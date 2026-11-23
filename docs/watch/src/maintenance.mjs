import {escapeHtml as e} from './core.mjs';
import {providers,playsInPage} from './providers.mjs';

// CacheStorage belongs to an origin, which can contain several GitHub projects.
// Remove only SheepBox metadata inside this application's path; retain its shell.
export async function clearCatalogueCache({cacheStorage=globalThis.caches,scope=new URL('../',import.meta.url)}={}){
  if(!cacheStorage)throw Error('Catalogue cache access is unavailable in this browser.');
  let removed=0;
  for(const name of await cacheStorage.keys()){
    if(!name.startsWith('sheepbox-web-')&&name!=='sheepbox-library-data-v1')continue;
    const cache=await cacheStorage.open(name);
    for(const request of await cache.keys()){
      const url=new URL(request.url);
      if(url.origin===scope.origin&&url.pathname.startsWith(scope.pathname+'data/'))if(await cache.delete(request))removed++;
    }
  }
  return removed;
}
const probes={nasaplus:'https://plus.nasa.gov/wp-json/wp/v2/video?per_page=1&_fields=id',cw:'https://data.cwtv.com/feed/app-2/landing/epg/page_1/pagesize_75/device_web/apiversion_24/'};
export async function probeProvider(id,{fetchImpl=globalThis.fetch,signal}={}){
  if(!probes[id])return 'No browser metadata check is available; use the publisher link.';
  try{
    const response=await fetchImpl(probes[id],{credentials:'omit',cache:'no-store',signal:signal??AbortSignal.timeout(12000)});
    return response.ok?'Metadata reachable. Playback and regional access are checked when you watch.':`Metadata returned HTTP ${response.status}. Playback availability is unverified.`;
  }catch{return 'Unable to verify from this browser (network, CORS or offline). This does not establish a provider outage.';}
}
export function providerStatusMarkup(catalog,statuses={}){
  return `<div class="provider-status-list">${providers.map(p=>{
    const items=catalog.items.filter(row=>row.provider===p.id),live=catalog.live.filter(row=>row.provider===p.id).length,shows=(catalog.providerSeries??[]).filter(row=>row.provider===p.id).length;
    const report=catalog.sources?.[p.id];
    const scope=typeof report==='object'?report.scope||report.note||report.source:'';
    const count=items.length||live||shows?`${live.toLocaleString()} live · ${items.filter(x=>x.kind!=='episode').length.toLocaleString()} videos · ${shows.toLocaleString()} shows · ${items.filter(x=>x.kind==='episode').length.toLocaleString()} episodes`:'Publisher website; no saved catalogue';
    return `<article class="provider-status-row"><h3><a href="#provider/${p.id}">${e(p.name)}</a></h3><p>${e(count)}</p><p>${playsInPage(p)?'Integrated player; current availability checked at playback.':'Opens the publisher’s official player.'}</p>${scope?`<small>${e(scope)}</small>`:''}<div class="button-row">${probes[p.id]?`<button class="button ghost small" data-probe-provider="${p.id}">Check metadata</button>`:''}<a class="text-button" href="${e(p.url)}" target="_blank" rel="noopener noreferrer">Publisher website ↗</a></div><p id="provider-probe-${p.id}" role="status">${e(statuses[p.id]??'No live check run in this session.')}</p></article>`;
  }).join('')}</div>`;
}
