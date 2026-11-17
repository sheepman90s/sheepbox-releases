// Maintainer metadata discovery. Follow only Roku-supplied browse/page links;
// no title limit, keyword search, play offer, DRM, ad or account request.
import {plainText,safeUrl} from './core.mjs';

export const ROKU_CATALOG_ROOT='https://app.roku.com/api/v2/homescreen/v2/home';
export const ROKU_MENU='https://app.roku.com/api/v1/navigation/menu';
const CONTENT_ID=/^[a-f0-9]{32}$/;
const PAGE_ID=/^[A-Za-z0-9_.:-]+$/;
// Current publisher UI maps this supplied navigation path to this rendered root.
const NAV_PATH_ROOTS={'/browse/roku-originals':'roku-originals'};
const fields=['grid','detailBackground','gridEpg','detailPoster'];
const disabled=value=>[true,'true',1].includes(value);
export function rokuFreeOption(row) {
  return Array.isArray(row?.viewOptions)&&row.viewOptions.some(option=>option?.providerId==='rokuavod'&&!disabled(option.disabled)&&!option.providerProductId);
}
function art(row) {return [...fields.map(key=>row?.imageMap?.[key]?.path),...(Array.isArray(row?.images)?row.images.map(image=>image?.path):[])].map(value=>safeUrl(value)).find(Boolean)||'';}
function categories(row,label) {return [...new Set([...(Array.isArray(row?.categoryObjects)?row.categoryObjects.map(x=>x?.title):[]),...(Array.isArray(row?.genres)?row.genres:[]),label].filter(x=>typeof x==='string').map(plainText).filter(Boolean))];}
function sourceCard(row,label) {
  const sourceId=row?.meta?.id;if(!CONTENT_ID.test(sourceId??'')||!['movie','series'].includes(row.type))return null;
  const title=plainText(row.title);if(!title)return null;
  const shelves=label?[plainText(label)]:[];const base={sourceId,title,image:art(row),description:plainText(row.description||row.shortDescription||row.longDescription),categories:categories(row,label),shelves,official:`https://app.roku.com/details/${sourceId}`,freeOptionVerified:rokuFreeOption(row)};
  if(row.type==='series')return {...base,cardAccess:base.freeOptionVerified?'free-option':row.viewOptions?.length?'other-options':'no-options'};
  if(!base.freeOptionVerified)return null;
  const duration=Number(row.runTimeSeconds);
  return {...base,id:`roku-${sourceId}`,provider:'roku',providerName:'Roku',kind:'film',mode:'roku-link',freeGuestVerified:true,watchUrl:`https://app.roku.com/watch/${sourceId}`,...(Number.isFinite(duration)&&duration>0?{duration:Math.round(duration)}:{})};
}

