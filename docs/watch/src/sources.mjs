import {safeUrl,archiveLicense,parseNasaVideo,archiveSchedule} from './core.mjs';
export async function fetchJson(url,{signal,timeout=25000}={}) {
  const controller=new AbortController();const abort=()=>controller.abort();
  if(signal?.aborted)controller.abort();signal?.addEventListener('abort',abort,{once:true});
  const timer=setTimeout(abort,timeout);
  try {
    const r=await fetch(url,{signal:controller.signal,credentials:'omit'});
    if(!r.ok)throw Error(`The publisher returned HTTP ${r.status}.`);
    const text=await r.text();if(text.length>12_000_000)throw Error('The publisher response is too large.');
    return {data:JSON.parse(text),response:r};
  } finally {clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
export async function loadCatalog(signal) {
  const {data}=await fetchJson(new URL('../data/catalog.json',import.meta.url),{signal});
  if(data.schema!==1||!Array.isArray(data.items)||!Array.isArray(data.live))throw Error('The SheepBox library could not be loaded.');
  return data;
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
