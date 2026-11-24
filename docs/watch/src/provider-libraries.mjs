import {safeUrl} from './core.mjs';
const privateKeys=['url','streams','encodings','cookies','headers','token','license','adTag','session','sessionId'];
export function validateProviderLibrary(value,provider){
 if(!['pbs','freetv','runtime'].includes(provider)||value?.schema!==1||value.provider!==provider||value.report?.complete!==true||!Array.isArray(value.items)||!Array.isArray(value.live)||!Array.isArray(value.providerSeries))throw Error('The '+provider+' catalogue is incomplete.');
 const rows=[...value.items,...value.live,...value.providerSeries],counts=value.report.counts;
 if(!counts||counts.videos!==value.items.length||counts.shows!==value.providerSeries.length||counts.live!==value.live.length||new Set(rows.map(row=>row.id)).size!==rows.length)throw Error('The '+provider+' catalogue counts do not reconcile.');
 for(const row of rows){
  if(row.provider!==provider||!(/^[A-Za-z0-9][A-Za-z0-9:._-]{0,239}$/).test(row.id??'')||!row.id.startsWith(provider+'-')||!row.title||!Array.isArray(row.categories)||privateKeys.some(key=>key in row))throw Error('Invalid '+provider+' metadata.');
  if(row.kind==='series')continue;
  if(row.freeGuestVerified!==true||typeof row.sourceId!=='string'||!(provider==='pbs'?/^[1-9]\d{5,11}$/:/^[1-9]\d{0,11}$/).test(row.sourceId)||row.id!==(provider==='pbs'?'pbs-video-':provider+'-')+row.sourceId||!safeUrl(row.official,provider==='pbs'?['www.pbs.org']:[provider==='runtime'?'www.runtime.tv':'www.freetv.com']))throw Error('Invalid '+provider+' free title.');
  if(provider==='pbs'&&(!['pbs','publisherLink'].includes(row.mode)||row.mode==='pbs'&&row.embedAllowed!==true))throw Error('PBS embedding permission is missing.');
  if(['freetv','runtime'].includes(provider)&&row.mode!==provider)throw Error('Invalid FreeTV playback mode.');
 }
 const byId=new Map(value.items.map(row=>[row.id,row]));
 const shows=new Map(value.providerSeries.map(row=>[row.id,row]));
 if(value.providerSeries.some(show=>!Array.isArray(show.episodes)||!show.episodes.length||new Set(show.episodes).size!==show.episodes.length||show.episodes.some(id=>byId.get(id)?.seriesId!==show.id))||value.items.some(row=>row.kind==='episode'&&(row.seriesId?row.standaloneEpisode===true||!shows.get(row.seriesId)?.episodes.includes(row.id):!['freetv','runtime'].includes(provider)||row.standaloneEpisode!==true)))throw Error('The '+provider+' episode catalogue is incomplete.');
 return value;
}
export function mergeProviderLibrary(catalog,value){
 validateProviderLibrary(value,value.provider);
 return {...catalog,items:[...catalog.items,...value.items],live:[...catalog.live,...value.live],providerSeries:[...(catalog.providerSeries??[]),...value.providerSeries],sources:{...catalog.sources,[value.provider]:value.report}};
}
export function resolveRegularPbs(item){
 const official=safeUrl(item?.official,['www.pbs.org']);
 if(item?.provider!=='pbs'||item.freeGuestVerified!==true||!official||!/^\d{6,12}$/.test(item.sourceId))throw Error('Invalid PBS title.');
 if(item.mode==='pbs'&&item.embedAllowed===true&&(!item.expiresAt||Date.parse(item.expiresAt)>Date.now()))return {kind:'embed',url:'https://player.pbs.org/viralplayer/'+item.sourceId+'/',official};
 return {kind:'external',url:official,notice:'PBS has not enabled embedding for this video, or its saved free window has ended. Its official page checks current availability and regional access.'};
}
