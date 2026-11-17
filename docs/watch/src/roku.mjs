// Metadata-only guest selection. Playback opens Roku's supported official website.
// Its same-origin APIs and protected media are never relayed or framed here.
import {plainText,safeUrl} from './core.mjs';

export const ROKU_SELECTION_SOURCE='https://app.roku.com/api/v2/homescreen/v2/home?limit=6';
const ID=/^[a-f0-9]{32}$/;
const LIMIT=20;

function freeMovie(row) {
  return row?.type==='movie'&&ID.test(row?.meta?.id??'')&&Array.isArray(row.viewOptions)&&
    row.viewOptions.some(option=>option?.providerId==='rokuavod'&&![true,'true',1].includes(option.disabled)&&!option.providerProductId);
}

function artwork(row) {
  const urls=['grid','detailBackground','gridEpg','detailPoster'].map(key=>row?.imageMap?.[key]?.path);
  urls.push(...(Array.isArray(row?.images)?row.images.map(image=>image?.path):[]));
  return urls.map(value=>safeUrl(value)).find(Boolean)||'';
}

function genres(row) {
  return [...new Set([...(Array.isArray(row?.categoryObjects)?row.categoryObjects.map(value=>value?.title):[]),
    ...(Array.isArray(row?.genres)?row.genres:[])].filter(value=>typeof value==='string').map(plainText).filter(Boolean))].slice(0,20);
}

export function parseRokuSelection(data) {
  if(!Array.isArray(data?.collections)||data.collections.length>150)throw Error('Roku returned an unexpected guest home selection.');
  const rows=new Map();
  for(const shelf of data.collections) {
    if(!Array.isArray(shelf?.view))continue;
    if(shelf.view.length>1000)throw Error('Roku returned an unexpected shelf size.');
    for(const entry of shelf.view) {
      const row=entry?.content;if(!freeMovie(row))continue;
      const sourceId=row.meta.id;const title=plainText(row.title).slice(0,240);if(!title)continue;
      const shelfName=plainText(shelf.title).slice(0,160);const old=rows.get(sourceId);
      if(old){old.shelves=[...new Set([...old.shelves,shelfName].filter(Boolean))];old.categories=[...new Set([...old.categories,shelfName].filter(Boolean))];continue;}
      // The first20 distinct eligible movies form an explicit, bounded editorial tranche.
      if(rows.size>=LIMIT)continue;
      const seconds=Number(row.runTimeSeconds);const categories=[...new Set(['Films',...genres(row),shelfName].filter(Boolean))];
      rows.set(sourceId,{id:`roku-${sourceId}`,sourceId,provider:'roku',providerName:'Roku',kind:'film',mode:'roku-link',title,
        description:plainText(row.description||row.shortDescription||row.longDescription).slice(0,4000),image:artwork(row),categories,
        shelves:shelfName?[shelfName]:[],...(Number.isFinite(seconds)&&seconds>0&&seconds<=43_200?{duration:Math.round(seconds)}:{}),
        official:`https://app.roku.com/details/${sourceId}`,watchUrl:`https://app.roku.com/watch/${sourceId}`,
        freeGuestVerified:true,selectionSource:ROKU_SELECTION_SOURCE});
    }
  }
  return [...rows.values()];
}

async function publicJson(url,{fetcher,signal}) {
  signal?.throwIfAborted();const controller=new AbortController();const abort=()=>controller.abort();
  signal?.addEventListener('abort',abort,{once:true});const timer=setTimeout(abort,25000);
  try {
    const response=await fetcher(url,{signal:controller.signal,credentials:'omit',cache:'no-store',redirect:'error'});
    if(!response.ok)throw Error(`Roku metadata returned HTTP ${response.status}.`);
    if(response.url){const final=safeUrl(response.url,['app.roku.com']);if(!final||new URL(final).pathname!==new URL(url).pathname)throw Error('Roku returned an unexpected metadata address.');}
    const text=await response.text();if(text.length>8_000_000)throw Error('Roku returned too much metadata.');
    try{return JSON.parse(text);}catch{throw Error('Roku returned unexpected metadata.');}
  }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}

// Maintainer refresh uses public metadata GETs only; no CSRF, account or play session.
export async function loadRokuSelection({fetcher=globalThis.fetch,signal}={}) {
  const items=parseRokuSelection(await publicJson(ROKU_SELECTION_SOURCE,{fetcher,signal}));
  if(!items.length)throw Error('Roku did not return any clearly free guest movies.');
  let enriched=0;const metadataFailures=[];const excluded=new Set();
  for(const item of items) {
    signal?.throwIfAborted();
    const url=new URL('https://app.roku.com/api/v2/homescreen/content/'+encodeURIComponent('https://content.sr.roku.com/content/v1/roku-trc/'+item.sourceId));
    url.searchParams.set('include','type,title,imageMap,images,description,shortDescription,longDescription,genres,categoryObjects,viewOptions,meta');
    try {
      const detail=await publicJson(url.href,{fetcher,signal});
      if(detail?.meta?.id!==item.sourceId)throw Error('Roku returned another movie identity.');
      if(!freeMovie(detail)){excluded.add(item.sourceId);throw Error('Roku did not reconfirm this free movie.');}
      item.image=artwork(detail)||item.image;item.description=plainText(detail.description||detail.shortDescription||detail.longDescription||item.description).slice(0,4000);
      item.categories=[...new Set([...item.categories,...genres(detail)])];enriched++;
    }catch(error){if(signal?.aborted)throw error;metadataFailures.push({sourceId:item.sourceId,reason:error.message});}
  }
  const available=items.filter(item=>!excluded.has(item.sourceId));
  if(!available.length)throw Error('Roku did not reconfirm any free guest movies.');
  return {items:available,live:[],report:{source:ROKU_SELECTION_SOURCE,label:'Free movie selection · Watch on Roku',complete:false,films:available.length,
    scope:'First 20 distinct enabled free rokuavod movies on the current guest home shelves; no complete-library or series claim.',
    metadataEnriched:enriched,metadataFailures,excluded:[...excluded],playback:'Explicit official watch-page links. Roku owns the external player, ads, sign-in, DRM, captions, availability and viewing history.',
    browserLimit:'Roku guest bootstrap/catalogue APIs do not allow browser CORS from SheepBox, and Roku sends X-Frame-Options:SAMEORIGIN. Metadata refresh runs outside the visitor browser.'}};
}

export function resolveRoku(item,{signal}={}) {
  signal?.throwIfAborted();
  if(item?.provider!=='roku'||item?.mode!=='roku-link'||item?.kind!=='film'||item?.freeGuestVerified!==true||!ID.test(item?.sourceId??''))
    throw Error('This item has no verified official Roku watch link.');
  return {kind:'external',url:`https://app.roku.com/watch/${item.sourceId}`};
}
