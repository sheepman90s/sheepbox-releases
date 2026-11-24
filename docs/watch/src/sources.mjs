import {safeUrl,archiveLicense,parseNasaVideo,archiveSchedule} from './core.mjs';
import {parseWebcams,publisherEmbedUrl} from './publishers.mjs';
import {resolveNewsOn} from './newson.mjs';
import {resolveXumo} from './xumo.mjs';
import {resolveCw} from './cw.mjs';
import {resolveYupp} from './yupp.mjs';
import {resolveWorldTv} from './worldtv.mjs';
import {resolveRedBull} from './redbull.mjs';
import {resolveRevry,validateRevryLibrary} from './revry.mjs';
import {resolveFilmzie} from './filmzie.mjs';
import {resolveFreeTv} from './freetv.mjs';
import {mergeProviderLibrary,resolveRegularPbs} from './provider-libraries.mjs';
import {resolveRoku} from './roku.mjs';
import {mergeApkLibrary,apkPublisherUrl} from './apk-library.mjs';
import {resolvePublisherLink} from './publisher-links.mjs';
import {mergeRokuLibrary,isRokuSeriesReference,parseRokuEpisodeFile,parseRokuEpisodeIndex} from './roku-library.mjs';
export async function fetchJson(url,{signal,timeout=25000,maxLength=12_000_000}={}) {
  const controller=new AbortController();const abort=()=>controller.abort();
  if(signal?.aborted)controller.abort();signal?.addEventListener('abort',abort,{once:true});
  const timer=setTimeout(abort,timeout);
  try {
    const r=await fetch(url,{signal:controller.signal,credentials:'omit'});
    if(!r.ok)throw Error(`The publisher returned HTTP ${r.status}.`);
    const text=await r.text();if(text.length>maxLength)throw Error('The publisher response is too large.');
    return {data:JSON.parse(text),response:r};
  } finally {clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
export async function loadCatalog(signal) {
  const {data}=await fetchJson(new URL('../data/catalog.json',import.meta.url),{signal});
  if(data.schema!==1||!Array.isArray(data.items)||!Array.isArray(data.live))throw Error('The SheepBox library could not be loaded.');
  const roku=data.externalCatalogs?.roku;
  if(roku&&roku.path!=='roku/catalog.json')throw Error('The Roku library address is invalid.');
  // All complete snapshots load together; a failed provider leaves startup in
  // its explicit retry state instead of silently presenting a partial library.
  const [cameras,library,{data:revry},{data:apk},...additions]=await Promise.all([
    fetchJson(new URL('../data/webcams.json',import.meta.url),{signal}),
    roku?fetchJson(new URL('../data/'+roku.path,import.meta.url),{signal,timeout:60000,maxLength:64_000_000}):Promise.resolve(null),
    fetchJson(new URL('../data/revry.json',import.meta.url),{signal,maxLength:16000000}),
    fetchJson(new URL('../data/apk-library.json',import.meta.url),{signal,timeout:60000,maxLength:40_000_000}),
    ...['pbs','freetv'].map(provider=>fetchJson(new URL('../data/'+provider+'.json',import.meta.url),{signal,timeout:60000,maxLength:40_000_000}))
  ]);
  validateRevryLibrary(revry);data.items.push(...revry.items);data.live.push(...revry.live);data.providerSeries.push(...revry.providerSeries);data.sources.revry=revry.report;
  let result=mergeApkLibrary(library?mergeRokuLibrary(data,library.data):data,apk);
  for(const addition of additions)result=mergeProviderLibrary(result,addition.data);
  return {...result,cameras:parseWebcams(cameras.data)};
}
export async function loadRokuSeriesFile(series,{signal}={}){
  if(!isRokuSeriesReference(series))throw Error('This series has no saved episode list.');
  const {data}=await fetchJson(new URL('../data/'+series.episodeFile,import.meta.url),{signal,timeout:45000,maxLength:32_000_000});
  return parseRokuEpisodeFile(series,data);
}
export async function loadRokuEpisodeIndex(id,{signal}={}){
  if(!/^roku-[a-f0-9]{32}$/.test(id))return new Map();const prefix=id.slice(5,7);
  const {data}=await fetchJson(new URL(`../data/roku/index/${prefix}.json`,import.meta.url),{signal,maxLength:8_000_000});
  return parseRokuEpisodeIndex(prefix,data);
}
export async function refreshNasa(previous,{signal,onProgress=()=>{}}={}) {
  const terms={};
  for(const item of previous.items.filter(x=>x.provider==='nasaplus'))for(const category of item.categories)terms[`existing:${category}`]=category;
  // Taxonomies supply current readable category names; failed refreshes leave the saved catalogue intact.
  for(const type of ['topic','genre']){
    let pages=1;
    for(let page=1;page<=pages;page++){
      const {data,response}=await fetchJson(`https://plus.nasa.gov/wp-json/wp/v2/${type}?per_page=100&page=${page}`,{signal});
      pages=Number(response.headers.get('x-wp-totalpages'))||1;if(pages>20)throw Error('The publisher returned an unexpected category count.');
      for(const term of data)terms[`${type}:${term.id}`]=term.name;
    }
  }
  let pages=1;const items=[];
  for(let page=1;page<=pages;page++){
    const fields='id,status,link,title,excerpt,meta,featured_image,topic,genre,series,date_gmt';
    const {data,response}=await fetchJson(`https://plus.nasa.gov/wp-json/wp/v2/video?per_page=100&page=${page}&_fields=${fields}`,{signal});
    pages=Number(response.headers.get('x-wp-totalpages'))||1;if(pages>30)throw Error('The publisher returned an unexpected catalogue size.');
    items.push(...data.map(row=>parseNasaVideo(row,terms)).filter(Boolean));onProgress(page,pages,items.length);
  }
  if(!items.length)throw Error('The publisher did not return any available videos.');
  return {...previous,items:[...previous.items.filter(x=>x.provider!=='nasaplus'),...items],refreshedAt:new Date().toISOString()};
}
function archiveFile(row) {
  const file=String(row.name??'');if(!file||file.startsWith('/')||file.split('/').some(x=>x==='..')||file.includes('\\')||row.private===true||row.private==='true')return null;
  const format=String(row.format??'').toLowerCase();
  const rank=format==='h.264 hd'?0:format==='h.264'?1:format==='mpeg4'?2:format==='h.264 ia'?3:/\.mp4$/i.test(file)?4:/\.webm$/i.test(file)?5:null;
  return rank===null?null:{file,rank};
}
export function availableArchiveFiles(data){
  if(data.is_dark===true||data.is_restricted===true||!archiveLicense(data.metadata?.licenseurl))return [];
  return (data.files??[]).map(archiveFile).filter(Boolean).sort((a,b)=>a.rank-b.rank);
}
export async function resolvePlayback(item,catalog,{signal}={}) {
  if(item.provider==='pbs')return resolveRegularPbs(item);
  if(item.mode==='freetv')return resolveFreeTv(item,{signal});
  if(item.mode==='apk-publisher'){const url=apkPublisherUrl(item);if(!url)throw Error('This title has no verified official publisher player link.');return {kind:'external',url};}
  if(item.mode==='publisher-link')return resolvePublisherLink(item,{signal});
  if(['newson-live','newson-latest'].includes(item.mode))return resolveNewsOn(item,{signal});
  if(item.mode==='xumo-live')return resolveXumo(item,{signal});
  if(item.mode==='cw-live')return resolveCw(item,{signal});
  if(item.mode==='yupp-live')return resolveYupp(item,{signal});
  if(item.mode==='worldtv')return resolveWorldTv(item);
  if(item.mode==='redbull')return resolveRedBull(item,{signal});
  if(item.mode==='revry')return resolveRevry(item,{signal});
  if(['filmzie-movie','filmzie-episode'].includes(item.mode))return resolveFilmzie(item,{signal});
  if(item.provider==='roku'&&(item.mode==='roku-link'||item.kind==='series'))return resolveRoku(item,{signal});
  if(['pbs','youtube'].includes(item.mode)) {
    let url='';
    if(item.mode==='pbs'&&item.embedAllowed===true)url=`https://player.pbs.org/viralplayer/${item.sourceId}/`;
    if(item.mode==='youtube')url=`https://www.youtube-nocookie.com/embed/${item.sourceId}`;
    if(!publisherEmbedUrl(url))throw Error('The publisher has not supplied a supported embedded player for this title.');
    return {kind:'embed',url,official:item.official};
  }
  if(item.mode==='nfb'){
    if(!/^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/.test(item.slug))throw Error('This film has an invalid publisher address.');
    return {kind:'embed',url:`https://www.nfb.ca/film/${item.slug}/embed/player/`,official:item.official};
  }
  if(item.mode==='nasa'||item.mode==='nasa-live'){
    let url='';
    if(item.mode==='nasa'){
      if(!/^[1-9]\d*$/.test(item.sourceId))throw Error('Invalid NASA+ video.');
      const {data}=await fetchJson(`https://plus.nasa.gov/wp-json/wp/v2/video/${item.sourceId}?_fields=id,meta`,{signal});
      url=safeUrl(data.meta?.['video-url'],['nasaplus.akamaized.net']);
      if(!url||!/^\/output\/\d+\.m3u8$/.test(new URL(url).pathname)||new URL(url).search)throw Error('NASA+ does not currently offer a supported video for this title.');
    }else{
      const {data}=await fetchJson('https://plus.nasa.gov/wp-json/nasaplus/v1/live-streams',{signal});
      url=safeUrl(data.find(row=>/NASA\+/.test(row.title)&&String(row['live-stream-link']).includes('/v1/channel/NASAPrime/NASAPlus.m3u8'))?.['live-stream-link']);
      if(!url||!new URL(url).hostname.endsWith('.channel-assembly.mediatailor.us-east-1.amazonaws.com')||new URL(url).pathname!=='/v1/channel/NASAPrime/NASAPlus.m3u8')throw Error('The NASA+ live channel is currently unavailable.');
    }
    return {kind:'hls',url,live:item.kind==='live'};
  }
  if(item.mode==='hls'){
    const url=safeUrl(item.url,['30a-tv.com']);if(!url||!new URL(url).pathname.endsWith('.m3u8'))throw Error('The publisher stream is unavailable.');
    return {kind:'hls',url,live:true};
  }
  let selected=item;let offset=0;let next;
  if(item.mode==='archive-linear'){
    const schedule=archiveSchedule(catalog.items,item.lineupCategory);if(!schedule)throw Error('This collection does not have a current lineup.');
    selected=schedule.item;offset=schedule.offset;next=schedule.next;
  }
  if(selected.mode==='archive'){
    if(!/^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(selected.sourceId))throw Error('Invalid Archive item.');
    const {data}=await fetchJson(`https://archive.org/metadata/${encodeURIComponent(selected.sourceId)}`,{signal});
    const license=archiveLicense(data.metadata?.licenseurl);if(!license)throw Error('A supported public reuse license could not be confirmed for this item. Open its publisher page for details.');
    if(data.is_dark||data.is_restricted)throw Error('This item is not available for public playback.');
    const files=availableArchiveFiles(data);
    const file=files[0];if(!file)throw Error('The Archive does not currently offer a browser-playable file.');
    const url=`https://archive.org/download/${encodeURIComponent(selected.sourceId)}/${file.file.split('/').map(encodeURIComponent).join('/')}`;
    const tracks=(data.files??[]).filter(row=>/\.vtt$/i.test(row.name??'')&&!String(row.name).includes('..')).slice(0,10).map(row=>({url:`https://archive.org/download/${encodeURIComponent(selected.sourceId)}/${String(row.name).split('/').map(encodeURIComponent).join('/')}`,label:row.title||'Captions',language:'en'}));
    return {kind:'video',url,tracks,license,offset,nowPlaying:item.mode==='archive-linear'?selected.title:'',next:next?.title,live:item.kind==='live'};
  }
  throw Error('This provider currently opens on its own website.');
}
