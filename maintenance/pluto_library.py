"""Export stable Pluto public guest catalogue metadata and official-player links.

Uses only the Python standard library, a fresh ordinary publisher session kept in
memory, and the region the publisher actually selects. It does not fetch video,
ads or licences, emulate another device/country, or export session values.

Example:
  python pluto_library.py --output output/pluto.json

The output is replaced atomically only after all supported roots, pagination,
current show destinations, current collection additions, and free live access
flags reconcile. Whole-service
and episode-level completeness are deliberately not claimed: the current All
collections are publisher-capped, and shows open their official episode picker.
"""
import concurrent.futures as futures
import datetime as dt
import hashlib
import html
import json
import math
import pathlib
import re
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter, deque

OUT = pathlib.Path(__file__).resolve().parent
ORIGIN = 'https://sheepman90s.github.io'
SITE = 'https://pluto.tv'
HEX = re.compile(r'[a-f0-9]{24}\Z')
SLUG = re.compile(r'[a-zA-Z0-9_-]{1,240}\Z')
LIVE_QUERY = '''query Channels($params:ChannelParams){channels(params:$params){__typename ... on ChannelResponseMany{start total rows success skipped channels{id originId slug href channelName description resolvedfilePathLogo isLocked isContentAccessibleInCMS requiredAddOns streamType videoContentId channelCategorySlugs}}}}'''

def now(): return dt.datetime.now(dt.timezone.utc).isoformat().replace('+00:00','Z')
def sha(value): return hashlib.sha256(json.dumps(value,sort_keys=True,separators=(',',':')).encode()).hexdigest()
def clean(value,limit=4000): return re.sub(r'\s+',' ',html.unescape(re.sub(r'<[^>]+>',' ',str(value or '')))).strip()[:limit]
def check(value,message):
    if not value: raise RuntimeError(message)
def image(value):
    if not isinstance(value,str): return ''
    if value.startswith('//'): value='https:'+value
    if value.startswith('/'): value='https://images.pluto.tv'+value
    p=urllib.parse.urlsplit(value)
    if p.scheme!='https' or p.username or p.password: return ''
    if any(re.search(r'token|jwt|session|authorization|licen[cs]e|signature|credential|policy|expires|key-pair|x-amz-|^sig$',key,re.I) for key,_ in urllib.parse.parse_qsl(p.query)): return ''
    return value
SNAPSHOTS = {}
def write(name, value):
    # Only allowlisted intermediate metadata stays in memory; no receipts on disk.
    SNAPSHOTS[name] = json.loads(json.dumps(value))

class PublisherRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        parsed = urllib.parse.urlsplit(newurl)
        check(parsed.scheme == 'https' and parsed.hostname in {'pluto.tv', 'api.pluto.tv'},
              'Unexpected publisher redirect')
        if parsed.hostname != urllib.parse.urlsplit(req.full_url).hostname:
            check(not any(key.lower() == 'authorization' for key in dict(req.header_items())),
                  'Refused cross-host redirect carrying authorization')
        return super().redirect_request(req, fp, code, msg, headers, newurl)

class Client:
    def __init__(self):
        self.lock=threading.Lock();self.next=0.;self.requests=0;self.token='';self.region=None;self.opener=urllib.request.build_opener(PublisherRedirect());self.bootstrap()
    def http(self,url,payload=None,auth=False):
        with self.lock:
            delay=max(0,self.next-time.monotonic());self.next=time.monotonic()+delay+.15
        time.sleep(delay)
        h={'User-Agent':'SheepBox/2.0.0 (public catalogue metadata refresh; Python urllib)','Origin':ORIGIN}
        if auth: h['Authorization']='Bearer '+self.token
        data=None
        if payload is not None: data=json.dumps(payload).encode();h['Content-Type']='application/json'
        for attempt in range(3):
            try:
                with self.opener.open(urllib.request.Request(url,data=data,headers=h),timeout=35) as r:
                    check(urllib.parse.urlsplit(r.url).hostname in {'pluto.tv','api.pluto.tv'},'Unexpected publisher redirect')
                    body=r.read(20_000_001);check(len(body)<=20_000_000,'Explicit incomplete: response size bound')
                    with self.lock: self.requests+=1
                    return body.decode('utf8')
            except urllib.error.HTTPError as e:
                if e.code in {500,502,503,504} and attempt<2:time.sleep(attempt+1);continue
                raise RuntimeError('Publisher HTTP '+str(e.code)+'; research incomplete') from None
            except (urllib.error.URLError,TimeoutError,OSError):
                if attempt<2:time.sleep(attempt+1);continue
                raise RuntimeError('Publisher network failure; research incomplete') from None
    def page(self,path):
        text=self.http(SITE+path)
        match=re.search(r'<script[^>]+id="__NEXT_DATA__"[^>]*>([\s\S]*?)</script>',text)
        check(match,'Missing publisher SSR data')
        value=json.loads(match[1]);check(value.get('props',{}).get('region')==self.region or self.region is None,'Publisher region changed')
        return value,text
    def bootstrap(self):
        value,_=self.page('/')
        props=value['props'];region=props['region']
        check(re.fullmatch('[A-Z]{2}',region or ''),'Unknown publisher region')
        check(self.region in (None,region),'Publisher region changed')
        self.region=region;self.token=props.get('sessionJwt','')
        check(self.token,'Publisher did not provide an ordinary guest session')
        pp=props['pageProps'];check(pp.get('isBot') is False and not pp.get('isMobileAndPlaybackDisabled'),'Publisher does not support this ordinary research client')
        q=next(q for q in pp['dehydratedState']['queries'] if q['queryKey'][0] == 'live-tv-channels')
        self.live_params=q['queryKey'][1]['params'];self.live_total=q['state']['data']['totalCount'];self.booted=time.monotonic()
    def api(self,path):
        if time.monotonic()-self.booted>600:self.bootstrap()
        return json.loads(self.http('https://api.pluto.tv'+path,auth=True))
    def graph(self,query,variables):
        packet=json.loads(self.http(SITE+'/api/tn/app-shell/graphql/',{'query':query,'variables':variables}))
        check(not packet.get('errors') and isinstance(packet.get('data'),dict),'Publisher GraphQL did not return complete metadata')
        return packet['data']

