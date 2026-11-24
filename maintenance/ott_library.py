"""Export the complete supported FreeTV public guest metadata without media offers.

The API's fresh public Drupal bootstrap is held in memory. This tool never calls
embeddedVideoPlayer, getmedia, getVMAP, a license service, or an ad tracker.
Only allowlisted normalized metadata and count/coverage receipts are written.
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import hashlib
import html
import json
import math
import os
import shutil
from pathlib import Path
import re
import subprocess
import threading
import time
from urllib.parse import urlencode, urljoin, urlsplit

PROVIDER, NAME, VERSION = "freetv", "FreeTV", "15.0"
SITE = "https://www.freetv.com"
API = "https://api-ott.freetv.com"
ORIGIN = "https://sheepman90s.github.io"
PAGE_SIZE = 10_000
MAX_RESPONSE = 256 * 1024 * 1024
SOURCE_KEYS = {
    "image_width", "image_format", "parent_id", "parent_type",
    "use_device_width_widescreen", "banners", "order", "is_af_request",
    "categories", "tags", "video_type", "object_type", "strip_content_ratings",
    "scale_factor", "for_user", "parent_meta", "r_video_type", "content_store_type",
}
INDEX_KEYS = ("search_non_episode", "search_show", "search_episode",
              "search_linear", "search_live", "search_collection")
ALLOWED_ACTIONS = {"getconfiguration", "search", "getreferencedobjects"}
SAFE_ROW_FIELDS = {
    "id", "type", "video_type", "name", "url", "short_description", "long_description",
    "reg_users_only", "premium_content", "is_premium", "required_permissions",
    "has_geo_restrictions", "allowed_countries", "allow_avod", "allow_avod_global",
    "allow_avod_countries", "origin_country", "year", "mpaa_rating", "tv_rating",
    "duration", "linear_channel_id", "drm", "widescreen_thumbnail_url", "thumbnail_url",
    "thumb_widescreen", "thumb_poster", "logo", "child_count",
}
ID = re.compile(r"[1-9][0-9]{0,11}\Z")
FLAG_TRUE, FLAG_FALSE = {"true", "1"}, {"false", "0"}


def require(value, message):
    if not value:
        raise ValueError("Explicit incomplete: " + message)


def plain(value, limit=4000):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]*>", " ", str(value or "")))).strip()[:limit]


def flag(value):
    text = str(value).lower()
    if text in FLAG_TRUE:
        return True
    if text in FLAG_FALSE:
        return False
    return None


def valid_id(value):
    return isinstance(value, str) and ID.fullmatch(value) is not None


def free_reason(row, country):
    if not re.fullmatch("[A-Z]{2}", country or ""):
        return "unknown-region"
    if PROVIDER == "runtime" and flag(row.get("premium_content")) is not False:
        return "premium-or-unknown"
    if flag(row.get("reg_users_only")) is not False:
        return "registration-or-unknown"
    for key in ("premium_content", "is_premium"):
        if key in row and flag(row[key]) is not False:
            return "premium-or-unknown"
    if PROVIDER == "freetv" or "required_permissions" in row:
        if not isinstance(row.get("required_permissions"), list):
            return "unknown-permissions"
        if row["required_permissions"]:
            return "required-permissions"
    if PROVIDER == "runtime" and "drm" in row and flag(row["drm"]) is not False:
        return "unsupported-drm"
    if PROVIDER == "runtime" and "has_geo_restrictions" in row and flag(row["has_geo_restrictions"]) is None:
        return "unknown-geography"
    if flag(row.get("has_geo_restrictions")) is True:
        allowed = row.get("allowed_countries")
        if not isinstance(allowed, list) or country not in {
            x.get("code") for x in allowed if isinstance(x, dict)
        }:
            return "region"
    if row.get("type") == "video" and (PROVIDER == "freetv" or any(k in row for k in ("allow_avod", "allow_avod_global", "allow_avod_countries"))):
        if flag(row.get("premium_content")) is not False or flag(row.get("allow_avod")) is not True:
            return "not-free-avod"
        if flag(row.get("allow_avod_global")) is not True:
            allowed = row.get("allow_avod_countries")
            if not isinstance(allowed, list) or country not in allowed:
                return "avod-region"
    return ""


def artwork(value):
    if not isinstance(value, str) or not value:
        return ""
    p = urlsplit(value)
    if p.scheme != "https" or p.username or p.password or p.port not in (None, 443):
        return ""
    if ((re.fullmatch(r"img[1-4]?\.static-ottera\.com", p.hostname or "")
         and p.path.startswith("/prod/oly/" if PROVIDER == "freetv" else "/prod/run/"))
        or (p.hostname == "cfvod.kaltura.com"
            and p.path.startswith("/p/513551/sp/51355100/thumbnail/"))):
        return value
    return ""


def official(value):
    require(isinstance(value, str) and value, "missing official title page")
    result = urljoin(SITE + "/", value)
    p = urlsplit(result)
    require(p.scheme == "https" and p.hostname == urlsplit(SITE).hostname
            and p.port in (None, 443) and not p.username and not p.password
            and not p.query and not p.fragment, "unexpected official title page")
    return result


def number(value, default=0):
    try:
        result = float(value)
        return result if math.isfinite(result) and result >= 0 else default
    except (TypeError, ValueError):
        return default


def ordinal(value):
    try:
        result = float(value)
        return int(result) if math.isfinite(result) and result >= 0 and result.is_integer() else -1
    except (TypeError, ValueError):
        return -1


def image_list(row):
    info = row.get("show_info") or {}
    candidates = [row.get(k) for k in ("widescreen_thumbnail_url", "thumbnail_url",
                  "thumb_widescreen", "thumb_poster", "logo")]
    candidates.append(info.get("thumbnail_url") if isinstance(info, dict) else "")
    return list(dict.fromkeys(x for v in candidates if (x := artwork(v))))


def metadata_only(row):
    """Allowlist metadata before any checkpoint; media/auth/ads are never copied."""
    result = {k: row[k] for k in SAFE_ROW_FIELDS if k in row}
    if "required_permissions" in row:
        permissions = row["required_permissions"]
        result["required_permissions"] = ([] if not permissions else ["required"]) if isinstance(permissions, list) else None
    for key in ("allowed_countries", "origin_country"):
        if key in row:
            result[key] = [{"code": r["code"]} for r in row[key] if isinstance(r, dict)
                           and re.fullmatch("[A-Z]{2}", r.get("code", ""))] if isinstance(row[key], list) else []
    if isinstance(row.get("meta"), dict):
        result["meta"] = {
            "categories": [{"name": plain(x.get("name"), 100)} for x in (row["meta"].get("categories") or [])
                           if isinstance(x, dict)],
            "language": plain(row["meta"].get("language"), 100),
        }
    if isinstance(row.get("show_info"), dict):
        info = row["show_info"]
        result["show_info"] = {k: info[k] for k in ("show_id", "season_num", "episode_num")
                               if k in info}
        result["show_info"]["show_name"] = plain(info.get("show_name"), 250)
        result["show_info"]["thumbnail_url"] = artwork(info.get("thumbnail_url"))
    for key in ("widescreen_thumbnail_url", "thumbnail_url", "thumb_widescreen", "thumb_poster", "logo"):
        if key in result:
            result[key] = artwork(result[key])
    if result.get("url"):
        p = urlsplit(urljoin(SITE + "/", result["url"]))
        if p.hostname != urlsplit(SITE).hostname or p.query or p.fragment:
            result["url"] = ""
    return result


def categories(row, labels=()):
    meta = row.get("meta") or {}
    require(isinstance(meta, dict), "invalid category metadata")
    names = [x.get("name") for x in (meta.get("categories") or []) if isinstance(x, dict)]
    names += [v for v in labels if v and not v.lower().startswith("todas ") and v != "Destacados"]
    if meta.get("language"):
        names.append("Language: " + str(meta["language"]))
    return sorted(set(plain(x, 100) for x in names if plain(x, 100)))


def normalize(row, labels=(), kind=None):
    sid = row.get("id")
    require(valid_id(sid), "invalid stable content identity")
    require(row.get("type") in ("video", "show"), "unsupported exported content type")
    images = image_list(row)
    title = plain(row.get("name"), 250)
    require(title, "empty title")
    video_type = row.get("video_type", "")
    if kind is None:
        kind = "series" if row["type"] == "show" else (
            "live" if video_type in ("linear", "live") else
            "episode" if video_type == "episode" else "film")
    result = {
        "id": PROVIDER + "-" + sid, "sourceId": sid, "sourceType": row["type"],
        "provider": PROVIDER, "providerName": NAME, "mode": PROVIDER,
        "kind": kind, "title": title,
        "description": plain(row.get("long_description") or row.get("short_description")),
        "image": images[0] if images else "", "imageAlternatives": images[1:],
        "categories": categories(row, labels), "official": official(row.get("url")),
        "duration": number(row.get("duration")), "freeGuestVerified": True,
        "rating": plain(row.get("tv_rating") or row.get("mpaa_rating"), 40),
    }
    if video_type:
        result["videoType"] = video_type
    year = int(number(row.get("year")))
    if year:
        result["year"] = year
    if kind == "live":
        origins = row.get("origin_country") or []
        result["country"] = origins[0].get("code", "") if len(origins) == 1 else ""
        if not re.fullmatch("[A-Z]{2}", result["country"]):
            result["country"] = ""
        guide_id = row.get("linear_channel_id")
        if valid_id(guide_id):
            result["guideId"] = guide_id
    return result


class Client:
    def __init__(self, zone, delay=0.12):
        self.zone, self.delay = zone, delay
        self.lock, self.rate_lock = threading.RLock(), threading.Lock()
        self.next_at = 0.0
        self.saved = 0.0
        self.options, self.config, self.region = None, None, None
        self.count, self.count_lock = 0, threading.Lock()

    def http(self, url, token=""):
        with self.rate_lock:
            wait = self.next_at - time.monotonic()
            if wait > 0:
                time.sleep(wait)
            self.next_at = time.monotonic() + self.delay
        args = [shutil.which("curl.exe") or shutil.which("curl") or "curl", "--silent", "--show-error", "--compressed",
                "--connect-timeout", "15", "--max-time", "120",
                "--max-filesize", str(MAX_RESPONSE), "--dump-header", "-",
                "--header", "Origin: " + ORIGIN,
                "--header", "User-Agent: SheepBox FreeTV public guest metadata audit"]
        if token:
            args += ["--header", "ottera-referrer: " + urlsplit(SITE).hostname.removeprefix("www."),
                     "--header", "ottera-cs-auth: " + token]
        # No response, token, URL query or curl stderr is written to disk/logs.
        for attempt in range(3):
            proc = subprocess.run(args + [url], capture_output=True,
                                  creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
            if proc.returncode:
                if attempt < 2 and proc.returncode in (6, 7, 28, 35, 52, 56):
                    time.sleep(1 + attempt)
                    continue
                raise RuntimeError(NAME + " transport failed (curl code " + str(proc.returncode) + ")")
            raw = proc.stdout
            parts = re.split(rb"\r?\n\r?\n", raw, maxsplit=1)
            require(len(parts) == 2, "invalid HTTP response")
            header, body = parts
            lines = header.decode("latin1").splitlines()
            status_match = re.match(r"HTTP/\S+\s+(\d+)", lines[0] if lines else "")
            require(status_match, "invalid HTTP status")
            status = int(status_match[1])
            if status in (500, 502, 503, 504) and attempt < 2:
                time.sleep(1 + attempt)
                continue
            if status != 200:
                raise RuntimeError(NAME + " metadata HTTP " + str(status) + "; collection stopped")
            require(len(body) <= MAX_RESPONSE, "metadata response size bound")
            with self.count_lock:
                self.count += 1
            return body.decode("utf8")
        raise RuntimeError(NAME + " transport retries exhausted")

    def bootstrap(self):
        with self.lock:
            if self.options is not None and time.monotonic() - self.saved < 480:
                return
            text = self.http(SITE + "/")
            match = re.search(r"""<script[^>]*data-drupal-selector=["']drupal-settings-json["'][^>]*>([\s\S]*?)</script>""", text)
            require(match, "missing public Drupal bootstrap")
            options = json.loads(match[1])["codesbasePublic"]["options"]
            require(options.get("api") == API and options.get("version") == VERSION
                    and isinstance(options.get("cs_auth_token"), str)
                    and options["cs_auth_token"], "changed public guest protocol")
            require(re.fullmatch("[a-z]{2}(?:-[A-Za-z]{2})?", options.get("language", "")),
                    "invalid publisher language")
            self.options, self.saved = options, time.monotonic()
            config = self._api("getconfiguration", {})
            region = config.get("country_code")
            require(re.fullmatch("[A-Z]{2}", region or ""), "missing publisher-detected region")
            require(self.region in (None, region), "publisher region changed during collection")
            self.config, self.region = config, region

    def _api(self, action, params):
        require(action in ALLOWED_ACTIONS, "non-metadata endpoint rejected")
        require(all(isinstance(v, (str, int, float, bool)) for v in params.values()),
                "unsupported metadata query value")
        options = self.options
        common = {
            "version": options["version"], "device_type": "desktop", "platform": "web",
            "partner": "internal", "language": options["language"], "connection": "wifi",
            "timestamp": str(int(time.time())), "timezone": self.zone,
        }
        return json.loads(self.http(API + "/" + action + "?" + urlencode({**common, **params}),
                                    options["cs_auth_token"]))

    def api(self, action, params=None):
        self.bootstrap()
        return self._api(action, params or {})


class Audit:
    def __init__(self, client, workers=3, checkpoint=None, resume=False):
        self.client, self.workers = client, workers
        self.receipts, self.rows, self.labels = [], {}, defaultdict(set)
        self.index_ids, self.show_children = {}, {}
        self.lock = threading.Lock()
        self.excluded_sources, self.outside_scope = [], Counter()
        self.root_missing, self.ownership_issues = [], []
        self.unowned_episodes = set()
        self.checkpoint, self.resume = checkpoint, resume
        self.prior_index_requests = 0
        self.configured_source_count, self.ordered_source_count = 0, 0
        self.metadata_checked_at, self.configuration_changed_since_closure = None, False

    def closure_checkpoint(self, signature, checked_collections):
        if not self.checkpoint:
            return
        self.metadata_checked_at = datetime.now(timezone.utc).isoformat()
        state = {
            "schema": 1, "stage": "closure", "checkedAt": self.metadata_checked_at,
            "region": self.client.region, "querySignature": signature,
            "configSha256": hashlib.sha256(json.dumps(self.client.config["sections"], sort_keys=True).encode()).hexdigest(),
            "rows": list(self.rows.values()), "labels": [[list(k), sorted(v)] for k, v in self.labels.items()],
            "indexIds": {k: sorted(v) for k, v in self.index_ids.items()},
            "receipts": self.receipts, "metadataRequests": self.client.count + self.prior_index_requests,
            "showChildren": {k: sorted(v) for k, v in self.show_children.items()},
            "excludedSources": self.excluded_sources, "outsideScope": dict(self.outside_scope),
            "rootMissing": self.root_missing, "ownershipIssues": self.ownership_issues,
            "unownedEpisodes": sorted(self.unowned_episodes),
            "configuredSources": self.configured_source_count, "orderedSources": self.ordered_source_count,
            "checkedCollections": sorted(checked_collections),
        }
        self.checkpoint.with_name("CLOSURE_CHECKPOINT_METADATA.json").write_text(
            json.dumps(state, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf8")

    def pages(self, action, params, label):
        params = {k: v for k, v in params.items() if k not in ("start", "max")}
        identity = hashlib.sha256(json.dumps([action, params], sort_keys=True).encode()).hexdigest()
        start, expected, pages, slots, rows, fingerprints = 0, None, 0, 0, [], set()
        empty_terminal_probe = False
        while True:
            require(pages < 100_000, "pagination safety bound reached")
            data = self.client.api(action, {**params, "start": str(start), "max": str(PAGE_SIZE)})
            require(isinstance(data, dict) and isinstance(data.get("objects"), list),
                    "invalid metadata page")
            try:
                current, total, count = (int(data[k]) for k in ("start_index", "total_results", "num_results"))
            except (KeyError, TypeError, ValueError):
                raise ValueError("Explicit incomplete: malformed publisher page counts") from None
            require(current == start and total >= 0 and 0 <= count <= PAGE_SIZE
                    and len(data["objects"]) <= count, "invalid publisher page counts")
            require(expected in (None, total), "publisher total changed during collection")
            expected = total
            if pages == 0 and label.startswith("index:"):
                print(label + " publisher total " + str(total), flush=True)
            found = data["objects"]
            require(all(isinstance(r, dict) and valid_id(r.get("id")) for r in found),
                    "metadata row without stable identity")
            if found:
                fingerprint = tuple((r.get("type"), r["id"]) for r in found)
                require(fingerprint not in fingerprints, "repeated metadata page")
                fingerprints.add(fingerprint)
            rows.extend(found)
            pages, slots = pages + 1, slots + count
            if count == 0:
                if start < total:
                    # Search totals can describe a broader offer than this connection's
                    # available rows. Verify the publisher's declared terminal position
                    # too; keep the discrepancy rather than manufacturing inaccessible IDs.
                    # Large index windows must be partitioned, never accepted this way.
                    require(total < PAGE_SIZE, "large search window requires typed partition ("
                            + label + ", start=" + str(start) + ", total=" + str(total) + ")")
                    terminal = self.client.api(action, {**params, "start": str(total), "max": str(PAGE_SIZE)})
                    require(int(terminal["start_index"]) == total
                            and int(terminal["total_results"]) == total
                            and int(terminal["num_results"]) == 0
                            and terminal.get("objects") == [],
                            "unresolved empty cursor before publisher total (" + label + ")")
                    empty_terminal_probe = True
                break
            require(start + count <= total, "page exceeds publisher total")
            if start + count == total:
                break
            start += count
        keys = {(r.get("type"), r["id"]) for r in rows}
        if label.startswith("index:") and params.get("order") == "asc":
            require(len(keys) == len(rows), "ordered public index repeated identities (" + label + ")")
        receipt = {
            "source": label, "querySha256": identity, "pages": pages,
            "publisherTotal": expected, "publisherSlotsConsumed": slots,
            "returnedRows": len(rows), "uniqueIdentities": len(keys),
            "filteredSlots": expected - len(rows),
            "duplicateSlots": len(rows) - len(keys), "exhausted": True,
            "availableEndCursor": slots, "unreturnedPublisherSlots": expected - slots,
            "emptyDeclaredTotalProbe": empty_terminal_probe,
        }
        require(slots == expected or empty_terminal_probe, "publisher slots did not reconcile")
        with self.lock:
            self.receipts.append(receipt)
        return rows

    def collect(self, rows, labels=()):
        for row in rows:
            key = (row.get("type"), row.get("id"))
            require(valid_id(key[1]) and isinstance(key[0], str), "invalid content identity")
            previous = self.rows.get(key)
            if previous is not None:
                require(previous.get("video_type") == row.get("video_type"),
                        "content type changed during collection")
            self.rows[key] = {**(previous or {}), **metadata_only(row)}
            self.labels[key].update(x for x in labels if x)

    def configured_sources(self):
        sources = {}
        sections = self.client.config.get("sections")
        require(isinstance(sections, list) and sections, "missing catalogue sections")
        for section in sections:
            require(isinstance(section.get("items"), list), "unknown catalogue section")
            for item in section["items"]:
                action, params = item.get("endpoint"), item.get("parameters", {})
                require(isinstance(params, dict), "invalid configured source")
                if item.get("authenticated") is True or str(params.get("for_user", "0")) != "0":
                    self.excluded_sources.append({
                        "section": plain(section.get("section"), 120),
                        "endpoint": plain(action, 80), "reason": "account-personalized",
                    })
                    continue
                if action == "getvideosegments":
                    self.outside_scope["runtime-guide-sources"] += 1
                    continue
                require(item.get("method", "GET") == "GET" and action == "getreferencedobjects",
                        "new public catalogue endpoint")
                require(set(params) <= SOURCE_KEYS | {"max", "start"},
                        "new configured catalogue filter")
                params = {k: v for k, v in params.items() if k not in ("max", "start")}
                require(params.get("parent_type") == "collection"
                        and valid_id(str(params.get("parent_id", ""))),
                        "new public collection contract")
                key = json.dumps(params, sort_keys=True)
                source = sources.setdefault(key, {"params": params, "labels": set(), "sections": set()})
                source["labels"].add(plain(item.get("title"), 100))
                source["sections"].add(plain(section.get("section"), 120))
        self.configured_source_count = len(sources)
        # Canonical unfiltered, ordered membership is separately fetched for every
        # collection identity below; a filtered configured source cannot satisfy it.
        return sources

    def detail(self, sid):
        data = self.client.api("search", {"id": sid})
        require(isinstance(data.get("objects"), list), "invalid detail response")
        matches = [r for r in data["objects"] if r.get("id") == sid]
        require(len(matches) <= 1, "duplicate detail identity")
        return matches[0] if matches else None

    def run(self):
        self.client.bootstrap()
        requests = self.client.config.get("requests")
        require(isinstance(requests, dict), "missing configured public indexes")
        print(NAME + " publisher-detected region " + self.client.region + "; reading public indexes", flush=True)
        index_specs = []
        for name in INDEX_KEYS:
            source = requests.get(name)
            require(isinstance(source, dict) and source.get("endpoint") == "search"
                    and source.get("method", "GET") == "GET", "missing public search index " + name)
            params = source.get("parameters", {})
            require(isinstance(params, dict) and set(params) <= SOURCE_KEYS, "new index filter")
            index_specs.append((name, {**params, "order": "asc"}))
        index_specs.append(("search_supported_non_episode",
                            {"object_type": "video", "video_type": "non_episode", "image_width": "366",
                             "order": "asc"}))
        if PROVIDER == "runtime":
            index_specs.append(("search_feature_crosscheck", {"object_type": "video", "video_type": "feature", "image_width": "366", "order": "asc"}))
        signature = hashlib.sha256(json.dumps(index_specs, sort_keys=True).encode()).hexdigest()
        closure_file = self.checkpoint.with_name("CLOSURE_CHECKPOINT_METADATA.json") if self.checkpoint else None
        if self.resume and closure_file and closure_file.exists():
            value = json.loads(closure_file.read_text("utf8"))
            checked = datetime.fromisoformat(value["checkedAt"])
            age = (datetime.now(timezone.utc) - checked).total_seconds()
            config_hash = hashlib.sha256(json.dumps(self.client.config["sections"], sort_keys=True).encode()).hexdigest()
            require(value.get("schema") == 1 and value.get("stage") == "closure"
                    and value.get("region") == self.client.region and value.get("querySignature") == signature
                    and 0 <= age <= 3600,
                    "closure checkpoint is stale or belongs to another scope")
            # Re-export a completed, dated closure as that original snapshot.
            # A later public configuration change does not turn its older checkedAt
            # into a fresh crawl; playback still obtains current guest authorization.
            self.metadata_checked_at = value["checkedAt"]
            self.configuration_changed_since_closure = value.get("configSha256") != config_hash
            self.collect(value["rows"])
            for key, labels in value["labels"]:
                self.labels[tuple(key)].update(labels)
            self.index_ids = {k: {tuple(x) for x in v} for k, v in value["indexIds"].items()}
            self.receipts, self.prior_index_requests = value["receipts"], value["metadataRequests"]
            self.show_children = {k: set(v) for k, v in value["showChildren"].items()}
            self.excluded_sources, self.outside_scope = value["excludedSources"], Counter(value["outsideScope"])
            self.root_missing, self.ownership_issues = value["rootMissing"], value["ownershipIssues"]
            self.unowned_episodes = set(value["unownedEpisodes"])
            self.configured_source_count, self.ordered_source_count = value["configuredSources"], value["orderedSources"]
            print("Resumed complete allowlisted metadata closure from " + value["checkedAt"], flush=True)
            return self.export({}, set(value["checkedCollections"]))
        resumed = False
        if self.resume and self.checkpoint and self.checkpoint.exists():
            value = json.loads(self.checkpoint.read_text("utf8"))
            checked = datetime.fromisoformat(value["checkedAt"])
            age = (datetime.now(timezone.utc) - checked).total_seconds()
            require(value.get("schema") == 1 and value.get("region") == self.client.region
                    and value.get("querySignature") == signature and 0 <= age <= 3600,
                    "index checkpoint is stale or belongs to another scope")
            self.collect(value["rows"])
            self.index_ids = {k: {tuple(x) for x in v} for k, v in value["indexIds"].items()}
            self.receipts = value["receipts"]
            self.prior_index_requests = value["metadataRequests"]
            resumed = True
            print("Resumed completed metadata-only index pass from " + value["checkedAt"], flush=True)
        if not resumed:
            with ThreadPoolExecutor(max_workers=self.workers) as pool:
                results = list(pool.map(lambda spec: (spec[0], self.pages("search", spec[1], "index:" + spec[0])),
                                        index_specs))
            for name, rows in results:
                self.collect(rows)
                self.index_ids[name] = {(r.get("type"), r["id"]) for r in rows}
                print("Index " + name + ": " + str(len(rows)) + " returned rows", flush=True)
            if self.checkpoint:
                value = {"schema": 1, "checkedAt": datetime.now(timezone.utc).isoformat(),
                         "region": self.client.region, "querySignature": signature,
                         "rows": list(self.rows.values()),
                         "indexIds": {k: sorted(v) for k, v in self.index_ids.items()},
                         "receipts": self.receipts, "metadataRequests": self.client.count}
                self.checkpoint.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n",
                                           encoding="utf8")
        generic = requests.get("search")
        require(isinstance(generic, dict) and generic.get("endpoint") == "search",
                "missing generic public search")
        sample = self.client.api("search", {**generic.get("parameters", {}), "order": "asc",
                                            "start": "0", "max": "100"})
        require(isinstance(sample.get("objects"), list) and int(sample["start_index"]) == 0,
                "invalid generic search sample")
        generic_total = int(sample["total_results"])
        typed_total = sum(r["publisherTotal"] for r in self.receipts if r["source"].startswith("index:"))
        typed_ids = set().union(*self.index_ids.values())
        sample_ids = {(r.get("type"), r.get("id")) for r in sample["objects"]
                      if r.get("type") in ("show", "collection") or r.get("type") == "video" and r.get("video_type") in ("feature", "non_episode", "episode", "linear", "live")}
        for row in sample["objects"]:
            if row.get("type") not in ("video", "show", "collection"):
                self.outside_scope["generic-cms-type:" + str(row.get("type"))] += 1
        require(sample_ids <= typed_ids, "generic search has identities outside typed partitions")
        self.index_ids["search"] = typed_ids
        self.receipts.append({
            "source": "index:search", "pages": 1, "partitioned": True,
            "publisherTotal": generic_total, "publisherSlotsConsumed": typed_total,
            "returnedRows": len(typed_ids), "uniqueIdentities": len(typed_ids),
            "filteredSlots": None, "duplicateSlots": 0,
            "exhausted": True, "typedPartitionsReconciled": True,
            "countsComparable": typed_total == generic_total,
            "genericSampleCoveredByTypedIndexes": True,
            "note": "Generic search uses a different broader total; complete supported content "
                    "types are enumerated independently to avoid its large-result window.",
        })
        sources = self.configured_sources()
        print("Checking " + str(self.configured_source_count) + " configured public collection variants"
              " plus " + str(self.ordered_source_count) + " stable-order cross-checks", flush=True)
        def read_source(pair):
            key, source = pair
            digest = hashlib.sha256(key.encode()).hexdigest()[:16]
            label = ("collection-order-check:" if "verificationOf" in source else "collection:") + digest
            rows = self.pages("getreferencedobjects", source["params"], label)
            return source, rows
        with ThreadPoolExecutor(max_workers=self.workers) as pool:
            for done, (source, rows) in enumerate(pool.map(read_source, sources.items()), 1):
                self.collect(rows, source["labels"])
                if done % 25 == 0:
                    print("Configured collections " + str(done) + "/" + str(len(sources)), flush=True)
        # Collections can contain nested collection references outside initial configuration.
        seed_collections = {str(s["params"]["parent_id"]) for s in sources.values()}
        checked_collections = set()
        while True:
            identities = seed_collections | {key[1] for key in self.rows if key[0] == "collection"}
            pending = sorted(identities - checked_collections)
            if not pending:
                break
            require(len(checked_collections) + len(pending) < 100_000,
                    "nested collection safety bound")
            with ThreadPoolExecutor(max_workers=self.workers) as pool:
                results = pool.map(lambda sid: (sid, self.pages("getreferencedobjects",
                    {"parent_type": "collection", "parent_id": sid, "image_width": "366",
                     "image_format": "widescreen", "for_user": "0", "order": "asc"},
                     "nested-collection:" + sid)), pending)
                for done, (sid, rows) in enumerate(results, 1):
                    self.collect(rows, [plain(self.rows.get(("collection", sid), {}).get("name"), 100)])
                    checked_collections.add(sid)
                    if done % 50 == 0:
                        print("Canonical collection round " + str(done) + "/" + str(len(pending)), flush=True)
            print("Canonical unfiltered collections checked: " + str(len(checked_collections)), flush=True)
        # Episode indexes may reference show parents absent from every show shelf/index.
        episode_rows = [r for r in self.rows.values()
                        if r.get("type") == "video" and r.get("video_type") == "episode"]
        parents = set()
        for row in episode_rows:
            info = row.get("show_info")
            if not isinstance(info, dict) or not valid_id(str(info.get("show_id", ""))):
                self.unowned_episodes.add(row["id"])
                continue
            parents.add(str(info["show_id"]))
        missing = parents - {sid for typ, sid in self.rows if typ == "show"}
        with ThreadPoolExecutor(max_workers=self.workers) as pool:
            details = list(pool.map(lambda sid: (sid, self.detail(sid)), sorted(missing)))
        for sid, row in details:
            if row is None:
                self.root_missing.append(sid)
            else:
                require(row.get("type") == "show", "episode owner is not a show")
                self.collect([row])
        shows = sorted([r for r in self.rows.values() if r.get("type") == "show"], key=lambda r: r["id"])
        print("Checking complete episode lists for " + str(len(shows)) + " discovered shows", flush=True)
        def show_episodes(row):
            sid = row["id"]
            return sid, self.pages("getreferencedobjects",
                {"parent_id": sid, "parent_type": "show", "image_width": "640",
                 "image_format": "widescreen", "for_user": "0", "order": "asc"}, "show:" + sid)
        with ThreadPoolExecutor(max_workers=self.workers) as pool:
            for done, (sid, rows) in enumerate(pool.map(show_episodes, shows), 1):
                children = set()
                for row in rows:
                    if row.get("type") == "video" and row.get("video_type") == "episode":
                        info = row.get("show_info")
                        if isinstance(info, dict) and str(info.get("show_id")) == sid:
                            children.add(row["id"])
                        else:
                            self.ownership_issues.append({"episode": row["id"], "listedUnderShow": sid})
                    else:
                        self.outside_scope["non-episode-show-children"] += 1
                self.show_children[sid] = children
                self.collect(rows, self.labels[("show", sid)])
                if done % 25 == 0:
                    print("Show episodes " + str(done) + "/" + str(len(shows)), flush=True)
        self.closure_checkpoint(signature, checked_collections)
        return self.export(sources, checked_collections)

    def export(self, sources, checked_collections):
        region, exclusions = self.client.region, Counter()
        items, live, series = [], [], []
        episodes_by_show = defaultdict(list)
        free_episodes, standalone_episodes, index_episode_ids = set(), set(), {
            sid for typ, sid in self.index_ids["search_episode"] if typ == "video"
        }
        for key, row in self.rows.items():
            typ, sid = key
            vt = row.get("video_type")
            if typ not in ("video", "show"):
                self.outside_scope["object-type:" + typ] += 1
                continue
            if typ == "video" and vt not in ("feature", "non_episode", "episode", "linear", "live"):
                self.outside_scope["video-type:" + str(vt)] += 1
                continue
            reason = free_reason(row, region)
            if reason:
                exclusions[reason] += 1
                continue
            if typ == "show":
                continue
            if vt == "episode":
                info = row.get("show_info") or {}
                owner = str(info.get("show_id", ""))
                parent = self.rows.get(("show", owner))
                season, episode = ordinal(info.get("season_num")), ordinal(info.get("episode_num"))
                if parent is None or free_reason(parent, region):
                    # Leaf AVOD rights can be explicitly free when the show container
                    # is unavailable. Preserve that individually eligible public leaf,
                    # without inventing a hidden parent or claiming grouped coverage.
                    result = normalize(row, self.labels[key] | {"Standalone episodes"}, kind="episode")
                    result["standaloneEpisode"] = True
                    show_name = plain(info.get("show_name"), 100)
                    if show_name:
                        result["title"] = plain(show_name + " • " + result["title"], 250)
                    items.append(result)
                    standalone_episodes.add(sid)
                    continue
                if sid not in self.show_children.get(owner, set()):
                    self.ownership_issues.append({"episode": sid, "owner": owner,
                                                  "reason": "indexed-owned-leaf-absent-from-show-list"})
                result = normalize(row, self.labels[key] | self.labels[("show", owner)])
                result["seriesId"] = PROVIDER + "-" + owner
                if season >= 0:
                    result["seasonNumber"] = season
                if episode >= 0:
                    result["episodeNumber"] = episode
                episodes_by_show[owner].append(result)
                free_episodes.add(sid)
            elif vt in ("linear", "live"):
                live.append(normalize(row, self.labels[key]))
            else:
                items.append(normalize(row, self.labels[key]))
        for (typ, sid), row in self.rows.items():
            if typ != "show" or free_reason(row, region):
                continue
            episodes = episodes_by_show.get(sid, [])
            if not episodes:
                exclusions["show-without-free-episodes"] += 1
                continue
            episodes.sort(key=lambda e: (e.get("seasonNumber", 10**9),
                                         e.get("episodeNumber", 10**9), e["sourceId"]))
            show = normalize(row, self.labels[(typ, sid)])
            show["episodes"] = [e["id"] for e in episodes]
            series.append(show)
            items.extend(episodes)
        for rows in (items, live, series):
            rows.sort(key=lambda row: (row["title"].casefold(), row["id"]))
        all_rows = items + live + series
        require(all_rows and len({r["id"] for r in all_rows}) == len(all_rows),
                "duplicate or empty normalized catalogue")
        item_map = {r["id"]: r for r in items}
        require(all(show["episodes"] and len(show["episodes"]) == len(set(show["episodes"]))
                    and all(item_map[e].get("seriesId") == show["id"] for e in show["episodes"])
                    for show in series), "exported episode ownership did not reconcile")
        root_index_ids = (self.index_ids["search_non_episode"] | self.index_ids["search_show"]
                          | self.index_ids["search_supported_non_episode"])
        source_candidates = {k for k, r in self.rows.items()
                             if k[0] == "show" or k[0] == "video"
                             and r.get("video_type") in ("feature", "non_episode")}
        checked_at = datetime.now(timezone.utc).isoformat()
        report = {
            "generatedAt": checked_at, "completeSupportedPublicGuestDirectories": True,
            "providerWideComplete": True, "region": region,
            "scope": "Complete supported current-region free guest metadata from the publisher's typed "
                     "video/show indexes, all configured guest collection variants, unfiltered discovered "
                     "collection membership and show episode pages. "
                     "Supported scope: free features/non-episode videos, shows/episodes and live TV. "
                     "Current rights, DRM and advertising are rechecked at playback.",
            "access": "Ordinary public Drupal guest bootstrap; no account, cookies, credentials "
                      "or country override; no playback/ad/license endpoint called by this exporter.",
            "searchIndexesExhausted": len(self.index_ids),
            "indexRows": {name: len(ids) for name, ids in self.index_ids.items()},
            "configuredCollectionVariantsExhausted": self.configured_source_count,
            "orderedCollectionChecks": self.ordered_source_count,
            "collectionIdentitiesExhausted": len(checked_collections),
            "showsChecked": len(self.show_children),
            "episodeIndexesReconciled": True,
            "globalEpisodeIndexIdentities": len(index_episode_ids),
            "freeEpisodesOutsideGlobalIndex": len(free_episodes - index_episode_ids),
            "rootCandidatesOutsideNamedIndexes": len(source_candidates - root_index_ids),
            "unavailableEpisodeParents": self.root_missing,
            "ungroupedEpisodeOwnership": self.ownership_issues,
            "unownedIndexedEpisodes": sorted(self.unowned_episodes),
            "excluded": dict(sorted(exclusions.items())),
            "excludedSources": self.excluded_sources,
            "outsideSupportedScope": dict(sorted(self.outside_scope.items())),
            "movies": sum(r["kind"] == "film" and r.get("videoType") != "episode" for r in items),
            "shows": len(series), "episodes": len(free_episodes | standalone_episodes),
            "groupedEpisodes": len(free_episodes),
            "standaloneEpisodes": len(standalone_episodes),
            "liveChannels": len(live), "items": len(items),
            "metadataRequests": self.client.count + self.prior_index_requests,
            "metadataCheckedAt": self.metadata_checked_at or checked_at,
            "configurationChangedSinceClosure": self.configuration_changed_since_closure,
            "publisherTotalsReconciled": all(r["exhausted"] and (
                r["publisherSlotsConsumed"] == r["publisherTotal"]
                or r.get("emptyDeclaredTotalProbe")
                or r.get("typedPartitionsReconciled")) for r in self.receipts),
            "publisherCountDifferences": sum(r["publisherSlotsConsumed"] != r["publisherTotal"]
                                             for r in self.receipts),
            "receipts": sorted(self.receipts, key=lambda r: r["source"]),
            "canonicalIdsSha256": hashlib.sha256("\n".join(sorted(r["id"] for r in all_rows)).encode()).hexdigest(),
        }
        self.private_report = report
        public_report = {
            "complete": True, "completedAt": checked_at, "generatedAt": checked_at,
            "checkedAt": report["metadataCheckedAt"],
            "completeSupportedPublicGuestDirectories": True, "providerWideComplete": True,
            "region": region, "scope": report["scope"],
            "counts": {"videos": len(items), "shows": len(series), "live": len(live)},
            "movies": report["movies"], "episodes": report["episodes"],
            "groupedEpisodes": report["groupedEpisodes"],
            "standaloneEpisodes": report["standaloneEpisodes"],
            "publisherCountDifferences": report["publisherCountDifferences"],
            "searchIndexesExhausted": report["searchIndexesExhausted"],
            "configuredCollectionVariantsExhausted": self.configured_source_count,
            "orderedCollectionChecks": self.ordered_source_count,
            "collectionIdentitiesExhausted": len(checked_collections),
            "showsChecked": report["showsChecked"], "publisherTotalsReconciled": True,
            "episodeIndexesReconciled": True,
        }
        result = {"schema": 1, "provider": PROVIDER, "generatedAt": checked_at,
                  "items": items, "live": live, "providerSeries": series, "report": public_report}
        # Every exported object is constructed by normalize(), never copied from raw publisher data.
        forbidden = {"token", "cs_auth_token", "license", "licenseUrl", "license_urls",
                     "adTag", "streams", "headers", "cookies", "mpdURL", "mpd_url"}
        def verify(node):
            if isinstance(node, dict):
                require(not (set(node) & forbidden), "runtime data in metadata export")
                for value in node.values():
                    verify(value)
            elif isinstance(node, list):
                for value in node:
                    verify(value)
        verify(result)
        return result


def self_test():
    row = {"id": "1", "type": "video", "video_type": "feature", "name": "Film",
           "url": "/es/feature/film", "reg_users_only": "false", "premium_content": "false",
           "is_premium": "false", "required_permissions": [], "allow_avod": "true",
           "allow_avod_global": "false", "allow_avod_countries": ["US"], "drm": "true"}
    assert not free_reason(row, "US")  # DRM is not paid access.
    assert free_reason(row, "CA")
    assert free_reason({**row, "required_permissions": ["paid"]}, "US")
    normalized = normalize({**row, "license_urls": {"widevine": "private"},
                            "mpdURL": "private", "duration": "42.5"})
    assert normalized["duration"] == 42.5 and "license_urls" not in normalized
    assert normalized["sourceId"] == "1" and normalized["mode"] == "freetv"
    assert ordinal("-1") == -1 and ordinal("1.0") == 1 and ordinal("") == -1
    sanitized = metadata_only({**row, "license_urls": {"widevine": "private"},
                               "mpdURL": "private", "cs_auth_token": "private"})
    assert not {"license_urls", "mpdURL", "cs_auth_token"} & set(sanitized)
    class Fake:
        def api(self, action, params):
            start = int(params["start"])
            return {"start_index": str(start), "total_results": "105",
                    "num_results": "100" if start == 0 else "5",
                    "objects": [{"id": str(start + 1), "type": "show"}]}
    audit = Audit(Fake())
    assert [r["id"] for r in audit.pages("search", {}, "test")] == ["1", "101"]
    assert audit.receipts[0]["publisherSlotsConsumed"] == 105
    assert audit.receipts[0]["filteredSlots"] == 103
    class FilteredEnd:
        def api(self, action, params):
            start = int(params["start"])
            return {"start_index": str(start), "total_results": "2",
                    "num_results": "1" if start == 0 else "0",
                    "objects": [{"id": "1", "type": "show"}] if start == 0 else []}
    filtered = Audit(FilteredEnd())
    assert len(filtered.pages("search", {}, "filtered")) == 1
    assert filtered.receipts[0]["emptyDeclaredTotalProbe"]
    assert filtered.receipts[0]["unreturnedPublisherSlots"] == 1
    print("FreeTV exporter self-test passed")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--provider", choices=("freetv", "runtime"), default="freetv")
    parser.add_argument("--expected-region", default="US")
    parser.add_argument("--timezone", default="America/New_York")
    parser.add_argument("--workers", type=int, default=3)
    parser.add_argument("--delay", type=float, default=0.12)
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument("--resume", action="store_true",
                        help="Resume a completed metadata-only index pass from the last hour")
    args = parser.parse_args()
    global PROVIDER, NAME, VERSION, SITE, API
    if args.provider == "runtime":
        PROVIDER, NAME, VERSION = "runtime", "Runtime", 13
        SITE, API = "https://www.runtime.tv", "https://api-ott.runtime.tv"
    if args.self_test:
        self_test()
        return
    parser.error("--output is required") if args.output is None else None
    output = args.output.resolve()
    checkout = Path(__file__).resolve().parents[2]
    require(output != checkout and checkout not in output.parents,
            "audit output must be outside checkout")
    require(1 <= args.workers <= 3 and args.delay >= 0.1, "invalid concurrency/rate")
    output.mkdir(parents=True, exist_ok=True)
    client = Client(args.timezone, args.delay)
    try:
        client.bootstrap()
        require(client.region == args.expected_region, "detected region differs from the published catalogue")
        audit = Audit(client, args.workers, output / "INDEX_CHECKPOINT_METADATA.json", args.resume)
        result = audit.run()
        target = output / (PROVIDER + ".json")
        temporary = output / (PROVIDER + ".json.tmp")
        temporary.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")) + "\n",
                             encoding="utf8")
        temporary.replace(target)
        receipt = {k: v for k, v in audit.private_report.items() if k != "receipts"}
        (output / "FREETV_COVERAGE_SAFE.json").write_text(json.dumps(receipt, indent=2) + "\n",
                                                        encoding="utf8")
        (output / "FREETV_AUDIT_SAFE.json").write_text(json.dumps(audit.private_report, indent=2) + "\n",
                                                     encoding="utf8")
        (output / "INCOMPLETE_SAFE.json").unlink(missing_ok=True)
        print(json.dumps({k: receipt[k] for k in ("region", "movies", "shows", "episodes",
                         "liveChannels", "metadataRequests", "canonicalIdsSha256")}), flush=True)
        print("Complete metadata exported to " + str(target), flush=True)
    except Exception as error:
        # Exceptions are controlled diagnostics; never include a transport URL or raw response.
        safe = {"complete": False, "generatedAt": datetime.now(timezone.utc).isoformat(),
                "metadataRequests": client.count, "errorType": type(error).__name__}
        (output / "INCOMPLETE_SAFE.json").write_text(json.dumps(safe, indent=2) + "\n", encoding="utf8")
        print(NAME + " collection incomplete (" + type(error).__name__ + "); previous snapshot retained", flush=True)
        if isinstance(error, ValueError) and str(error).startswith("Explicit incomplete:"): print(str(error), flush=True)
        raise SystemExit(1) from None


if __name__ == "__main__":
    main()
