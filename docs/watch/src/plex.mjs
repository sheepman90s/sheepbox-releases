import {safeUrl,plainText} from './core.mjs';
const API='https://vod.provider.plex.tv',AUTH='https://plex.tv/api/v2/users/anonymous';
const ID=/^[a-f0-9]{24}$/,PRIVATE=['token','authToken','headers','cookies','Media','Part','Ad','streams','url','adTag','license','session','sessionId'];
const yes=value=>value===true||value===1||['true','1'].includes(String(value).toLowerCase());
export function plexFree(row,now=Date.now()/1000){return !!row&&typeof row.availabilityId==='string'&&!!row.availabilityId&&Number.isFinite(Number(row.expiresAt))&&Number(row.expiresAt)>now&&!['requiresSubscription','requiresPurchase','requiresAuthentication','isPremium'].some(key=>yes(row[key]));}
export function plexOfficial(value,kind){
 const url=safeUrl(value,['watch.plex.tv']);if(!url)return '';const u=new URL(url);
 if(u.protocol!=='https:'||u.search||u.hash||/%2f|%5c|%2e/i.test(u.pathname))return '';
 const pattern=kind==='film'?/^\/movie\/[^/?#\\]+\/?$/:kind==='series'?/^\/show\/[^/?#\\]+\/?$/:/^\/show\/[^/?#\\]+\/season\/\d+\/episode\/\d+\/?$/;
 return pattern.test(u.pathname)?url:'';
}
export function plexImage(value){const url=safeUrl(value);if(!url)return '';const u=new URL(url);return u.protocol==='https:'&&![...u.searchParams.keys()].some(key=>/token|signature|credential|session/i.test(key))?url:'';}
export function normalizePlex(row,{kind,categories=[],series}={}){
 const sourceId=String(row?.ratingKey??'');kind??=({movie:'film',show:'series',episode:'episode'})[row?.type];
 const official=plexOfficial(row?.publicPagesURL,kind);
 if(!ID.test(sourceId)||!kind||!plexFree(row)||!official||!plainText(row.title))throw Error('Plex returned incomplete free title metadata.');
 const item={id:'plex-'+(kind==='film'?'movie':kind==='series'?'series':'episode')+'-'+sourceId,sourceId,sourceType:row.type,provider:'plex',providerName:'Plex',kind,mode:'plex-publisher',freeGuestVerified:true,title:plainText(row.title).slice(0,250),description:plainText(row.summary).slice(0,4000),official,image:plexImage(row.thumb)||series?.image||'',categories:[...new Set([...categories,...(row.Genre??[]).map(g=>plainText(g.tag))].filter(Boolean))],expiresAt:Number(row.expiresAt)};
 const duration=Number(row.duration)/1000;if(Number.isFinite(duration)&&duration>0)item.duration=duration;
 if(Number.isInteger(Number(row.year))&&Number(row.year)>0)item.year=Number(row.year);
 if(kind==='series'){item.episodes=[];item.episodeDiscovery='plex-api';}
 if(kind==='episode'){
  if(series)item.seriesId=series.id;
  for(const [key,field] of [['seasonNumber','parentIndex'],['episodeNumber','index']])if(row[field]!==null&&row[field]!==undefined&&row[field]!==''&&Number.isInteger(Number(row[field]))&&Number(row[field])>=0)item[key]=Number(row[field]);
 }
 return item;
}
export function isPlexSeries(row){return !!(row?.provider==='plex'&&row.kind==='series'&&ID.test(row.sourceId??'')&&row.id==='plex-series-'+row.sourceId&&row.episodeDiscovery==='plex-api'&&row.freeGuestVerified===true&&plexOfficial(row.official,'series'));}
export function validatePlexLibrary(value){
 if(value?.schema!==1||value.provider!=='plex'||value.report?.complete!==true||value.report.completeRootDirectories!==true||value.report.genresReconciled!==true||!Array.isArray(value.items)||!Array.isArray(value.providerSeries)||!Array.isArray(value.live)||value.live.length)throw Error('The complete Plex movie/show directory could not be loaded.');
 const rows=[...value.items,...value.providerSeries],counts=value.report.counts;
 if(!counts||counts.videos!==value.items.length||counts.shows!==value.providerSeries.length||counts.live!==0||new Set(rows.map(row=>row.id)).size!==rows.length)throw Error('Plex root catalogue counts do not reconcile.');
 for(const row of rows){if(!ID.test(row.sourceId??'')||row.provider!=='plex'||row.mode!=='plex-publisher'||row.freeGuestVerified!==true||!Number.isFinite(row.expiresAt)||row.expiresAt<=0||!row.title||!Array.isArray(row.categories)||PRIVATE.some(key=>key in row)||!plexOfficial(row.official,row.kind)||row.kind==='film'&&(row.id!=='plex-movie-'+row.sourceId||row.sourceType!=='movie')||row.kind==='series'&&(row.sourceType!=='show'||!isPlexSeries(row)||!Array.isArray(row.episodes)||row.episodes.length))throw Error('Invalid Plex catalogue metadata.');}
 if(value.items.some(row=>row.kind!=='film')||value.providerSeries.some(row=>row.kind!=='series'))throw Error('Plex catalogue contains an unsupported title type.');return value;
}
export function mergePlexLibrary(catalog,value){validatePlexLibrary(value);return {...catalog,items:[...catalog.items,...value.items],providerSeries:[...(catalog.providerSeries??[]),...value.providerSeries],sources:{...catalog.sources,plex:value.report}};}
export function resolvePlex(item,{signal}={}){signal?.throwIfAborted();const official=plexOfficial(item?.official,item?.kind);if(item?.provider!=='plex'||item.freeGuestVerified!==true||!ID.test(item.sourceId??'')||!official||PRIVATE.some(key=>key in item))throw Error('This Plex title has no verified official player address.');return {kind:'external',url:official,notice:'Plex’s official player checks current free access, region, captions and advertising.'};}

export class PlexGuest {
 constructor({fetchImpl=(...args)=>globalThis.fetch(...args),clientId=crypto.randomUUID()}={}){this.fetchImpl=fetchImpl;this.clientId=clientId;}
 headers(){return {Accept:'application/json','Content-Type':'application/json','X-Plex-Product':'Plex Mediaverse','X-Plex-Client-Identifier':this.clientId,'X-Plex-Platform':'Web','X-Plex-Device':'Browser','X-Plex-Language':'en','X-Plex-Provider-Version':'7.6.0'};}
 async response(url,{signal,post=false,token}={}){
  const destination=new URL(url);if(destination.href!==AUTH&&destination.origin!==API||token&&destination.origin!==API)throw Error('Plex credentials cannot leave their provider service.');
  const r=await this.fetchImpl(url,{method:post?'POST':'GET',headers:{...this.headers(),...(token?{'X-Plex-Token':token}:{})},credentials:'omit',redirect:'error',cache:'no-store',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(35000)]):AbortSignal.timeout(35000)});
  if(!r.ok){const error=Error('Plex returned HTTP '+r.status+'.');error.status=r.status;throw error;}
  const text=await r.text();if(text.length>32_000_000)throw Error('Plex returned too much metadata.');return JSON.parse(text);
 }
 async session(signal){
  if(this.token&&Date.now()-this.created<1500000)return this.token;
  for(let attempt=0;attempt<2;attempt++){
   signal?.throwIfAborted();
   if(!this.pending){const task=this.response(AUTH,{post:true,signal}).then(row=>{if(row.anonymous!==true||typeof row.authToken!=='string'||!row.authToken)throw Error('Plex’s ordinary guest session is unavailable.');this.token=row.authToken;this.created=Date.now();return this.token;}).finally(()=>{if(this.pending===task)this.pending=null;});this.pending=task;}
   try{return await this.pending;}catch(error){if(attempt||signal?.aborted||error.name!=='AbortError')throw error;}
  }
 }
 async api(path,{signal}={}){
  const url=new URL(path,API);if(url.origin!==API||!url.pathname.startsWith('/library/')||url.username||url.password||url.hash)throw Error('Unsupported Plex metadata address.');
  for(let attempt=0;attempt<2;attempt++){const token=await this.session(signal);try{const data=await this.response(url.href,{signal,token});if(data?.MediaContainer?.identifier!=='tv.plex.provider.vod')throw Error('Plex returned a different metadata provider.');return data.MediaContainer;}catch(error){if(![401,403].includes(error.status)||attempt)throw error;if(this.token===token)this.token='';}}
 }
 async children(sourceId,{signal}={}){
  if(!ID.test(sourceId))throw Error('Invalid Plex show or season.');let offset=0,total;const result=[],ids=new Set();
  do{
   const data=await this.api('/library/metadata/'+sourceId+'/children?'+new URLSearchParams({availabilityType:'free','X-Plex-Container-Start':String(offset),'X-Plex-Container-Size':'100'}),{signal});
   const rows=data.Metadata??[],count=Number(data.size),reported=Number(data.totalSize);
   if(!Array.isArray(rows)||Number(data.offset??0)!==offset||!Number.isSafeInteger(count)||count<0||rows.length!==count||!Number.isSafeInteger(reported)||reported<0||total!==undefined&&total!==reported||!count&&offset<reported)throw Error('The Plex season/episode directory is incomplete.');
   total=reported;for(const row of rows){if(!ID.test(row.ratingKey??'')||ids.has(row.ratingKey))throw Error('Plex repeated an episode page.');ids.add(row.ratingKey);result.push(row);}
   offset+=count;if(offset>total)throw Error('Plex episode counts do not reconcile.');
  }while(offset<total);
  return result;
 }
 async detail(sourceId,{signal}={}){if(!ID.test(sourceId))throw Error('Invalid Plex title.');const data=await this.api('/library/metadata/'+sourceId,{signal});const row=data.Metadata?.find(row=>row.ratingKey===sourceId);if(!row||data.Metadata.length!==1)throw Error('This Plex title is unavailable.');return row;}
 async series(show,{signal}={}){
  if(!isPlexSeries(show))throw Error('Invalid Plex show.');const current=await this.detail(show.sourceId,{signal});if(current.type!=='show'||!plexFree(current))throw Error('This Plex show is no longer available to free guests.');
  const seasons=await this.children(show.sourceId,{signal}),items=[],seen=new Set();
  for(const season of seasons){
   if(season.type!=='season'||season.parentRatingKey!==show.sourceId)throw Error('Plex returned an inconsistent season owner.');
   // A season is a navigation container. The free-only child directory and each
   // episode's own current offer authorize leaves; missing container-only rights
   // fields must not silently remove independently free episodes.
   for(const row of await this.children(season.ratingKey,{signal})){
    if(row.type!=='episode'||row.parentRatingKey!==season.ratingKey||row.grandparentRatingKey!==show.sourceId)throw Error('Plex returned an inconsistent episode owner.');
    if(!plexFree(row)||!Array.isArray(row.Media)||!row.Media.length)continue;
    const item=normalizePlex(row,{series:show,categories:show.categories});if(seen.has(item.id))throw Error('Plex repeated an episode across seasons.');seen.add(item.id);items.push(item);
   }
  }
  items.sort((a,b)=>(a.seasonNumber??1e9)-(b.seasonNumber??1e9)||(a.episodeNumber??1e9)-(b.episodeNumber??1e9)||a.id.localeCompare(b.id));
  return {schema:1,provider:'plex',complete:true,seriesId:show.id,checkedAt:new Date().toISOString(),seasonCount:seasons.length,items};
 }
}
const guest=new PlexGuest();
export function validatePlexEpisodes(show,value){
 if(!isPlexSeries(show)||value?.schema!==1||value.provider!=='plex'||value.complete!==true||value.seriesId!==show.id||!Number.isFinite(Date.parse(value.checkedAt))||!Array.isArray(value.items)||new Set(value.items.map(row=>row.id)).size!==value.items.length)throw Error('The complete Plex episode list could not be verified.');
 for(const row of value.items)if(row.id!=='plex-episode-'+row.sourceId||!ID.test(row.sourceId??'')||row.provider!=='plex'||row.kind!=='episode'||row.mode!=='plex-publisher'||row.seriesId!==show.id||row.freeGuestVerified!==true||PRIVATE.some(key=>key in row)||!plexOfficial(row.official,'episode')||!row.title)throw Error('Plex episode ownership or metadata is invalid.');return value;
}
const metadataCache='sheepbox-library-data-v1',scope=new URL('../',import.meta.url),indexWrites=new Map();
const cacheUrl=part=>new URL('data/plex/'+part,scope).href;
async function readCached(part){try{const r=await(await caches.open(metadataCache)).match(cacheUrl(part));return r?await r.json():null;}catch{return null;}}
async function saveCached(value){
 try{const cache=await caches.open(metadataCache);await cache.put(cacheUrl('series/'+value.seriesId.slice(12)+'.json'),new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}}));
  const groups=new Map();for(const row of value.items){const prefix=row.sourceId.slice(0,2);if(!groups.has(prefix))groups.set(prefix,{});groups.get(prefix)[row.sourceId]=value.seriesId;}
  await Promise.all([...groups].map(([prefix,entries])=>{const job=(indexWrites.get(prefix)??Promise.resolve()).catch(()=>{}).then(async()=>{const previous=await readCached('index/'+prefix+'.json');const safe=Object.fromEntries(Object.entries(previous??{}).filter(([id,show])=>ID.test(id)&&/^plex-series-[a-f0-9]{24}$/.test(show)));await cache.put(cacheUrl('index/'+prefix+'.json'),new Response(JSON.stringify({...safe,...entries}),{headers:{'Content-Type':'application/json'}}));});indexWrites.set(prefix,job);return job;}));
 }catch{/* Metadata caching can be unavailable; a complete current result still works. */}
}
export async function loadPlexSeries(show,{signal,client=guest,force=false}={}){
 signal?.throwIfAborted();
 const cached=await readCached('series/'+show.sourceId+'.json');let previous;try{if(cached)previous=validatePlexEpisodes(show,cached);}catch{}
 signal?.throwIfAborted();
 if(!force&&previous&&Date.now()-Date.parse(previous.checkedAt)>=0&&Date.now()-Date.parse(previous.checkedAt)<21600000)return previous;
 try{const value=validatePlexEpisodes(show,await client.series(show,{signal}));signal?.throwIfAborted();await saveCached(value);return value;}catch(error){signal?.throwIfAborted();if(previous)return {...previous,retained:true};throw error;}
}
export async function plexEpisodeParent(id,{signal,client=guest}={}){
 signal?.throwIfAborted();if(!/^plex-episode-[a-f0-9]{24}$/.test(id))return null;const source=id.slice(13),index=await readCached('index/'+source.slice(0,2)+'.json'),cached=index?.[source];signal?.throwIfAborted();if(/^plex-series-[a-f0-9]{24}$/.test(cached??''))return {parent:cached};
 const row=await client.detail(source,{signal});if(row.type!=='episode'||!plexFree(row)||!ID.test(row.grandparentRatingKey??''))throw Error('This Plex episode is no longer available to free guests.');return {parent:'plex-series-'+row.grandparentRatingKey,row};
}