export function rokuPageAddress(value,{rendered=false}={}) {
  if(typeof value!=='string'||!value||/[\u0000-\u001f\\]/.test(value))return '';
  if(rendered) {
    if(!PAGE_ID.test(value))return '';
    return `https://app.roku.com/api/v2/homescreen/pages/${encodeURIComponent(value)}/rendered?limit=100`;
  }
  const safe=safeUrl(value,['api2.sr.roku.com']);if(!safe)return '';
  const u=new URL(safe);if(u.hash||!u.pathname.startsWith('/homescreen/'))return '';
  if(!/^\/homescreen\/(?:v[12]\/)?(?:plugins\/)?(?:pages|collections)\//.test(u.pathname))return '';
  return `https://app.roku.com/api/v2/homescreen/pages/${encodeURIComponent(value)}`;
}

export function rokuMenuPages(data) {
  const result=new Map();const paths=[];
  function walk(value){if(!value||typeof value!=='object')return;if(Array.isArray(value)){value.forEach(walk);return;}
    const title=plainText(value.title);const id=value.meta?.id;
    if(value.meta?.type==='page'&&title&&title!=='Live TV') {const url=rokuPageAddress(id,{rendered:true});if(url)result.set(url,{url,label:title,kind:'page',feed:url});}
    if(value.meta?.type==='path'&&typeof id==='string'&&id.startsWith('/browse/')) {
      const target=NAV_PATH_ROOTS[id];const url=target?rokuPageAddress(target,{rendered:true}):'';
      if(url)result.set(url,{url,label:title||'Roku Originals',kind:'page',feed:url});else paths.push({path:id,label:title});
    }
    if(Array.isArray(value.view))value.view.forEach(walk);
  }walk(data);
  return {pages:[...result.values()],paths};
}

export function rokuCollections(data) {
  const rows=[];
  if(Array.isArray(data?.collections))rows.push(...data.collections.filter(row=>row&&typeof row==='object'));
  // Roku's wrapper can include both an empty collections[] and its own valid view.
  if(Array.isArray(data?.view))rows.push(data);
  if(!rows.length)for(const row of Object.values(data??{}))if(row&&typeof row==='object'&&Array.isArray(row.view))rows.push(row);
  return rows;
}

export function parseRokuCatalogPage(data,{label='',feed='',continuation=false}={}) {
  const rows=rokuCollections(data);const films=[];const series=[];const links=[];const lazy=[];const skipped=[];const rowStats=[];
  for(const row of rows) {
    const name=plainText(row.title)||label;
    if(disabled(row.lazyload)){lazy.push({label:name,id:row.meta?.id,href:row.meta?.href});continue;}
    const view=Array.isArray(row.view)?row.view:[];let more=0;let pageLinks=0;const identities=[];
    for(const entry of view) {
      const content=entry?.content;if(!content)continue;
      const card=sourceCard(content,name);
      if(card){if(content.type==='movie')films.push(card);else series.push(card);identities.push(content.meta.id);}
      else if(CONTENT_ID.test(content.meta?.id??''))identities.push(content.meta.id);
      if(content.meta?.mediaType!=='page')continue;
      const childLabel=plainText(content.title)||name;const href=content.meta.href;
      if(/live(?: tv| channels)?/i.test(name)&&/^(?:more|live tv|live channels)$/i.test(childLabel)){skipped.push({reason:'live-directory',label:name});continue;}
      let url='';let kind='page';
      if(typeof href==='string'&&href.includes('/plugins/pages/see-more')){url=rokuPageAddress(href);kind='more';more++;}
      else if(content.meta.id)url=rokuPageAddress(content.meta.id,{rendered:true});
      if(!url){skipped.push({reason:'unsupported-page-link',label:childLabel,path:typeof href==='string'?(()=>{try{return new URL(href).pathname;}catch{return'';}})():''});continue;}
      pageLinks++;links.push({url,label:kind==='more'?name:childLabel,kind,feed:kind==='more'&&continuation&&name===label?(feed||url):url});
    }
    rowStats.push({label:name,entries:view.length,contentIdentities:identities,moreLinks:more,pageLinks,terminal:more===0});
  }
  return {films,series,links,lazy,skipped,rows:rowStats,recognized:rows.length>0||Array.isArray(data?.collections)&&(data?.meta?.mediaType==='page'||data?.type==='page')};
}

function merge(map,row) {
  const old=map.get(row.sourceId);if(!old){map.set(row.sourceId,row);return;}
  map.set(row.sourceId,{...old,image:old.image||row.image,description:old.description||row.description,categories:[...new Set([...old.categories,...row.categories])],shelves:[...new Set([...old.shelves,...row.shelves])],freeOptionVerified:old.freeOptionVerified||row.freeOptionVerified,...(old.freeGuestVerified||row.freeGuestVerified?{freeGuestVerified:true}:{}),...(row.cardAccess==='free-option'?{cardAccess:row.cardAccess}:{})});
}
function validTask(task) {
  const value=safeUrl(task?.url,['app.roku.com']);if(!value)return false;
  const u=new URL(value);if(u.hash)return false;
  if(u.pathname==='/api/v2/homescreen/v2/home')return [...u.searchParams].every(([key,value])=>key==='limit'&&/^\d+$/.test(value));
  const match=/^\/api\/v2\/homescreen\/pages\/([^/]+)(\/rendered)?$/.exec(u.pathname);if(!match)return false;
  try{const target=decodeURIComponent(match[1]);return match[2]?PAGE_ID.test(target)&&[...u.searchParams].every(([key,value])=>key==='limit'&&/^\d+$/.test(value)):rokuPageAddress(target)===value;}catch{return false;}
}

export async function discoverRokuCatalog({fetcher=globalThis.fetch,signal,onCheckpoint=async()=>{},onProgress=()=>{},resume,checkpointEvery=25,maxRequests=Infinity,delayMs=1000,maxResponseBytes=32_000_000,extraRoots=[]}={}) {
  const initial=resume?.checkpoint??resume;
  if(initial&&initial.schema!==1)throw Error('Unsupported Roku discovery checkpoint.');
  const films=new Map((initial?.films??[]).map(row=>[row.sourceId,row]));const shows=new Map((initial?.seriesCandidates??[]).map(row=>[row.sourceId,row]));
  const queue=[];const queued=new Set(initial?.seen??[]);const done=new Set(initial?.done??[]);const failures=[];const unavailablePages=[...(initial?.unavailablePages??[])];const skipped=[...(initial?.skipped??[])];const roots=[...(initial?.roots??[])];const unresolvedPaths=[...(initial?.unresolvedPaths??[])];
  const feeds=new Map(initial?.graphVersion===2?(initial.feedSignatures??[]):[]);const coverage=[...(initial?.coverage??[])];let requests=initial?.requests??0;let bytes=initial?.bytes??0;let menuLoaded=initial?.menuLoaded??false;let lastCheckpoint=requests;let runRequests=0;
  const startedAt=initial?.startedAt??new Date().toISOString();let retryAfterUntil=initial?.retryAfterUntil??null;let blockedStatus=retryAfterUntil&&Date.parse(retryAfterUntil)>Date.now()?initial.blockedStatus:0;
  function enqueue(task){if(!validTask(task))throw Error('Unsupported Roku metadata task.');if(done.has(task.url)||queue.some(x=>x.url===task.url))return;if(!queued.has(task.url))queued.add(task.url);queue.push(task);}
  if(initial){for(const task of [...(initial.pending??[]),...(initial.failedTasks??[])])enqueue(task);}
  else enqueue({url:ROKU_CATALOG_ROOT+'?limit=100',label:'Home',kind:'page',feed:ROKU_CATALOG_ROOT});
  for(let i=unresolvedPaths.length-1;i>=0;i--){const path=unresolvedPaths[i];const target=NAV_PATH_ROOTS[path.path];if(target){const url=rokuPageAddress(target,{rendered:true});enqueue({url,label:path.label||'Roku Originals',kind:'page',feed:url});if(!roots.some(row=>row.url===url))roots.push({label:path.label||'Roku Originals',url});unresolvedPaths.splice(i,1);}}
  for(const task of extraRoots)enqueue(task);
  const sleep=ms=>new Promise((resolve,reject)=>{if(signal?.aborted){reject(signal.reason);return;}const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},ms);const abort=()=>{clearTimeout(timer);reject(signal.reason);};signal?.addEventListener('abort',abort,{once:true});});
  async function read(url) {
    signal?.throwIfAborted();if(blockedStatus)throw Object.assign(Error(`HTTP ${blockedStatus}: publisher requests paused.`),{blocked:true});if(runRequests>=maxRequests)throw Error('Roku discovery request budget reached.');
    let last;
    for(let attempt=0;attempt<2;attempt++) {
      const controller=new AbortController();const abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});const timeout=setTimeout(abort,30000);
      requests++;runRequests++;
      try{const r=await fetcher(url,{signal:controller.signal,credentials:'omit',cache:'no-store',redirect:'error'});if([403,429].includes(r.status)){blockedStatus=r.status;const value=r.headers?.get('retry-after');const date=Date.parse(value??'');const seconds=/^\d{1,6}$/.test(value??'')?Number(value):Number.isFinite(date)?Math.max(0,Math.ceil((date-Date.now())/1000)):null;retryAfterUntil=seconds!==null?new Date(Date.now()+seconds*1000).toISOString():null;throw Object.assign(Error(`HTTP ${r.status}: publisher requests paused.`),{blocked:true});}if(!r.ok)throw Error(`HTTP ${r.status}`);
        if(r.url&&new URL(r.url).origin!=='https://app.roku.com')throw Error('Unexpected metadata origin.');
        const text=await r.text();bytes+=text.length;if(text.length>maxResponseBytes)throw Error('Roku metadata response exceeded the explicit byte bound.');
        try{return JSON.parse(text);}catch{throw Error('Roku returned non-JSON metadata.');}
      }catch(error){last=error;if(signal?.aborted||error.blocked)throw error;if(attempt===0&&runRequests<maxRequests)await sleep(300);else break;}
      finally{clearTimeout(timeout);signal?.removeEventListener('abort',abort);}
    }throw last;
  }
  function snapshot() {
    const remaining=queue.length+failures.length;
    const graphTraversalComplete=menuLoaded&&remaining===0&&unresolvedPaths.length===0&&!skipped.some(x=>x.reason==='unsupported-page-link');
    const errors=failures.map(({task,error})=>({label:task.label,error}));
    const report={source:'Roku public guest browse/navigation and supplied More graph',label:'Roku reachable free catalogue',complete:graphTraversalComplete,graphTraversalComplete,providerWideComplete:false,serviceTotal:null,scope:'All supported reachable available current browse/menu/More pages traversed. Repeated publisher 404/410 links are recorded unavailable terminal branches; their absent contents and the whole service are not claimed complete.',startedAt,updatedAt:new Date().toISOString(),requests,bytes,films:films.size,seriesCandidates:shows.size,verifiedFreeSeriesCards:[...shows.values()].filter(x=>x.freeOptionVerified).length,pagesCompleted:done.size,availablePagesCompleted:done.size-unavailablePages.length,unavailablePages,remaining:queue.length,failed:failures.length,errors,metadataFailures:errors,roots,unresolvedPaths,skipped,coverage,operationalLimitReached:runRequests>=maxRequests&&queue.length>0,blocked:!!blockedStatus,...(blockedStatus?{blockedStatus,retryAfterUntil}:{})};
    return {items:[...films.values()],seriesCandidates:[...shows.values()],live:[],report,checkpoint:{schema:1,graphVersion:2,startedAt,films:[...films.values()],seriesCandidates:[...shows.values()],pending:[...queue],failedTasks:failures.map(x=>x.task),failures:errors,unavailablePages,seen:[...queued],done:[...done],roots,unresolvedPaths,menuLoaded,requests,bytes,skipped,coverage,feedSignatures:[...feeds],blockedStatus,retryAfterUntil}};
  }
  async function checkpoint(force=false){const data=snapshot();onProgress(data.report);if(force||requests-lastCheckpoint>=checkpointEvery){await onCheckpoint(data);lastCheckpoint=requests;}return data;}
  try {
    if(!menuLoaded&&!blockedStatus) {
      try{const menu=rokuMenuPages(await read(ROKU_MENU));if(!menu.pages.some(x=>x.label==='Movies')||!menu.pages.some(x=>['Series','TV Shows'].includes(x.label)))throw Error('Roku did not supply both movie and show browse roots.');for(const task of menu.pages){enqueue(task);roots.push({label:task.label,url:task.url});}for(const path of menu.paths)if(!unresolvedPaths.some(x=>x.path===path.path))unresolvedPaths.push(path);menuLoaded=true;}
      catch(error){failures.push({task:{url:ROKU_CATALOG_ROOT+'?limit=100',label:'Navigation menu',kind:'menu'},error:error.message});}
    }
    while(queue.length&&runRequests<maxRequests&&!blockedStatus) {
      signal?.throwIfAborted();const task=queue.shift();if(done.has(task.url))continue;
      try {
        const data=await read(task.url);const parsed=parseRokuCatalogPage(data,{label:task.label,feed:task.feed,continuation:task.kind==='more'});
        if(!parsed.recognized)throw Error('Roku returned no recognized metadata rows.');
        const identities=[...new Set(parsed.rows.flatMap(row=>row.contentIdentities))].sort();
        parsed.films.forEach(row=>merge(films,row));parsed.series.forEach(row=>merge(shows,row));skipped.push(...parsed.skipped);
        for(const child of parsed.links)enqueue(child);
        if(task.kind==='more'&&identities.length&&parsed.links.some(child=>child.kind==='more'&&child.feed===task.feed)){const signature=identities.join(',');const history=feeds.get(task.feed)??[];if(history.includes(signature))throw Error('Roku repeated a continuing More page without advancing its content identities.');feeds.set(task.feed,[...history,signature]);}
        if(parsed.lazy.length)throw Error(`Roku left ${parsed.lazy.length} lazy metadata shelves unloaded.`);
        done.add(task.url);coverage.push({label:task.label,kind:task.kind,rows:parsed.rows.length,entries:parsed.rows.reduce((sum,row)=>sum+row.entries,0),moreLinks:parsed.rows.reduce((sum,row)=>sum+row.moreLinks,0),terminalRows:parsed.rows.filter(row=>row.terminal).length});
      }catch(error){if(signal?.aborted){queue.unshift(task);throw error;}const absent=/^HTTP (404|410)$/.exec(error.message);if(absent){if(!unavailablePages.some(row=>row.path===new URL(task.url).pathname))unavailablePages.push({label:task.label,path:new URL(task.url).pathname,status:Number(absent[1])});done.add(task.url);coverage.push({label:task.label,kind:task.kind,status:Number(absent[1]),unavailable:true,rows:0,entries:0});}else failures.push({task,error:error.message});}
      await checkpoint();if(delayMs)await sleep(delayMs);
    }
  }finally{await checkpoint(true);}
  return snapshot();
}

