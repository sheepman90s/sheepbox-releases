import {plainText,safeUrl} from './core.mjs';

const names={roku:'Roku',fawesome:'Fawesome',philo:'Philo',byutv:'BYUtv'};
const numeric=/^[1-9][0-9]{0,14}$/;
const privateFields=['url','video_url','video_hls_url','stream_url','token','headers','cookies','csrf','streams','adTag','license','session','sessionId'];
export const publisherPlayerName=provider=>names[provider]??'';
function philoIdentity(id){
  if(!/^Q2hhbm5lbDo[A-Za-z0-9_-]{10,64}$/.test(id??''))return false;
  try{return /^Channel:[1-9][0-9]{0,24}$/.test(atob(id.replaceAll('-','+').replaceAll('_','/')));}catch{return false;}
}
export function publisherLinkUrl(item){
  if(item?.mode!=='publisher-link'||item.freeGuestVerified!==true||privateFields.some(key=>key in item)||
      ['isPaid','subscriptionRequired','isPreview','isTrailer'].some(key=>item[key]===true))return '';
  const url=safeUrl(item.official);if(!url)return '';const u=new URL(url);if(u.search||u.hash)return '';
  if(item.provider==='fawesome'&&item.kind==='film'&&numeric.test(item.sourceId??'')&&item.id==='fawesome-'+item.sourceId&&
      u.hostname==='fawesome.tv'&&new RegExp('^/movies/'+item.sourceId+'/[a-z0-9-]+/?$').test(u.pathname))return url;
  if(item.provider==='philo'&&item.kind==='live'&&philoIdentity(item.sourceId)&&item.id==='philo-'+item.sourceId&&
      item.publisherFreeGroupVerified===true&&u.hostname==='www.philo.com'&&u.pathname==='/player/channel/'+item.sourceId)return url;
  return '';
}
export function resolvePublisherLink(item,{signal}={}){
  signal?.throwIfAborted();const url=publisherLinkUrl(item);
  if(!url)throw Error('This title has no verified official publisher player link.');
  return {kind:'external',url};
}
export function parseFawesomeMovie(row){
  const sourceId=String(row?.node_id??'');
  if(!numeric.test(sourceId)||row.item_type!=='movie'||row.feed_type!=='video'||row.blockItem!=='false'||row.nodeRestrictionType!==null||
      row.offer!==undefined&&row.offer!=='free')return null;
  const title=plainText(row.title??'').slice(0,250);if(!title)return null;
  let official;try{official=new URL(row.web_url,'https://fawesome.tv/').href;}catch{return null;}
  const image=[row.bg_image_landscape,row.main_picture,row.bg_image_portrait].map(value=>safeUrl(value,['ftmain.cachefly.net'])).find(Boolean)??'';
  const categories=['Fawesome This Week',...String(row.primary_genre??'').split(',').map(plainText).filter(Boolean)];
  const item={id:'fawesome-'+sourceId,sourceId,provider:'fawesome',providerName:'Fawesome',kind:'film',mode:'publisher-link',
    title,description:plainText(row.description??'').slice(0,4000),image,official,categories:[...new Set(categories)],
    duration:Math.max(0,Number(row.runtime)||0),freeGuestVerified:true};
  return publisherLinkUrl(item)?item:null;
}
export function parsePhiloChannel(group){
  if(group?.type!=='GUIDE'||group.header?.title!=='Free channels'||group.header?.id!=='VGlsZUdyb3VwSGVhZGVyOmZyZWVfY2hhbm5lbHM')return null;
  const channel=group.channel,sourceId=channel?.channelId;if(!philoIdentity(sourceId))return null;
  const title=plainText(channel.displayName??'').slice(0,250);if(!title)return null;
  const image=safeUrl(String(channel.whiteSquare??'').replaceAll('${width}','640'),['prod-s.cdn-cf.philo.com']);
  const item={id:'philo-'+sourceId,sourceId,provider:'philo',providerName:'Philo Free Channels',kind:'live',mode:'publisher-link',title,
    description:'A channel in Philo’s free guest lineup. Choose the current live programme on its official channel page. Philo manages regional access, captions and advertising.',
    image,categories:['Free channels'],official:'https://www.philo.com/player/channel/'+sourceId,
    freeGuestVerified:true,publisherFreeGroupVerified:true};
  return publisherLinkUrl(item)?item:null;
}
export function validatePublisherSelection(selection,provider){
  if(selection?.schema!==1||selection.provider!==provider||!Array.isArray(selection.items)||!Array.isArray(selection.live)||
      selection.report?.selectionComplete!==true||!(selection.items.length+selection.live.length))throw Error('The publisher selection is incomplete.');
  const rows=[...selection.items,...selection.live];
  if(rows.some(row=>row.provider!==provider||!publisherLinkUrl(row))||new Set(rows.map(row=>row.id)).size!==rows.length||
      provider==='philo'&&(selection.items.length||selection.report.guideDirectoryComplete!==true||selection.report.guideGroupsChecked!==selection.report.guideGroupsExpected)||
      provider==='fawesome'&&(selection.live.length||selection.report.shelfName!=='Fawesome This Week'))throw Error('The publisher selection contains inconsistent metadata.');
  return selection;
}
function fawesomeFeed(raw){
  const u=new URL(raw);if(u.protocol!=='https:'||u.hostname!=='rapi.ifood.tv'||u.port||u.username||u.password||u.hash||
    !['/index.php','/sub-categories.php','/recipes.php'].includes(u.pathname)||u.searchParams.get('appId')!=='9'||u.searchParams.get('siteId')!=='236'||u.searchParams.get('auth-token')!=='1217575')throw Error('Unexpected Fawesome catalogue address.');
  return u;
}
export async function loadFawesomeSelection({fetchImpl=globalThis.fetch,signal}={}){
  async function json(raw){const url=fawesomeFeed(raw);const r=await fetchImpl(url,{credentials:'omit',signal:signal??AbortSignal.timeout(45000)});
    if(!r.ok)throw Error('Fawesome catalogue returned HTTP '+r.status);const text=await r.text();if(text.length>16_000_000)throw Error('Fawesome returned too much metadata.');return JSON.parse(text);}
  const root=await json('https://rapi.ifood.tv/index.php?appId=9&siteId=236&auth-token=1217575&version=sv6.0');
  if(root.status!=='ok'||root.adsdk?.adActivation!=='true')throw Error('Fawesome’s current free advertising-supported catalogue could not be confirmed.');
  const movies=root.channels?.find(row=>row.name==='Movies');if(!movies)throw Error('Fawesome’s movie directory is unavailable.');
  const menu=await json(movies.url);if(menu.status!=='ok')throw Error('Fawesome’s movie shelves could not load.');
  const shelf=menu.channels?.find(row=>row.name==='Fawesome This Week');if(!shelf)throw Error('The Fawesome This Week shelf is unavailable.');
  const url=fawesomeFeed(shelf.url);url.searchParams.set('max-results','2000');url.searchParams.set('start-index','0');
  const payload=await json(url),rows=Array.isArray(payload.results)?payload.results:Object.values(payload.results??{});
  if(payload.status!=='ok'||!rows.length||rows.length>=2000||!Number.isFinite(Number(payload.count))||Number(payload.count)>rows.length)throw Error('The complete Fawesome weekly selection could not load. The previous catalogue is retained.');
  const items=rows.map(parseFawesomeMovie).filter(Boolean),report={generatedAt:new Date().toISOString(),selectionComplete:true,
    shelfName:'Fawesome This Week',source:'Fawesome public Movies navigation and its supplied weekly shelf',rowsChecked:rows.length,
    movies:items.length,excluded:rows.length-items.length,providerWideComplete:false,
    scope:'The complete current Fawesome This Week movie shelf, not the whole Fawesome library. Playback remains in the official publisher player.'};
  return validatePublisherSelection({schema:1,provider:'fawesome',items,live:[],report},'fawesome');
}