def jobs(values,fn):
    queue=deque(values)
    with futures.ThreadPoolExecutor(max_workers=3) as pool:
        pending={}
        for _ in range(min(3,len(queue))):
            value=queue.popleft();pending[pool.submit(fn,value)]=value
        while pending:
            done,_=futures.wait(pending,return_when=futures.FIRST_COMPLETED)
            for task in done:
                key=pending.pop(task);yield key,task.result()
                if queue:
                    key=queue.popleft();pending[pool.submit(fn,key)]=key

def collect():
    c=Client();check(c.region == 'US', 'Publisher selected a different region; export requires review')
    raw_categories={};directory_pages=0
    first=c.api('/v3/vod/categories?includeItems=true&deviceType=web&offset=12&page=1')
    expected_categories=first['totalCategories'];expected_pages=first['totalPages']
    def add_directory(data,page):
        check(data['totalCategories']==expected_categories and data['totalPages']==expected_pages and data['page']==page,'Category directory changed')
        rows=data['categories'];check(len(rows)==min(12,expected_categories-(page-1)*12),'Category directory page is incomplete')
        for row in rows:
            check(HEX.fullmatch(row.get('_id','')) and row['_id'] not in raw_categories,'Duplicate/malformed category identity')
            raw_categories[row['_id']]=row
    add_directory(first,1);directory_pages=1
    for page,data in jobs(range(2,expected_pages+1),lambda page:c.api('/v3/vod/categories?includeItems=true&deviceType=web&offset=12&page='+str(page))):
        add_directory(data,page);directory_pages+=1
    check(len(raw_categories)==expected_categories,'Category directory closure failed')
    print('Category directory: '+str(expected_categories)+' categories / '+str(directory_pages)+' pages',flush=True)
    records={};episode_shelves={};category_receipts=[];excluded=Counter();row_types=Counter()
    def category_all(row):
        cid=row['_id'];total=row['totalItemsCount'];size=row['offset'];initial=row['items'];all_items=list(initial)
        check(row['page']==1 and size==100 and isinstance(total,int) and total>=0,'Category item paging shape changed')
        check(len(initial)==min(size,total),'Initial category page incomplete')
        for page in range(2,math.ceil(total/size)+1):
            data=c.api('/v3/vod/categories/'+cid+'/items?deviceType=web&offset=100&page='+str(page))
            check(data['_id']==cid and data['page']==page and data['offset']==size and data['totalItemsCount']==total,'Category item total/identity changed')
            check(len(data['items'])==min(size,total-(page-1)*size),'Category item page incomplete')
            all_items.extend(data['items'])
        check(len(all_items)==total,'Category item totals did not reconcile')
        return row,all_items,math.ceil(total/size)
    for _,(category,items,pages) in jobs(list(raw_categories.values()),category_all):
        seen=set();duplicates=0
        for item in items:
            source=item.get('_id');kind=item.get('type');row_types[kind]+=1
            check(isinstance(source,str) and HEX.fullmatch(source),'Malformed catalogue item identity')
            if source in seen:duplicates+=1
            seen.add(source)
            if category.get('plutoOfficeOnly') is True:excluded['officeOnlyReferences']+=1;continue
            expiry=item.get('avail',{}).get('endDate');start=item.get('avail',{}).get('startDate')
            for text in (expiry,start):
                if text:check(dt.datetime.fromisoformat(text.replace('Z','+00:00')).tzinfo is not None,'Undated availability')
            when=dt.datetime.now(dt.timezone.utc)
            if expiry and dt.datetime.fromisoformat(expiry.replace('Z','+00:00'))<=when:excluded['expiredReferences']+=1;continue
            if start and dt.datetime.fromisoformat(start.replace('Z','+00:00'))>when:excluded['futureReferences']+=1;continue
            if kind=='episode':
                parent=item.get('seriesID');check(isinstance(parent,str) and HEX.fullmatch(parent),'Episode shelf has no stable parent')
                episode_shelves[source]=parent;continue
            check(kind in {'movie','series'},'Unsupported catalogue item type '+str(kind))
            slug=item.get('slug');check(isinstance(slug,str) and SLUG.fullmatch(slug),'Missing stable publisher slug')
            prior=records.get(source)
            if prior:check(prior['type']==kind and prior['slug']==slug,'Conflicting catalogue identity')
            groups=set(prior['categories'] if prior else []);groups.add(clean(category['name'],160))
            art=item.get('poster16_9',{}).get('path') or item.get('featuredImage') or ''
            if not art and item.get('covers'):art=item['covers'][0].get('url','')
            records[source]={'sourceId':source,'type':kind,'slug':slug,'title':clean(item.get('name'),500),
                             'description':clean(item.get('summary') or item.get('description')),'image':image(art),
                             'categories':sorted(groups),'duration':item.get('duration'),'expiresAt':expiry,
                             'seasonsNumbers':item.get('seasonsNumbers',[])}
        category_receipts.append({'id':category['_id'],'title':clean(category['name'],160),'declared':len(items),'read':len(items),'pages':pages,'unique':len(seen),'duplicates':duplicates,'officeOnly':category.get('plutoOfficeOnly') is True})
        if len(category_receipts)%40==0:print('Categories reconciled '+str(len(category_receipts))+'/'+str(expected_categories)+'; distinct roots '+str(len(records)),flush=True)
    missing_parents=sorted(set(episode_shelves.values())-set(records))
    print('Category closure: '+str(len(records))+' roots; orphan episode parents '+str(len(missing_parents)),flush=True)
    write('CATEGORY_ROOTS_SAFE.json',{'region':c.region,'records':list(records.values()),'categories':category_receipts,
          'expectedCategories':expected_categories,'directoryPages':directory_pages,'episodeParents':episode_shelves,
          'missingParents':missing_parents,'itemTypes':dict(row_types),'excluded':dict(excluded)})
    # Independently exhaust both current website All collections; capped totals stay explicit.
    web_index={};web_receipts=[];web_records={}
    def ssr_index(kind,page):
        path='/'+c.region.lower()+'/'+kind+'/category/all-'+kind+'/'+(str(page)+'/' if page>1 else '')
        value,_=c.page(path)
        query=next(q for q in value['props']['pageProps']['dehydratedState']['queries'] if q['queryKey'][0] == 'poster-grid-data-' + c.region.lower())
        return query['state']['data']
    for kind in ('movies','shows'):
        data=ssr_index(kind,1);total=data['totalCount'];seen={};read=0;skipped=0;page_count=math.ceil(total/24)
        def add_index(value,page):
            nonlocal read,skipped
            check(value['pageNumber']==page and value['totalCount']==total,'Current website collection changed')
            rows=value['items'];check(len(rows)+value['skippedCount']==min(24,total-(page-1)*24),'Current website collection page is incomplete')
            for row in rows:
                key=row['id'];check(key not in seen,'Repeated current website collection page/item');seen[key]=row
            read+=len(rows);skipped+=value['skippedCount']
        add_index(data,1)
        for page,value in jobs(range(2,page_count+1),lambda page:ssr_index(kind,page)):add_index(value,page)
        check(read+skipped==total,'Current website collection total did not reconcile')
        if kind=='movies':
            missing=[key for key in seen if key not in records]
        else:
            slugs={row['slug']:key for key,row in records.items() if row['type']=='series'}
            missing=[]
            for key,row in seen.items():
                slug=row['href'].strip('/').split('/')[-1]
                if slug not in slugs:missing.append(key)
                else:web_index[slugs[slug]]=SITE+'/'+c.region.lower()+row['href']
        for key,row in seen.items():
            if kind=='movies' and key in records:web_index[key]=SITE+'/'+c.region.lower()+row['href']
        web_records[kind]=[{key:row.get(key) for key in ('id','title','href','contentType','description','thumb','genre','requiredAddOns','bundleLocked','isContentAccessibleInCMS','status')} for row in seen.values()]
        web_receipts.append({'root':'/'+c.region.lower()+'/'+kind+'/category/all-'+kind+'/','declared':total,'read':read,'skipped':skipped,'pages':page_count,'outsideCategoryGraphIds':missing,'scope':'Publisher collection is capped alphabetically; not a whole-library total'})
        print('Current '+kind+' collection reconciled '+str(read)+'; outside legacy category graph '+str(len(missing)),flush=True)
        write('WEB_INDEX_ROOTS_SAFE.json',{'region':c.region,'roots':web_receipts,'records':web_records,'exactHrefMap':web_index})
    live=[];live_seen=set();live_rows=c.live_params['rows'];live_total=c.live_total;live_skipped=0;locked_live=[]
    for start in range(0,live_total,live_rows):
        params=dict(c.live_params);params['start']=start
        data=c.graph(LIVE_QUERY,{'params':params})['channels']
        check(data.get('success') is True and data['start']==start and data['total']==live_total and data['rows']==live_rows,'Live directory changed')
        rows=data['channels'];skipped=data.get('skipped',0)
        check(len(rows)+skipped==min(live_rows,live_total-start),'Live directory page is incomplete')
        live_skipped+=skipped
        for row in rows:
            origin=str(row['originId']);check(origin.isdigit() and origin not in live_seen,'Duplicate live identity');live_seen.add(origin)
            check(type(row.get('isLocked')) is bool and type(row.get('isContentAccessibleInCMS')) is bool and isinstance(row.get('requiredAddOns'),list),'Live access fields changed')
            if row['isLocked'] or not row['isContentAccessibleInCMS'] or row['requiredAddOns']:
                locked_live.append({'originId':origin,'title':clean(row['channelName'],500),'isLocked':row['isLocked'],'isContentAccessibleInCMS':row['isContentAccessibleInCMS']});continue
            official=urllib.parse.urljoin(SITE,row['href']);check(official==SITE+'/'+c.region.lower()+'/watch/live-tv/'+origin+'/','Unknown live official link')
            live.append({'id':'pluto-live-'+origin,'sourceId':origin,'provider':'pluto','providerName':'Pluto TV','kind':'live','mode':'pluto-link','title':clean(row['channelName'],500),'description':clean(row.get('description')),'image':image(row.get('resolvedfilePathLogo')),'categories':row.get('channelCategorySlugs',[]),'official':official,'freeGuestVerified':True})
    check(len(live)+len(locked_live)+live_skipped==live_total,'Live directory closure failed')

    write('LIVE_READY_SAFE.json', {'region': c.region, 'live': live,
          'directory': {'declared': live_total, 'returned': len(live) + len(locked_live),
                        'eligible': len(live), 'excludedRestricted': len(locked_live),
                        'skipped': live_skipped, 'pages': math.ceil(live_total / live_rows)}})
    return c

