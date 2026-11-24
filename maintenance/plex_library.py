"""Export Plex's current free movie/show roots and complete genre membership.

Run with --output NEW_DIRECTORY and the actual web app --origin if changed.
Only plex.json is published, atomically after all root/genre pages reconcile.
Anonymous state and raw replies remain in memory. No player, media, ad or licence
requests are made. Episodes are resolved fully on first show visit by the web app;
this exporter does not claim a whole-service episode pre-audit.
"""
from concurrent.futures import ThreadPoolExecutor
from collections import Counter
from datetime import datetime, timezone
import argparse
import hashlib
import html
import json
import math
from pathlib import Path
import re
import subprocess
import threading
import time
from urllib.parse import urlencode, urlsplit
import uuid

BASE = "https://vod.provider.plex.tv"
ORIGIN = "https://sheepman90s.github.io"
OUT = Path(__file__).resolve().parent
FIELDS = ("ratingKey,title,type,thumb,art,summary,availabilityId,expiresAt,publicPagesURL,"
          "slug,duration,year,requiresSubscription,requiresPurchase,requiresAuthentication,isPremium,"
          "leafCount,childCount,contentRating")
IDENTITY = re.compile(r"[a-f0-9]{24}\Z")
SENSITIVE = re.compile(r"token|authorization|credential|signature|^sign$|^policy$|session|^expires$|^ks$", re.I)


def need(ok, message):
    if not ok:
        raise ValueError("Incomplete Plex metadata: " + message)


def plain(value, limit=4000):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]*>", " ", str(value or "")))).strip()[:limit]


def numeric(value):
    if isinstance(value, bool):
        return None
    try:
        value = float(value)
        return value if math.isfinite(value) else None
    except (TypeError, ValueError):
        return None


def truth(value):
    return value is True or str(value).lower() in ("true", "1")


def available(row):
    expiry = numeric(row.get("expiresAt"))
    return (isinstance(row.get("availabilityId"), str) and bool(row["availabilityId"])
            and expiry is not None and expiry > time.time()
            and not any(truth(row.get(key)) for key in (
                "requiresSubscription", "requiresPurchase", "requiresAuthentication", "isPremium")))


def exclusion_reason(row):
    if not isinstance(row.get("availabilityId"), str) or not row["availabilityId"]:
        return "missingOffer"
    expiry = numeric(row.get("expiresAt"))
    if expiry is None:
        return "missingOrInvalidExpiry"
    if expiry <= time.time():
        return "expired"
    for key in ("requiresSubscription", "requiresPurchase", "requiresAuthentication", "isPremium"):
        if truth(row.get(key)):
            return key
    return "unresolvedEligibility"


def official(value, kind):
    need(isinstance(value, str), "missing exact publisher page")
    parsed = urlsplit(value)
    need(parsed.scheme == "https" and parsed.hostname == "watch.plex.tv"
         and parsed.port in (None, 443) and not parsed.username and not parsed.password
         and not parsed.query and not parsed.fragment, "unsafe publisher page")
    pieces = parsed.path.strip("/").split("/")
    need(len(pieces) == 2 and pieces[0] == ("movie" if kind == "movie" else "show")
         and pieces[1] and pieces[1] not in (".", ".."), "publisher page type mismatch")
    return value


def art(value):
    if not isinstance(value, str) or not value:
        return ""
    parsed = urlsplit(value)
    if (parsed.scheme != "https" or parsed.username or parsed.password
        or parsed.port not in (None, 443) or parsed.fragment):
        return ""
    from urllib.parse import parse_qs
    if any(SENSITIVE.search(k) for k in parse_qs(parsed.query)):
        return ""
    # Nested image URLs must also be public and noncredentialed.
    for values in parse_qs(parsed.query).values():
        for candidate in values:
            if candidate.startswith(("https://", "http://")) and not art(candidate):
                return ""
    return value


