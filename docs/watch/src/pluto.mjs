import {safeUrl} from './core.mjs';
const NATIVE=/^[a-f0-9]{24}$/,CMS=/^[1-9]\d{0,19}$/;
const privateFields=['token','authToken','sessionJwt','headers','cookies','streams','url','adTag','license','session','sessionId'];
export function plutoOfficial(row){
 const value=safeUrl(row?.official,['pluto.tv']);if(!value)return '';const url=new URL(value);
 if(url.protocol!=='https:'||url.search||url.hash||/%2f|%5c|%2e/i.test(url.pathname))return '';
 if(row.kind==='film')return NATIVE.test(row.sourceId??'')&&url.pathname==='/us/movies/'+row.sourceId+'/'?value:'';
 if(row.kind==='live')return CMS.test(row.sourceId??'')&&url.pathname==='/us/watch/live-tv/'+row.sourceId+'/'?value:'';
 if(row.kind==='series'){
  const slug=typeof row.slug==='string'&&/^[A-Za-z0-9_-]+$/.test(row.slug)&&url.pathname==='/us/shows/'+row.slug+'/';
  if(row.sourceNamespace==='cms')return CMS.test(row.sourceId??'')&&(url.pathname==='/us/shows/'+row.sourceId+'/'||slug)?value:'';
  const canonical=CMS.test(row.canonicalSourceId??'')&&url.pathname==='/us/shows/'+row.canonicalSourceId+'/';
  return NATIVE.test(row.sourceId??'')&&(canonical||slug)?value:'';
 }
 return '';
}
export function isPlutoExternalSeries(row){return !!(row?.provider==='pluto'&&row.kind==='series'&&row.mode==='series'&&row.externalOnly===true&&row.freeGuestVerified===true&&row.id==='pluto-series-'+(row.sourceNamespace==='cms'?'cms-':'')+row.sourceId&&Array.isArray(row.episodes)&&row.episodes.length===0&&row.episodeCount===undefined&&plutoOfficial(row)&&privateFields.every(key=>!(key in row)));}
export function validatePlutoLibrary(value){
 const report=value?.report;
 if(value?.schema!==1||value.provider!=='pluto'||report?.complete!==true||report.providerWideComplete!==false||report.region!=='US'||report.categoryGraphComplete!==true||report.currentIndexesReconciled!==true||report.movieDestinationsComplete!==true||report.liveDirectoryComplete!==true||!Array.isArray(value.items)||!Array.isArray(value.live)||!Array.isArray(value.providerSeries))throw Error('The complete supported Pluto directories could not be loaded.');
 const rows=[...value.items,...value.providerSeries,...value.live],counts=report.counts;
 if(!counts||counts.videos!==value.items.length||counts.shows!==value.providerSeries.length||counts.live!==value.live.length||new Set(rows.map(row=>row.id)).size!==rows.length)throw Error('Pluto catalogue counts or identities do not reconcile.');
 for(const row of rows){if(row.provider!=='pluto'||row.freeGuestVerified!==true||!row.title||!Array.isArray(row.categories)||privateFields.some(key=>key in row)||!plutoOfficial(row)||row.isLocked!==false||row.isContentAccessibleInCMS===false)throw Error('Invalid Pluto public title metadata.');}
 if(value.items.some(row=>row.kind!=='film'||row.sourceNamespace!=='native'||row.id!=='pluto-movie-'+row.sourceId||row.mode!=='pluto-publisher')||value.live.some(row=>row.kind!=='live'||row.sourceNamespace!=='channel'||row.id!=='pluto-live-'+row.sourceId||row.mode!=='pluto-publisher'||row.isLocked!==false||row.isContentAccessibleInCMS!==true)||value.providerSeries.some(row=>!['native','cms'].includes(row.sourceNamespace)||!isPlutoExternalSeries(row)))throw Error('Pluto contains an unsupported title reference.');return value;
}
export function mergePlutoLibrary(catalog,value){validatePlutoLibrary(value);return {...catalog,items:[...catalog.items,...value.items],live:[...catalog.live,...value.live],providerSeries:[...(catalog.providerSeries??[]),...value.providerSeries],sources:{...catalog.sources,pluto:value.report}};}
export function resolvePluto(item,{signal}={}){signal?.throwIfAborted();const url=plutoOfficial(item);if(item?.provider!=='pluto'||item.freeGuestVerified!==true||item.isLocked===true||item.isContentAccessibleInCMS===false||!url||privateFields.some(key=>key in item))throw Error('This Pluto title has no verified official player address.');return {kind:'external',url,notice:'Pluto’s official player checks current free access, region, captions and advertising.'};}
