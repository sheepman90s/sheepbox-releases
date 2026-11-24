import {safeUrl,plainText} from './core.mjs';
const API='https://backstage-api.com';
const device=crypto.randomUUID();
const validId=id=>typeof id==='string'&&/^[A-Za-z0-9_!'-]{1,180}$/.test(id);
const free=value=>value==null||typeof value==='number'&&value===0||typeof value==='string'&&value.trim()!==''&&Number(value)===0;
const routes={movie:'movies',episode:'episodes',clip:'clips',channel:'channels'};
export const revryUnblocked=row=>!!row&&!row.isHidden&&(row.blocked==null||Array.isArray(row.blocked)&&!row.blocked.length)&&free(row.minimumPrice);
function edition(rows){return rows.find(row=>row.editionType==='full'&&revryUnblocked(row)&&free(row.price)&&row.streams?.some(stream=>stream.type==='hls'&&stream.drm==='unencrypted'))??rows.find(row=>row.editionType==='full'&&revryUnblocked(row)&&free(row.price)&&row.streams?.some(stream=>stream.type==='dash'&&stream.drm==='widevine'));}
async function request(url,{signal,json=true,api=true}={}){
 const response=await fetch(url,{credentials:'omit',cache:'no-store',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(25000)]):AbortSignal.timeout(25000),headers:api?{Accept:'application/json','X-Service-ID':'0f7df5f0-d19e-11ef-8f78-d97d2702e67c','X-Application-ID':'86ec0a90-d345-11ef-b549-c3f611f19132','X-Device-ID':device,'X-Device-Type':'web','Accept-Language':'en'}:{Accept:'text/plain'}});
 if(!response.ok)throw Error('Revry returned HTTP '+response.status+'.');const text=await response.text();if(text.length>12000000)throw Error('Revry returned too much data.');return json?JSON.parse(text):text.trim();
}
function clientUrl(raw){
 const safe=safeUrl(raw,['services.nimrod.24imedia.com']);if(!safe)throw Error('Revry changed its advertising/stream resolver.');
 const url=new URL(safe),ua=globalThis.navigator?.userAgent??'';
 url.searchParams.set('clientData',JSON.stringify({platform:'web',dataPrivacy:{regulation:'',consent:'',dnt:1,lat:1,gppString:'',gppSid:''},device:{id:'',maker:'',model:'',os:/Windows/.test(ua)?'windows':/Android/.test(ua)?'android':/Mac/.test(ua)?'macos':'',osVersion:'',language:'en'},user:{pseudoId:device,sessionId:crypto.randomUUID()},app:{name:'SheepBox',bundle:'',storeUrl:'https://github.com/sheepman90s/sheepbox-releases',language:'en'},player:{width:globalThis.innerWidth??1280,height:globalThis.innerHeight??720,muted:0,playbackId:crypto.randomUUID()},media:{language:'en',adPodMaxDur:null}}));return url.href;
}
async function authorizeRevry(item,{signal,editionId}={}){
 const type=item?.sourceType,id=item?.sourceId;
 if(item?.mode!=='revry'||!routes[type]||!validId(id)||item.freeGuestVerified!==true)throw Error('Invalid Revry title.');
 const config=await request(API+'/configurations/application',{signal});
 if(config.custom?.features?.guestMode?.enabled!==true||config.custom.features.guestMode.allowWatchContent!==true)throw Error('Revry guest viewing is unavailable.');
 const ads=config.features?.adInsertion;if(ads?.enabled!==true||ads.type!=='CSAI'||ads.SSAIProvider!=null)throw Error('Revry changed its advertising protocol.');
 const path=API+'/media/'+routes[type]+'/'+encodeURIComponent(id),detail=await request(path,{signal});
 if(String(detail.id)!==id||detail.type!==type||!revryUnblocked(detail))throw Error('This Revry free title is unavailable in the current region.');
 if(type==='episode'&&detail.series){if(!validId(detail.series)||!revryUnblocked(await request(API+'/media/series/'+encodeURIComponent(detail.series)+'?includeEpisodes=false',{signal})))throw Error('This Revry show is unavailable.');}
 const editions=await request(path+'/editions',{signal});if(!Array.isArray(editions))throw Error('Revry editions changed.');
 const selected=editionId?editions.find(row=>String(row.id)===editionId&&row.editionType==='full'&&revryUnblocked(row)&&free(row.price)&&row.streams?.some(stream=>stream.type==='dash'&&stream.drm==='widevine')):edition(editions);if(!selected)throw Error('Revry did not authorize the same free full edition.');
 if(!validId(String(selected.id)))throw Error('Revry returned an invalid edition.');
 const protectedVideo=!!editionId||!selected.streams.some(stream=>stream.type==='hls'&&stream.drm==='unencrypted');
 const protocol=protectedVideo?'dash':'hls',encryption=protectedVideo?'widevine':'unencrypted';
 const stream=await request(path+'/stream?'+new URLSearchParams({editionId:selected.id,type:protocol,drm:encryption}),{signal});
 if(stream.type!==protocol||stream.drm!==encryption||(!protectedVideo&&stream.data?.licenseUrl))throw Error('Revry did not authorize the expected guest playback.');
 if(protectedVideo&&(!safeUrl(stream.data?.licenseUrl)||new URL(stream.data.licenseUrl).protocol!=='https:'))throw Error('Revry did not authorize a playback licence.');
 return {stream,selected,type,protectedVideo};
}
export async function resolveRevry(item,{signal}={}){
 const {stream,selected,type,protectedVideo}=await authorizeRevry(item,{signal});
 let url;
 if(stream.urlSrc){if(stream.urlSrcService!=='parameterManager')throw Error('Revry changed its stream resolver.');url=await request(clientUrl(stream.urlSrc),{signal,json:false,api:false});}else url=stream.url;
 url=safeUrl(url);if(!url)throw Error('Revry did not return a supported stream.');
 const tag=stream.data?.adsUrl||stream.advertisement||'';
 if(!tag&&!['channel','clip'].includes(type))throw Error('Revry’s advertising schedule is unavailable.');
 const tracks=(selected.subtitles??[]).flatMap(track=>{const source=track.sources?.find(source=>source.type==='webvtt'&&safeUrl(source.src));return source?[{url:source.src,language:track.language||'und',label:plainText(track.label||track.language)||'Captions'}]:[];});
 return {kind:protectedVideo?'dash':'hls',url,adTag:tag?clientUrl(tag):'',live:type==='channel',tracks,...(protectedVideo?{drm:{licenseUrl:stream.data.licenseUrl,refreshLicense:async({signal}={})=>(await authorizeRevry(item,{signal,editionId:String(selected.id)})).stream.data.licenseUrl}}:{})};
}
export function validateRevryLibrary(value){
 if(value?.schema!==1||value.provider!=='revry'||value.report?.completeSupportedPublicGuestDirectories!==true||value.report.searchQueriesExhausted!==36||!Array.isArray(value.items)||!Array.isArray(value.live)||!Array.isArray(value.providerSeries))throw Error('The Revry catalogue is incomplete.');
 const all=[...value.items,...value.live,...value.providerSeries];
 if(new Set(all.map(row=>row.id)).size!==all.length||all.some(row=>row.provider!=='revry'||!row.title||!validId(row.sourceId)||!row.freeGuestVerified||['url','headers','cookies','token','license','adTag','streams'].some(key=>key in row)))throw Error('Revry catalogue metadata is invalid.');
 const items=new Map(value.items.map(row=>[row.id,row]));if(value.providerSeries.some(show=>!show.episodes?.length||show.episodes.some(id=>items.get(id)?.seriesId!==show.id)))throw Error('Revry episode coverage is incomplete.');
 const counts=value.report.eligibleRootOffers;
 if(!counts||value.items.filter(row=>row.sourceType==='movie').length!==counts.movie||value.items.filter(row=>row.sourceType==='clip').length!==counts.clip||value.providerSeries.length!==counts.shows||value.live.length!==counts.channel||value.items.filter(row=>row.sourceType==='episode'&&row.seriesId).length!==value.report.freeEpisodes)throw Error('Revry metadata was truncated after its complete audit.');
 return value;
}
export async function loadRevryGuide(channels,{signal}={}){
 const now=Math.floor(Date.now()/1000),result=[];
 for(const channel of channels.filter(row=>row.provider==='revry'&&row.sourceType==='channel')){
  if(!validId(channel.sourceId))throw Error('Invalid Revry guide channel.');
  const data=await request(API+'/media/channels/'+encodeURIComponent(channel.sourceId)+'/epg?'+new URLSearchParams({from:String(now-3600),to:String(now+86400)}),{signal});
  if(!Array.isArray(data.items)||data.offset!==0||data.total!==data.items.length)throw Error('Revry’s programme guide is incomplete.');
  result.push({id:channel.id,title:channel.title,programmes:data.items.map(row=>({title:plainText(row.label),description:plainText(row.description),start:Number(row.startsAt)*1000,end:Number(row.endsAt)*1000})).filter(row=>row.title&&Number.isFinite(row.start)&&row.end>row.start).sort((a,b)=>a.start-b.start)});
 }
 return result;
}