def normalize(row, kind):
    sid = row.get("ratingKey")
    need(isinstance(sid, str) and IDENTITY.fullmatch(sid), "invalid catalogue identity")
    need(row.get("type") == kind, "root type mismatch")
    need(available(row), "normalization of unavailable root")
    title = plain(row.get("title"), 500)
    need(title, "empty root title")
    item = {
        "id": ("plex-movie-" if kind == "movie" else "plex-series-") + sid,
        "sourceId": sid, "sourceType": kind, "provider": "plex", "providerName": "Plex",
        "kind": "film" if kind == "movie" else "series", "mode": "plex-publisher",
        "freeGuestVerified": True, "title": title,
        "description": plain(row.get("summary")), "image": art(row.get("thumb")) or art(row.get("art")),
        "official": official(row.get("publicPagesURL"), kind),
        "categories": sorted(set(plain(g.get("tag"), 100) for g in row.get("Genre", [])
                                 if isinstance(g, dict) and plain(g.get("tag"), 100))),
    }
    for key in ("slug",):
        if isinstance(row.get(key), str) and row[key]:
            item[key] = row[key]
    expiry = numeric(row.get("expiresAt"))
    if expiry is not None:
        item["expiresAt"] = int(expiry) if expiry.is_integer() else expiry
    duration = numeric(row.get("duration"))
    item["duration"] = max(0, duration or 0) / 1000
    year = numeric(row.get("year"))
    if year is not None and year >= 0 and year.is_integer():
        item["year"] = int(year)
    if row.get("contentRating"):
        item["rating"] = plain(row["contentRating"], 50)
    if kind == "show":
        item.update(episodes=[], episodeDiscovery="plex-api")
    return item