export function parseRokuFilmDetail(detail,item) {
  if(detail?.meta?.id!==item?.sourceId||detail?.type!=='movie'||!Array.isArray(detail.viewOptions))throw Error('Roku did not confirm the requested movie metadata.');
  if(!rokuFreeOption(detail))return null;
  const duration=Number(detail.runTimeSeconds);
  return {...item,title:plainText(detail.title)||item.title,image:art(detail)||item.image,
    description:plainText(detail.description||detail.shortDescription||detail.longDescription||item.description),
    categories:[...new Set([...item.categories,...categories(detail,'')])],freeGuestVerified:true,freeOptionVerified:true,
    ...(Number.isFinite(duration)&&duration>0?{duration:Math.round(duration)}:{})};
}

// Reconfirm and enrich every discovered free movie through the public detail GET.
// Resume records are safe per-ID metadata, not a session or a playback offer cache.
export async function enrichRokuFilms(items,{fetcher=globalThis.fetch,signal,onCheckpoint=async()=>{},onProgress=()=>{},resume,concurrency=1,checkpointEvery=50,maxRequests=Infinity,requestIntervalMs=1000}={}) {
  if(!Array.isArray(items)||items.some(item=>!CONTENT_ID.test(item?.sourceId??'')||item.kind!=='film'||!item.freeGuestVerified))throw Error('Pass verified Roku film metadata for enrichment.');
  if(!Number.isInteger(concurrency)||concurrency<1||concurrency>12)throw Error('Use modest Roku metadata concurrency between 1 and 12.');
  if(!Number.isFinite(requestIntervalMs)||requestIntervalMs<0||requestIntervalMs>60000)throw Error('Roku metadata pacing must be between 0 and 60000 milliseconds.');
  const initial=resume?.checkpoint??resume;if(initial&&initial.schema!==1)throw Error('Unsupported Roku enrichment checkpoint.');
  const input=new Map(items.map(item=>[item.sourceId,item]));const records=new Map((initial?.records??[]).filter(record=>input.has(record.sourceId)).map(record=>[record.sourceId,record]));
  const startedAt=initial?.startedAt??new Date().toISOString();let requests=initial?.requests??0;let runRequests=0;let finished=0;let index=0;let checkpointCount=0;let saving=Promise.resolve();let pacing=Promise.resolve();let nextRequestAt=0;let retryAfterUntil=initial?.retryAfterUntil??null;let blockedStatus=retryAfterUntil&&Date.parse(retryAfterUntil)>Date.now()?initial.blockedStatus:0;let retryAfterSeconds=blockedStatus?Math.ceil((Date.parse(retryAfterUntil)-Date.now())/1000):null;
  const todo=[...input.keys()].filter(id=>!['verified','unavailable'].includes(records.get(id)?.status));
  function snapshot() {
    const verified=[...records.values()].filter(record=>record.status==='verified');const unavailable=[...records.values()].filter(record=>record.status==='unavailable');const failures=[...records.values()].filter(record=>record.status==='failed');
    const pending=[...input.keys()].filter(id=>!['verified','unavailable'].includes(records.get(id)?.status));
    const result=[...input.values()].filter(item=>records.get(item.sourceId)?.status!=='unavailable').map(item=>records.get(item.sourceId)?.status==='verified'?records.get(item.sourceId).item:item);
    const report={source:'Roku public per-film metadata detail GETs',startedAt,updatedAt:new Date().toISOString(),inputFilms:input.size,retainedFilms:result.length,verified:verified.length,excluded:unavailable.map(({sourceId,reason,statusCode})=>({sourceId,reason,...(statusCode?{statusCode}:{})})),metadataFailures:failures.map(({sourceId,reason})=>({sourceId,reason})),pending:pending.length,requests,complete:pending.length===0,missingImages:result.filter(item=>!item.image).length,missingDescriptions:result.filter(item=>!item.description).length,missingDuration:result.filter(item=>!item.duration).length,operationalLimitReached:runRequests>=maxRequests&&pending.length>0,blocked:!!blockedStatus,...(blockedStatus?{blockedStatus,retryAfterSeconds,retryAfterUntil}:{}),requestIntervalMs};
    return {items:result,report,checkpoint:{schema:1,startedAt,requests,records:[...records.values()],pending,blockedStatus,retryAfterUntil}};
  }
  async function publish(force=false) {const data=snapshot();onProgress(data.report);if(force||finished-checkpointCount>=checkpointEvery){checkpointCount=finished;saving=saving.then(()=>onCheckpoint(data));await saving;}return data;}
  async function pace(){const next=pacing.then(async()=>{if(blockedStatus)throw Object.assign(Error(`HTTP ${blockedStatus}: publisher requests paused.`),{statusCode:blockedStatus,blocked:true});const wait=nextRequestAt-Date.now();if(wait>0)await new Promise(resolve=>setTimeout(resolve,wait));signal?.throwIfAborted();if(blockedStatus)throw Object.assign(Error(`HTTP ${blockedStatus}: publisher requests paused.`),{statusCode:blockedStatus,blocked:true});nextRequestAt=Date.now()+requestIntervalMs;});pacing=next.catch(()=>{});await next;}
  async function detail(item) {
    const url=new URL('https://app.roku.com/api/v2/homescreen/content/'+encodeURIComponent('https://content.sr.roku.com/content/v1/roku-trc/'+item.sourceId));
    url.searchParams.set('include','type,title,imageMap,images,description,shortDescription,longDescription,genres,categoryObjects,viewOptions,meta,runTimeSeconds');let last;
    for(let attempt=0;attempt<2;attempt++) {
      signal?.throwIfAborted();await pace();if(runRequests>=maxRequests)throw Error('Roku enrichment request budget reached.');requests++;runRequests++;
      const controller=new AbortController();const abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});const timeout=setTimeout(abort,25000);
      try {const r=await fetcher(url.href,{signal:controller.signal,credentials:'omit',cache:'no-store',redirect:'error'});if([403,429].includes(r.status)){blockedStatus=r.status;const value=r.headers?.get('retry-after');const date=Date.parse(value??'');retryAfterSeconds=/^\d{1,6}$/.test(value??'')?Number(value):Number.isFinite(date)?Math.max(0,Math.ceil((date-Date.now())/1000)):null;retryAfterUntil=retryAfterSeconds!==null?new Date(Date.now()+retryAfterSeconds*1000).toISOString():null;throw Object.assign(Error(`HTTP ${r.status}: publisher requests paused.`),{statusCode:r.status,blocked:true});}if(!r.ok)throw Object.assign(Error(`HTTP ${r.status}`),{statusCode:r.status});
        if(r.url&&new URL(r.url).origin!=='https://app.roku.com')throw Error('Unexpected Roku metadata origin.');const text=await r.text();if(text.length>8_000_000)throw Error('Roku detail response exceeded the explicit byte bound.');
        let data;try{data=JSON.parse(text);}catch{throw Error('Roku returned non-JSON movie details.');}return parseRokuFilmDetail(data,item);
      }catch(error){last=error;if(signal?.aborted||error.blocked)throw error;}
      finally{clearTimeout(timeout);signal?.removeEventListener('abort',abort);}
    }throw last;
  }
  async function worker() {while(index<todo.length&&runRequests<maxRequests&&!blockedStatus){signal?.throwIfAborted();const sourceId=todo[index++];const item=input.get(sourceId);
    try{const enriched=await detail(item);records.set(sourceId,enriched?{sourceId,status:'verified',checkedAt:new Date().toISOString(),item:enriched}:{sourceId,status:'unavailable',checkedAt:new Date().toISOString(),reason:'The detailed movie record no longer offers enabled free rokuavod access.'});}
    catch(error){if(signal?.aborted)throw error;records.set(sourceId,{sourceId,status:[404,410].includes(error.statusCode)?'unavailable':'failed',checkedAt:new Date().toISOString(),reason:error.message,...(error.statusCode?{statusCode:error.statusCode}:{})});}
    finished++;await publish();
  }}
  try{signal?.throwIfAborted();await Promise.all(Array.from({length:Math.min(concurrency,todo.length)},worker));}finally{await publish(true);}
  return snapshot();
}
