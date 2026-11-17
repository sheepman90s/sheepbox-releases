import {safeUrl,plainText} from './core.mjs';

const API='https://prod-api.yupptv.com/service/api/v1/';
const FILTER='genreCode:all;langCode:SPO,HIN,TEL,TAM,MAL,KAN,BEN,MAR,PUN,GUJ,BAN,NEP,ORI,URD,BHO,ENG,ARA,ASM,SPA,FRE,MUS';
const CDN=['.cloudfront.net','.vgcdn.net','.yupptv.com','.akamaized.net','.yuppcdn.net','.amagi.tv','.sofast.tv','.ottlive.co.in'];
const numeric=value=>/^[1-9]\d{0,17}$/.test(String(value??''));
const channelPath=value=>typeof value==='string'&&/^fast-tv\/[A-Za-z0-9_+-]{1,160}\/live$/.test(value);
const box=globalThis.crypto.randomUUID();
let guest=null;
let startingGuest=null;

// These identify the channel's country, not the viewer's region or its language.
// YuppTV's free guide has no channel-country field; all other rows stay unmapped.
export const YUPP_COUNTRY_SOURCES=Object.freeze({
  '8':{country:'in',source:'https://www.yupptv.com/amp/channels/aajtak/live'},
  '11':{country:'in',source:'https://www.yupptv.com/amp/channels/india-today-news/live'},
  '195':{country:'in',source:'https://www.yupptv.com/amp/channels/ndtv-24x7/live'},
  '1501':{country:'in',source:'https://www.yupptv.com/amp/channels/zee-news/live'},
});

function clientDescription(){
  const ua=globalThis.navigator?.userAgent??'';
  const chrome=ua.match(/(?:Chrome|Chromium)\/([\d.]+)/);
  const firefox=ua.match(/Firefox\/([\d.]+)/);
  const safari=ua.match(/Version\/([\d.]+).*Safari\//);
  const node=ua.match(/Node\.js\/([\d.]+)/);
  const name=chrome?'Chrome':firefox?'Firefox':safari?'Safari':node?'Node':'SheepBox';
  const version=(chrome||firefox||safari||node)?.[1]??'';
  const os=/Android/.test(ua)?'Android':/Windows/.test(ua)?'Windows':/iPhone|iPad/.test(ua)?'iOS':/Mac/.test(ua)?'macOS':/Linux/.test(ua)?'Linux':globalThis.process?.platform==='win32'?'Windows':globalThis.process?.platform==='linux'?'Linux':'Unknown';
  return `${name},${version},${os}`;
}

function aborted(signal){if(signal?.aborted)throw signal.reason??new DOMException('Aborted','AbortError');}
async function request(endpoint,query,{signal,session}={}){
  if(!['get/token','tvguide/channels','page/content','page/stream'].includes(endpoint))throw Error('Unsupported YuppTV request.');
  aborted(signal);
  const controller=new AbortController();const cancel=()=>controller.abort();
  signal?.addEventListener('abort',cancel,{once:true});
  const timer=setTimeout(cancel,25000);
  try{
    const headers=session?{'box-id':box,'session-id':session,'tenant-code':'yupptv'}:{};
    const response=await fetch(API+endpoint+'?'+new URLSearchParams(query),{signal:controller.signal,credentials:'omit',cache:'no-store',headers});
    if(!response.ok){const error=Error(`YuppTV returned HTTP ${response.status}.`);error.httpStatus=response.status;throw error;}
    const text=await response.text();if(text.length>8_000_000)throw Error('The YuppTV response is too large.');
    let data;try{data=JSON.parse(text);}catch{throw Error('YuppTV returned an unreadable response.');}
    if(data.status!==true||!data.response||typeof data.response!=='object')throw Error('YuppTV did not authorize this request.');
    return data;
  }finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);}
}

