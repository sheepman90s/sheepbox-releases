import {safeUrl,plainText} from './core.mjs';
const SITE='https://www.runtime.tv',API='https://api-ott.runtime.tv';
const idPattern=/^[1-9][0-9]{0,11}$/;
const yes=value=>['1','true'].includes(String(value).toLowerCase()),no=value=>['0','false'].includes(String(value).toLowerCase());
export function runtimeEligible(row,country){
 if(!row||!/^([A-Z]{2})$/.test(country)||!no(row.reg_users_only)||!no(row.premium_content))return false;
 if(['premium_content','is_premium','drm'].some(key=>key in row&&!no(row[key])))return false;
 if('required_permissions' in row&&(!Array.isArray(row.required_permissions)||row.required_permissions.length))return false;
 if('has_geo_restrictions' in row&&!yes(row.has_geo_restrictions)&&!no(row.has_geo_restrictions))return false;
 if(yes(row.has_geo_restrictions)&&!row.allowed_countries?.some(value=>value.code===country))return false;
 if(['allow_avod','allow_avod_global','allow_avod_countries'].some(key=>key in row)&&(!yes(row.allow_avod)||!yes(row.allow_avod_global)&&!row.allow_avod_countries?.includes(country)))return false;
 return true;
}
async function text(url,{signal,headers}={}){
 const r=await fetch(url,{credentials:'omit',cache:'no-store',headers,signal:signal?AbortSignal.any([signal,AbortSignal.timeout(30000)]):AbortSignal.timeout(30000)});
 if(!r.ok)throw Error('Runtime returned HTTP '+r.status+'.');const value=await r.text();if(value.length>8_000_000)throw Error('Runtime returned too much data.');return value;
}
let saved;
async function bootstrap(signal){
 if(saved&&Date.now()-saved.created<600000)return saved;
 const html=await text(SITE+'/',{signal}),raw=html.match(/<script[^>]*data-drupal-selector=["']drupal-settings-json["'][^>]*>([\s\S]*?)<\/script>/)?.[1];
 if(!raw)throw Error('Runtime guest configuration is unavailable.');
 const options=JSON.parse(raw).codesbasePublic?.options;
 if(options?.api!==API||options.version!==13||typeof options.cs_auth_token!=='string'||!options.cs_auth_token)throw Error('Runtime changed its guest protocol.');
 const session={token:options.cs_auth_token,version:options.version,language:options.language,created:Date.now()};
 const config=await api('getconfiguration',session,{},signal);if(!/^[A-Z]{2}$/.test(config.country_code))throw Error('Runtime could not detect the current region.');
 session.country=config.country_code;return saved=session;
}
async function api(action,session,params,signal,{json=true}={}){
 const url=new URL('/'+action,API);url.search=new URLSearchParams({version:session.version,device_type:'desktop',platform:'web',partner:'internal',language:session.language,connection:'wifi',timestamp:String(Math.floor(Date.now()/1000)),timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,...params});
 const value=await text(url,{signal,headers:{'ottera-referrer':'runtime.tv','ottera-cs-auth':session.token}});return json?JSON.parse(value):value;
}
function officialUrl(raw){const url=safeUrl(new URL(raw,SITE).href,['www.runtime.tv']);if(!url||new URL(url).protocol!=='https:')throw Error('Runtime returned an invalid title page.');return url;}
export function parseRuntimeOffer(item,row,script,country){
 if(String(row.id)!==item.sourceId||row.type!=='video'||!runtimeEligible(row,country))throw Error('This Runtime title is unavailable for free guest playback in the current region.');
 const kind='hls',url=script.match(/playerSources\.hls\s*=\s*\[\{\s*url:\s*'([^']+)'/)?.[1];
 if(!safeUrl(url)||new URL(url).protocol!=='https:')throw Error('Runtime did not supply a supported playback offer.');
 const rawAds=script.match(/\bads:\s*(\{[^\r\n]+\}),/)?.[1],ads=rawAds?JSON.parse(rawAds):null;
 const adTag=ads?.hasAds===true?ads.url:'',live=['linear','live'].includes(row.video_type);
 if(adTag){const safe=safeUrl(adTag,['api-ott.runtime.tv']);if(!safe||new URL(safe).pathname!=='/getVMAP'||new URL(safe).searchParams.get('id')!==item.sourceId)throw Error('Runtime changed its advertising protocol.');}
 if(!live&&yes(row.has_ads)&&!adTag)throw Error('Runtime’s advertising schedule is unavailable.');
 return {kind,url,adTag,live};
}
async function authorize(item,signal){
 if(item?.mode!=='runtime'||!idPattern.test(item.sourceId)||item.freeGuestVerified!==true)throw Error('Invalid Runtime title.');
 const session=await bootstrap(signal),data=await api('search',session,{id:item.sourceId},signal),rows=data.objects?.filter(row=>String(row.id)===item.sourceId);
 if(rows?.length!==1)throw Error('This Runtime title is unavailable.');const row=rows[0];
 if(!runtimeEligible(row,session.country))throw Error('This Runtime title is unavailable for free guest viewing in the current region.');
 const script=await api('embeddedVideoPlayer',session,{id:item.sourceId,div_id:'video_player',content_page_url:encodeURIComponent(officialUrl(row.url)),image_width:String(globalThis.innerWidth||1280),max_bitrate:'10000'},signal,{json:false});
 return parseRuntimeOffer(item,row,script,session.country);
}
export async function resolveRuntime(item,{signal}={}){return authorize(item,signal);}
export function runtimeGuideRows(data){
 if(!Array.isArray(data?.objects))throw Error('Runtime’s programme guide changed.');
 return data.objects.map(row=>({title:plainText(row.name),description:plainText(row.short_description),start:Number(row.segment_start_time)*1000,end:Number(row.segment_end_time)*1000})).filter(row=>row.title&&row.start>0&&Number.isFinite(row.end)&&row.end>row.start);
}
export async function loadRuntimeGuide(channels,{signal}={}){
 const session=await bootstrap(signal),result=[];
 for(const channel of channels.filter(row=>row.provider==='runtime'&&idPattern.test(row.guideId))){
  let start=0;const programmes=[],fingerprints=new Set();
  while(true){
   const data=await api('getvideosegments',session,{parent_id:channel.guideId,parent_type:'linear_channel',linear_channel_id:channel.guideId,image_width:'366',start:String(start),max:'100'},signal);
   const total=Number(data.total_results),count=Number(data.num_results);
   if(Number(data.start_index)!==start||!Number.isSafeInteger(total)||total<0||!Number.isSafeInteger(count)||count<0||count>100||!Array.isArray(data.objects)||data.objects.length>count)throw Error('Runtime’s programme guide is incomplete.');
   if(count){const fingerprint=data.objects.map(row=>row.id).join('|');if(fingerprints.has(fingerprint))throw Error('Runtime repeated a programme page.');fingerprints.add(fingerprint);}
   programmes.push(...runtimeGuideRows(data));
   if(start+count>=total)break;if(count===0)throw Error('Runtime’s programme guide ended early.');start+=count;
  }
  result.push({id:channel.id,title:channel.title,programmes:[...new Map(programmes.map(row=>[row.start+'|'+row.end+'|'+row.title,row])).values()].sort((a,b)=>a.start-b.start)});
 }
 return result;
}