SHOW_QUERY = '''query ShowHomeData($slug:String!){showHome(slug:$slug){show{id slug title description longDescription genre isLocked}}}'''
MOVIE_QUERY = '''query MovieHomeData($id:String!){movieDetail(id:$id){movie{id contentId title description longDescription genre isLocked}}}'''

def recoverable_internal_field(error, allowed):
    path = error.get('path') or []
    # Some upstreams wrap explicit refusals as INTERNAL_SERVER_ERROR. Inspect
    # their message in memory only; never retry or echo those refusal details.
    refusal = re.search(r'unauthori[sz]ed|authori[sz]ation.{0,30}(?:denied|required|failed)|authentication.{0,30}(?:denied|required|failed)|forbidden|access.{0,20}denied|rate.{0,12}limit|too many requests|quota|query.{0,12}cost|complexity|captcha',
                        str(error.get('message') or ''), re.I)
    return bool(path and path[0] in allowed and error.get('extensions', {}).get('code') == 'INTERNAL_SERVER_ERROR' and not refusal)

def current_show_result(c, row, wrapper):
    source = row['sourceId']; slug = row['slug']
    show = wrapper.get('show') if isinstance(wrapper, dict) else None
    if show is None:
        # A missing resolver alone is not an availability decision. Verify the
        # publisher's ordinary route actually goes back to its live homepage.
        value, _ = c.page('/' + c.region.lower() + '/shows/' + slug + '/')
        check(value.get('page') == '/watch/live-tv' and not value.get('query'),
              'A native show has an unresolved current publisher destination')
        return {'sourceId': source, 'nativeSlug': slug, 'status': 'publisher-page-unavailable'}
    cms = str(show.get('id') or ''); canonical = show.get('slug')
    check(cms.isdigit() and isinstance(canonical, str) and SLUG.fullmatch(canonical),
          'Current publisher show identity shape changed')
    check(type(show.get('isLocked')) is bool, 'Current publisher show access shape changed')
    return {'sourceId': source, 'nativeSlug': slug, 'cmsId': cms, 'canonicalSlug': canonical,
            'title': clean(show.get('title'), 500),
            'description': clean(show.get('longDescription') or show.get('description')),
            'genre': clean(show.get('genre'), 160),
            'official': SITE + '/' + c.region.lower() + '/shows/' + canonical + '/',
            'isLocked': show['isLocked'],
            'status': 'locked' if show['isLocked'] else 'verified-current-show'}

