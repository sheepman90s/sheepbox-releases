"""Reproduce Revry's complete public guest-directory and episode-offer audit.

Only the final count/coverage receipt is suitable for committing. Raw exchanges
go to an explicitly supplied directory outside this checkout. No account is used.
"""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from collections import Counter
from datetime import datetime, timezone
import argparse, hashlib, json, string, urllib.error, urllib.parse, urllib.request, uuid

BASE = 'https://backstage-api.com'

def unblocked(row):
    blocked, price = row.get('blocked'), row.get('minimumPrice')
    return not row.get('isHidden') and (blocked is None or blocked == []) and price in (None, 0, 0.0, '0')

def supported(editions):
    return any(e.get('editionType') == 'full' and unblocked(e) and e.get('price') in (None, 0, 0.0, '0')
               and any((s.get('type'), s.get('drm')) in [('hls', 'unencrypted'), ('dash', 'widevine')]
                       for s in e.get('streams', [])) for e in editions)

def run(output):
    output.mkdir(parents=True, exist_ok=True)
    headers = {'Accept': 'application/json', 'User-Agent': 'SheepBox guest catalogue audit',
               'X-Service-ID': '0f7df5f0-d19e-11ef-8f78-d97d2702e67c',
               'X-Application-ID': '86ec0a90-d345-11ef-b549-c3f611f19132',
               'X-Device-ID': str(uuid.uuid4()), 'X-Device-Type': 'web', 'Accept-Language': 'en'}
    missing_responses = Counter()
    def get(path, params=None, allow_missing=False):
        url = BASE + path + ('?' + urllib.parse.urlencode(params) if params else '')
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=40) as r:
                raw = r.read(12_000_001)
                if len(raw) > 12_000_000: raise ValueError('Explicit incomplete: response size bound')
        except urllib.error.HTTPError as error:
            if allow_missing and error.code in (404, 410):
                missing_responses[error.code] += 1
                return None
            raise
        return json.loads(raw)
    def pages(path, params=None, filtered=False, episodes=False):
        result, ids, offset, expected = [], set(), 0, None
        for _ in range(2000):
            data = get(path, {**(params or {}), 'offset': offset, 'size': 100})
            rows = data['items']
            if not episodes:
                total = data['total']
                if data['offset'] != offset or data['size'] != 100: raise ValueError('Paging contract changed')
                if expected is not None and expected != total: raise ValueError('Changing publisher total')
                expected = total
                if filtered and offset >= total:
                    if rows: raise ValueError('Search did not exhaust at its publisher total')
                    return result
            elif not rows: return result
            if len(rows) > 100: raise ValueError('Oversized page')
            for row in rows:
                if row['id'] in ids: raise ValueError('Duplicate page identity')
                ids.add(row['id'])
            result.extend(rows)
            offset += 100 if filtered else len(rows)
            if not filtered and not episodes:
                if offset == expected: return result
                if not rows or offset > expected: raise ValueError('Unreconciled publisher total')
        raise ValueError('Explicit incomplete: pagination safety bound')
    config = get('/configurations/application')
    guest = config['custom']['features']['guestMode']
    if not guest.get('enabled') or not guest.get('allowWatchContent'): raise ValueError('Guest watching unavailable')
    main = config['features']['menus']['main']
    menu = next(x for x in get('/menus') if x['id'] == main)
    def menu_pages(items):
        for item in items:
            if item['type'] == 'page': yield item['reference']
            yield from menu_pages(item.get('items', []))
    page_ids = set(menu_pages(menu['items'])); checked_pages = set(); playlists = set(); items = {}
    while page_ids - checked_pages:
        if len(page_ids) > 2000: raise ValueError('Explicit incomplete: linked-page safety bound')
        id = min(page_ids - checked_pages)
        for section in get('/pages/' + id, {'includeItems': 'false'}):
            if any(section.get(k) for k in ['remoteUrl', 'computedPlaylist', 'linkItems']):
                raise ValueError('Explicit incomplete: new catalogue source')
            for extra in section.get('additionalItems') or []:
                if extra.get('type') != 'image': raise ValueError('Explicit incomplete: new additional item type')
                target = extra.get('target')
                if target is None: continue
                if target.get('type') != 'page' or not target.get('link'):
                    raise ValueError('Explicit incomplete: new catalogue link target')
                page_ids.add(target['link'])
            if section.get('playlistId'):
                params = {}; sorting = section.get('sorting') or {}
                if sorting.get('field'): params['sortField'] = sorting['field']
                if sorting.get('order'): params['sortOrder'] = sorting['order']
                if section.get('pinnedItems'): params['pinnedItems'] = ','.join(section['pinnedItems'])
                playlists.add((section['playlistId'], tuple(sorted(params.items()))))
        checked_pages.add(id)
    def collect(rows):
        for row in rows:
            if row.get('type') not in ['movie', 'series', 'episode', 'clip', 'channel']:
                raise ValueError('Explicit incomplete: unsupported content type')
            items[row['type'] + '~' + row['id']] = row
    for id, params in sorted(playlists): collect(pages('/playlists/' + id, dict(params)))
    checked_genres = set()
    def genres():
        while True:
            pending = {g['id'] for x in items.values() for g in x.get('genres', [])} - checked_genres
            if not pending: return
            if len(checked_genres | pending) > 2000: raise ValueError('Explicit incomplete: genre safety bound')
            for id in sorted(pending):
                collect(pages('/genres/' + id + '/media')); checked_genres.add(id)
    genres()
    for term in string.ascii_lowercase + string.digits:
        collect(pages('/search', {'q': term}, filtered=True))
    genres()
    channels = pages('/media/channels')
    collect(channels)
    checked_episodes, episode_parents, unavailable_parents = set(), {}, set()
    while True:
        pending = {key: row for key, row in items.items() if row['type'] == 'episode' and key not in checked_episodes}
        if not pending: break
        if len(checked_episodes) + len(pending) > 200_000: raise ValueError('Explicit incomplete: episode discovery safety bound')
        for key, row in pending.items():
            if 'series' not in row: row = get('/media/episodes/' + row['id']); items[key] = row
            if row.get('series'):
                parent = 'series~' + row['series']; episode_parents[key] = parent
                if parent not in items and parent not in unavailable_parents:
                    detail = get('/media/series/' + row['series'], {'includeEpisodes': 'false'}, allow_missing=True)
                    if detail is None: unavailable_parents.add(parent)
                    else: collect([detail])
            checked_episodes.add(key)
        genres()
    routes = {'movie': 'movies', 'series': 'series', 'episode': 'episodes', 'clip': 'clips', 'channel': 'channels'}
    if any(x['type'] not in routes for x in items.values()): raise ValueError('Explicit incomplete: unsupported content type')
    def asset(row):
        typ, id = row['type'], row['id']; path = '/media/' + routes[typ] + '/' + id
        key = typ + '~' + id
        detail = get(path, {'includeEpisodes': 'true'} if typ == 'series' else None, allow_missing=True)
        if detail is None: return key, {'unavailable': True}
        if typ != 'series': return key, {'detail': detail, 'editions': get(path + '/editions', allow_missing=True) or []}
        children = pages(path + '/episodes', episodes=True)
        declared = [e['id'] for s in detail['seasons'] for e in s['episodes']]
        if len(declared) != len(set(declared)) or set(declared) != {x['id'] for x in children}:
            raise ValueError('Episode paging and declared seasons did not reconcile')
        if any(e.get('type') != 'episode' or e.get('series') != id for e in children):
            raise ValueError('Mismatched episode parent')
        if not {k.split('~', 1)[1] for k, v in episode_parents.items() if v == key} <= set(declared):
            raise ValueError('Episode shelves did not reconcile with their shows')
        return key, {'detail': detail, 'episodes': children}
    roots = [row for key, row in items.items() if key not in episode_parents]
    with ThreadPoolExecutor(max_workers=3) as pool: assets = dict(pool.map(asset, roots))
    children = {e['id']: e for a in assets.values() for e in a.get('episodes', [])}
    def episode(id): return id, get('/media/episodes/' + id + '/editions', allow_missing=True) or []
    with ThreadPoolExecutor(max_workers=3) as pool: offers = dict(pool.map(episode, children))
    eligible = {id for id, editions in offers.items() if supported(editions) and unblocked(children[id])}
    counts = Counter(); eligible_roots = set(); visible_episodes = set()
    for key, asset in assets.items():
        if asset.get('unavailable'): continue
        row = asset['detail']
        if not unblocked(row): continue
        if row['type'] == 'series':
            available = {e['id'] for e in asset['episodes']} & eligible
            if available:
                counts['shows'] += 1; eligible_roots.add(key); visible_episodes.update('episode~' + id for id in available)
        elif supported(asset['editions']): counts[row['type']] += 1; eligible_roots.add(key)
    title_keys = {key for key in eligible_roots if not key.startswith('channel~')}
    def digest(keys): return hashlib.sha256('\n'.join(sorted(keys)).encode()).hexdigest()
    receipt = {'generatedAt': datetime.now(timezone.utc).isoformat(), 'provider': 'Revry',
               'completeSupportedPublicGuestDirectories': True, 'navigationPages': len(page_ids),
               'playlistsExhausted': len({id for id, _ in playlists}), 'playlistRequestsExhausted': len(playlists),
               'genreIndexesExhausted': len(checked_genres),
               'searchQueriesExhausted': 36, 'candidates': dict(Counter(x['type'] for x in items.values())),
               'seriesReconciled': sum(x.get('detail', {}).get('type') == 'series' for x in assets.values()),
               'episodeCandidates': len(children), 'freeEpisodes': len(visible_episodes), 'eligibleRootOffers': dict(counts),
               'episodeShelfRowsGroupedUnderShows': len(episode_parents),
               'unavailableParentShows': len(unavailable_parents),
               'shelfEpisodeRowsWithUnavailableParents': sum(parent in unavailable_parents for parent in episode_parents.values()),
               'unavailableRootAssets': sum(bool(x.get('unavailable')) for x in assets.values()),
               'unavailableAssetResponses': dict(missing_responses),
               'canonicalTitleCount': len(title_keys), 'canonicalTitleIdsSha256': digest(title_keys),
               'visibleEpisodeIdsSha256': digest(visible_episodes),
               'access': 'Uncredentialed guest; no country overrides; full-edition blockers preserved',
               'playbackAcceptance': 'Separate device tests required; this is a metadata/offer audit'}
    (output / 'REVRY_COVERAGE_SAFE.json').write_text(json.dumps(receipt, indent=2), encoding='utf-8')
    # Stable metadata export; raw responses and guest routing state remain outside Git.
    def identity(typ, id): return 'revry-' + typ + '-' + hashlib.sha256(str(id).encode()).hexdigest()[:24]
    def metadata(row):
        typ, id = row['type'], str(row['id'])
        image = ''
        for kind in ['poster', 'still', 'square']:
            images = (row.get('images') or {}).get(kind) or []
            image = next((x['url'] for x in images if urllib.parse.urlparse(x.get('url', '')).scheme == 'https'), '')
            if image: break
        return {'id': identity(typ, id), 'sourceId': id, 'sourceType': typ, 'provider': 'revry', 'providerName': 'Revry',
                'mode': 'revry', 'kind': {'movie':'film', 'series':'series', 'episode':'episode', 'clip':'video', 'channel':'live'}[typ],
                'title': row.get('label', ''), 'description': row.get('description') or '', 'image': image,
                'categories': [g['label'] for g in row.get('genres', []) if g.get('label')],
                'official': 'https://revry.com/', 'freeGuestVerified': True}
    web_items, web_live, web_series = [], [], []
    for key in sorted(eligible_roots):
        value = assets[key]; row = value['detail']; item = metadata(row)
        if row['type'] == 'channel': web_live.append(item)
        elif row['type'] == 'series':
            item['episodes'] = []
            for season in row['seasons']:
                for number, ref in enumerate(season['episodes'], 1):
                    if ref['id'] not in eligible: continue
                    episode = metadata(children[ref['id']]); episode['seriesId'] = item['id']
                    episode['seasonNumber'] = season.get('number', children[ref['id']].get('seasonNumber', 0))
                    episode['episodeNumber'] = children[ref['id']].get('episodeNumber', number)
                    episode['categories'] = item['categories']; web_items.append(episode); item['episodes'].append(episode['id'])
            web_series.append(item)
        else: web_items.append(item)
    all_rows = web_items + web_live + web_series
    if len({x['id'] for x in all_rows}) != len(all_rows) or any(not x['title'] for x in all_rows): raise ValueError('Stable export identities conflict')
    if len(web_series) != counts['shows'] or len([x for x in web_items if x['kind'] == 'episode']) != len(visible_episodes): raise ValueError('Stable export totals do not reconcile')
    receipt['scope'] = 'Complete supported public free guest directories and full editions, all seasons/episodes reconciled. Current region, access, advertising and DRM are checked at playback.'
    (output / 'REVRY_WEB_METADATA.json').write_text(json.dumps({'schema':1, 'provider':'revry', 'items':web_items, 'live':web_live, 'providerSeries':web_series, 'report':receipt}, ensure_ascii=False), encoding='utf-8')
    print(json.dumps({k:receipt[k] for k in ['canonicalTitleCount','freeEpisodes','eligibleRootOffers']}))

if __name__ == '__main__':
    parser = argparse.ArgumentParser(); parser.add_argument('--output', required=True, type=Path); args = parser.parse_args()
    output = args.output.resolve(); checkout = Path(__file__).resolve().parents[2]
    if output == checkout or checkout in output.parents: raise SystemExit('Raw exchanges require an output directory outside this checkout')
    try: run(output)
    except Exception as error: raise SystemExit("Revry metadata refresh incomplete (" + type(error).__name__ + "); previous snapshot retained") from None
