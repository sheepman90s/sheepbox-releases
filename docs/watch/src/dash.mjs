import {safeUrl} from './core.mjs';
let library;
let retirement=Promise.resolve();
// Route changes create a new WebPlayer/video. CDM close and MediaKeys detach are
// asynchronous, so the next protected player must wait across those instances.
export function retireDash(player){
 if(!player)return retirement;
 let closing;try{closing=player.destroy();}catch{closing=Promise.resolve();}
 retirement=Promise.allSettled([retirement,closing]).then(()=>{});return retirement;
}
export async function loadDash(){
 if(globalThis.shaka)return globalThis.shaka;
 library??=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=new URL('../vendor/shaka-player-5.3.4.compiled.js',import.meta.url).href;script.onload=()=>resolve(globalThis.shaka);script.onerror=()=>{library=null;script.remove();reject(Error('The protected video player could not load. Please retry.'));};document.head.append(script);});
 return library;
}
// Every key request repeats the publisher's normal authorization for this exact
// asset/edition. The original media, advertising schedule and challenge stay intact.
export function licenseFilter(shaka,offer,signal){
 return async(type,request)=>{
  if(type!==shaka.net.NetworkingEngine.RequestType.LICENSE)return;
  signal.throwIfAborted();
  request.allowCrossSiteCredentials=false;
  const body=request.body,bytes=ArrayBuffer.isView(body)?new Uint8Array(body.buffer,body.byteOffset,body.byteLength):body instanceof ArrayBuffer?new Uint8Array(body):null;
  // Widevine's CAQ asks for a service certificate, not content keys. Keep that
  // exchange and provisioning/release on the URI chosen for the original offer.
  // Reauthorizing a new playback session here can invalidate its following key request.
  const certificate=(!request.licenseRequestType||request.licenseRequestType==='license-request')&&bytes?.length===2&&bytes[0]===8&&bytes[1]===4;
  if(certificate||['individualization-request','license-release'].includes(request.licenseRequestType))return;
  const url=await offer.drm.refreshLicense({signal});signal.throwIfAborted();
  if(!safeUrl(url)||new URL(url).protocol!=='https:')throw Error('The publisher did not authorize a secure playback licence.');
  request.uris=[url];
 };
}
export async function openDash(video,offer,{signal,onError,onTracks,onPlayer=()=>{}}={}){
 const shaka=await loadDash();await retirement;signal.throwIfAborted();shaka.polyfill.installAll();
 if(!shaka.Player.isBrowserSupported()||!navigator.requestMediaKeySystemAccess)throw Error('Protected playback needs a browser with Widevine enabled, such as Chrome or Edge. You can also use the publisher’s website.');
 if(!safeUrl(offer.drm?.licenseUrl)||typeof offer.drm.refreshLicense!=='function')throw Error('The publisher did not authorize protected playback.');
 const player=new shaka.Player();onPlayer(player);let fatalError;
 player.addEventListener('error',event=>{if(event.detail?.severity===shaka.util.Error.Severity.CRITICAL){fatalError=event.detail;onError?.(event.detail);}});
 player.addEventListener('trackschanged',()=>onTracks?.(player));
 player.configure({drm:{servers:{'com.widevine.alpha':offer.drm.licenseUrl},preferredKeySystems:['com.widevine.alpha']},streaming:{bufferingGoal:30,bufferBehind:30},preferredTextLanguage:'en'});
 player.getNetworkingEngine().registerRequestFilter(licenseFilter(shaka,offer,signal));
 await player.attach(video);signal.throwIfAborted();
 let timer;try{await Promise.race([player.load(offer.url,null,'application/dash+xml'),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Protected playback took too long to start. Retry, or open the publisher’s website.')),60000);})]);
  // Manifest readiness precedes the asynchronous CDM exchange. Do not let the
  // advertising SDK start until the publisher has authorized a renderable key.
  const deadline=Date.now()+30000;
  while(!Object.values(player.getKeyStatuses()).some(status=>['usable','output-downscaled'].includes(status))){signal.throwIfAborted();if(fatalError)throw fatalError;if(Date.now()>deadline)throw Error('The publisher did not finish authorizing protected playback.');await new Promise(resolve=>setTimeout(resolve,100));}
 }
 catch(error){signal.throwIfAborted();throw Error([6001,6002].includes(error.code)?'Protected playback needs Widevine enabled in a supported browser, such as Chrome or Edge. You can also use the publisher’s website.':'The publisher’s protected video could not start. Retry, or open its website.');}finally{clearTimeout(timer);}
 signal.throwIfAborted();return player;
}