def metadata_batch(c, rows, kind):
    # Ordinary GraphQL aliases reduce round trips without changing access checks.
    check(kind in {'movie', 'show'} and 0 < len(rows) <= 10, 'Unsupported metadata batch')
    field, argument, selection = (('movieDetail', 'id', 'movie{id title isLocked}') if kind == 'movie'
        else ('showHome', 'slug', 'show{id slug title description longDescription genre isLocked}'))
    variables = {'v' + str(i): row['sourceId'] if kind == 'movie' else row['slug'] for i, row in enumerate(rows)}
    definitions = ','.join('$' + key + ':String!' for key in variables)
    fields = ' '.join('m' + str(i) + ':' + field + '(' + argument + ':$v' + str(i) + '){' + selection + '}' for i in range(len(rows)))
    packet = json.loads(c.http(SITE + '/api/tn/app-shell/graphql/', {
        'query': 'query PublicMetadata(' + definitions + '){' + fields + '}', 'variables': variables}))
    data = packet.get('data'); check(isinstance(data, dict), 'Metadata alias batch did not return data')
    expected = {'m' + str(i) for i in range(len(rows))}; failed = set()
    for error in packet.get('errors') or []:
        check(recoverable_internal_field(error, expected), 'Publisher refused or could not safely resolve metadata batch')
        failed.add(error['path'][0])
    if failed:
        time.sleep(0.5)
        with c.lock:
            if not hasattr(c, 'metadata_recoveries'): c.metadata_recoveries = []
            c.metadata_recoveries.append({'sources': [rows[int(key[1:])]['sourceId'] for key in sorted(failed)], 'isolatedRetries': len(failed)})
        for key in failed:
            i = int(key[1:]); single = json.loads(c.http(SITE + '/api/tn/app-shell/graphql/', {
                'query': 'query PublicMetadata($value:String!){' + field + '(' + argument + ':$value){' + selection + '}}',
                'variables': {'value': variables['v' + str(i)]}}))
            for error in single.get('errors') or []:
                check(recoverable_internal_field(error, {field}), 'Publisher refused or could not safely resolve metadata')
            check(isinstance(single.get('data'), dict) and field in single['data'], 'Isolated metadata shape changed')
            data[key] = single['data'][field]
    check(set(data) == expected, 'Metadata alias batch response is incomplete')
    return [data['m' + str(i)] for i in range(len(rows))]