async function session(signal){
  aborted(signal);
  if(guest&&guest.expires>Date.now())return guest;
  if(!startingGuest)startingGuest=(async()=>{
    // A public website guest session. No account or browser storage is used.
    const data=await request('get/token',{tenant_code:'yupptv',box_id:box,product:'yupptv',device_id:'5',display_lang_code:'ENG',device_sub_type:clientDescription(),timezone:Intl.DateTimeFormat().resolvedOptions().timeZone});
    const id=data.response.sessionId;if(typeof id!=='string'||!id||id.length>4096)throw Error('YuppTV did not provide a guest session.');
    guest={id,expires:Date.now()+600_000};return guest;
  })().finally(()=>{startingGuest=null;});
  const current=await startingGuest;aborted(signal);return current;
}

async function withGuest(signal,action){
  const current=await session(signal);
  try{return await action(current.id);}catch(error){
    if(error.httpStatus!==401)throw error;
    if(guest===current)guest=null;
    const renewed=await session(signal);return action(renewed.id);
  }
}

function imageUrl(value){
  const absolute=safeUrl(value);if(absolute)return absolute;
  const match=String(value??'').match(/^([A-Za-z0-9_-]+),([A-Za-z0-9_./-]+\.(?:png|jpe?g|webp|svg))$/i);
  if(!match||match[2].split('/').includes('..'))return '';
  // Same public image expansion as YuppTV's own AMP channel pages.
  return `https://d229kpbsb5jevy.cloudfront.net/yupptvnew/content/${match[1]}/logos/${match[2]}`;
}

export function parseYuppChannels(data){
  const rows=data?.response?.data;
  if(data?.status!==true||!Array.isArray(rows)||rows.length>5000)throw Error('YuppTV did not return its free channel guide.');
  const channels=new Map();
  for(const row of rows){
    const attributes=row.target?.pageAttributes;
    if(attributes?.payType!=='F'||attributes.networkName!=='Yupp Fast'||!numeric(row.id)||!channelPath(row.target?.path))continue;
    const id=String(row.id),title=plainText(row.display?.title).slice(0,250);if(!title)continue;
    const existing=channels.get(id);if(existing&&existing.path!==row.target.path)throw Error('YuppTV repeated a conflicting channel identity.');
    channels.set(id,{id,title,path:row.target.path,image:imageUrl(row.display?.imageUrl),language:plainText(attributes.language).slice(0,80),genre:plainText(attributes.genre).slice(0,100)});
  }
  return [...channels.values()];
}

function preroll(page,pageUrl){
  const config=page?.response?.adUrlResponse;
  if(page?.status!==true||!config||!Array.isArray(config.adUrlTypes))throw Error('YuppTV did not confirm its advertising schedule.');
  if(config.adUrlTypes.length>1)throw Error('This YuppTV channel needs an unsupported advertising schedule.');
  if(!config.adUrlTypes.length)return '';
  const row=config.adUrlTypes[0];
  if(!['preUrl','preRollUrl'].includes(row.urlType)||row.position?.adType!=='instream'||row.attributes?.adTag&&row.attributes.adTag!=='googima')throw Error('This YuppTV channel needs an unsupported advertising format.');
  // The current publisher client maps preUrl/preRollUrl to offset:"pre".
  // Its position.offset value (observed "30") is not a content seek/cue time.
  let supplied=row.url;
  if(typeof supplied==='string'&&/(?:\[referrer_url\]|%5Breferrer_url%5D)/i.test(supplied)){
    let current;try{current=new URL(pageUrl);}catch{throw Error('A browser page is required for this YuppTV advertising schedule.');}
    if(current.protocol!=='https:'&&!(current.protocol==='http:'&&['localhost','127.0.0.1'].includes(current.hostname)))throw Error('Unsupported YuppTV player-page context.');
    current.hash='';
    supplied=supplied.replace(/\[referrer_url\]|%5Breferrer_url%5D/gi,encodeURIComponent(current.href));
  }
  const url=safeUrl(supplied);
  let decoded='';try{decoded=decodeURIComponent(url);}catch{throw Error('YuppTV returned an unsupported advertising address.');}
  if(!url||new URL(url).hash||/[{}\[\]]/.test(decoded))throw Error('YuppTV returned an unsupported advertising address.');
  return url;
}

