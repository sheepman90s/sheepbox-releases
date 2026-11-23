import {escapeHtml as e,fold,archiveSchedule} from './core.mjs';
import {loadCwGuide} from './cw.mjs';
let saved;
export async function renderGuide(container,{catalog,signal}={}){
  container.innerHTML='<a class="back-link" href="#live">‹ Live TV</a><div class="page-heading"><div><h1>Programme guide</h1><p>The CW’s publisher schedule and SheepBox Classics now/next. Other channels have no browser guide yet.</p></div><button class="button secondary" id="guide-refresh">Refresh guide</button></div><label for="guide-query">Find a programme or channel</label><input class="filter-input" id="guide-query" type="search" placeholder="Programme title, keyword or channel…"><p id="guide-status" role="status">Loading the complete CW schedule…</p><div id="guide-results"></div>';
  const find=id=>container.querySelector('#'+id);let limit=50;
  const time=value=>new Date(value).toLocaleString(undefined,{weekday:'short',hour:'numeric',minute:'2-digit'});
  function draw(){
    const now=Date.now(),words=fold(find('guide-query').value).split(/\s+/).filter(Boolean),rows=[];
    for(const channel of saved?.channels??[]){
      if(!catalog.live.some(item=>item.id===channel.id))continue;
      const current=channel.programmes.find(program=>program.start<=now&&program.end>now);
      const next=channel.programmes.find(program=>program.start>now);
      const programmes=words.length?channel.programmes.filter(program=>words.every(word=>fold(channel.title+' '+program.title+' '+program.description).includes(word))):[current,next].filter(Boolean);
      for(const program of programmes)rows.push({id:channel.id,channel:channel.title,...program});
    }
    for(const channel of catalog.live.filter(item=>item.mode==='archive-linear')){
      const schedule=archiveSchedule(catalog.items,channel.lineupCategory,now);if(!schedule)continue;
      const row={id:channel.id,channel:channel.title,title:schedule.item.title,description:'SheepBox scheduled collection · Next: '+(schedule.next?.title??'Collection continues'),synthetic:true};
      if(words.every(word=>fold(row.channel+' '+row.title+' '+row.description).includes(word)))rows.push(row);
    }
    find('guide-results').innerHTML=rows.length?'<div class="guide-list">'+rows.slice(0,limit).map(row=>`<article class="guide-row"><div><small>${e(row.channel)}${row.synthetic?' · SheepBox schedule':''}</small><h2>${e(row.title)}</h2><p>${row.start?e(time(row.start)+' – '+time(row.end)): 'Playing now'}${row.start<=now&&row.end>now?' · NOW':''}</p><p>${e(row.description)}</p></div><a class="button secondary small" href="#watch/${e(row.id)}">Watch channel</a></article>`).join('')+'</div>'+ (rows.length>limit?`<button class="button secondary" id="guide-more">Show more · ${limit} of ${rows.length}</button>`:''):'<p class="publisher-note">No programmes matched the available guide. This search covers The CW and SheepBox Classics only.</p>';
    find('guide-more')?.addEventListener('click',()=>{limit+=50;draw();},{signal});
  }
  async function refresh(force=false){
    find('guide-refresh').disabled=true;
    try{
      if(force||!saved||Date.now()-saved.checkedAt>900000)saved=await loadCwGuide({signal});
      if(signal.aborted)return;
      find('guide-status').textContent=`CW guide checked ${new Date(saved.checkedAt).toLocaleString()} · ${saved.channels.length} channels. Times use your local timezone. Publisher schedules can change.`;draw();
    }catch{if(!signal.aborted){find('guide-status').textContent='The CW guide could not be verified from this browser. Network, regional or CORS restrictions may apply.'+(saved?' Showing the previously checked schedule.':'');draw();}}
    finally{if(!signal.aborted)find('guide-refresh').disabled=false;}
  }
  find('guide-query').addEventListener('input',()=>{limit=50;draw();},{signal});find('guide-refresh').addEventListener('click',()=>refresh(true),{signal});await refresh();
}