class Client:
    def __init__(self):
        self.cid = str(uuid.uuid4())
        self.token, self.created = "", 0.0
        self.auth_lock, self.rate_lock, self.stats_lock = threading.RLock(), threading.Lock(), threading.Lock()
        self.cancelled = threading.Event()
        self.next_at, self.requests = 0.0, 0

    def base_headers(self):
        return {
            "Origin": ORIGIN, "User-Agent": "SheepBox Plex public guest metadata refresh",
            "Accept": "application/json", "Content-Type": "application/json",
            "X-Plex-Product": "Plex Mediaverse", "X-Plex-Client-Identifier": self.cid,
            "X-Plex-Platform": "Web", "X-Plex-Device": "Browser",
            "X-Plex-Language": "en", "X-Plex-Provider-Version": "7.6.0",
        }

    def http(self, url, headers, post=False):
        need(not self.cancelled.is_set(), "request group stopped")
        args = ["curl.exe", "--silent", "--show-error", "--compressed", "--connect-timeout", "15",
                "--max-time", "45", "--max-filesize", "12000000", "--dump-header", "-"]
        if post:
            args += ["--request", "POST", "--data", ""]
        config = []
        for key, value in headers.items():
            need(not any(ch in str(value) for ch in "\r\n"), "invalid request header")
            config.append("header = " + json.dumps(key + ": " + value))
        config.append("url = " + json.dumps(url))
        config_bytes = ("\n".join(config) + "\n").encode("utf8")
        for attempt in range(3):
            # Auth and retries share the metadata request rate bound.
            with self.rate_lock:
                wait = self.next_at - time.monotonic()
                if wait > 0:
                    time.sleep(wait)
                need(not self.cancelled.is_set(), "request group stopped")
                self.next_at = time.monotonic() + 0.25
            proc = subprocess.run(args + ["--config", "-"], input=config_bytes, capture_output=True,
                                  creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
            if proc.returncode:
                if attempt < 2 and proc.returncode in (6, 7, 28, 35, 52, 56):
                    time.sleep(attempt + 1)
                    continue
                self.cancelled.set()
                raise RuntimeError("Plex transport error " + str(proc.returncode))
            parts = re.split(rb"\r?\n\r?\n", proc.stdout, maxsplit=1)
            need(len(parts) == 2, "invalid HTTP response")
            head, body = parts
            status = re.match(rb"HTTP/\S+\s+(\d+)", head.splitlines()[0])
            need(status, "invalid status")
            code = int(status[1])
            if code in (500, 502, 503, 504) and attempt < 2:
                time.sleep(attempt + 1)
                continue
            if code not in (200, 201, 401):
                self.cancelled.set()
            with self.stats_lock:
                self.requests += 1
            need(len(body) <= 12_000_000, "response exceeds explicit metadata size bound")
            # Neither the raw response nor any headers/URLs are logged or persisted.
            return code, json.loads(body)
        raise RuntimeError("Plex retries exhausted")

    def headers(self, renew=False):
        with self.auth_lock:
            if renew or not self.token or time.monotonic() - self.created >= 25 * 60:
                code, data = self.http("https://plex.tv/api/v2/users/anonymous", self.base_headers(), True)
                need(code == 201 and data.get("anonymous") is True
                     and isinstance(data.get("authToken"), str) and data["authToken"],
                     "normal anonymous authorization failed")
                self.token, self.created = data["authToken"], time.monotonic()
            return {**self.base_headers(), "X-Plex-Token": self.token}

    def get(self, path, params=None):
        need(path.startswith("/") and not path.startswith("//") and "?" not in path,
             "invalid metadata path")
        url = BASE + path + ("?" + urlencode(params) if params else "")
        for attempt in range(2):
            code, data = self.http(url, self.headers(renew=attempt == 1))
            if code == 401 and attempt == 0:
                continue
            need(code == 200, "metadata HTTP " + str(code))
            container = data.get("MediaContainer")
            need(isinstance(container, dict) and container.get("identifier") == "tv.plex.provider.vod",
                 "different or missing provider")
            return container
        raise RuntimeError("Plex anonymous session rejected")


class Audit:
    def __init__(self):
        self.client = Client()
        self.roots, self.receipts = {1: {}, 2: {}}, []
        self.root_stats, self.genre_stats, self.excluded = {}, {}, Counter()
        self.genre_memberships, self.missing_from_roots = {}, {}
        self.receipt_lock = threading.Lock()

    def params(self, typ, offset=0, size=100, genre=None, detailed=True):
        result = {"type": typ, "availabilityType": "free", "sort": "titleSort:asc",
                  "X-Plex-Container-Start": offset, "X-Plex-Container-Size": size,
                  "includeElements": "Image"}
        if genre:
            result["genre"] = genre
        if detailed:
            # Genre membership is reconciled separately in full. The optional
            # combined Genre+field projection can produce a publisher HTTP500
            # for one otherwise valid 100-row page; ordinary metadata without
            # that optional element remains available, without changing rights.
            result.update(includeFields=FIELDS)
        else:
            result["includeFields"] = "ratingKey"
        return result

    def pages(self, typ, genre=None, first=None):
        offset, expected, fingerprints, rows, pages = 0, None, set(), [], 0
        prefetched = {}
        while True:
            if offset == 0 and first is not None:
                c = first
            elif genre is None and expected is not None:
                if not prefetched:
                    # Only independent fixed offsets are concurrent. Each batch
                    # is reconciled in order and all workers share Client's
                    # four-request/sec gate. A failed batch submits no next batch.
                    offsets = list(range(offset, min(offset + 300, expected), 100))
                    def fetch(start):
                        return self.client.get("/library/sections/movies/all", self.params(typ, start))
                    with ThreadPoolExecutor(max_workers=3) as pool:
                        values = list(pool.map(fetch, offsets))
                    prefetched = dict(zip(offsets, values))
                c = prefetched.pop(offset)
            else:
                c = self.client.get("/library/sections/movies/all",
                                    self.params(typ, offset, genre=genre, detailed=genre is None))
            batch = c.get("Metadata", [])
            need(isinstance(batch, list), "invalid Metadata array")
            total, size = c.get("totalSize"), c.get("size")
            need(isinstance(total, int) and total >= 0 and isinstance(size, int)
                 and 0 <= size <= 100 and size == len(batch) and c.get("offset", offset) == offset,
                 "invalid provider paging envelope")
            need(expected in (None, total), "publisher total changed while paging")
            expected = total
            if genre is None:
                need(size == min(100, total - offset), "root fixed-offset batch size changed")
            need(all(isinstance(r, dict) and isinstance(r.get("ratingKey"), str)
                     and IDENTITY.fullmatch(r["ratingKey"]) for r in batch), "invalid stable root identity")
            if batch:
                fingerprint = tuple(r["ratingKey"] for r in batch)
                need(fingerprint not in fingerprints, "repeated page")
                fingerprints.add(fingerprint)
            rows.extend(batch)
            pages += 1
            offset += size
            need(offset <= total and (size > 0 or offset >= total), "empty or excessive page before total")
            if genre is None and (offset % 2000 == 0 or offset >= total):
                print(("Movies" if typ == 1 else "Shows") + " " + str(offset) + "/" + str(total), flush=True)
            if offset >= total:
                break
        need(offset == expected, "unreconciled provider offsets")
        receipt = {
            "type": typ, "genreId": genre, "publisherRows": expected,
            "consumedRows": offset, "uniqueIds": len({r["ratingKey"] for r in rows}),
            "duplicateRows": len(rows) - len({r["ratingKey"] for r in rows}),
            "pages": pages, "exhausted": True,
        }
        with self.receipt_lock:
            self.receipts.append(receipt)
        return rows, receipt

    def ensure_link(self, row):
        kind, sid = row.get("type"), row.get("ratingKey")
        try:
            official(row.get("publicPagesURL"), kind)
            return row
        except ValueError:
            c = self.client.get("/library/metadata/" + sid)
            matches = [r for r in c.get("Metadata", []) if r.get("ratingKey") == sid]
            need(len(matches) == 1 and matches[0].get("type") == kind and available(matches[0]),
                 "root publisher page unavailable for " + sid)
            return matches[0]

    def read_root(self, typ):
        rows, receipt = self.pages(typ)
        kind = "movie" if typ == 1 else "show"
        result = {}
        for row in rows:
            need(row.get("type") == kind, "unexpected free root type")
            if not available(row):
                self.excluded[kind + ":" + exclusion_reason(row)] += 1
                continue
            row = self.ensure_link(row)
            item = normalize(row, kind)
            sid = item["sourceId"]
            if sid in result:
                need(result[sid]["official"] == item["official"], "duplicate root disagrees on official identity")
                item["categories"] = sorted(set(item["categories"]) | set(result[sid]["categories"]))
            result[sid] = item
        return typ, result, receipt

    def genre_plan(self):
        genres = []
        for typ in (1, 2):
            c = self.client.get("/library/sections/movies/genre", {"type": typ, "availabilityType": "free"})
            directory = c.get("Directory")
            need(isinstance(directory, list) and len(directory) == c.get("totalSize"),
                 "genre inventory did not reconcile")
            for row in directory:
                need(row.get("field") == "genre" and row.get("type") == ("movie" if typ == 1 else "show")
                     and isinstance(row.get("value"), str) and IDENTITY.fullmatch(row["value"])
                     and plain(row.get("title"), 100), "unknown genre inventory row")
                genres.append({"type": typ, "id": row["value"], "title": plain(row["title"], 100)})
        def first_page(g):
            try:
                c = self.client.get("/library/sections/movies/all",
                                    self.params(g["type"], genre=g["id"], detailed=False))
                return g, c
            except Exception:
                self.client.cancelled.set()
                raise
        with ThreadPoolExecutor(max_workers=3) as pool:
            plan = list(pool.map(first_page, genres))
        estimated_pages = sum((c.get("totalSize", 0) + 99) // 100 for _, c in plan)
        membership_rows = sum(c.get("totalSize", 0) for _, c in plan)
        print("Plan: " + str(len(genres)) + " genres, " + str(membership_rows)
              + " membership slots, about " + str(estimated_pages) + " membership pages", flush=True)
        return plan

    def run(self):
        plan = self.genre_plan()
        # Root fixed-offset batches already use three workers. Serial root types
        # keep the overall request concurrency bounded at three, as in genres.
        for typ in (1, 2):
            _, rows, receipt = self.read_root(typ)
            self.roots[typ], self.root_stats[typ] = rows, receipt
        def membership(entry):
            try:
                genre, first = entry
                rows, receipt = self.pages(genre["type"], genre["id"], first=first)
                return genre, rows, receipt
            except Exception:
                self.client.cancelled.set()
                raise
        with ThreadPoolExecutor(max_workers=3) as pool:
            for done, (genre, rows, receipt) in enumerate(pool.map(membership, plan), 1):
                typ = genre["type"]
                ids = {r["ratingKey"] for r in rows}
                self.genre_memberships[(typ, genre["id"])] = ids
                self.genre_stats[(typ, genre["id"])] = receipt
                for sid in ids:
                    item = self.roots[typ].get(sid)
                    if item is None:
                        self.missing_from_roots.setdefault((typ, sid), set()).add(genre["title"])
                    elif genre["title"] not in item["categories"]:
                        item["categories"].append(genre["title"])
                if done % 10 == 0 or done == len(plan):
                    print("Genre membership " + str(done) + "/" + str(len(plan)), flush=True)
        # Investigate every genre-only identity rather than silently dropping it.
        for (typ, sid), labels in sorted(self.missing_from_roots.items()):
            c = self.client.get("/library/metadata/" + sid)
            matches = [r for r in c.get("Metadata", []) if r.get("ratingKey") == sid]
            need(len(matches) == 1, "unresolved genre-only identity " + sid)
            row = matches[0]
            if not available(row):
                self.excluded["genreOnly:" + exclusion_reason(row)] += 1
                continue
            item = normalize(self.ensure_link(row), "movie" if typ == 1 else "show")
            item["categories"] = sorted(set(item["categories"]) | labels)
            self.roots[typ][sid] = item
        items, shows = list(self.roots[1].values()), list(self.roots[2].values())
        for rows in (items, shows):
            for row in rows:
                row["categories"] = sorted(set(row["categories"]))
            rows.sort(key=lambda r: (r["title"].casefold(), r["sourceId"]))
        all_rows = items + shows
        need(len({r["id"] for r in all_rows}) == len(all_rows), "normalized identities collide")
        need(all(numeric(r.get("expiresAt")) is not None and r["expiresAt"] > time.time()
                 for r in all_rows), "offer expired before completed export")
        completed = datetime.now(timezone.utc).isoformat()
        missing_art = [r["id"] for r in all_rows if not r["image"]]
        report = {
            "complete": True, "completeRootDirectories": True, "genresReconciled": True,
            "counts": {"videos": len(items), "shows": len(shows), "live": 0},
            "providerWideComplete": False, "generatedAt": completed,
            "scope": "Complete current free movie/show root directories and genre membership. "
                     "Every opened show loads all currently free seasons/episodes; "
                     "no whole-service/all-episode pre-audit claim.",
            "region": None,
            "regionalScope": "Publisher-selected offer on the audit connection; no country override or inferred country.",
            "rootDeclaredRows": {str(k): v["publisherRows"] for k, v in self.root_stats.items()},
            "rootUniqueIds": {str(k): v["uniqueIds"] for k, v in self.root_stats.items()},
            "rootDuplicateRows": {str(k): v["duplicateRows"] for k, v in self.root_stats.items()},
            "genresChecked": len(plan), "movieGenres": sum(g["type"] == 1 for g, _ in plan),
            "showGenres": sum(g["type"] == 2 for g, _ in plan),
            "genreOnlyIdentitiesChecked": len(self.missing_from_roots),
            "missingArt": len(missing_art), "missingDescriptions": sum(not r["description"] for r in all_rows),
            "excludedRoots": dict(self.excluded), "episodesPreAudited": False,
        }
        value = {"schema": 1, "provider": "plex", "generatedAt": completed,
                 "items": items, "live": [], "providerSeries": shows, "report": report}
        forbidden = {"token", "authToken", "headers", "cookies", "session", "sessionId",
                     "Media", "Part", "Ad", "license", "licenseUrl", "adTag", "streams"}
        for row in all_rows:
            need(not forbidden & set(row), "private/runtime field in normalized metadata")
            need(row["mode"] == "plex-publisher" and row["freeGuestVerified"] is True,
                 "invalid normalized free root")
        return value


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True,
                        help="Destination for the completed normalized plex.json metadata file")
    parser.add_argument("--origin", default=ORIGIN,
                        help="Actual intended application origin, without a path or publisher impersonation")
    args = parser.parse_args()
    OUT = args.output.expanduser().resolve()
    ORIGIN = args.origin.rstrip("/")
    app_origin = urlsplit(ORIGIN)
    if (
        app_origin.scheme not in ("https", "http") or not app_origin.hostname
        or app_origin.username or app_origin.password or app_origin.path or app_origin.query or app_origin.fragment
    ):
        parser.error("--origin must be the actual application origin without credentials, path, query or fragment")
    OUT.mkdir(parents=True, exist_ok=True)
    try:
        value = Audit().run()
        raw = (json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf8")
        temporary = OUT / "plex.json.tmp"
        temporary.write_bytes(raw)
        temporary.replace(OUT / "plex.json")
        print(json.dumps({"complete": True, "counts": value["report"]["counts"], "bytes": len(raw),
                          "sha256": hashlib.sha256(raw).hexdigest()}), flush=True)
    except Exception as error:
        # Exception text and subprocess stderr may contain request context.
        # Print only its type; no raw headers, responses, URLs or values.
        print(json.dumps({"complete": False, "errorType": type(error).__name__}), flush=True)
        raise SystemExit(1) from None