export function parseYuppOffer(data,channel,page,{pageUrl=globalThis.location?.href??''}={}){
  const response=data?.response,status=response?.streamStatus,attributes=response?.pageAttributes;
  if(data?.status!==true||status?.hasAccess!==true||status.previewStreamStatus!==false||status.isParentControlled!==false||status.trailerStreamStatus===true)throw Error('YuppTV has not granted full free playback of this channel.');
  if(attributes?.payType!=='F'||attributes.networkName!=='Yupp Fast'||String(attributes.channelId)!==channel.id||!['true',true].includes(attributes.isLive))throw Error('YuppTV returned a different, paid or non-live channel.');
  if(!Array.isArray(response.streams)||response.streams.length>100)throw Error('YuppTV returned no supported stream.');
  const selected=response.streams.find(row=>{
    if(row.isTrailer!==false||row.keys?.licenseKey||row.keys?.certificate||row.drm||row.licenseUrl||row.keySystems||Object.keys(row.params??{}).length)return false;
    const url=safeUrl(row.url,CDN);if(!url)return false;
    const uri=new URL(url);return !uri.hash&&uri.pathname.toLowerCase().endsWith('.m3u8');
  });
  if(!selected)throw Error('YuppTV did not offer supported clear guest HLS playback.');
  return {kind:'hls',url:selected.url,adTag:preroll(page,pageUrl),live:true,nowPlaying:plainText(attributes.liveProgramName).slice(0,300),tracks:[]};
}

function metadata(channel){
  const source=YUPP_COUNTRY_SOURCES[channel.id];
  return {id:`yupp-live-${channel.id}`,provider:'yupptv',providerName:'YuppTV Free',kind:'live',title:channel.title,
    sourceId:channel.id,path:channel.path,mode:'yupp-live',official:`https://www.yupptv.com/${channel.path}`,image:channel.image,
    language:channel.language,categories:[...new Set([channel.genre,channel.language].filter(Boolean))],
    description:'A free YuppTV FAST channel. Current guest access, live media and publisher advertising are checked when selected.',
    ...(source?{country:source.country,countrySource:source.source}:{})};
}

export async function loadYuppSelection({signal}={}){
  const channels=await withGuest(signal,session=>request('tvguide/channels',{filter:FILTER},{signal,session}).then(parseYuppChannels));
  if(!channels.length)throw Error('YuppTV did not return free channels.');
  const live=channels.map(metadata).sort((a,b)=>a.title.localeCompare(b.title));
  return {items:[],live,report:{source:'YuppTV current public free guest guide',channelDirectoryComplete:true,channels:live.length,
    countryMapped:live.filter(row=>row.country).length,countryUnmapped:live.filter(row=>!row.country).length,
    countryRule:'Explicit source-mapped channel IDs only; viewer country and language are never used as channel country.',
    offersCheckedOnPlay:true,advertising:'Fresh publisher preUrl/preRollUrl via Google IMA; unsupported required schedules are refused.',
    publicRestProtocol:'Authorized public page/content and page/stream endpoints; no encrypted web-envelope configuration is required.',
    playbackScope:'Directory availability is checked again on play. Region, access, clear-HLS availability and advertising can change.'}};
}

export async function resolveYupp(item,{signal}={}){
  if(item?.mode!=='yupp-live'||!numeric(item.sourceId))throw Error('Invalid YuppTV channel.');
  return withGuest(signal,async session=>{
    const channels=parseYuppChannels(await request('tvguide/channels',{filter:FILTER},{signal,session}));
    const channel=channels.find(row=>row.id===String(item.sourceId));if(!channel)throw Error('This free YuppTV channel is no longer available.');
    const [page,data]=await Promise.all([
      request('page/content',{path:channel.path},{signal,session}),
      request('page/stream',{path:channel.path,device_supported_features:'HD,SD,adaptivedvr'},{signal,session}),
    ]);
    return parseYuppOffer(data,channel,page);
  });
}
