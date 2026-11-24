import {runtime} from './paths.mjs';
const {validateProviderLibrary}=await runtime('provider-libraries');
const {validateRevryLibrary}=await runtime('revry');
const {validatePlexLibrary}=await runtime('plex');
const {validatePlutoLibrary}=await runtime('pluto');
export function publicMetadata(value){
 const forbidden=new Set(['token','cs_auth_token','cookies','headers','license','licenseUrl','license_urls','adTag','streams','encodings','sessionId','mpdURL','mpd_url']);
 function visit(node){if(Array.isArray(node))node.forEach(visit);else if(node&&typeof node==='object'){for(const [key,child] of Object.entries(node)){if(forbidden.has(key))throw Error('Temporary playback or authentication data cannot be published.');visit(child);}}else if(typeof node==='string'&&/https?:\/\/[^\s"<>]+\.(?:m3u8|mpd)(?:\?|$)/i.test(node))throw Error('Media offers cannot be published as catalogue metadata.');}
 visit(value);return value;
}
export function validateReplacement(previous,next,provider){
 publicMetadata(next);
 if(['pbs','freetv','runtime'].includes(provider))validateProviderLibrary(next,provider);
 else if(provider==='plex')validatePlexLibrary(next);
 else if(provider==='pluto')validatePlutoLibrary(next);
 else if(provider==='revry')validateRevryLibrary(next);
 else if(next.report?.complete!==true||!Array.isArray(next.items)||!Array.isArray(next.live)||!Array.isArray(next.providerSeries))throw Error('Provider traversal is incomplete.');
 if(previous.report?.region&&next.report?.region!==previous.report.region)throw Error('Detected region differs from the saved catalogue.');
 const all=[...next.items,...next.live,...next.providerSeries],byId=new Map(next.items.map(row=>[row.id,row]));
 if(!all.length||new Set(all.map(row=>row.id)).size!==all.length||all.some(row=>row.provider!==provider||!row.id||!row.title)||!['plex','pluto'].includes(provider)&&next.providerSeries.some(show=>!show.episodes?.length||new Set(show.episodes).size!==show.episodes.length||show.episodes.some(id=>byId.get(id)?.seriesId!==show.id)))throw Error('Catalogue identities or episode ownership do not reconcile.');
 for(const key of ['items','live','providerSeries'])if(previous[key]?.length&&next[key].length<previous[key].length*0.8)throw Error(provider+' '+key+' fell from '+previous[key].length+' to '+next[key].length+'; retain the saved library for maintainer review.');
 return next;
}
export function mergeSelection(catalog,provider,value){
 const previous={items:catalog.items.filter(row=>row.provider===provider),live:catalog.live.filter(row=>row.provider===provider),providerSeries:(catalog.providerSeries??[]).filter(row=>row.provider===provider),report:catalog.sources[provider]};
 validateReplacement(previous,value,provider);
 return {...catalog,items:[...catalog.items.filter(row=>row.provider!==provider),...value.items],live:[...catalog.live.filter(row=>row.provider!==provider),...value.live],providerSeries:[...(catalog.providerSeries??[]).filter(row=>row.provider!==provider),...value.providerSeries],sources:{...catalog.sources,[provider]:value.report},...(value.nasaSeries?{nasaSeries:value.nasaSeries}:{})};
}
