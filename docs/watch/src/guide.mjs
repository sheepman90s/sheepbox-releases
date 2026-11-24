import {escapeHtml as e,fold,archiveSchedule} from './core.mjs';
import {loadFreeTvGuide} from './freetv.mjs';
import {loadRuntimeGuide} from './runtime.mjs';
import {loadRevryGuide} from './revry.mjs';
import {loadCwGuide} from './cw.mjs';
import {loadXumoGuide} from './xumo.mjs';
const cache=new Map(),HOUR=3600000,SPAN=3*HOUR;
export function guideWindow(programmes,start,end){return programmes.filter(p=>p.start<end&&p.end>start).map(p=>({...p,left:Math.max(0,(p.start-start)/(end-start)*100),width:(Math.min(end,p.end)-Math.max(start,p.start))/(end-start)*100}));}
export function searchGuide(channels,query){const words=fold(query).split(/\s+/).filter(Boolean);return channels.flatMap(channel=>channel.programmes.filter(p=>words.every(word=>fold(channel.title+' '+p.title+' '+p.description).includes(word))).map(p=>({...p,id:channel.id,channel:channel.title})));}
export async function renderGuide(container,{catalog,signal=new AbortController().signal}={}){
 const minimum=new Date().setHours(0,0,0,0),maximum=new Date(new Date(minimum).setDate(new Date(minimum).getDate()+7)).getTime();
 let start=Math.floor(Date.now()/(HOUR/2))*(HOUR/2),limit=40,loading=new Set(),failed=new Set(),xumoController,generation=0,selected;
 const visible=new Set(catalog.live.map(row=>row.id)),time=value=>new Date(value).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'}),date=value=>new Date(value).toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'});
 container.innerHTML='<a class="back-link" href="#live">‹ Live TV</a><div class="page-heading"><div><h1>Programme guide</h1><p>Publisher schedules from The CW, Revry, FreeTV, Runtime and Xumo. Times use your local timezone.</p></div><button class="button secondary" id="guide-refresh">Refresh guide</button></div><label for="guide-query">Find a programme or channel</label><input class="filter-input" id="guide-query" type="search" placeholder="Programme title, keyword or channel…"><div class="guide-controls"><button class="button secondary small" id="guide-prev">‹ Earlier</button><button class="button secondary small" id="guide-now">Now</button><button class="button secondary small" id="guide-next">Later ›</button><label for="guide-day">Day</label><select id="guide-day"></select><button class="button ghost small" id="guide-layout" aria-pressed="false">List view</button></div><p id="guide-status" role="status"></p><p class="caption-message">Xumo loads all channel pages for the displayed time window, up to seven days ahead. Search covers all loaded schedules; choose another time to search its Xumo window. Other channels may have no browser guide.</p><div id="guide-results"></div>';
 const find=id=>container.querySelector('#'+id);
 find('guide-day').innerHTML=Array.from({length:7},(_,i)=>{const d=new Date(minimum);d.setDate(d.getDate()+i);return `<option value="${d.getTime()}">${e(date(d))}</option>`;}).join('');
 function channels(){return [...cache.values()].flatMap(row=>row.channels).filter(row=>visible.has(row.id));}
 function classicChannels(){const at=Date.now();return catalog.live.filter(row=>row.mode==='archive-linear').flatMap(channel=>{const schedule=archiveSchedule(catalog.items,channel.lineupCategory,at);if(!schedule)return [];const begins=at-schedule.offset*1000;return [{id:channel.id,title:channel.title+' · SheepBox schedule',programmes:[{title:schedule.item.title,description:'SheepBox scheduled collection · Next: '+(schedule.next?.title??'Collection continues'),start:begins,end:begins+schedule.item.duration*1000}]}];});}
 function status(){const verified=[...cache].filter(([,v])=>v.channels.some(row=>visible.has(row.id))).map(([name,v])=>name+' ('+new Date(v.checkedAt).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'})+')');find('guide-status').textContent=(loading.size?'Loading: '+[...loading].join(', ')+'. ':'')+'Verified: '+(verified.join(', ')||'waiting for publisher schedules')+'.'+(failed.size?' Unverified refresh: '+[...failed].join(', ')+'. Previously checked schedules remain available.':'')+' Publisher schedules can change.';find('guide-refresh').disabled=loading.size>0;}
 const more=total=>total>limit?`<button class="button secondary" id="guide-more">Show more · ${limit} of ${total}</button>`:'';
 function details(focus=false){
  if(!selected||!find('guide-details'))return;const {channel,p}=selected,panel=find('guide-details');panel.hidden=false;
  panel.innerHTML=`<small>${e(channel.title+' · '+date(p.start)+' · '+time(p.start)+' – '+time(p.end))}</small><h2>${e(p.title)}</h2><p>${e(p.description)}</p><a class="button secondary small" href="#watch/${e(channel.id)}">Watch channel</a><button class="button ghost small" id="guide-close-details">Close details</button>`;
  if(focus)panel.focus();find('guide-close-details').addEventListener('click',()=>{const id=selected.channel.id,at=selected.p.start;selected=null;panel.hidden=true;const button=[...container.querySelectorAll('[data-guide-channel]')].find(row=>row.dataset.guideChannel===id&&Number(row.dataset.guideStart)===at);(button||find('guide-layout')).focus();},{signal});
 }
 function draw(){
  if(signal.aborted)return;const active=document.activeElement,wasInside=find('guide-results').contains(active),focusedChannel=active?.dataset.guideChannel,focusedStart=active?.dataset.guideStart,detailsFocused=!!active?.closest('#guide-details'),scroll=find('guide-results').querySelector('.guide-scroll'),scrollX=scroll?.scrollLeft??0,scrollY=scroll?.scrollTop??0;
  status();const query=find('guide-query').value.trim(),list=find('guide-layout').getAttribute('aria-pressed')==='true',rows=channels(),end=start+SPAN;
  find('guide-prev').disabled=start<=minimum;find('guide-next').disabled=start+SPAN>=maximum;
  const localDay=new Date(start);localDay.setHours(0,0,0,0);find('guide-day').value=String(localDay.getTime());
  if(query||list){
   const results=query?searchGuide([...rows,...classicChannels()],query):rows.flatMap(row=>guideWindow(row.programmes,start,end).map(p=>({...p,id:row.id,channel:row.title})));
   find('guide-results').innerHTML=`<p class="eyebrow">${e(query?'Search · all loaded schedules':date(start)+' · '+time(start)+' – '+time(end))} · ${results.length.toLocaleString()} programmes</p>`+(results.length?'<div class="guide-list">'+results.slice(0,limit).map(row=>`<article class="guide-row"><div><small>${e(row.channel)}</small><h2>${e(row.title)}</h2><p>${e(date(row.start)+' · '+time(row.start)+' – '+time(row.end))}${row.start<=Date.now()&&row.end>Date.now()?' · NOW':''}</p><p>${e(row.description)}</p></div><a class="button secondary small" href="#watch/${e(row.id)}">Watch channel</a></article>`).join('')+'</div>'+more(results.length):`<p class="publisher-note">${loading.size?'Schedules are still loading. Results will update when ready.':'No programmes matched the loaded guide. Try another time or keyword.'}</p>`);
  }else{
   const shown=rows.filter(row=>row.programmes.some(p=>p.start<end&&p.end>start)),nowOffset=(Date.now()-start)/SPAN*100;
   const ticks=Array.from({length:6},(_,i)=>`<span>${e(time(start+i*HOUR/2))}</span>`).join('');
   find('guide-results').innerHTML=`<p class="eyebrow">${e(date(start)+' · '+time(start)+' – '+time(end))} · ${shown.length.toLocaleString()} channels with schedules</p><div class="guide-scroll" tabindex="0" role="region" aria-label="Programme time grid. Scroll horizontally for times; Tab leaves the grid."><div class="guide-grid"><div class="guide-grid-heading"><strong>Channel</strong><div class="guide-time-axis">${ticks}</div></div>${shown.slice(0,limit).map(row=>`<div class="guide-channel-row"><a class="guide-channel" href="#watch/${e(row.id)}">${e(row.title)}</a><div class="guide-programmes">${guideWindow(row.programmes,start,end).map(p=>`<button class="guide-programme${p.start<=Date.now()&&p.end>Date.now()?' playing':''}" data-guide-left="${p.left}" data-guide-width="${p.width}" data-guide-channel="${e(row.id)}" data-guide-start="${p.start}" aria-label="${e(row.title+' · '+p.title+' · '+time(p.start)+' to '+time(p.end))}"><strong>${e(p.title)}</strong><small>${e(time(p.start)+' – '+time(p.end))}</small></button>`).join('')}${nowOffset>=0&&nowOffset<100?`<span class="guide-now-line" data-guide-now="${nowOffset}" aria-hidden="true"></span>`:''}</div></div>`).join('')}</div></div>${shown.length?'':`<p class="publisher-note">${loading.size?'Schedules are still loading.':'No published schedules in this window. Try another time or List view.'}</p>`}${more(shown.length)}<div id="guide-details" class="publisher-note" hidden tabindex="-1"></div>`;
   container.querySelectorAll('[data-guide-left]').forEach(button=>{button.style.left=button.dataset.guideLeft+'%';button.style.width=button.dataset.guideWidth+'%';});
   container.querySelectorAll('[data-guide-now]').forEach(line=>line.style.left=line.dataset.guideNow+'%');
   container.querySelectorAll('[data-guide-channel]').forEach(button=>button.addEventListener('click',()=>{
    const channel=rows.find(row=>row.id===button.dataset.guideChannel),p=channel?.programmes.find(row=>row.start===Number(button.dataset.guideStart));if(!p)return;
    selected={channel,p};details(true);
   },{signal}));
  }
  const classics=catalog.live.filter(row=>row.mode==='archive-linear').map(channel=>({channel,schedule:archiveSchedule(catalog.items,channel.lineupCategory)})).filter(row=>row.schedule);
  if(classics.length&&!query)find('guide-results').insertAdjacentHTML('beforeend','<h2>SheepBox Classics · playing now</h2><p class="caption-message">SheepBox scheduled collections, separate from publisher guides.</p><div class="button-row">'+classics.map(({channel,schedule})=>`<a class="button ghost small" href="#watch/${e(channel.id)}">${e(channel.title+' · '+schedule.item.title)}</a>`).join('')+'</div>');
  find('guide-more')?.addEventListener('click',()=>{limit+=40;draw();},{signal});
  details();const nextScroll=find('guide-results').querySelector('.guide-scroll');if(nextScroll){nextScroll.scrollLeft=scrollX;nextScroll.scrollTop=scrollY;}
  if(wasInside){const target=focusedChannel?[...container.querySelectorAll('[data-guide-channel]')].find(row=>row.dataset.guideChannel===focusedChannel&&row.dataset.guideStart===focusedStart):detailsFocused?find('guide-details'):find('guide-more');(target||find('guide-layout')).focus({preventScroll:true});}
 }
 async function fetchProvider(name,loader,force=false){
  if(!force&&cache.has(name)&&Date.now()-cache.get(name).checkedAt<900000){draw();return;}
  loading.add(name);failed.delete(name);draw();
  try{const rows=await loader();signal.throwIfAborted();cache.set(name,{checkedAt:Date.now(),channels:rows});}catch{if(!signal.aborted)failed.add(name);}finally{loading.delete(name);draw();}
 }
 async function xumo(force=false){
  xumoController?.abort();const controller=new AbortController(),mine=++generation,requestSignal=AbortSignal.any([signal,controller.signal]);xumoController=controller;
  const previous=cache.get('Xumo');if(!force&&previous?.start===start&&Date.now()-previous.checkedAt<900000){loading.delete('Xumo');draw();return;}
  const requested=start;loading.add('Xumo');failed.delete('Xumo');draw();
  try{const rows=await loadXumoGuide(catalog.live,{signal:requestSignal,start:requested,end:requested+SPAN});requestSignal.throwIfAborted();if(mine===generation)cache.set('Xumo',{checkedAt:Date.now(),channels:rows,start:requested});}catch{if(!requestSignal.aborted)failed.add('Xumo');}finally{if(mine===generation){loading.delete('Xumo');draw();}}
 }
 async function refresh(force=false){await Promise.allSettled([fetchProvider('CW',()=>loadCwGuide({signal}).then(v=>v.channels),force),fetchProvider('Revry',()=>loadRevryGuide(catalog.live,{signal}),force),fetchProvider('FreeTV',()=>loadFreeTvGuide(catalog.live,{signal}),force),fetchProvider('Runtime',()=>loadRuntimeGuide(catalog.live,{signal}),force),xumo(force)]);}
 function move(value){start=Math.min(maximum-SPAN,Math.max(minimum,value));limit=40;draw();void xumo();}
 find('guide-query').addEventListener('input',()=>{limit=40;draw();},{signal});
 find('guide-layout').addEventListener('click',()=>{const button=find('guide-layout'),list=button.getAttribute('aria-pressed')!=='true';button.setAttribute('aria-pressed',String(list));button.textContent=list?'Time grid':'List view';limit=40;draw();},{signal});
 find('guide-prev').addEventListener('click',()=>move(start-SPAN),{signal});find('guide-next').addEventListener('click',()=>move(start+SPAN),{signal});find('guide-now').addEventListener('click',()=>move(Math.floor(Date.now()/(HOUR/2))*(HOUR/2)),{signal});
 find('guide-day').addEventListener('change',()=>{const target=new Date(Number(find('guide-day').value)),current=new Date(start);target.setHours(current.getHours(),current.getMinutes());move(target.getTime());},{signal});find('guide-refresh').addEventListener('click',()=>void refresh(true),{signal});
 signal.addEventListener('abort',()=>xumoController?.abort(),{once:true});draw();await refresh();
}
