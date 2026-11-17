import {safeUrl} from './core.mjs';

let sdk;
export function loadAdvertising() {
  if(globalThis.google?.ima)return Promise.resolve(globalThis.google.ima);
  sdk??=new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src='https://imasdk.googleapis.com/js/sdkloader/ima3.js';
    const timer=setTimeout(()=>{script.remove();sdk=null;reject(Error('The publisher player took too long to initialize. Retry, or open its website.'));},20000);
    script.onload=()=>{clearTimeout(timer);if(globalThis.google?.ima)resolve(globalThis.google.ima);else{sdk=null;reject(Error('The publisher player could not initialize.'));}};
    script.onerror=()=>{clearTimeout(timer);script.remove();sdk=null;reject(Error('The publisher player could not initialize. Retry, or open its website.'));};
    document.head.append(script);
  });
  return sdk;
}

export class PublisherAds {
  constructor(ima,{container,video,adTag,onStatus=()=>{},onComplete=()=>{},onEnded=()=>{}}) {
    if(!safeUrl(adTag))throw Error('The publisher did not supply its advertising schedule.');
    Object.assign(this,{ima,container,video,adTag,onStatus,onComplete,onEnded});this.dead=false;this.started=false;this.blocking=true;this.contentFinished=false;
    this.controls=new AbortController();this.host=document.createElement('div');this.host.className='publisher-ads';this.host.hidden=true;container.append(this.host);
    this.display=new ima.AdDisplayContainer(this.host,video);this.loader=new ima.AdsLoader(this.display);
    this.loader.addEventListener(ima.AdsManagerLoadedEvent.Type.ADS_MANAGER_LOADED,event=>this.loaded(event));
    this.loader.addEventListener(ima.AdErrorEvent.Type.AD_ERROR,event=>this.error(event));
    this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(container);this.event('READY');
  }
  event(type,code) {
    if(this.dead)return;
    this.container.dataset.adState=type;
    this.container.dispatchEvent(new CustomEvent('sheepbox:advertising',{detail:{type,...(code?{code}:{} )}}));
  }
  start() {
    if(this.dead||this.started)return;this.started=true;this.blocking=true;
    // initialize() stays inside the user's Play gesture, as required on phones.
    this.host.hidden=false;this.display.initialize();this.onStatus('Connecting to the publisher’s player…');this.event('REQUESTED');
    const request=new this.ima.AdsRequest();request.adTagUrl=this.adTag;
    const {width,height}=this.container.getBoundingClientRect();request.linearAdSlotWidth=Math.round(width);request.linearAdSlotHeight=Math.round(height);request.nonLinearAdSlotWidth=Math.round(width);request.nonLinearAdSlotHeight=Math.round(height/3);
    request.setAdWillAutoPlay?.(false);request.setAdWillPlayMuted?.(this.video.muted);
    this.loader.requestAds(request);
  }
  loaded(event) {
    if(this.dead)return;
    try {
      const settings=new this.ima.AdsRenderingSettings();settings.restoreCustomPlaybackStateOnAdBreakComplete=true;
      this.manager=event.getAdsManager(this.video,settings);
      const types=this.ima.AdEvent.Type;
      this.manager.addEventListener(this.ima.AdErrorEvent.Type.AD_ERROR,event=>this.error(event));
      this.manager.addEventListener(types.CONTENT_PAUSE_REQUESTED,()=>{if(this.dead)return;this.blocking=true;this.video.pause();this.video.controls=false;this.host.hidden=false;this.onStatus('Advertisement');this.event('CONTENT_PAUSE_REQUESTED');});
      this.manager.addEventListener(types.CONTENT_RESUME_REQUESTED,()=>{this.event('CONTENT_RESUME_REQUESTED');this.resume();});
      this.manager.addEventListener(types.STARTED,event=>{if(this.dead)return;this.host.hidden=false;this.event('STARTED');if(event.getAd()?.isLinear()===false)this.resume(true);});
      this.manager.addEventListener(types.COMPLETE,()=>{if(this.dead)return;this.onComplete();this.event('COMPLETED');});
      this.manager.addEventListener(types.ALL_ADS_COMPLETED,()=>{if(this.dead)return;this.allAdsCompleted=true;this.event('ALL_ADS_COMPLETED');if(this.contentFinished)this.finish();});
      const {width,height}=this.container.getBoundingClientRect();this.manager.init(Math.round(width),Math.round(height),this.ima.ViewMode.NORMAL);this.manager.start();
    } catch(error){this.error(error);}
  }
  resume(keepOverlay=false) {
    if(this.dead||this.contentFinished)return;
    this.blocking=false;if(!keepOverlay)this.host.hidden=true;this.video.controls=true;
    this.video.play().catch(()=>this.onStatus('Ready — press Play to continue.'));
  }
  error(event) {
    if(this.dead)return;
    const code=event.getError?.().getErrorCode?.();this.event('AD_ERROR',code);
    // Follow the SDK's documented content-resume behavior for ad errors/no fill.
    this.manager?.destroy();this.manager=null;
    if(this.contentFinished)this.finish();else this.resume();
  }
  ended() {
    if(this.dead||this.blocking)return;
    this.contentFinished=true;this.loader.contentComplete();if(!this.manager||this.allAdsCompleted)this.finish();
  }
  finish(){if(!this.dead&&!this.finished){this.finished=true;this.onEnded();}}
  resize() {if(!this.dead&&this.manager){const box=this.container.getBoundingClientRect();this.manager.resize(Math.round(box.width),Math.round(box.height),document.fullscreenElement?this.ima.ViewMode.FULLSCREEN:this.ima.ViewMode.NORMAL);}}
  destroy() {
    if(this.dead)return;this.dead=true;this.controls.abort();this.observer.disconnect();this.manager?.destroy();this.loader.destroy();this.display.destroy();this.host.remove();
  }
}
