"""Export regular PBS's complete checked free catalogue as safe browser metadata.

The output directory is private audit storage. Only pbs-web-catalog.json is a
candidate runtime artifact; no player responses, media/ad URLs or cookies are
saved. Every eligible video gets an ordinary logged-out portal-player check.
Use --resume after an interrupted run; safe per-video receipts expire in 6h.
"""
from __future__ import annotations

import argparse
import concurrent.futures as futures
import datetime as dt
import hashlib
import json
import pathlib
import re
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter, deque


API = "https://content.services.pbs.org/graphql/"
SITE = "https://www.pbs.org"
VERSION = 1
SLUG = re.compile(r"[A-Za-z0-9_-]{1,180}\Z")
UUID = re.compile(r"[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}\Z")
NUMERIC = re.compile(r"[1-9][0-9]{5,11}\Z")
GENRES = {"ARTS_AND_MUSIC": "Arts & Music", "CULTURE": "Culture", "DRAMA": "Drama",
          "FOOD": "Food", "HISTORY": "History", "HOME_AND_HOWTO": "Home & How-To",
          "INDIE_FILMS": "Documentaries & Indie Films", "NEWS_AND_PUBLIC_AFFAIRS": "News & Public Affairs",
          "SCIENCE_AND_NATURE": "Science & Nature"}
DIRECTORY = '''query SheepBoxShows($after:String){searchShows(first:50,ordering:ALPHABETICAL,after:$after){edges{node{__typename slug}}pageInfo{hasNextPage endCursor}}}'''
ALL_SHOWS = '''query SheepBoxAllShows($after:String){allShows(first:50,after:$after){edges{node{__typename slug}}pageInfo{hasNextPage endCursor}}}'''
BATCH = '''query SheepBoxGuestVideos($slugs:[String!]!){showsBatch(showSlugs:$slugs,minExpireDays:0){show{slug title genre description:descriptionLong image:poster2x3ImageUrl}fullLengthAssets{id cid slug title duration isMvod availability videoType seasonOrdinal episodeOrdinal expireDate description:descriptionShort image:mezzanine16x9ImageUrl}}}'''


def stamp():
    return dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z")


def instant(value):
    result = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    if result.tzinfo is None:
        raise ValueError("Timestamp has no timezone")
    return result.astimezone(dt.timezone.utc)


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()).hexdigest()


def write_json(path, value):
    temporary = path.with_name(path.name + ".pending")
    temporary.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf8")
    temporary.replace(path)


def clean(value, limit=4000):
    if not isinstance(value, str):
        return ""
    return re.sub(r"\s+", " ", value).strip()[:limit]


def artwork(value):
    if not value:
        return ""
    parsed = urllib.parse.urlsplit(value)
    if parsed.scheme != "https" or parsed.hostname != "image.pbs.org" or parsed.username or parsed.password or parsed.port not in (None, 443):
        raise ValueError("Unrecognized PBS artwork address")
    return value


def ordinal(value):
    if value is None:
        return None
    if type(value) is not int or value > 100000:
        raise ValueError("Invalid PBS ordinal")
    return value if value > 0 else None


def runtime_report(report):
    """Keep the runtime artifact's provenance concise; detailed receipts stay private."""
    directories = report["directories"]
    return {"complete": report["complete"],
            "counts": {"videos": report["videos"], "shows": report["shows"], "live": 0},
            "scope": report["scope"], "completedAt": report["generatedAt"],
            "directoryTotals": {"searchResources": directories[0]["resources"],
                                "franchiseGroups": len(directories[0]["franchises"]),
                                "searchShows": directories[0]["shows"],
                                "allShows": directories[1]["shows"],
                                "checkedShows": report["showsChecked"]},
            "candidateVideos": report["uniqueEligibleCandidates"], "playerChecks": report["playerChecks"],
            "embeddedVideos": report["embedded"], "publisherHandoffs": report["publisherHandoffs"],
            "excludedVideos": sum(report["excluded"].values())}


