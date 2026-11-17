// A bounded publisher editorial selection, using per-film officially declared embeds.
// The original iframe owns availability, advertising, captions and tracking consent.
import {plainText,safeUrl} from './core.mjs';

export const RED_BULL_SELECTION_SOURCE='https://www.redbull.com/us-en/collections/films';
const UUID='[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const FILM=new RegExp(`^rrn:content:films:${UUID}$`);
const PAGE=new RegExp(`^/[a-z]{2}(?:_[A-Z]{2,3})?/page/(rrn:content:films:${UUID})/[a-z0-9-]{1,240}$`);
const EMBED=new RegExp(`^/en(?:_US)?/embed/(rrn:content:films:${UUID})$`);

export function redBullEmbedUrl(value,expectedId='') {
  const url=safeUrl(value,['www.redbull.tv']);if(!url)return '';
  const u=new URL(url);const match=EMBED.exec(u.pathname);
  return !u.search&&!u.hash&&match&&(!expectedId||match[1]===expectedId)?url:'';
}

function filmPage(value) {
  const url=safeUrl(value,['www.redbull.tv']);if(!url)return null;
  const u=new URL(url);const match=PAGE.exec(u.pathname);
  return !u.search&&!u.hash&&match?{url,id:match[1]}:null;
}

export function parseRedBullSelectionLinks(html) {
  if(typeof html!=='string'||html.length>8_000_000)throw Error('Red Bull returned an unexpected selection page.');
  const films=new Map();
  for(const match of html.matchAll(/<a\b[^>]*\bhref=["']([^"'<>]+)["'][^>]*>/gi)) {
    const page=filmPage(plainText(match[1]));if(page&&!films.has(page.id))films.set(page.id,page);
  }
  if(!films.size||films.size>40)throw Error('Red Bull returned an unexpected editorial selection size.');
  return [...films.values()];
}

function duration(value) {
  const match=/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(String(value??''));
  if(!match)return 0;
  const seconds=Number(match[1]||0)*3600+Number(match[2]||0)*60+Number(match[3]||0);
  return seconds>0&&seconds<=43_200?Math.round(seconds):0;
}

export function parseRedBullFilm(html,page) {
  if(!page||!FILM.test(page.id)||!filmPage(page.url)||filmPage(page.url).id!==page.id)throw Error('Invalid Red Bull film identity.');
  if(typeof html!=='string'||html.length>8_000_000)throw Error('Red Bull returned an unexpected film page.');
  const nodes=[];
  for(const match of html.matchAll(/<script\b[^>]*\btype=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {const data=JSON.parse(match[1]);nodes.push(...(Array.isArray(data)?data:Array.isArray(data?.['@graph'])?data['@graph']:[data]));}catch{}
  }
  const videos=nodes.filter(node=>node?.['@type']==='VideoObject'&&redBullEmbedUrl(node.embedUrl,page.id));
  if(videos.length!==1)throw Error('Red Bull has not supplied an unambiguous film embed.');
  const video=videos[0];const movie=nodes.find(node=>node?.['@type']==='Movie'&&plainText(node.name)===plainText(video.name));
  if(!movie)throw Error('Red Bull did not identify this selection as a complete film.');
  const title=plainText(video.name).slice(0,240);
  if(!title||/\btrailer\b|\bteaser\b/i.test(title))throw Error('Red Bull returned a trailer or incomplete title.');
  const suppliedImages=Array.isArray(video.thumbnailUrl)?video.thumbnailUrl:[video.thumbnailUrl];
  const image=suppliedImages.map(value=>safeUrl(value,['img.redbull.com','resources.redbull.tv','img.liiift.io'])).find(Boolean)||'';
  const seconds=duration(video.duration||movie.duration);
  return {id:`redbull-${page.id}`,sourceId:page.id,provider:'redbull',providerName:'Red Bull TV',kind:'film',mode:'redbull',
    title,description:plainText(video.description||movie.description).slice(0,4000),image,categories:['Films','Sports'],
    official:page.url,embedUrl:video.embedUrl,embedAllowed:true,embedSource:page.url,...(seconds?{duration:seconds}:{}),
    selectionSource:RED_BULL_SELECTION_SOURCE};
}

async function publicHtml(url,{signal,fetcher=globalThis.fetch}={}) {
  signal?.throwIfAborted();
  const controller=new AbortController();const abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});
  const timer=setTimeout(abort,30000);
  try {
    const response=await fetcher(url,{signal:controller.signal,credentials:'omit',cache:'no-store',redirect:'follow'});
    if(!response.ok)throw Error(`Red Bull returned HTTP ${response.status}.`);
    if(response.url&&!safeUrl(response.url,['www.redbull.com','www.redbull.tv']))throw Error('Red Bull returned an unsupported page redirect.');
    const html=await response.text();if(html.length>8_000_000)throw Error('Red Bull returned an unexpected page size.');
    return html;
  } finally {clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}

// Maintainer-only metadata refresh. It never calls the media or advertising APIs.
export async function loadRedBullSelection({signal,fetcher=globalThis.fetch}={}) {
  const pages=parseRedBullSelectionLinks(await publicHtml(RED_BULL_SELECTION_SOURCE,{signal,fetcher}));
  const items=[];const excluded=[];
  for(const page of pages) {
    signal?.throwIfAborted();
    try {items.push(parseRedBullFilm(await publicHtml(page.url,{signal,fetcher}),page));}
    catch(error){if(signal?.aborted)throw error;excluded.push({sourceId:page.id,reason:error.message});}
  }
  if(!items.length)throw Error('Red Bull did not supply any supported complete film embeds.');
  return {items,live:[],providerSeries:[],report:{source:RED_BULL_SELECTION_SOURCE,label:'Official film selection',
    complete:false,selectionComplete:items.length===pages.length,discovered:pages.length,films:items.length,excluded,
    scope:'Current films linked by the publisher editorial Films collection; not the entire Red Bull TV library.',
    playback:'Per-title VideoObject.embedUrl. The original publisher iframe controls fresh offers, advertising, regional availability, captions and consent.'}};
}

export async function resolveRedBull(item,{signal}={}) {
  signal?.throwIfAborted();
  const sourceId=String(item?.sourceId??'');const url=redBullEmbedUrl(item?.embedUrl,sourceId);
  const source=filmPage(item?.embedSource);
  if(item?.provider!=='redbull'||item?.mode!=='redbull'||item?.embedAllowed!==true||!FILM.test(sourceId)||!url||!source||source.id!==sourceId)
    throw Error('Red Bull has not supplied a supported embedded player for this film.');
  return {kind:'embed',url,official:source.url};
}
