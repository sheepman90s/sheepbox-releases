import {escapeHtml as e} from './core.mjs';
const ENDPOINT='https://sheepbox-parties.aj-2e2.workers.dev';
export const validRoom=code=>/^[A-HJ-NP-Z2-9]{8}$/.test(code??'');
// Native and web use the same publisher identity, without the web card prefix.
export function partyTarget(item){return item?.provider==='nasaplus'&&item.mode==='nasa'&&/^[1-9]\d*$/.test(item.sourceId)?{provider:'nasaplus',id:item.sourceId,name:item.title.slice(0,180),kind:item.kind==='episode'?'episode':'movie'}:null;}
export function partyItemId(target){return target?.provider==='nasaplus'&&/^[1-9]\d*$/.test(target.id)?'nasa-'+target.id:'';}
export function partyCorrection({position,duration,ready,inAd,hostPresent,phase,playing,hostPosition,age}){
  if(inAd)return {};
  if(!hostPresent)return {playing:false};
  if(phase==='ended')return {playing:true}; // Allow a delayed viewer to finish.
  if(phase!=='ready')return {playing:false};
  const desired=Math.max(0,Math.min(hostPosition+(playing?Math.min(15,Math.max(0,age)):0),Number.isFinite(duration)&&duration>0?Math.max(0,duration-.25):Infinity));
  return {playing,seek:ready&&Math.abs(position-desired)>2?desired:undefined};
}
export class PartyClient {
  constructor({endpoint=ENDPOINT,fetchImpl=globalThis.fetch.bind(globalThis),onChange=()=>{}}={}){this.endpoint=endpoint;this.fetch=fetchImpl;this.onChange=onChange;this.handle=null;this.snapshot=null;this.error='';this.busy=false;this.pending=Promise.resolve();}
  locked(job){const next=this.pending.then(job);this.pending=next.catch(()=>{});return next;}
  async call(code,token,payload){
    if(code&&!validRoom(code))throw Error('Enter the 8-character room code.');
    const response=await this.fetch(this.endpoint+'/v1/rooms'+(code?'/'+code:''),{method:payload?'POST':'GET',credentials:'omit',cache:'no-store',keepalive:payload?.action==='leave',signal:AbortSignal.timeout(12000),headers:{...(payload?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})},...(payload?{body:JSON.stringify(payload)}:{})});
    const text=await response.text();if(text.length>65536)throw Error('The watch-party reply is too large.');
    let value;try{value=JSON.parse(text);}catch{throw Error('The watch-party service could not be reached.');}
    if(!response.ok)throw Error(value.error||'The watch-party service could not be reached.');return value;
  }
  accept(value){if(this.snapshot?.serverNow>value.serverNow)return;this.snapshot=value;this.received=performance.now();this.error='';this.onChange();}
  async connect(payload,code){
    if(this.handle)throw Error('Leave the current room first.');
    const value=await this.call(code,null,payload);
    if(!validRoom(value.code)||typeof value.token!=='string'||!partyItemId(value.target)){
      if(validRoom(value.code)&&value.token)await this.call(value.code,value.token,{action:'leave'}).catch(()=>{});
      throw Error('This browser currently synchronizes NASA+ on-demand titles. Join this room with the Android app for other providers.');
    }
    this.handle={code:value.code,token:value.token,you:value.you};this.accept(value);
  }
  create(item,name){const target=partyTarget(item);if(!target)throw Error('Open a NASA+ on-demand video to host a browser watch party.');return this.connect({name,target});}
  join(code,name){return this.connect({action:'join',name},code.trim().toUpperCase());}
  get host(){return !!this.handle&&this.handle.you===this.snapshot?.host;}
  action(payload){const handle=this.handle;return this.locked(async()=>{if(!handle||this.handle!==handle)return;const value=await this.call(handle.code,handle.token,payload);if(this.handle===handle)this.accept(value);});}
  async tick(player,item){
    if(this.busy||!this.handle)return;this.busy=true;
    const active=this.handle;const matches=partyItemId(this.snapshot.target)===item?.id,video=matches?player?.video:null;
    try{
      if(this.host){const phase=!video?'waiting':player.ads?.blocking?'ad':video.ended?'ended':video.readyState>=3?'ready':video.readyState>=1?'buffering':'waiting';await this.action({action:'playback',position:Math.max(0,Math.round((video?.currentTime??(this.snapshot.playback?.position??0)/1000)*1000)),playing:!!video&&!video.paused,phase});}
      else{
        const handle=this.handle,value=await this.locked(()=>this.call(handle.code,handle.token));if(this.handle!==handle)return;this.accept(value);
        if(video&&player.video===video&&video.isConnected){const playback=value.playback;const correction=partyCorrection({position:video.currentTime,duration:video.duration,ready:video.readyState>=2,inAd:!!player.ads?.blocking,hostPresent:value.hostPresent,phase:playback.phase,playing:playback.playing,hostPosition:playback.position/1000,age:(value.serverNow-playback.at)/1000});
          if(correction.seek!==undefined)video.currentTime=correction.seek;
          if(correction.playing===false)video.pause();else if(correction.playing&&video.paused&&!video.ended)await video.play().catch(()=>{this.error='Press Play once to allow this browser to follow the host.';this.onChange();});
        }
      }
    }catch(error){if(this.handle!==active)return;this.error=error.message;if(!this.host&&video&&!player?.ads?.blocking)video.pause();this.onChange();}finally{this.busy=false;}
  }
  async leave(){const handle=this.handle;this.handle=null;this.snapshot=null;this.error='';this.onChange();if(handle)await this.call(handle.code,handle.token,{action:'leave'}).catch(()=>{});}
}
export function partyPanelMarkup(client){
  const s=client.snapshot;if(!s)return '';
  return `<header><h2>Watch party</h2><button class="button ghost small" data-party="hide">Hide chat</button></header><p>Room <strong>${e(s.code)}</strong> · ${s.members.length}/8 viewers</p><p class="party-status" role="status">${e(client.error||(!s.hostPresent?'Waiting for the host…':client.host?'You control playback.':'Following the host. Press Play if your browser asks.'))}</p><div class="party-messages" role="log" aria-label="Party messages">${s.messages.map(message=>`<p><strong>${e(message.name)}</strong> ${e(message.text)}</p>`).join('')||'<p>Say hello. Text chat only.</p>'}</div><form id="party-chat-form"><label class="sr-only" for="party-message">Message</label><input id="party-message" maxlength="300" placeholder="Write a message…" autocomplete="off" required><button class="button secondary small">Send</button></form><div class="party-members"><strong>Viewers</strong>${s.members.map(member=>`<div><span>${e(member.name)}${member.id===s.host?' · Host':''}</span>${client.host&&member.id!==s.you?`<button class="text-button" data-party-transfer="${e(member.id)}">Make host</button>`:''}</div>`).join('')}</div><div class="button-row"><button class="button ghost small" data-party="copy">Copy invitation</button><button class="button ghost small" data-party="leave">${client.host?'Close room':'Leave room'}</button></div><p class="party-privacy">Chat is shared with this room’s viewers. No voice or microphone. Rooms expire after six hours; the service retains recent messages for up to an hour.</p>`;
}
