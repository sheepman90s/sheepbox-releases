import {safeUrl} from './core.mjs';
let hlsLibrary;
async function loadHls(){
  if(globalThis.Hls)return globalThis.Hls;
  hlsLibrary??=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=new URL('../vendor/hls-1.7.4.min.js',import.meta.url).href;script.onload=()=>resolve(globalThis.Hls);script.onerror=()=>{hlsLibrary=null;reject(Error('The video player could not load. Please retry.'));};document.head.append(script);});
  return hlsLibrary;
}
export class WebPlayer {
  constructor(container,{onStatus=()=>{},onProgress=()=>{},onEnded=()=>{},onCaptions=()=>{}}={}){
    Object.assign(this,{container,onStatus,onProgress,onEnded,onCaptions});this.generation=0;
  }
  stop(){
    this.generation++;
    this.trackController?.abort();this.trackController=null;
    for(const url of this.trackUrls??[])URL.revokeObjectURL(url);this.trackUrls=[];
    if(this.video){this.onProgress(this.video.currentTime,this.video.duration);this.video.pause();this.video.removeAttribute('src');this.video.load();}
    this.hls?.destroy();this.hls=null;this.video=null;this.container.replaceChildren();
  }
  async open(offer,{position=0,captions=false,title='Video'}={}){
    this.stop();const generation=this.generation;
    if(offer.kind==='embed'){
      const url=safeUrl(offer.url,['www.nfb.ca']);if(!url)throw Error('Unsupported publisher player.');
      const frame=document.createElement('iframe');frame.src=url;frame.title=`${title} — publisher player`;frame.allow='autoplay; fullscreen; picture-in-picture; encrypted-media';frame.allowFullscreen=true;frame.referrerPolicy='strict-origin-when-cross-origin';
      frame.setAttribute('sandbox','allow-scripts allow-same-origin allow-presentation allow-popups allow-forms allow-popups-to-escape-sandbox');
      this.container.append(frame);this.onStatus('Use the publisher’s player controls.');return;
    }
    if(!safeUrl(offer.url))throw Error('Unsupported video address.');
    const video=document.createElement('video');this.video=video;this.preferCaptions=captions;video.controls=true;video.playsInline=true;video.preload='metadata';if(offer.kind==='hls')video.crossOrigin='anonymous';video.setAttribute('aria-label',title);
    this.container.append(video);
    let failed=false;const failure=()=>{if(!failed&&generation===this.generation){failed=true;this.onStatus('This video could not start. Retry, or open the publisher’s website.','error');}};
    video.addEventListener('error',failure);
    video.addEventListener('waiting',()=>this.onStatus('Buffering…'));
    video.addEventListener('playing',()=>this.onStatus(offer.live?'Live now':'Playing'));
    video.addEventListener('pause',()=>{if(!video.ended&&video.readyState)this.onStatus('Paused');});
    video.addEventListener('loadedmetadata',()=>{
      const offset=Number(offer.offset)||position;
      if(offset>0&&Number.isFinite(video.duration))video.currentTime=Math.min(offset,Math.max(0,video.duration-1));
      this.onStatus('Ready — press Play to watch.');
      this.captions(this.preferCaptions);
      this.onCaptions(video.textTracks.length>0);
    });
    let stamp=0;
    video.addEventListener('timeupdate',()=>{if(Date.now()-stamp>5000){stamp=Date.now();this.onProgress(video.currentTime,video.duration);}});
    video.addEventListener('ended',()=>this.onEnded());
    if(offer.tracks?.length){
      const controller=new AbortController();this.trackController=controller;const timer=setTimeout(()=>controller.abort(),15000);
      Promise.allSettled(offer.tracks.map(async supplied=>{
        const response=await fetch(supplied.url,{signal:controller.signal,credentials:'omit'});if(!response.ok)return;
        const text=await response.text();if(text.length>1_000_000||!text.trimStart().startsWith('WEBVTT')||generation!==this.generation)return;
        const url=URL.createObjectURL(new Blob([text],{type:'text/vtt'}));(this.trackUrls??=[]).push(url);
        const track=document.createElement('track');track.kind='subtitles';track.label=supplied.label;track.srclang=supplied.language;track.src=url;track.default=this.preferCaptions;
        track.addEventListener('load',()=>{if(generation===this.generation){this.captions(this.preferCaptions);this.onCaptions(true);}});video.append(track);track.track.mode=this.preferCaptions?'showing':'hidden';
      })).finally(()=>clearTimeout(timer));
    }
    if(offer.kind==='hls'){
      const Hls=await loadHls();if(generation!==this.generation)return;
      if(Hls?.isSupported()){
        const hls=new Hls({maxBufferLength:30,backBufferLength:30,enableWorker:true});this.hls=hls;
        hls.on(Hls.Events.ERROR,(_,data)=>{if(data.fatal)failure();});
        hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED,()=>{this.onCaptions(hls.subtitleTracks.length>0);if(this.preferCaptions&&hls.subtitleTracks.length)hls.subtitleTrack=0;});
        hls.loadSource(offer.url);hls.attachMedia(video);
      }else if(video.canPlayType('application/vnd.apple.mpegurl'))video.src=offer.url;
      else throw Error('This browser does not support this stream. Try a current browser or the publisher’s website.');
    }else video.src=offer.url;
  }
  captions(enabled){this.preferCaptions=enabled;if(this.hls){this.hls.subtitleDisplay=enabled;this.hls.subtitleTrack=enabled&&this.hls.subtitleTracks.length?0:-1;}let selected=false;if(this.video)for(const track of this.video.textTracks){track.mode=enabled&&!selected?'showing':'disabled';if(enabled&&!selected)selected=true;}}
  async fullscreen(){const video=this.video;if(this.container.requestFullscreen)await this.container.requestFullscreen();else if(video?.webkitEnterFullscreen)video.webkitEnterFullscreen();}
  async pictureInPicture(){if(!this.video||!document.pictureInPictureEnabled)return false;if(document.pictureInPictureElement)await document.exitPictureInPicture();else await this.video.requestPictureInPicture();return true;}
}