class Audit:
    def __init__(self, output, workers, delay, resume):
        self.output, self.workers, self.delay, self.resume = output, workers, delay, resume
        self.stop = threading.Event()
        self.lock = threading.Lock()
        self.next_request = 0.0
        self.requests = 0
        self.started = stamp()
        self.http_status = Counter()
        self.output.mkdir(parents=True, exist_ok=True)
        self.batch_dir = self.output / "batches"
        self.batch_dir.mkdir(exist_ok=True)

    def request(self, url, payload=None):
        parsed = urllib.parse.urlsplit(url)
        if parsed.scheme != "https" or parsed.hostname not in {"content.services.pbs.org", "player.pbs.org"}:
            raise ValueError("Unrecognized PBS request destination")
        headers = {"User-Agent": "SheepBox/2.0.0-Web-RC5 (public PBS catalogue metadata audit)"}
        data = None
        if payload is not None:
            headers.update({"Content-Type": "application/json", "X-PBS-Platform": "pbsorg", "X-PBS-Platform-Version": "1.0"})
            data = json.dumps(payload).encode()
        for attempt in range(3):
            if self.stop.is_set():
                raise RuntimeError("Audit stopped after a publisher refusal or incomplete response")
            with self.lock:
                wait = max(0, self.next_request - time.monotonic())
                self.next_request = time.monotonic() + wait + self.delay
            if self.stop.wait(wait):
                raise RuntimeError("Audit stopped")
            try:
                req = urllib.request.Request(url, data=data, headers=headers)
                with urllib.request.urlopen(req, timeout=40) as response:
                    if urllib.parse.urlsplit(response.url).hostname != parsed.hostname:
                        raise RuntimeError("Unexpected publisher redirect")
                    body = response.read(32_000_001)
                    if len(body) > 32_000_000:
                        raise RuntimeError("Publisher response exceeds the explicit completeness bound")
                    with self.lock:
                        self.requests += 1
                        self.http_status[response.status] += 1
                    return body.decode("utf8")
            except urllib.error.HTTPError as exc:
                with self.lock:
                    self.requests += 1
                    self.http_status[exc.code] += 1
                if exc.code in (401, 403, 429):
                    self.stop.set()
                if exc.code in (500, 502, 503, 504) and attempt < 2:
                    self.stop.wait(0.6 * (attempt + 1))
                    continue
                raise RuntimeError(f"PBS HTTP {exc.code}; metadata audit incomplete") from None
            except (urllib.error.URLError, TimeoutError, OSError):
                if attempt < 2:
                    self.stop.wait(0.6 * (attempt + 1))
                    continue
                raise RuntimeError("PBS network request failed; metadata audit incomplete") from None
        raise RuntimeError("PBS request did not finish")

    def query(self, query, variables):
        packet = json.loads(self.request(API, {"query": query, "variables": variables}))
        if packet.get("errors") or not isinstance(packet.get("data"), dict):
            raise RuntimeError("PBS GraphQL returned errors or incomplete data")
        return packet["data"]

    def directory(self, field, query):
        after, ids, cursors, pages = None, [], set(), 0
        resource_ids, franchises = set(), []
        while True:
            result = self.query(query, {"after": after})[field]
            edges, info = result["edges"], result["pageInfo"]
            if not isinstance(edges, list) or len(edges) > 50 or type(info.get("hasNextPage")) is not bool:
                raise RuntimeError("PBS directory shape changed")
            page = [row["node"]["slug"] for row in edges]
            if any(not SLUG.fullmatch(slug) for slug in page) or len(set(page)) != len(page) or resource_ids.intersection(page):
                raise RuntimeError("PBS directory has malformed or repeated show identities")
            resource_ids.update(page)
            for edge in edges:
                row = edge["node"]
                if row.get("__typename") == "Show":
                    ids.append(row["slug"])
                elif row.get("__typename") == "Franchise":
                    franchises.append(row["slug"])
                else:
                    raise RuntimeError("PBS directory introduced an unknown resource type")
            pages += 1
            if not info["hasNextPage"]:
                break
            cursor = info.get("endCursor")
            if not page or not isinstance(cursor, str) or not 1 <= len(cursor) <= 512 or cursor in cursors:
                raise RuntimeError("PBS directory cursor did not advance")
            cursors.add(cursor)
            after = cursor
        if not ids:
            raise RuntimeError("PBS directory is empty")
        print(f"{field}: {len(ids)} shows, {len(franchises)} franchise groups, {pages} exhausted pages", flush=True)
        return ids, {"field": field, "resources": len(resource_ids), "shows": len(ids), "franchises": franchises,
                     "pages": pages, "cursorExhausted": True,
                     "identitySha256": digest(sorted(ids))}

    def jobs(self, values, function):
        queue = deque(values)
        with futures.ThreadPoolExecutor(max_workers=self.workers) as pool:
            pending = {}
            for _ in range(min(self.workers, len(queue))):
                value = queue.popleft()
                pending[pool.submit(function, value)] = value
            while pending:
                done, _ = futures.wait(pending, return_when=futures.FIRST_COMPLETED)
                for future in done:
                    value = pending.pop(future)
                    try:
                        yield value, future.result()
                    except Exception:
                        self.stop.set()
                        for other in pending:
                            other.cancel()
                        raise
                    if queue and not self.stop.is_set():
                        value = queue.popleft()
                        pending[pool.submit(function, value)] = value

    def load_batch(self, slugs):
        key = digest(slugs)
        path = self.batch_dir / (key + ".json")
        if self.resume and path.exists():
            saved = json.loads(path.read_text("utf8"))
            age = (dt.datetime.now(dt.timezone.utc) - instant(saved["checkedAt"])).total_seconds()
            if saved.get("schema") == VERSION and saved.get("slugs") == slugs and 0 <= age < 6 * 3600:
                return saved["rows"]
        rows = self.query(BATCH, {"slugs": slugs})["showsBatch"]
        if not isinstance(rows, list):
            raise RuntimeError("PBS batch is not a complete show list")
        returned = [row["show"]["slug"] for row in rows]
        if set(returned) != set(slugs) or len(returned) != len(slugs):
            missing = sorted(set(slugs) - set(returned))
            extra = sorted(set(returned) - set(slugs))
            raise RuntimeError(f"PBS batch identity mismatch: missing={missing}, extra={extra}, returned={len(returned)}, expected={len(slugs)}")
        safe = []
        for row in rows:
            show = row["show"]
            metadata = {key: show.get(key) for key in ("slug", "title", "genre", "description", "image")}
            if not clean(metadata["title"], 500) or not isinstance(row.get("fullLengthAssets"), list):
                raise RuntimeError("PBS show metadata is incomplete")
            assets = []
            for asset in row["fullLengthAssets"]:
                assets.append({key: asset.get(key) for key in ("id", "cid", "slug", "title", "duration", "isMvod", "availability", "videoType", "seasonOrdinal", "episodeOrdinal", "expireDate", "description", "image")})
            safe.append({"show": metadata, "fullLengthAssets": assets})
        write_json(path, {"schema": VERSION, "checkedAt": stamp(), "slugs": slugs, "rows": safe})
        return safe

    def bridge(self, asset):
        slug = asset["slug"]
        params = urllib.parse.urlencode({"userPassportStatus": "loggedout", "parentURL": f"{SITE}/video/{slug}/"})
        html = self.request(f"https://player.pbs.org/portalplayer/{slug}/?{params}")
        marker = re.search(r"window\.videoBridge\s*=\s*", html)
        if not marker:
            raise RuntimeError(f"Missing PBS bridge for {slug}")
        data = json.JSONDecoder().raw_decode(html[marker.end():].lstrip())[0]
        if data.get("slug") != slug or data.get("cid") != asset["cid"] or not NUMERIC.fullmatch(str(data.get("id", ""))):
            raise RuntimeError(f"PBS player identity mismatch for {slug}")
        expiry = data.get("expire_date")
        if expiry is not None and (not isinstance(expiry, str) or not expiry):
            raise RuntimeError(f"Unknown PBS expiry contract for {slug}")
        expired = bool(expiry and instant(expiry) <= dt.datetime.now(dt.timezone.utc))
        availability, member, playable = data.get("availability"), data.get("is_mvod"), data.get("is_playable")
        if not isinstance(availability, str) or type(member) is not bool or type(playable) is not bool:
            raise RuntimeError(f"Incomplete PBS guest eligibility for {slug}")
        if data.get("video_type") != "full_length":
            raise RuntimeError(f"PBS full-length identity changed for {slug}")
        reason = "expired" if expired else "membership" if member else "unavailable" if availability != "available" or not playable else ""
        return {"schema": VERSION, "checkedAt": stamp(), "slug": slug, "cid": asset["cid"],
                "sourceId": str(data["id"]), "freeGuestVerified": not reason,
                "embedAllowed": data.get("allow_embed") is True,
                "embeddingPermissionKnown": type(data.get("allow_embed")) is bool,
                "expiresAt": expiry, "excludedReason": reason}

    def run(self):
        ids, search_report = self.directory("searchShows", DIRECTORY)
        all_ids, all_report = self.directory("allShows", ALL_SHOWS)
        expected = sorted(set(ids) | set(all_ids))
        write_json(self.output / "directory.json", {"schema": VERSION, "generatedAt": stamp(), "slugs": expected,
                   "directories": [search_report, all_report], "onlySearch": sorted(set(ids)-set(all_ids)), "onlyAllShows": sorted(set(all_ids)-set(ids))})
        chunks = [expected[index:index+10] for index in range(0, len(expected), 10)]
        shows = {}
        for _, rows in self.jobs(chunks, self.load_batch):
            for row in rows:
                slug = row["show"]["slug"]
                if slug in shows:
                    raise RuntimeError("Duplicate completed show batch")
                shows[slug] = row
            print(f"Show metadata: {len(shows)}/{len(expected)}", flush=True)
        if set(shows) != set(expected):
            raise RuntimeError("Not every directory show was checked")
        candidates, owners, excluded = {}, {}, Counter()
        today = dt.datetime.now(dt.timezone.utc).date()
        raw_count = 0
        for show_slug, row in sorted(shows.items()):
            seen = set()
            for asset in row["fullLengthAssets"]:
                raw_count += 1
                slug, cid = asset.get("slug"), asset.get("cid")
                if not isinstance(slug, str) or not SLUG.fullmatch(slug) or not isinstance(cid, str) or not UUID.fullmatch(cid) or not clean(asset.get("title"), 500):
                    raise RuntimeError("Malformed PBS asset identity")
                if cid in seen:
                    raise RuntimeError(f"Repeated PBS asset in show {show_slug}")
                seen.add(cid)
                if asset.get("isMvod") is not False or asset.get("availability") != "available" or asset.get("videoType") != "FULL_LENGTH":
                    excluded["nonFreeFullLength"] += 1
                    continue
                expiry = asset.get("expireDate")
                if expiry is not None:
                    if dt.date.fromisoformat(expiry) < today:
                        excluded["expiredMetadata"] += 1
                        continue
                if cid in candidates and any(candidates[cid].get(key) != asset.get(key) for key in ("slug", "title", "isMvod", "availability", "videoType", "expireDate")):
                    raise RuntimeError("Conflicting repeated PBS asset metadata")
                candidates[cid] = asset
                owners.setdefault(cid, []).append(show_slug)
        print(f"Eligible metadata: {len(candidates)} unique videos from {raw_count} show references", flush=True)
        receipts = {}
        receipt_path = self.output / "bridge-receipts.ndjson"
        if self.resume and receipt_path.exists():
            lines = receipt_path.read_text("utf8").splitlines()
            for index, line in enumerate(lines):
                try:
                    saved = json.loads(line)
                except json.JSONDecodeError:
                    if index == len(lines)-1:
                        break
                    raise RuntimeError("An earlier bridge checkpoint is damaged") from None
                cid = saved.get("cid")
                age = (dt.datetime.now(dt.timezone.utc)-instant(saved["checkedAt"])).total_seconds()
                if saved.get("schema") == VERSION and cid in candidates and saved["slug"] == candidates[cid]["slug"] and 0 <= age < 6*3600:
                    receipts[cid] = saved
        with receipt_path.open("w", encoding="utf8") as handle:
            for saved in receipts.values():
                handle.write(json.dumps(saved, separators=(",", ":")) + "\n")
            handle.flush()
            pending = [asset for cid, asset in sorted(candidates.items()) if cid not in receipts]
            print(f"Player checks: {len(receipts)}/{len(candidates)} reused; {len(pending)} pending", flush=True)
            for asset, result in self.jobs(pending, self.bridge):
                receipts[asset["cid"]] = result
                handle.write(json.dumps(result, separators=(",", ":")) + "\n")
                handle.flush()
                if len(receipts) % 100 == 0 or len(receipts) == len(candidates):
                    print(f"Player checks: {len(receipts)}/{len(candidates)}; embedded {sum(r['freeGuestVerified'] and r['embedAllowed'] for r in receipts.values())}; handoff {sum(r['freeGuestVerified'] and not r['embedAllowed'] for r in receipts.values())}", flush=True)
        if set(receipts) != set(candidates):
            raise RuntimeError("Not every eligible asset received a current player check")
        # A changed index cannot be silently declared a complete current snapshot.
        final_ids, final_search = self.directory("searchShows", DIRECTORY)
        final_all, final_all_report = self.directory("allShows", ALL_SHOWS)
        if set(final_ids) != set(ids) or set(final_all) != set(all_ids):
            raise RuntimeError("PBS directory changed during the audit; resume with the current index")
        items, by_show, player_ids = [], {}, set()
        for cid, asset in sorted(candidates.items()):
            receipt = receipts[cid]
            if not receipt["freeGuestVerified"]:
                excluded["player:" + receipt["excludedReason"]] += 1
                continue
            player_id = receipt["sourceId"]
            if player_id in player_ids:
                raise RuntimeError("A PBS numeric player identity belongs to more than one CID")
            player_ids.add(player_id)
            parents = sorted(owners[cid])
            categories = sorted({GENRES.get(shows[p]["show"].get("genre"), "Other shows") for p in parents})
            item_id = "pbs-video-" + player_id
            item = {"id": item_id, "provider": "pbs", "providerName": "PBS", "kind": "episode",
                    "sourceId": player_id, "cid": cid, "slug": asset["slug"], "title": clean(asset["title"], 500),
                    "description": clean(asset.get("description")), "image": artwork(asset.get("image")),
                    "categories": categories, "seriesId": "pbs-show-" + parents[0],
                    "official": f"{SITE}/video/{asset['slug']}/", "mode": "pbs" if receipt["embedAllowed"] else "publisherLink",
                    "embedAllowed": receipt["embedAllowed"], "freeGuestVerified": True,
                    "expiresAt": receipt["expiresAt"], "checkedAt": receipt["checkedAt"]}
            for field, source in (("seasonNumber", "seasonOrdinal"), ("episodeNumber", "episodeOrdinal")):
                number = ordinal(asset.get(source))
                if number is not None:
                    item[field] = number
            duration = asset.get("duration")
            if duration is not None:
                if type(duration) is not int or duration < 0:
                    raise RuntimeError("Invalid PBS duration")
                item["duration"] = duration
            items.append(item)
            for parent in parents:
                by_show.setdefault(parent, []).append(item)
        series = []
        for slug, videos in sorted(by_show.items()):
            show = shows[slug]["show"]
            videos.sort(key=lambda v: (-(v.get("seasonNumber") or 0), v.get("episodeNumber") or 0, v["title"], v["id"]))
            series.append({"id": "pbs-show-" + slug, "provider": "pbs", "providerName": "PBS", "slug": slug,
                           "kind": "series", "mode": "series", "title": clean(show["title"], 500),
                           "description": clean(show.get("description")), "image": artwork(show.get("image")),
                           "categories": [GENRES.get(show.get("genre"), "Other shows")],
                           "official": f"{SITE}/show/{slug}/", "episodes": [video["id"] for video in videos]})
        if not items or not series:
            raise RuntimeError("The completed PBS library is unexpectedly empty")
        by_id = {item["id"]: item for item in items}
        if sum(len(show["episodes"]) for show in series) != len(items) or any(
                by_id[episode]["seriesId"] != show["id"] for show in series for episode in show["episodes"]):
            raise RuntimeError("PBS episode ownership needs reconciliation before a complete export")
        report = {"generatedAt": stamp(), "startedAt": self.started, "complete": True, "selectionComplete": True,
                  "providerWideComplete": True, "source": "Ordinary public PBS GraphQL show directories and logged-out portal players",
                  "scope": "Complete checked public regular-PBS free full-length selection. PBS KIDS and local live TV are separate. Publisher region, availability and free windows remain authoritative.",
                  "directories": [search_report, all_report], "finalDirectories": [final_search, final_all_report],
                  "directoryShows": len(expected), "showBatches": len(chunks), "showsChecked": len(shows),
                  "fullLengthReferences": raw_count, "uniqueEligibleCandidates": len(candidates), "playerChecks": len(receipts),
                  "shows": len(series), "videos": len(items), "embedded": sum(i["embedAllowed"] for i in items),
                  "publisherHandoffs": sum(not i["embedAllowed"] for i in items),
                  "unknownEmbeddingPermissions": sum(not r["embeddingPermissionKnown"] for r in receipts.values()),
                  "sharedVideoReferences": sum(len(value)-1 for value in owners.values()), "excluded": dict(excluded),
                  "videoIdentitySha256": digest(sorted(i["cid"] for i in items)), "requestsThisRun": self.requests,
                  "httpStatusThisRun": dict(self.http_status),
                  "privacy": "Stable metadata only; no cookies, credentials, player configuration, playback offers, advertising or caption URLs are exported.",
                  "playbackAcceptance": "Metadata and explicit embedding-permission checks; actual browser decoding and ad delivery require separate acceptance."}
        result = {"schema": 1, "provider": "pbs", "generatedAt": report["generatedAt"], "items": sorted(items, key=lambda i: (i["title"].casefold(), i["id"])),
                  "providerSeries": series, "live": [], "report": runtime_report(report)}
        write_json(self.output / "pbs-web-catalog.json", result)
        write_json(self.output / "audit-report.json", report)
        incomplete = self.output / "audit-incomplete.json"
        if incomplete.exists():
            incomplete.unlink()
        print(json.dumps({key: report[key] for key in ("complete", "directoryShows", "shows", "videos", "embedded", "publisherHandoffs", "excluded")}), flush=True)
        return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True, type=pathlib.Path)
    parser.add_argument("--workers", type=int, default=3, choices=(1, 2, 3))
    parser.add_argument("--delay", type=float, default=0.15, help="Minimum global delay between public requests")
    parser.add_argument("--resume", action="store_true")
    args = parser.parse_args()
    if args.delay < 0.05:
        parser.error("Keep at least 0.05s between public requests")
    audit = Audit(args.output.resolve(), args.workers, args.delay, args.resume)
    try:
        audit.run()
    except Exception as error:
        audit.stop.set()
        failure = {"schema": VERSION, "generatedAt": stamp(), "complete": False, "stage": "unfinished audit",
                   "reason": str(error), "requestsThisRun": audit.requests, "httpStatusThisRun": dict(audit.http_status)}
        write_json(audit.output / "audit-incomplete.json", failure)
        print(json.dumps(failure), flush=True)
        raise SystemExit(1) from None


if __name__ == "__main__":
    main()