def current_shows(c, rows):
    return [current_show_result(c, row, wrapper) for row, wrapper in zip(rows, metadata_batch(c, rows, 'show'))]


def current_movies(c, rows):
    wrappers = metadata_batch(c, rows, 'movie')
    results = []
    for i, row in enumerate(rows):
        source = row['sourceId']; wrapper = wrappers[i]
        movie = wrapper.get('movie') if isinstance(wrapper, dict) else None
        receipt = {'sourceId': source}
        if movie is None:
            page, _ = c.page('/' + c.region.lower() + '/movies/' + source + '/')
            check(page.get('page') == '/watch/live-tv' and not page.get('query'),
                  'Movie metadata absent but current publisher destination unresolved')
            receipt['status'] = 'publisher-page-unavailable'
        else:
            check(str(movie.get('id')) == source and type(movie.get('isLocked')) is bool,
                  'Publisher movie identity/access shape changed')
            receipt.update({'status': 'locked' if movie['isLocked'] else 'verified-current-movie',
                            'isLocked': movie['isLocked'], 'title': clean(movie.get('title') or row['title'], 500)})
        results.append(receipt)
    return results

def reconcile(c, snapshots):
    cat = snapshots['CATEGORY_ROOTS_SAFE.json']; web = snapshots['WEB_INDEX_ROOTS_SAFE.json']
    native = {r['sourceId']: r for r in cat['records']}
    native_shows = [r for r in cat['records'] if r['type'] == 'series']
    for size in (2, 10):
        check(len(current_shows(c, native_shows[:size])) == min(size, len(native_shows)), 'Publisher show metadata batching unavailable')
    destinations = []
    batches = [native_shows[i:i+10] for i in range(0, len(native_shows), 10)]
    next_checkpoint = 500
    for _, receipts in jobs(batches, lambda rows: current_shows(c, rows)):
        destinations.extend(receipts)
        if len(destinations) >= next_checkpoint:
            print('Current show destinations checked ' + str(len(destinations)) + '/' + str(len(native_shows)), flush=True)
            next_checkpoint = (len(destinations) // 500 + 1) * 500
    check(len(destinations) == len(native_shows), 'Show destination traversal is incomplete')
    destination_report = {'complete': True, 'completedAt': now(), 'region': c.region,
                          'expected': len(native_shows), 'checked': len(destinations),
                          'counts': dict(Counter(r['status'] for r in destinations)), 'results': destinations}
    write('SHOW_DESTINATIONS_SAFE.json', destination_report)
    native_movies = [r for r in cat['records'] if r['type'] == 'movie']
    for size in (2, 10):
        check(len(current_movies(c, native_movies[:size])) == min(size, len(native_movies)),
              'Publisher did not support a bounded ordinary metadata alias batch')
    movie_receipts = []
    movie_batches = [native_movies[i:i+10] for i in range(0, len(native_movies), 10)]
    next_checkpoint = 500
    for _, receipts in jobs(movie_batches, lambda rows: current_movies(c, rows)):
        movie_receipts.extend(receipts)
        if len(movie_receipts) >= next_checkpoint:
            print('Current movie destinations checked ' + str(len(movie_receipts)) + '/' + str(len(native_movies)), flush=True)
            next_checkpoint = (len(movie_receipts) // 500 + 1) * 500
    check(len(movie_receipts) == len(native_movies), 'Movie destination traversal is incomplete')
    write('MOVIE_DESTINATIONS_SAFE.json', {'complete': True, 'completedAt': now(), 'region': c.region,
          'expected': len(native_movies), 'checked': len(movie_receipts),
          'counts': dict(Counter(r['status'] for r in movie_receipts)), 'results': movie_receipts})
    missing = {('movies' if '/movies/' in r['root'] else 'shows'): set(r['outsideCategoryGraphIds']) for r in web['roots']}
    pending = [(kind, row) for kind, rows in web['records'].items() for row in rows if row['id'] in missing[kind]]
    def detail(task):
        kind, row = task; expected = str(row['id'])
        official = SITE + '/' + c.region.lower() + row['href']
        if kind == 'movies':
            check(HEX.fullmatch(expected), 'Current movie has an unsupported identity')
            wrapper = c.graph(MOVIE_QUERY, {'id': expected}).get('movieDetail')
            data = wrapper.get('movie') if isinstance(wrapper, dict) else None
            check(isinstance(data, dict) and str(data.get('id')) == expected,
                  'Current collection movie detail is unresolved')
            check(official == SITE + '/' + c.region.lower() + '/movies/' + expected + '/',
                  'Current collection movie href shape changed')
        else:
            slug = row['href'].strip('/').split('/')[-1]
            check(expected.isdigit() and SLUG.fullmatch(slug), 'Current show identity shape changed')
            wrapper = c.graph(SHOW_QUERY, {'slug': slug}).get('showHome')
            data = wrapper.get('show') if isinstance(wrapper, dict) else None
            check(isinstance(data, dict) and str(data.get('id')) == expected and data.get('slug') == slug,
                  'Current collection show detail is unresolved')
            check(official == SITE + '/' + c.region.lower() + '/shows/' + slug + '/',
                  'Current collection show href shape changed')
        check(type(data.get('isLocked')) is bool, 'Current collection access field changed')
        return {'kind': kind, 'webId': expected, 'sourceId': expected, 'title': clean(data.get('title') or row.get('title'), 500),
                'official': official, 'slug': data.get('slug') or '', 'isLocked': data['isLocked'],
                'description': clean(data.get('longDescription') or data.get('description')),
                'genre': clean(data.get('genre'), 160),
                'status': 'publisher-locked' if data['isLocked'] else ('current-guest-movie' if kind == 'movies' else 'current-guest-show')}
    additions = [receipt for _, receipt in jobs(pending, detail)]
    check(len(additions) == len(pending), 'Current index reconciliation is incomplete')
    write('INDEX_DELTA_SAFE.json', {'complete': True, 'completedAt': now(), 'region': c.region,
          'expected': len(pending), 'checked': len(additions),
          'counts': dict(Counter(r['status'] for r in additions)), 'results': additions})
    write('METADATA_RECOVERIES_SAFE.json', getattr(c, 'metadata_recoveries', []))

def normalized(snapshots):
    cat = snapshots['CATEGORY_ROOTS_SAFE.json']; web = snapshots['WEB_INDEX_ROOTS_SAFE.json']
    dest = snapshots['SHOW_DESTINATIONS_SAFE.json']; delta = snapshots['INDEX_DELTA_SAFE.json']
    movie_dest = snapshots['MOVIE_DESTINATIONS_SAFE.json']
    live_snapshot = snapshots['LIVE_READY_SAFE.json']
    region = cat['region']
    check(region == web['region'] == dest['region'] == movie_dest['region'] == delta['region'] == live_snapshot['region'] == 'US',
          'Snapshot regions do not reconcile')
    check(len(cat['categories']) == cat['expectedCategories'] and not cat['missingParents'],
          'Category graph closure is incomplete')
    check(all(r['declared'] == r['read'] for r in cat['categories']), 'Category item totals do not reconcile')
    check(all(r['read'] + r['skipped'] == r['declared'] for r in web['roots']), 'Current index totals do not reconcile')
    check(all(r['skipped'] == 0 for r in web['roots']), 'Current collections omitted undisclosed rows; review required')
    check(dest['complete'] is True and dest['checked'] == dest['expected'] == len(dest['results']),
          'Show destinations have not all been checked')
    check(delta['checked'] == delta['expected'] == len(delta['results']), 'Current index additions are incomplete')
    by_dest = {r['sourceId']: r for r in dest['results']}
    check(len(by_dest) == dest['expected'], 'Repeated show destination identity')
    native_shows = {r['sourceId'] for r in cat['records'] if r['type'] == 'series'}
    check(set(by_dest) == native_shows, 'Show destination coverage differs from native graph')
    check(movie_dest['complete'] is True and movie_dest['checked'] == movie_dest['expected'] == len(movie_dest['results']),
          'Movie destinations have not all been checked')
    by_movie = {r['sourceId']: r for r in movie_dest['results']}
    native_movies = {r['sourceId'] for r in cat['records'] if r['type'] == 'movie'}
    check(len(by_movie) == movie_dest['expected'] and set(by_movie) == native_movies,
          'Movie destination coverage differs from native graph')
    base = {'provider': 'pluto', 'providerName': 'Pluto TV', 'freeGuestVerified': True}
    movies = []; shows = []; seen_movies = set(); exclusions = Counter(); aliases = []
    allowed_status = {'verified-current-show', 'locked', 'publisher-page-unavailable'}
    for row in sorted(cat['records'], key=lambda r: r['sourceId']):
        source = row['sourceId']; check(HEX.fullmatch(source), 'Native source identity changed')
        card = {**base, 'id': ('pluto-movie-' if row['type'] == 'movie' else 'pluto-series-') + source,
                'sourceId': source, 'sourceNamespace': 'native', 'title': row['title'],
                'description': row['description'], 'image': image(row.get('image')),
                'categories': list(row['categories'])}
        if row.get('expiresAt'): card['expiresAt'] = row['expiresAt']
        if row['type'] == 'movie':
            movie_result = by_movie[source]
            check(movie_result['status'] in {'verified-current-movie', 'locked', 'publisher-page-unavailable'},
                  'A movie destination remains unresolved')
            if movie_result['status'] != 'verified-current-movie':
                exclusions['movie-' + movie_result['status']] += 1; continue
            if isinstance(row.get('duration'), (int, float)) and row['duration'] > 0:
                card['duration'] = int(row['duration'] / 1000)
            card.update({'kind': 'film', 'mode': 'pluto-publisher', 'isLocked': False,
                         'title': movie_result.get('title') or card['title'],
                         'official': web['exactHrefMap'].get(source) or SITE + '/us/movies/' + source + '/'})
            check(card['official'] == SITE + '/us/movies/' + source + '/', 'Native movie route shape changed')
            movies.append(card); seen_movies.add(source)
        else:
            result = by_dest[source]; check(result['status'] in allowed_status, 'A show destination remains unresolved')
            if result['status'] != 'verified-current-show':
                exclusions[result['status']] += 1; continue
            cms = result['cmsId']; check(cms.isdigit(), 'Canonical show identity is not publisher-supplied')
            card.update({'kind': 'series', 'mode': 'series', 'externalOnly': True, 'episodes': [],
                         'canonicalSourceId': cms, 'official': result['official'], 'isLocked': False,
                         'slug': result['canonicalSlug'],
                         'title': result.get('title') or card['title']})
            shows.append(card)
    web_by_id = {(kind, str(r['id'])): r for kind, rows in web['records'].items() for r in rows}
    for result in sorted(delta['results'], key=lambda r: (r['kind'], str(r['webId']))):
        source = str(result['webId']); original = web_by_id[(result['kind'], source)]
        if result.get('isLocked') is True:
            exclusions['currentIndexLocked'] += 1; continue
        check(result.get('isLocked') is False, 'A current index addition lacks explicit guest eligibility')
        card = {**base, 'sourceId': source, 'title': result['title'], 'description': result['description'],
                'image': image(original.get('thumb')), 'categories': ['All Movies' if result['kind'] == 'movies' else 'All Shows'],
                'official': result['official'], 'isLocked': False}
        if result.get('genre'): card['categories'].append(clean(result['genre'], 160))
        if result['kind'] == 'movies':
            check(HEX.fullmatch(source) and source not in seen_movies, 'Current movie identity conflict')
            card.update({'id': 'pluto-movie-' + source, 'sourceNamespace': 'native', 'kind': 'film', 'mode': 'pluto-publisher'})
            movies.append(card); seen_movies.add(source)
        else:
            check(source.isdigit(), 'Current CMS show identity changed')
            card.update({'id': 'pluto-series-cms-' + source, 'sourceNamespace': 'cms', 'canonicalSourceId': source,
                         'kind': 'series', 'mode': 'series', 'externalOnly': True, 'episodes': [], 'slug': result['slug']})
            shows.append(card)
    # Exact publisher destination equivalence is the only alias merge rule.
    # Native identity wins over CMS-only aliases; titles are never identity keys.
    unique_shows = {}
    for card in sorted(shows, key=lambda r: (r['sourceNamespace'] != 'native', r['id'])):
        official = card['official']; prior = unique_shows.get(official)
        if prior:
            check(prior['canonicalSourceId'] == card['canonicalSourceId'], 'Shared show route has conflicting publisher identities')
            prior['categories'] = sorted(set(prior['categories'] + card['categories']))
            aliases.append({'retained': prior['id'], 'alias': card['id'], 'official': official})
        else: unique_shows[official] = card
    shows = sorted(unique_shows.values(), key=lambda r: r['id'])
    live = []
    for row in live_snapshot['live']:
        source = str(row['sourceId']); check(source.isdigit(), 'Live source identity changed')
        card = {**base, **{k: row[k] for k in ('id', 'sourceId', 'title', 'description', 'image', 'categories', 'official')},
                'sourceNamespace': 'channel', 'kind': 'live', 'mode': 'pluto-publisher',
                'isLocked': False, 'isContentAccessibleInCMS': True}
        check(card['official'] == SITE + '/us/watch/live-tv/' + source + '/', 'Live official route shape changed')
        live.append(card)
    directory = live_snapshot['directory']
    check(directory['returned'] + directory['skipped'] == directory['declared'] and
          directory['eligible'] == len(live) and directory['eligible'] + directory['excludedRestricted'] == directory['returned'],
          'Live directory totals do not reconcile')
    check(directory['skipped'] == 0, 'Live directory omitted undisclosed rows; review required')
    movies.sort(key=lambda r: r['id']); live.sort(key=lambda r: r['id'])
    ids = [r['id'] for r in movies + shows + live]
    check(len(ids) == len(set(ids)), 'Repeated normalized provider identity')
    hrefs = [r['official'] for r in movies + shows + live]
    check(len(hrefs) == len(set(hrefs)), 'Repeated normalized official destination')
    scope = ('Complete traversal of the supported public guest VOD category graph, reconciled with both current capped All collections, '
             'plus the complete current free-access live directory in the publisher-detected US region. '
             'Shows use official publisher episode navigation. Native movie/show routes absent from the current publisher website are excluded explicitly. '
             'These sources do not prove whole-service or episode-level completeness.')
    report = {'complete': True, 'providerWideComplete': False, 'categoryGraphComplete': True,
              'currentIndexesReconciled': True, 'liveDirectoryComplete': True, 'movieDestinationsComplete': True, 'region': region,
              'completedAt': now(), 'scope': scope, 'counts': {'videos': len(movies), 'shows': len(shows), 'live': len(live)},
              'categoryDirectory': {'categories': cat['expectedCategories'], 'pages': cat['directoryPages'],
                                    'reconciledCategories': len(cat['categories'])},
              'currentIndexes': [{'kind': 'movies' if '/movies/' in r['root'] else 'shows',
                                  'declared': r['declared'], 'read': r['read'], 'skipped': r['skipped'], 'pages': r['pages'],
                                  'outsideCategoryGraph': len(r['outsideCategoryGraphIds']), 'capped': True} for r in web['roots']],
              'liveDirectory': directory,
              'sourceExclusions': cat.get('excluded', {}),
              'movieDestinations': {'checked': movie_dest['checked'], 'mapped': movie_dest['counts'].get('verified-current-movie', 0),
                                    'excludedUnavailable': exclusions['movie-publisher-page-unavailable'], 'excludedLocked': exclusions['movie-locked']},
              'showDestinations': {'checked': dest['checked'], 'mapped': dest['counts'].get('verified-current-show', 0),
                                   'excludedUnavailable': exclusions['publisher-page-unavailable'], 'excludedLocked': exclusions['locked'],
                                   'exactDestinationAliases': len(aliases)},
              'currentIndexAdditions': {'movies': sum(r['kind'] == 'movies' and r.get('isLocked') is False for r in delta['results']),
                                       'shows': sum(r['kind'] == 'shows' and r.get('isLocked') is False for r in delta['results']),
                                       'excludedLocked': exclusions['currentIndexLocked']}}
    write('EXACT_DESTINATION_ALIASES_SAFE.json', aliases)
    return {'schema': 1, 'provider': 'pluto', 'generatedAt': report['completedAt'],
            'items': movies, 'providerSeries': shows, 'live': live, 'report': report}

def main():
    import argparse
    parser = argparse.ArgumentParser(description='Export stable Pluto browse metadata and official player handoffs only.')
    parser.add_argument('--output', type=pathlib.Path, required=True)
    args = parser.parse_args()
    check(args.output.suffix.lower() == '.json', 'Output must be a JSON file')
    c = collect()
    check(c.region == 'US', 'The publisher selected a different region; review the supported export contract')
    reconcile(c, SNAPSHOTS)
    bundle = normalized(SNAPSHOTS)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    temporary = args.output.with_suffix(args.output.suffix + '.pending')
    temporary.write_text(json.dumps(bundle, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf8')
    temporary.replace(args.output)
    print(json.dumps({'complete': True, 'region': c.region, 'counts': bundle['report']['counts'],
                      'providerWideComplete': False}), flush=True)

if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        # All raised application messages are fixed and metadata-only. Avoid
        # echoing unexpected urllib/JSON exceptions, URLs, request bodies or SSR.
        if isinstance(exc, RuntimeError):
            print('Pluto metadata export incomplete: ' + str(exc), flush=True)
        else:
            print('Pluto metadata export incomplete: unexpected response or local I/O error', flush=True)
        raise SystemExit(1)
