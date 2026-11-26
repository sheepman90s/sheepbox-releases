import {VERSION} from './core.mjs';
export const CHANNEL_REQUEST_ENDPOINT='https://sheepbox-reports.aj-2e2.workers.dev/v1/reports';
export async function channelRequestPayload(name,details='',reportId=crypto.randomUUID()){
 const title=String(name).trim(),notes=String(details).trim();
 if(!title||title.length>180)throw Error('Enter a channel or show name, up to 180 characters.');
 if(notes.length>500)throw Error('Keep request details within 500 characters.');
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(reportId))throw Error('Invalid request reference.');
 const canonical=title.normalize('NFKC').replace(/\s+/g,' ').toLowerCase();
 const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical)))].map(n=>n.toString(16).padStart(2,'0')).join('');
 return {schemaVersion:1,reportId,scope:'request',provider:'sheepbox',catalogId:'channel-request:'+hash,title,kind:'channel',problem:'Request a channel',details:notes,appVersion:VERSION,androidApi:0,platform:'web'};
}
export async function sendChannelRequest(payload,{signal,fetcher=fetch}={}){
 const controller=new AbortController(),abort=()=>controller.abort();
 signal?.throwIfAborted();signal?.addEventListener('abort',abort,{once:true});
 const timer=setTimeout(abort,30000);
 try{
  const response=await fetcher(CHANNEL_REQUEST_ENDPOINT,{method:'POST',credentials:'omit',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:controller.signal});
  if(response.status===429)throw Error('Requests are busy. Please try again later.');
  if(!response.ok)throw Error('Your request could not be confirmed. Wait a moment, then try again.');
  const text=await response.text();if(text.length>16384)throw Error('Your request could not be confirmed.');
  let result;try{result=JSON.parse(text);}catch{throw Error('Your request could not be confirmed.');}
  if(result.success!==true||result.reportId!==payload.reportId||!Number.isSafeInteger(result.reference)||result.reference<1)throw Error('Your request could not be confirmed.');
  return result.reference;
 }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
export function showChannelRequest({signal}={}){
 if(signal?.aborted)return;
 const existing=document.getElementById('channel-request-dialog');if(existing){existing.querySelector('input')?.focus();return;}
 const previous=document.activeElement,dialog=document.createElement('dialog'),controller=new AbortController();
 dialog.id='channel-request-dialog';dialog.className='channel-request-dialog';dialog.setAttribute('aria-labelledby','channel-request-title');
 dialog.innerHTML='<form><h2 id="channel-request-title">Request a channel</h2><p>Tell us which channel or show you would like. Your request and app version go to SheepBox’s private GitHub issue tracker. You do not need a GitHub account. Availability will be reviewed.</p><label>Channel or show name<input name="channel" maxlength="180" required autocomplete="off"></label><label>Details (optional)<textarea name="details" maxlength="500" rows="3" placeholder="Provider, official link, country or other details"></textarea></label><p role="status" aria-live="polite"></p><div class="channel-request-actions"><button class="button" type="submit">Send request</button><button class="button ghost" type="button">Cancel</button></div></form>';
 const form=dialog.querySelector('form'),name=form.elements.channel,details=form.elements.details,status=form.querySelector('[role=status]'),send=form.querySelector('[type=submit]');
 const hosted=document.location.origin==='https://sheepman90s.github.io';
 let busy=false,completed=false,identity='',payload;
 const close=()=>{controller.abort();signal?.removeEventListener('abort',close);dialog.close();dialog.remove();if(!signal?.aborted&&previous?.isConnected)previous.focus();};
 dialog.addEventListener('cancel',event=>{event.preventDefault();close();});form.querySelector('[type=button]').addEventListener('click',close);
 signal?.addEventListener('abort',close,{once:true});
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(!hosted||busy||completed)return;busy=true;send.disabled=true;name.disabled=true;details.disabled=true;status.textContent='Sending request…';
  try{
   const next=name.value.trim()+'\u0000'+details.value.trim();
   if(!payload||next!==identity){payload=await channelRequestPayload(name.value,details.value);identity=next;}
   controller.signal.throwIfAborted();const reference=await sendChannelRequest(payload,{signal:controller.signal});
   completed=true;status.textContent=`Request submitted. Reference #${reference}. Thank you!`;send.textContent='Request submitted';form.querySelector('[type=button]').textContent='Close';
  }catch(error){if(!controller.signal.aborted){status.textContent=error.name==='AbortError'?'Your request could not be confirmed. Wait a moment, then try again.':error.message;send.textContent='Try again';}}
  finally{busy=false;if(!completed){send.disabled=false;name.disabled=false;details.disabled=false;}}
 });
 if(!hosted){
  name.disabled=true;details.disabled=true;send.hidden=true;status.textContent='To send a channel request, open the hosted SheepBox web app.';
  const link=document.createElement('a');link.href='https://sheepman90s.github.io/sheepbox-releases/watch/#retro';link.textContent='Open SheepBox on the web';link.className='button';link.target='_blank';link.rel='noopener noreferrer';form.querySelector('.channel-request-actions').prepend(link);form.querySelector('[type=button]').textContent='Close';
 }
 document.body.append(dialog);dialog.showModal();if(hosted)name.focus();else form.querySelector('[type=button]').focus();
}
