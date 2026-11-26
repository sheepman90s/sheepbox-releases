import {escapeHtml as e,archiveLicense} from './core.mjs';
import {WebPlayer} from './player.mjs';
import {retroMetadata,retroPlayback} from './retro-playback.mjs';
import {showChannelRequest} from './channel-requests.mjs';
export function retroHash(value){let hash=2166136261;for(let i=0;i<value.length;i++)hash=Math.imul(hash^value.charCodeAt(i),16777619);return hash>>>0;}
export const retroSafeFile=value=>typeof value==='string'&&value.length>0&&value.length<1000&&!value.startsWith('/')&&!/[\\\u0000-\u001f]/.test(value)&&!value.split('/').includes('..');
export function retroYear(value){const values=Array.isArray(value)?value:[value],years=values.map(v=>[...String(v??'').matchAll(/(?<!\d)\d{4}(?!\d)/g)].map(m=>m[0]));return years.length&&years.every(rows=>rows.length&&rows.every(v=>Number(v)>=1800&&Number(v)<2000))?years[0][0]:'';}
export function retroCatalog(data){
 if(data.schema!==1||data.mediaVerified!==true||!Number.isSafeInteger(data.epoch)||!Array.isArray(data.programs)||!Array.isArray(data.channels))throw Error('The Retro TV lineup needs a verified catalog.');
 const programs=new Map();
 for(const row of data.programs){
  if(!/^retro-[a-f0-9]{24}$/.test(row.id)||programs.has(row.id)||!/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/.test(row.sourceId)||!retroSafeFile(row.file)||!archiveLicense(row.license)||!Number.isSafeInteger(row.duration)||row.duration<10||row.duration>14400||!row.title)throw Error('Invalid Retro TV program.');
  programs.set(row.id,row);
 }
 const seen=new Set();const channels=data.channels.map(channel=>{
  if(!/^[a-z][a-z0-9-]{0,39}$/.test(channel.id)||seen.has(channel.id)||!channel.name||!channel.programs?.length||new Set(channel.programs).size!==channel.programs.length)throw Error('Invalid Retro TV channel.');seen.add(channel.id);
  const lineup=channel.programs.map(id=>{const p=programs.get(id);if(!p)throw Error('Missing Retro TV program.');return p;});
  lineup.sort(channel.id==='soaps'?(a,b)=>compare(a.year+' '+a.title+' '+a.id,b.year+' '+b.title+' '+b.id):(a,b)=>retroHash(channel.id+'\n'+a.id)-retroHash(channel.id+'\n'+b.id)||compare(a.id,b.id));
  return {...channel,lineup,cycle:lineup.reduce((sum,p)=>sum+p.duration*1000,0)};
 });
 if(!channels.length)throw Error('The Retro TV lineup is empty.');
 return {...data,channels,programs};
}
const compare=(a,b)=>a<b?-1:a>b?1:0;
export function retroSchedule(catalog,channel,now=Date.now(),count=3){
 if(!channel?.lineup?.length||!Number.isSafeInteger(now)||!Number.isInteger(count)||count<1||count>100)throw Error('Invalid Retro TV schedule request.');
 const elapsed=((now-catalog.epoch*1000)%channel.cycle+channel.cycle)%channel.cycle;
 let index=0,acc=0;while(acc+channel.lineup[index].duration*1000<=elapsed){acc+=channel.lineup[index++].duration*1000;}
 let start=now-(elapsed-acc);
 return Array.from({length:count},(_,i)=>{const item=channel.lineup[(index+i)%channel.lineup.length],end=start+item.duration*1000;const entry={item,start,end};start=end;return entry;});
}
export function retroMedia(program,data){
 if(data.is_dark||data.is_restricted||['true','1',true,1].includes(data.metadata?.access_restricted)||!archiveLicense(data.metadata?.licenseurl)||!retroYear(data.metadata?.year??data.metadata?.date))throw Error('This program is no longer offered with the vintage metadata and public licence used for this lineup. Try another channel.');
 const file=data.files?.find(f=>f.name===program.file);
 if(!file||['true','1',true,1].includes(file.private)||!retroSafeFile(file.name))throw Error('This program’s video is unavailable. Try another channel.');
 if(Math.abs(Number(file.length)-program.duration)>2||!Number.isFinite(Number(file.length)))throw Error('This program’s length has changed. The lineup needs a refresh.');
 return 'https://archive.org/download/'+encodeURIComponent(program.sourceId)+'/'+program.file.split('/').map(encodeURIComponent).join('/');
}
let loaded;
async function load(){
 loaded??=fetch(new URL('../data/retro-tv.json',import.meta.url),{credentials:'omit'}).then(r=>{if(!r.ok)throw Error('The Retro TV catalog could not load.');return r.json();}).then(retroCatalog).catch(error=>{loaded=null;throw error;});return loaded;
}
export async function renderRetro(container,{signal,selected='',onSelect=()=>{}}){
 container.innerHTML='<div class="initial-loading"><h1>Retro TV</h1><p>Opening the channel guide…</p></div>';
 let catalog;try{catalog=await load();}catch(error){if(!signal.aborted){container.innerHTML=`<h1>Retro TV</h1><p role="alert">${e(error.message)}</p><a href="#home" class="button">Home</a><button class="button" id="retro-reload">Retry</button>`;container.querySelector('#retro-reload').addEventListener('click',()=>location.reload(),{signal});}return;}
 if(signal.aborted)return;
 let channel=catalog.channels.find(c=>c.id===selected)??catalog.channels[0],current,request,player,playback,generation=0,lastTime=Date.now(),query='',category='',digits='',digitTimer;
 const clock=ms=>new Date(ms).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});
 container.innerHTML=`<section class="retro-tv"><header class="retro-header"><div><span class="eyebrow">SHEEPBOX CHANNELS</span><h1>Retro TV</h1><p>Always on. Drop in anywhere.</p></div><a class="button ghost" href="#home">Home</a><time id="retro-clock"></time></header><div class="retro-top"><div><div id="retro-video" class="player-surface retro-video" tabindex="0" aria-label="Retro TV player. Up and Down change channel."></div><div class="retro-controls"><button class="button secondary" data-retro="previous">‹ Channel</button><button class="button secondary" data-retro="next">Channel ›</button><button class="button" data-retro="live">Tune to now</button><button class="button ghost" data-retro="full">Full screen</button></div></div><div class="retro-info"><span class="eyebrow" id="retro-channel"></span><h2 id="retro-title"></h2><p id="retro-time"></p><p id="retro-description"></p><p id="retro-status" role="status" aria-live="polite"></p><div class="button-row"><button class="button secondary" data-retro="retry">Retry video</button><a id="retro-source" class="button ghost" target="_blank" rel="noopener noreferrer">Archive source & credits ↗</a></div><p class="retro-note">${catalog.channels.length} original SheepBox channels · vintage cartoons, television, movies, music, sports and more. Video comes from Internet Archive. Weather and news are historical recordings.</p></div></div><div class="retro-filters"><label>Find a channel <input id="retro-search" type="search" placeholder="Channel name or number"></label><label>Browse <select id="retro-category"><option value="">All channels</option>${[...new Set(catalog.channels.map(c=>c.category))].map(c=>`<option>${e(c)}</option>`).join('')}</select></label><span>Same catalog + clock = same show on Android and web</span></div><div class="retro-guide" role="region" aria-label="Retro TV channel guide"><table><thead><tr><th>Channel</th><th>On now</th><th>Up next</th><th>Later</th></tr></thead><tbody id="retro-rows"></tbody></table></div><p id="retro-empty" hidden>No matching channels.</p><p class="retro-note">A separate SheepBox lineup and schedule. Some source material may be unavailable or carry dated language and themes. Licensed source credits are linked for every program.</p></section>`;
 const get=id=>container.querySelector('#retro-'+id);
 container.querySelector('.retro-header a').insertAdjacentHTML('beforebegin','<button class="button ghost" data-retro="request">Request a channel</button>');
 get('source').insertAdjacentHTML('beforebegin','<button class="button" id="retro-play" data-retro="play" hidden>Play video</button>');
 container.querySelector('.retro-filters>span').textContent='Shared channels across Android and web';
 if(catalog.coverage?.complete===false)container.querySelector('.retro-info').insertAdjacentHTML('beforeend','<p class="retro-note">Preview lineup: some Archive titles remain unverified and are left out.</p>');
 const status=(text)=>{if(!signal.aborted)get('status').textContent=text;};
 function guide(){
  const now=Date.now(),rows=catalog.channels.filter(c=>(!category||c.category===category)&&(!query||(c.number+' '+c.name+' '+c.category).toLowerCase().includes(query)));
  get('clock').textContent=clock(now);get('empty').hidden=rows.length>0;
  const focused=get('rows').contains(document.activeElement)?document.activeElement.dataset.retroChannel:null;
  get('rows').innerHTML=rows.map(c=>`<tr class="${c.id===channel.id?'selected':''}"><th><button data-retro-channel="${e(c.id)}" aria-pressed="${c.id===channel.id}"><b>${String(c.number).padStart(2,'0')}</b> ${e(c.name)}<small>${e(c.category)}</small></button></th>${retroSchedule(catalog,c,now).map((p,i)=>`<td><time>${clock(p.start)}–${clock(p.end)}</time><strong>${e(p.item.title)}</strong>${i===0?`<progress value="${now-p.start}" max="${p.end-p.start}" aria-label="Program progress"></progress>`:''}</td>`).join('')}</tr>`).join('');
  if(focused)[...get('rows').querySelectorAll('button')].find(b=>b.dataset.retroChannel===focused)?.focus({preventScroll:true});
 }
 async function tune(force=false){
  const slot=retroSchedule(catalog,channel)[0];if(!force&&current?.item.id===slot.item.id&&current.start===slot.start)return;
  current=slot;const own=++generation;request?.abort();playback?.stop();playback=null;request=new AbortController();player?.stop();get('play').hidden=true;
  get('channel').textContent=`CHANNEL ${String(channel.number).padStart(2,'0')} · ${channel.name}`;get('title').textContent=slot.item.title;
  get('time').textContent=`${clock(slot.start)}–${clock(slot.end)} · ${slot.item.year}`;get('description').textContent=slot.item.description;
  get('source').href='https://archive.org/details/'+encodeURIComponent(slot.item.sourceId);get('source').title=slot.item.license;
  status('Tuning in…');guide();onSelect(channel.id);
  try{
   const data=await retroMetadata(slot.item.sourceId,{signal:request.signal});if(own!==generation||signal.aborted)return;const url=retroMedia(slot.item,data);
   if(Date.now()>=slot.end){await tune();return;}
   player=new WebPlayer(get('video'));
   await player.open({kind:'video',url,offset:Math.max(0,(Date.now()-slot.start)/1000),live:true},{title:slot.item.title});
   playback=retroPlayback(player.video,{slot,signal:request.signal,isCurrent:()=>own===generation&&!signal.aborted,onStatus:status,onBlocked:blocked=>{get('play').hidden=!blocked;}});
   playback.play();
  }catch(error){if(own===generation&&!signal.aborted&&error.name!=='AbortError')status(error.message);}
 }
 function change(delta){channel=catalog.channels[(catalog.channels.indexOf(channel)+delta+catalog.channels.length)%catalog.channels.length];tune(true);}
 const click=event=>{const button=event.target.closest('[data-retro-channel]');if(button){channel=catalog.channels.find(c=>c.id===button.dataset.retroChannel);tune(true);return;}switch(event.target.closest('[data-retro]')?.dataset.retro){case 'request':showChannelRequest({signal});break;case 'previous':change(-1);break;case 'next':change(1);break;case 'live':case 'retry':tune(true);break;case 'play':playback?.play();break;case 'full':player?.fullscreen().catch(()=>status('Full screen is unavailable.'));break;}};
 container.addEventListener('click',click,{signal});
 get('search').addEventListener('input',event=>{query=event.target.value.trim().toLowerCase();guide();},{signal});get('category').addEventListener('change',event=>{category=event.target.value;guide();},{signal});
 document.addEventListener('keydown',event=>{
  if(event.target.closest?.('dialog')||event.target.matches?.('input,select,textarea')||event.ctrlKey||event.altKey||event.metaKey)return;
  if(/^[0-9]$/.test(event.key)){digits+=event.key;clearTimeout(digitTimer);status('Channel '+digits);digitTimer=setTimeout(()=>{const found=catalog.channels.find(c=>c.number===Number(digits));digits='';if(found){channel=found;tune(true);}else status('That channel number is not in this lineup.');},800);event.preventDefault();}
  if(get('video').contains(event.target)||event.target===get('video')){
   if(['ArrowUp','ChannelUp','ArrowDown','ChannelDown'].includes(event.key)){event.preventDefault();event.stopImmediatePropagation();change(['ArrowUp','ChannelUp'].includes(event.key)?1:-1);}
  }
 },{signal,capture:true});
 const timer=setInterval(()=>{const now=Date.now();if(current&&(now>=current.end||now<current.start))tune();else if(Math.abs(now-lastTime)>15000&&player?.video&&!player.video.paused){const offset=(now-current.start)/1000;player.video.currentTime=Math.max(0,offset);}lastTime=now;},1000);
 const guideTimer=setInterval(guide,30000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden){tune(true);guide();}},{signal});
 signal.addEventListener('abort',()=>{generation++;request?.abort();playback?.stop();player?.stop();clearInterval(timer);clearInterval(guideTimer);clearTimeout(digitTimer);},{once:true});
 tune(true);
}
