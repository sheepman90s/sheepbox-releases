const unavailable='This program’s video could not start. Retry video or change channel. The schedule continues.';

export async function retroMetadata(sourceId,{signal,fetcher=fetch,timeoutMs=20000}={}){
 const request=new AbortController();let timedOut=false;
 const cancel=()=>request.abort(signal.reason);
 if(signal?.aborted)cancel();else signal?.addEventListener('abort',cancel,{once:true});
 const timer=setTimeout(()=>{timedOut=true;request.abort();},timeoutMs);
 try{
  const response=await fetcher('https://archive.org/metadata/'+encodeURIComponent(sourceId),{signal:request.signal,credentials:'omit'});
  if(!response.ok)throw Error('Internet Archive returned HTTP '+response.status+'. Retry or change channel.');
  return await response.json();
 }catch(error){
  if(signal?.aborted)throw signal.reason??new DOMException('Canceled','AbortError');
  if(timedOut)throw Error('Internet Archive took too long to respond. Retry video or change channel.');
  if(error instanceof TypeError)throw Error('Internet Archive could not be reached. Retry video or change channel.');
  throw error;
 }finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);}
}

// Keep each video's events, play promise and deadline bound to its schedule slot.
// A rejected play promise is an autoplay prompt only for NotAllowedError.
export function retroPlayback(video,{slot,signal,isCurrent=()=>true,onStatus,onBlocked=()=>{},now=Date.now,timeoutMs=30000}){
 let stopped=false,failed=false,blocked=false,timer;
 const listeners=[];
 const active=()=>!stopped&&!signal?.aborted&&isCurrent();
 const clear=()=>{clearTimeout(timer);timer=undefined;};
 const status=text=>{if(active())onStatus(text);};
 function fail(text=unavailable){
  if(!active())return;failed=true;blocked=false;clear();onBlocked(false);status(text);
 }
 function watch(){
  if(timer!==undefined)return;
  timer=setTimeout(()=>{
   if(!active())return;
   fail('This program is taking too long to load. Retry video or change channel. The schedule continues.');
   video.pause();
  },timeoutMs);
 }
 function sync(){
  if(!active()||now()>=slot.end||!Number.isFinite(video.duration))return;
  const offset=Math.min(Math.max(0,(now()-slot.start)/1000),Math.max(0,video.duration-1));
  if(Math.abs(video.currentTime-offset)>3)video.currentTime=offset;
 }
 const listen=(type,callback)=>{video.addEventListener(type,callback);listeners.push([type,callback]);};
 listen('loadedmetadata',sync);
 listen('play',()=>{if(active()&&!video.error){failed=false;blocked=false;onBlocked(false);sync();watch();}});
 listen('playing',()=>{if(active()){failed=false;blocked=false;clear();onBlocked(false);status('Live now');}});
 listen('waiting',()=>{if(active()&&!failed&&!blocked){status('Buffering…');watch();}});
 listen('pause',()=>{if(active()&&!failed&&!blocked&&!video.ended&&video.readyState){clear();status('Paused — press Play or tune to now.');}});
 listen('error',()=>fail());
 listen('ended',()=>{clear();if(now()<slot.end)status('This video ended early. The next program starts at '+new Date(slot.end).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})+'. Retry video or change channel.');});
 function stop(){if(stopped)return;stopped=true;clear();for(const [type,callback] of listeners)video.removeEventListener(type,callback);signal?.removeEventListener('abort',stop);}
 signal?.addEventListener('abort',stop,{once:true});
 return {
  stop,
  async play(){
   if(!active())return false;
   failed=false;blocked=false;onBlocked(false);watch();
   try{await video.play();return active();}
   catch(error){
    if(!active()||failed)return false;
    if(error.name==='NotAllowedError'&&!video.error){blocked=true;clear();onBlocked(true);status('Ready — press Play to tune in.');}
    else if(error.name==='AbortError'&&video.paused&&!video.error){clear();status('Paused — press Play or tune to now.');}
    else fail();
    return false;
   }
  }
 };
}
