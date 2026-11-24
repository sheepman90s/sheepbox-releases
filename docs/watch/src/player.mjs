import {safeUrl} from './core.mjs';
import {publisherEmbedUrl} from './publishers.mjs';
import {loadAdvertising,PublisherAds} from './ads.mjs';
import {openDash,retireDash} from './dash.mjs';
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
    this.drmController?.abort();this.drmController=null;
    retireDash(this.dash);this.dash=null;
    this.ads?.destroy();this.ads=null;
    this.trackController?.abort();this.trackController=null;
    for(const url of this.trackUrls??[])URL.revokeObjectURL(url);this.trackUrls=[];this.externalTracks=[];
    if(this.video){this.onProgress(this.video.currentTime,this.video.duration);this.video.pause();this.video.removeAttribute('src');this.video.load();}
    this.hls?.destroy();this.hls=null;this.video=null;this.container.replaceChildren();
  }
  async open(offer,{position=0,captions=false,title='Video'}={}){
    this.stop();const generation=this.generation;
    if(offer.kind==='embed'){
      const url=publisherEmbedUrl(offer.url);if(!url)throw Error('Unsupported publisher player.');
      const frame=document.createElement('iframe');frame.src=url;frame.title=`${title} — publisher player`;frame.allow='autoplay; fullscreen; picture-in-picture; encrypted-media';frame.allowFullscreen=true;frame.referrerPolicy='strict-origin-when-cross-origin';
      frame.setAttribute('sandbox','allow-scripts allow-same-origin allow-presentation allow-popups allow-forms allow-popups-to-escape-sandbox');
      this.container.append(frame);this.onStatus('Use the publisher’s player controls.');return;
    }
    if(!safeUrl(offer.url))throw Error('Unsupported video address.');
    const video=document.createElement('video');this.video=video;this.preferCaptions=captions;video.controls=!offer.adTag;video.playsInline=true;video.preload='metadata';if(['hls','dash'].includes(offer.kind))video.crossOrigin='anonymous';video.setAttribute('aria-label',title);
    this.container.append(video);
    let failed=false;const failure=()=>{if(!failed&&generation===this.generation){failed=true;this.onStatus('This video could not start. Retry, or open the publisher’s website.','error');}};
    video.addEventListener('error',failure);
    video.addEventListener('waiting',()=>{if(!this.ads?.blocking)this.onStatus('Buffering…');});
    video.addEventListener('playing',()=>{if(!this.ads?.blocking)this.onStatus(offer.live?'Live now':'Playing');});
    video.addEventListener('pause',()=>{if(!this.ads?.blocking&&!video.ended&&video.readyState)this.onStatus('Paused');});
    video.textTracks.addEventListener('addtrack',()=>{if(generation===this.generation){this.captions(this.preferCaptions);this.onCaptions(this.hasCaptions());}});
    video.addEventListener('loadedmetadata',()=>{
      const offset=Number(offer.offset)||position;
      if(offset>0&&Number.isFinite(video.duration))video.currentTime=Math.min(offset,Math.max(0,video.duration-1));
      if(!this.ads?.started)this.onStatus(offer.kind==='dash'?'Preparing protected playback…':'Ready — press Play to watch.');
      this.captions(this.preferCaptions);
      this.onCaptions(this.hasCaptions());
    });
    let stamp=0;
    video.addEventListener('timeupdate',()=>{if(!this.ads?.blocking&&Date.now()-stamp>5000){stamp=Date.now();this.onProgress(video.currentTime,video.duration);}});
    video.addEventListener('ended',()=>{if(this.ads)this.ads.ended();else this.onEnded();});
    let startButton;
    if(offer.adTag){
      video.disablePictureInPicture=true;video.controlsList?.add('nofullscreen');
      const ima=await loadAdvertising();if(generation!==this.generation)return;
      this.ads=new PublisherAds(ima,{container:this.container,video,adTag:offer.adTag,onStatus:this.onStatus,onComplete:offer.onAdComplete,onEnded:this.onEnded});
      const play=document.createElement('button');startButton=play;play.type='button';play.className='button publisher-start';play.textContent='▶ Play';play.setAttribute('aria-label','Play video');play.disabled=offer.kind==='dash';
      play.addEventListener('click',()=>{if(generation!==this.generation)return;try{this.ads.start();play.remove();}catch{this.onStatus('The publisher player could not start. Retry, or open its website.','error');}});this.container.append(play);
      video.addEventListener('play',()=>{if(this.ads&&!this.ads.started)video.pause();});
    }
    if(offer.tracks?.length){
      const controller=new AbortController();this.trackController=controller;const timer=setTimeout(()=>controller.abort(),15000);
      Promise.allSettled(offer.tracks.map(async supplied=>{
        const response=await fetch(supplied.url,{signal:controller.signal,credentials:'omit'});if(!response.ok)return;
        const text=await response.text();if(text.length>1_000_000||!text.trimStart().startsWith('WEBVTT')||generation!==this.generation)return;
        const url=URL.createObjectURL(new Blob([text],{type:'text/vtt'}));(this.trackUrls??=[]).push(url);
        const track=document.createElement('track');track.kind='subtitles';track.label=supplied.label;track.srclang=supplied.language;track.src=url;track.default=this.preferCaptions;
        track.addEventListener('load',()=>{if(generation===this.generation){this.captions(this.preferCaptions);this.onCaptions(true);}});this.externalTracks.push(track);video.append(track);track.track.mode=this.preferCaptions?'showing':'hidden';
      })).finally(()=>clearTimeout(timer));
    }
    if(offer.kind==='dash'){
      const controller=new AbortController();this.drmController=controller;
      try{await openDash(video,offer,{signal:controller.signal,onPlayer:player=>{if(generation===this.generation)this.dash=player;else retireDash(player);},onError:failure,onTracks:()=>{if(generation===this.generation){this.captions(this.preferCaptions);this.onCaptions(this.hasCaptions());}}});if(failed)throw Error('The publisher’s protected video could not start. Retry, or open its website.');if(generation===this.generation){if(startButton)startButton.disabled=false;if(video.paused&&!this.ads?.started)this.onStatus('Ready — press Play to watch.');}}
      catch(error){if(generation===this.generation){controller.abort();retireDash(this.dash);this.dash=null;this.onStatus(error.message||'Protected playback is unavailable in this browser. Use the publisher’s website.','error');throw error;}}
    }else if(offer.kind==='hls'){
      const Hls=await loadHls();if(generation!==this.generation)return;
      if(Hls?.isSupported()){
        const hls=new Hls({maxBufferLength:30,backBufferLength:30,enableWorker:true});this.hls=hls;
        hls.on(Hls.Events.ERROR,(_,data)=>{if(data.fatal)failure();});
        hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED,()=>{if(generation===this.generation){this.onCaptions(this.hasCaptions());this.captions(this.preferCaptions);}});
        hls.loadSource(offer.url);hls.attachMedia(video);
      }else if(video.canPlayType('application/vnd.apple.mpegurl'))video.src=offer.url;
      else throw Error('This browser does not support this stream. Try a current browser or the publisher’s website.');
    }else video.src=offer.url;
  }
  hasCaptions(){return !!this.dash?.getTextTracks().length||!!this.hls?.subtitleTracks.length||!!this.video&&[...this.video.textTracks].some(track=>['subtitles','captions'].includes(track.kind));}
  captions(enabled){
    this.preferCaptions=enabled;
    if(this.dash){const tracks=this.dash.getTextTracks(),chosen=tracks.find(track=>/^en\b|^eng$/i.test(track.language))??tracks[0];if(enabled&&chosen&&!chosen.active)this.dash.selectTextTrack(chosen);else if(!enabled&&tracks.some(track=>track.active))this.dash.selectTextTrack(null);if(tracks.length){for(const element of this.externalTracks??[])element.track.mode='disabled';return;}}
    if(this.hls){this.hls.subtitleDisplay=enabled;this.hls.subtitleTrack=enabled&&this.hls.subtitleTracks.length?0:-1;}
    if(this.video){
      const tracks=[...this.video.textTracks].filter(track=>['subtitles','captions'].includes(track.kind));
      const chosen=tracks.find(track=>track.kind==='subtitles'&&(/^en\b|^eng$/i.test(track.language)||/english/i.test(track.label)))??tracks.find(track=>track.cues?.length)??tracks[0];
      for(const track of tracks)track.mode=enabled&&track===chosen?'showing':'disabled';
    }
  }
  async fullscreen(){const video=this.video;if(this.container.requestFullscreen)await this.container.requestFullscreen();else if(video?.webkitEnterFullscreen)video.webkitEnterFullscreen();}
  async pictureInPicture(){if(!this.video||!document.pictureInPictureEnabled)return false;if(document.pictureInPictureElement)await document.exitPictureInPicture();else await this.video.requestPictureInPicture();return true;}
}
