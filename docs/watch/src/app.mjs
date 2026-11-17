import {VERSION,escapeHtml as e,safeUrl,fold,filterItems,parseRoute,durationLabel,archiveSchedule} from './core.mjs';
import {providers,providerById} from './providers.mjs';
import {browserStore} from './storage.mjs';
import {loadCatalog,resolvePlayback,refreshNasa} from './sources.mjs';
import {WebPlayer} from './player.mjs';

const paths={home:'M3 10 12 3l9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z',live:'M4 7h16v13H4z M8 3l4 4 4-4 M8 23h8',play:'m8 5 11 7-11 7Z',star:'m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z',grid:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',settings:'M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1Z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',search:'M16 16l5 5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',arrow:'m9 5 7 7-7 7',back:'m15 5-7 7 7 7',external:'M14 3h7v7 M21 3 10 14 M10 3H4a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-6',refresh:'M20 7a9 9 0 1 0 1 9 M20 2v5h-5',cc:'M3 5h18v14H3z M10 9H7v6h3 M17 9h-3v6h3',full:'M8 3H3v5 M16 3h5v5 M21 16v5h-5 M8 21H3v-5',pip:'M3 4h18v16H3z M12 12h7v6h-7z',clock:'M12 7v5l4 2 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',download:'M12 3v12 m-5-5 5 5 5-5 M4 17v4h16v-4',film:'M3 3h18v18H3z M7 3v18 M17 3v18 M3 8h4 M3 16h4 M17 8h4 M17 16h4',close:'M5 5l14 14 M19 5 5 19'};
const icon=(name)=>`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name]??paths.play}"/></svg>`;
const $=id=>document.getElementById(id);
const store=browserStore();
const state={catalog:null,all:[],byId:new Map(),route:parseRoute(location.hash),limit:36,filter:{},player:null,controller:null,refreshing:false};
let toastTimer,installPrompt,previousBrowse='#ondemand';

function toast(message){$('toast').textContent=message;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),3200);}
function updateConnection(){$('connection-status').hidden=navigator.onLine;}
function navigate(hash){if(location.hash===hash)renderRoute();else location.hash=hash;}
function activeNav(){const name=state.route.name;if(name==='provider'||name==='series')return 'ondemand';if(name==='watch')return state.byId.get(state.route.id)?.kind==='live'?'live':'ondemand';if(name==='search'||name==='history')return 'home';return name;}
function renderNavigation(){
  const active=activeNav();const nav=[['home','Home','home'],['live','Live TV','live'],['ondemand','On Demand','play'],['favorites','Favorites','star'],['providers','Providers','grid']];
  $('navigation').innerHTML=nav.map(([id,label,symbol])=>`<a href="#${id}" class="nav-item${id===active?' active':''}" ${id===active?'aria-current="page"':''}>${icon(symbol)}<span>${label}</span>${id==='favorites'&&store.data.favorites.length?`<span class="nav-count">${store.data.favorites.length}</span>`:''}</a>`).join('');
}
function indexCatalog(catalog){
  const terms=new Map((catalog.nasaSeries??[]).map(term=>[term.id,term]));
  function root(id){const seen=new Set();while(terms.get(id)?.parent&&terms.get(id).parent!=='0'){if(seen.has(id))return '';seen.add(id);id=terms.get(id).parent;}return id;}
  const groups=new Map();
  for(const item of catalog.items.filter(x=>x.provider==='nasaplus'))for(const id of new Set((item.series??[]).map(root).filter(Boolean))){if(!groups.has(id))groups.set(id,[]);groups.get(id).push(item);}
  const series=[...groups].filter(([id])=>terms.has(id)).map(([id,episodes])=>({id:`nasa-series-${id}`,provider:'nasaplus',providerName:'NASA+',kind:'series',title:terms.get(id).title,description:terms.get(id).description,
    categories:['Series'],image:episodes.find(x=>x.image)?.image??'',official:'https://plus.nasa.gov/',mode:'series',episodes:episodes.map(x=>x.id)}));
  state.catalog=catalog;state.all=[...catalog.live,...catalog.items,...series];state.byId=new Map(state.all.map(item=>[item.id,item]));
}
function interleave(items){const groups=new Map();for(const item of items){if(!groups.has(item.provider))groups.set(item.provider,[]);groups.get(item.provider).push(item);}const arrays=[...groups.values()];const result=[];let offset=0;while(arrays.some(rows=>offset<rows.length)){for(const rows of arrays)if(rows[offset])result.push(rows[offset]);offset++;}return result;}
function card(item){
  const live=item.kind==='live';const href=item.kind==='series'?`#series/${encodeURIComponent(item.id)}`:`#watch/${encodeURIComponent(item.id)}`;
  const saved=store.isFavorite(item.id);const position=store.resume(item.id);const history=store.data.history[item.id];
  const schedule=item.mode==='archive-linear'?archiveSchedule(state.catalog.items,item.lineupCategory):null;
  const subtitle=schedule?`Now: ${schedule.item.title}`:item.kind==='series'?`${item.episodes.length} episodes · NASA+`:item.providerName;
  return `<article class="media-card" data-item-id="${e(item.id)}"><a class="card-art" href="${href}" aria-label="${item.kind==='series'?'Browse episodes of':'Watch'} ${e(item.title)}"><span class="art-placeholder">${icon(live?'live':'film')}<strong>${e(item.providerName)}</strong><small>${live?'LIVE TELEVISION':'ON DEMAND'}</small></span>${safeUrl(item.image)?`<img src="${e(item.image)}" alt="" loading="lazy" decoding="async">`:''}${live?'<span class="live-tag">LIVE</span>':''}<span class="play-circle">${icon(item.kind==='series'?'grid':'play')}</span>${!live&&durationLabel(item.duration)?`<span class="duration-tag">${durationLabel(item.duration)}</span>`:''}${position&&history?.duration?`<span class="mini-progress"><progress max="${Math.max(1,history.duration)}" value="${position}" aria-label="Saved viewing progress"></progress></span>`:''}</a><div class="card-info"><a href="${href}" class="card-title">${e(item.title)}</a><p class="card-subtitle">${e(subtitle)}</p><button class="favorite-button${saved?' saved':''}" data-favorite="${e(item.id)}" aria-label="${saved?'Remove':'Save'} ${e(item.title)} ${saved?'from':'to'} favorites" aria-pressed="${saved}">${icon('star')}</button></div></article>`;
}
function cards(items,compact=false){return `<div class="content-grid${compact?' compact':''}">${items.map(card).join('')}</div>`;}
function providerCard(p){
  const inPage=p.playback!=='website';const saved=store.isFavorite(`provider:${p.id}`);
  return `<article class="provider-card palette-${p.palette}" data-provider-id="${p.id}"><a href="#provider/${p.id}" class="provider-title"><span class="provider-logo">${e(p.name==='NASA+'?'N+':p.name==='Internet Archive'?'IA':p.name.split(/\s/).map(x=>x[0]).slice(0,2).join(''))}</span><h3>${e(p.name)}</h3></a><button class="favorite-button${saved?' saved':''}" data-favorite="provider:${p.id}" aria-label="${saved?'Remove':'Save'} ${e(p.name)} ${saved?'from':'to'} favorites" aria-pressed="${saved}">${icon('star')}</button><p>${e(p.description)}</p><div class="provider-foot"><span class="playback-badge${inPage?' in-page':''}">${inPage?p.playback==='embed'?'Publisher player':'Plays here':'Publisher site'}</span>${inPage?`<a href="#provider/${p.id}">Browse ${icon('arrow')}</a>`:`<a href="${p.url}" target="_blank" rel="noopener noreferrer" data-open-provider="${p.id}" aria-label="Open ${e(p.name)} website in a new tab">Open website ${icon('external')}</a>`}</div></article>`;
}
const empty=(title,message,action='<a href="#ondemand" class="button secondary">Browse On Demand</a>')=>`<div class="empty-state">${icon('search')}<h2>${e(title)}</h2><p>${e(message)}</p>${action}</div>`;
const heading=(title,subtitle,action='')=>`<div class="page-heading"><div><h1>${e(title)}</h1><p>${e(subtitle)}</p></div>${action}</div>`;
const section=(title,subtitle,href,label='See all')=>`<div class="section-heading"><h2>${e(title)}${subtitle?`<small>${e(subtitle)}</small>`:''}</h2>${href?`<a href="${href}">${e(label)} ${icon('arrow')}</a>`:''}</div>`;
function resumeItems(){return Object.entries(store.data.history).sort((a,b)=>b[1].at-a[1].at).filter(([id])=>store.resume(id)>0&&state.byId.has(id)).map(([id])=>state.byId.get(id));}
function renderHome(){
  const recent=resumeItems();const featured=interleave(state.catalog.items.filter(item=>item.image)).slice(0,12);
  const featuredProviders=['nasaplus','archive','nfb','pluto','tubi','roku','pbskids','redbull'].map(providerById);
  $('main').innerHTML=`<section class="hero" aria-labelledby="home-title"><div class="hero-content"><div class="eyebrow">THE BEST SEAT IS YOURS</div><h1 id="home-title">What are we<br>watching?</h1><p>Live television, films and familiar favorites.<br>Make yourself comfortable.</p><div class="button-row"><a class="button" href="#live">${icon('play')} Watch live</a><a class="button secondary" href="#ondemand">Browse films & shows</a></div><div class="library-pills"><span>${state.catalog.live.length} channels</span><span>${state.catalog.items.length.toLocaleString()} catalogue entries</span><span>No SheepBox account</span></div></div></section>${recent.length?`${section('Pick up where you left off','Saved on this browser.','#history','Your history')}${cards(recent.slice(0,4))}`:''}${section('Live right now','A little space, music and classic television.','#live','All live channels')}${cards(state.catalog.live.slice(0,4))}${section('Something for your next movie night','Explore films, science, stories and animation.','#ondemand','Browse library')}${cards(featured)}${section('Your favorite places to watch','Browse here or open the publisher’s own website.','#providers','All providers')}<div class="provider-grid">${featuredProviders.map(providerCard).join('')}</div>`;
}
function currentLibrary(){
  const {name,id}=state.route;
  if(name==='live')return state.catalog.live;
  if(name==='series')return (state.byId.get(id)?.episodes??[]).map(key=>state.byId.get(key)).filter(Boolean);
  if(name==='provider')return state.all.filter(item=>item.provider===id);
  if(name==='favorites')return state.all.filter(item=>store.isFavorite(item.id));
  if(name==='search')return state.all;
  return state.all.filter(item=>item.kind!=='live');
}
function filterMarkup({provider=true,kind=true}={}){
  const available=[...new Set(currentLibrary().map(x=>x.provider))].map(providerById).filter(Boolean);
  const categories=[...new Set(currentLibrary().filter(x=>!state.filter.provider||x.provider===state.filter.provider).flatMap(x=>x.categories??[]))].sort((a,b)=>a.localeCompare(b));
  return `<div class="filters"><label class="sr-only" for="library-query">Filter this library</label><input id="library-query" class="filter-input" type="search" placeholder="Filter ${state.route.name==='live'?'channels':'this library'}…" value="${e(state.filter.query??'')}" maxlength="160">${provider?`<label class="sr-only" for="library-provider">Provider</label><select id="library-provider"><option value="">All providers</option>${available.map(p=>`<option value="${p.id}"${state.filter.provider===p.id?' selected':''}>${e(p.name)}</option>`).join('')}</select>`:''}<label class="sr-only" for="library-category">Category</label><select id="library-category"><option value="">All categories</option>${categories.map(c=>`<option${state.filter.category===c?' selected':''}>${e(c)}</option>`).join('')}</select>${kind?`<label class="sr-only" for="library-kind">Content type</label><select id="library-kind"><option value="">Films & shows</option><option value="film"${state.filter.kind==='film'?' selected':''}>Films</option><option value="series"${state.filter.kind==='series'?' selected':''}>Series</option><option value="video"${state.filter.kind==='video'?' selected':''}>Videos & episodes</option></select>`:''}<label class="sr-only" for="library-sort">Sort order</label><select id="library-sort"><option value="featured">Featured</option><option value="az"${state.filter.sort==='az'?' selected':''}>Title A–Z</option></select><span class="result-count" id="result-count" role="status"></span></div>`;
}
function renderResults(){
  let items=filterItems(currentLibrary(),state.filter);
  items=state.filter.sort==='az'?items.sort((a,b)=>a.title.localeCompare(b.title,undefined,{numeric:true,sensitivity:'base'})):interleave(items);
  const limit=Math.min(state.limit,items.length);
  if($('result-count'))$('result-count').textContent=`${items.length.toLocaleString()} ${state.route.name==='live'?'channels':'results'}`;
  $('results').innerHTML=items.length?`${cards(items.slice(0,limit))}${limit<items.length?`<div class="load-more"><button class="button secondary" data-action="more">Show more · ${limit.toLocaleString()} of ${items.length.toLocaleString()}</button></div>`:''}`:empty('Nothing matched this time.','Try a different title, category or provider.','<button class="button secondary" data-action="clear-filters">Clear filters</button>');
}
function renderLibrary(){
  const live=state.route.name==='live';
  $('main').innerHTML=`${heading(live?'Live TV':'On Demand',live?'Tune into a public channel or a continuous SheepBox Classics collection.':'Films, stories and series from NASA+, NFB and licensed Internet Archive collections.',`<a href="#providers" class="button ghost">${icon('grid')} All providers</a>`)}${filterMarkup({kind:!live})}${!live?`<p class="result-note">NFB films use the publisher’s own player. Internet Archive entries are a selection, not its full library. <a href="#settings" class="inline-link">About this preview</a></p>`:''}<div id="results"></div>${live?`${section('More live television','These providers open on their own websites.','#providers','Browse all')}<div class="provider-grid">${providers.filter(p=>p.playback==='website'&&p.content!=='vod').slice(0,8).map(providerCard).join('')}</div>`:''}`;renderResults();
}
function renderProvider(p){
  if(!p){$('main').innerHTML=empty('Provider not found.','Choose a provider from the directory.','<a class="button secondary" href="#providers">All providers</a>');return;}
  const items=currentLibrary();const count=items.filter(x=>x.kind!=='series').length;
  $('main').innerHTML=`<a href="#providers" class="back-link">${icon('back')} All providers</a><div class="provider-banner palette-${p.palette}"><span class="provider-logo">${e(p.name==='Internet Archive'?'IA':p.name.slice(0,2))}</span><div><div class="eyebrow">${p.playback==='website'?'PUBLISHER WEBSITE':'IN YOUR SHEEPBOX LIBRARY'}</div><h1>${e(p.name)}</h1><p>${e(p.description)}</p></div><a class="button secondary" href="${p.url}" target="_blank" rel="noopener noreferrer" data-open-provider="${p.id}">Open website ${icon('external')}</a></div>${p.playback==='website'?`<div class="publisher-note">This provider’s player isn’t integrated into the web preview yet. Use its official website to browse and watch; its content is also available through the supported Android TV integration.</div><div class="button-row"><button class="button ghost" data-favorite="provider:${p.id}">${icon('star')} ${store.isFavorite(`provider:${p.id}`)?'Remove favorite':'Save provider'}</button><a class="button secondary" href="https://github.com/sheepman90s/sheepbox-releases/releases/latest" target="_blank" rel="noopener noreferrer">Get the Android TV app ${icon('external')}</a></div>`:`<p class="result-note">${p.id==='nfb'?'Free public film metadata from the catalogue snapshot. NFB’s embedded player checks current access and regional availability.':p.id==='archive'?'Only entries with a published Creative Commons or public-domain license are listed. Licensing is checked again when you play.':`${count.toLocaleString()} videos and channels in this catalogue.`}</p>${p.id==='nasaplus'?`<div class="button-row"><button class="button ghost small" data-action="refresh-nasa" ${state.refreshing?'disabled':''}>${icon('refresh')} Refresh NASA+ catalogue</button><span id="refresh-status" class="caption-message"></span></div>`:''}${filterMarkup({provider:false,kind:p.content!=='live'})}<div id="results"></div>`}`;
  if(p.playback!=='website')renderResults();
}
function renderSeries(item){
  if(!item?.episodes){$('main').innerHTML=empty('Series not found.','The current catalogue no longer includes this series.');return;}
  $('main').innerHTML=`<a href="#provider/nasaplus" class="back-link">${icon('back')} NASA+</a>${heading(item.title,item.description||`${item.episodes.length} videos in this NASA+ series.`)}<div class="button-row"><button class="button ghost" data-favorite="${item.id}">${icon('star')} ${store.isFavorite(item.id)?'Remove favorite':'Save series'}</button><a class="button secondary" href="https://plus.nasa.gov/" target="_blank" rel="noopener noreferrer">NASA+ website ${icon('external')}</a></div><h2 class="series-list-heading">Episodes & videos · ${item.episodes.length}</h2>${filterMarkup({provider:false,kind:false})}<div id="results"></div>`;renderResults();
}
function renderFavorites(){
  const savedProviders=providers.filter(p=>store.isFavorite(`provider:${p.id}`));const savedItems=currentLibrary();
  $('main').innerHTML=`${heading('Your favorites','The channels, titles and providers you’ve saved on this browser.')}<div class="tabs"><a class="tab active" href="#favorites">${store.data.favorites.length} saved favorites</a><a class="tab" href="#history">Watch history</a></div>${!savedItems.length&&!savedProviders.length?empty('Make this place yours.','Tap the star beside a title, channel or provider to save it here.','<a class="button" href="#ondemand">Find something to watch</a>'):''}${savedProviders.length?`${section('Saved providers','','')}<div class="provider-grid">${savedProviders.map(providerCard).join('')}</div>`:''}${savedItems.length?`${section('Saved titles & channels','','')}${filterMarkup()}<div id="results"></div>`:''}`;
  if(savedItems.length)renderResults();
}
function renderProviders(){
  $('main').innerHTML=`${heading('All your places to watch','Some providers play here; others open their official website. No SheepBox account is needed.')}<div class="filters"><label class="sr-only" for="provider-query">Find a provider</label><input class="filter-input" id="provider-query" type="search" placeholder="Find a provider…"><label class="sr-only" for="provider-playback">Playback availability</label><select id="provider-playback"><option value="">All providers</option><option value="here">Plays in SheepBox</option><option value="website">Publisher websites</option></select><span class="result-count" id="provider-count" role="status"></span></div><div id="provider-results"></div>`;renderProviderResults();
}
function renderProviderResults(){const query=fold($('provider-query').value);const availability=$('provider-playback').value;const items=providers.filter(p=>(!availability||(availability==='here'?p.playback!=='website':p.playback==='website'))&&fold(`${p.name} ${p.description} ${p.category}`).includes(query));$('provider-count').textContent=`${items.length} providers`;$('provider-results').innerHTML=items.length?`<div class="provider-grid">${items.map(providerCard).join('')}</div>`:empty('No providers matched.','Try a different name or availability filter.','');}
function renderSearch(){
  state.filter.query=state.route.id;
  const matchedProviders=providers.filter(p=>fold(`${p.name} ${p.category}`).includes(fold(state.route.id))).slice(0,8);
  $('main').innerHTML=`${heading(state.route.id?`Results for “${state.route.id}”`:'Find your next favorite','Search the web catalogue, live channels and provider directory.')}<div>${matchedProviders.length?`${section('Providers','','')}<div class="provider-grid">${matchedProviders.map(providerCard).join('')}</div><div class="section-divider"></div>`:''}</div>${filterMarkup()}<div id="results"></div>`;renderResults();
}
function renderHistory(){
  const rows=Object.entries(store.data.history).sort((a,b)=>b[1].at-a[1].at).filter(([id])=>state.byId.has(id)||id.startsWith('provider:')&&providerById(id.slice(9)));
  $('main').innerHTML=`${heading('Your watch history','Saved on this browser. Publisher players keep their own playback progress.')}<div class="tabs"><a class="tab" href="#favorites">Favorites</a><a class="tab active" href="#history">Watch history</a></div>${rows.length?rows.slice(0,100).map(([id,h])=>{const p=id.startsWith('provider:')?providerById(id.slice(9)):null;const item=state.byId.get(id);return `<div class="history-row"><a href="${p?`#provider/${p.id}`:`#watch/${e(id)}`}">${e(p?.name??item.title)}<small>${e(new Date(h.at).toLocaleDateString())}${store.resume(id)?` · Resume at ${durationLabel(h.position)}`:''}</small></a><button data-remove-history="${e(id)}" aria-label="Remove ${e(p?.name??item.title)} from history">Remove</button></div>`;}).join(''):empty('Your next watch starts here.','When you open a video or channel, it will appear here.','<a class="button" href="#ondemand">Explore the library</a>')}`;
}
function renderSettings(){
  const generated=new Date(state.catalog.generatedAt).toLocaleDateString(undefined,{year:'numeric',month:'long',day:'numeric'});
  $('main').innerHTML=`${heading('Make yourself at home','Your library, playback preferences and a little about SheepBox.')}<div class="settings-grid"><section class="settings-card"><h2>Your library</h2><p>Favorites and viewing progress are saved on this browser. They don’t automatically sync with another browser or the Android TV app.</p><div class="library-summary"><span><strong>${store.data.favorites.length}</strong>favorites</span><span><strong>${Object.keys(store.data.history).length}</strong>history entries</span></div>${!store.persistent?'<p class="info-line">Browser storage isn’t available. Export a backup before closing this page to keep your library.</p>':''}<div class="button-row"><button class="button secondary" data-action="export">${icon('download')} Export backup</button><label class="button ghost" for="import-backup">Import backup<input id="import-backup" type="file" accept="application/json,.json" class="sr-only"></label></div><small>Import merges saved entries with your existing library.</small><button class="subtle-action" data-action="clear-library">Clear favorites & history</button></section><section class="settings-card"><h2>Playback</h2><label><input id="prefer-captions" type="checkbox"${store.data.settings.captions?' checked':''}> Prefer captions when available</label><p>Caption tracks come from the video’s publisher. Embedded players use their own controls and preferences.</p><p>Use the video controls for play, pause, seeking, volume and captions. Full screen and picture-in-picture depend on your browser.</p><p>Keyboard: <b>/</b> searches, arrow keys move focus, and <b>Esc</b> goes back from playback.</p></section><section class="settings-card"><h2>SheepBox Web <span class="eyebrow">${VERSION} PREVIEW</span></h2><p>Free live television, films and your favorite providers in one place. This is the first browser release, with an expanding set of in-page integrations.</p><p>NASA+ plays here, NFB uses its official embedded player, and Internet Archive entries have published reuse licenses. Other provider cards clearly open the publisher’s website.</p><p>Catalogue snapshot: <b>${e(generated)}</b>. Listings can change. The publisher decides what’s available in your region.</p><div class="button-row"><a class="button secondary" href="https://github.com/sheepman90s/sheepbox-releases/releases/latest" target="_blank" rel="noopener noreferrer">Android TV app ${icon('external')}</a><button class="button ghost" data-action="refresh-nasa" ${state.refreshing?'disabled':''}>${icon('refresh')} Refresh NASA+</button></div><p id="refresh-status"></p></section><section class="settings-card"><h2>Privacy & publishers</h2><p>No SheepBox account, advertising tracker or analytics is used. Your favorites and history stay in this browser unless you export a backup.</p><p>When you watch, your browser connects to the publisher’s video service. Embedded players and publisher websites have their own privacy policies, cookies and advertising.</p><p>SheepBox is independent and is not endorsed by NASA, NFB or the other publishers. Videos remain with their owners; publisher access rules and advertising are retained.</p><p>Internet Archive licenses and source links appear beside the player. NFB’s player is used under its <a href="https://help.nfb.ca/terms/" target="_blank" rel="noopener noreferrer">embedding terms</a>.</p></section></div>`;
}
async function renderWatch(item){
  if(!item){$('main').innerHTML=empty('This title isn’t in the current library.','It may no longer be available. Browse the library or try its publisher.');return;}
  const p=providerById(item.provider);const controller=state.controller;
  const back=item.kind==='live'?'#live':previousBrowse.startsWith('#watch')?'#ondemand':previousBrowse;
  $('main').innerHTML=`<div class="player-layout"><a href="${back}" class="back-link">${icon('back')} Back to browsing</a><div id="player-surface" class="player-surface"><div class="player-loader"><progress aria-label="Loading video"></progress><p>Connecting to ${e(item.providerName)}…</p></div></div><div class="player-info"><div><div class="eyebrow">${item.kind==='live'?'LIVE TV':item.kind==='film'?'FILM':'ON DEMAND'} · ${e(item.providerName)}</div><h1>${e(item.title)}</h1><p id="now-playing">${item.kind==='live'?'Live programming from the original source.':[item.year,durationLabel(item.duration)].filter(Boolean).join(' · ')}</p></div><div class="button-row"><button class="button ghost" data-favorite="${e(item.id)}" aria-pressed="${store.isFavorite(item.id)}">${icon('star')} ${store.isFavorite(item.id)?'Saved':'Save favorite'}</button><a class="button secondary" href="${e(item.official||p?.url||'https://archive.org/')}" target="_blank" rel="noopener noreferrer">Publisher website ${icon('external')}</a></div></div><div class="player-state" id="player-state" role="status">Loading the publisher’s video…</div><div class="player-tools" id="player-tools"><button class="button secondary small" data-action="fullscreen">${icon('full')} Full screen</button><button class="button ghost small" id="captions-toggle" data-action="captions" aria-pressed="${store.data.settings.captions}" disabled>${icon('cc')} Captions</button><button class="button ghost small" id="pip-button" data-action="pip" hidden>${icon('pip')} Picture-in-picture</button><span class="caption-message" id="caption-message">Checking available caption tracks.</span></div><p class="player-description">${e(item.description)}</p><p class="publisher-credit">Source: <a href="${e(item.official||p?.url)}" target="_blank" rel="noopener noreferrer">${e(p?.name??item.providerName)}</a><span id="license-credit"></span></p>${item.mode==='nfb'?'<div class="publisher-note">The video and its controls are supplied by NFB. Availability, captions and access are managed by the publisher. Playback position in this embedded player is not stored in SheepBox.</div>':''}</div>`;
  const hadPosition=store.data.history[item.id]?.position??0;const hadDuration=store.data.history[item.id]?.duration??0;store.record(item.id,hadPosition,hadDuration);
  const status=(message,kind)=>{if(controller.signal.aborted||!$('player-state'))return;$('player-state').classList.toggle('error',kind==='error');$('player-state').textContent=message;if(kind==='error'){$('player-state').insertAdjacentHTML('beforeend','<button class="button ghost small" data-action="retry-player">Retry</button>');}};
  try {
    const offer=await resolvePlayback(item,state.catalog,{signal:controller.signal});if(controller.signal.aborted)return;
    if(offer.nowPlaying)$('now-playing').textContent=`Now: ${offer.nowPlaying}${offer.next?` · Next: ${offer.next}`:''}`;
    if(offer.license)$('license-credit').innerHTML=` · <a href="${e(offer.license)}" target="_blank" rel="noopener noreferrer">Reuse license</a>`;
    if(offer.kind==='embed'){$('captions-toggle').hidden=true;$('caption-message').textContent='Captions and playback settings are in the publisher’s player.';}
    else if(document.pictureInPictureEnabled)$('pip-button').hidden=false;
    const player=new WebPlayer($('player-surface'),{onStatus:status,onProgress:(position,duration)=>{if(item.kind!=='live'&&Number.isFinite(position)&&position>0)store.record(item.id,position,Number.isFinite(duration)?duration:0);},
      onCaptions:available=>{if(controller.signal.aborted||!$('captions-toggle'))return;$('captions-toggle').disabled=!available;$('caption-message').textContent=available?'Publisher caption tracks available.':'No compatible caption tracks were found in this stream.';},
      onEnded:()=>{if(item.mode==='archive-linear'&&!controller.signal.aborted)renderRoute();else{store.removeHistory(item.id);status('Finished. Find your next watch in the library.');}}});
    state.player=player;await player.open(offer,{position:item.kind==='live'?0:store.resume(item.id),captions:store.data.settings.captions,title:item.title});
  }catch(error){if(controller.signal.aborted)return;$('player-surface').innerHTML=`<div class="player-loader">${icon('film')}<p>The video couldn’t be opened.</p></div>`;status(error.name==='AbortError'?'The publisher took too long to respond. Retry, or use its website.':error instanceof TypeError?'The publisher could not be reached. Retry, or open its website.':error.message,'error');}
}
function renderRoute(){
  if(!state.catalog)return;
  clearTimeout(filterTimer);
  state.controller?.abort();state.player?.stop();state.player=null;
  const previous=state.route;state.route=parseRoute(location.hash);if(previous.name!=='watch')previousBrowse=`#${previous.name}${previous.id?`/${encodeURIComponent(previous.id)}`:''}`;
  state.controller=new AbortController();state.limit=36;state.filter={};
  if(state.route.name==='search')state.filter.query=state.route.id;
  renderNavigation();$('global-search').value=state.route.name==='search'?state.route.id:'';
  document.title=`${({home:'Home',live:'Live TV',ondemand:'On Demand',favorites:'Favorites',providers:'Providers',settings:'Settings',history:'History',search:'Search'}[state.route.name]??state.byId.get(state.route.id)?.title??providerById(state.route.id)?.name??'Watch')} · SheepBox`;
  switch(state.route.name){case 'live':case 'ondemand':renderLibrary();break;case 'provider':renderProvider(providerById(state.route.id));break;case 'series':renderSeries(state.byId.get(state.route.id));break;case 'favorites':renderFavorites();break;case 'providers':renderProviders();break;case 'search':renderSearch();break;case 'settings':renderSettings();break;case 'history':renderHistory();break;case 'watch':renderWatch(state.byId.get(state.route.id));break;default:renderHome();}
  window.scrollTo({top:0,behavior:'instant'});
}

let filterTimer;
document.addEventListener('input',event=>{
  if(event.target.id==='provider-query'){clearTimeout(filterTimer);filterTimer=setTimeout(renderProviderResults,100);}
  if(event.target.id==='library-query'){state.filter.query=event.target.value;state.limit=36;clearTimeout(filterTimer);filterTimer=setTimeout(renderResults,130);}
});
document.addEventListener('change',async event=>{
  const id=event.target.id;
  if(id==='provider-playback'){renderProviderResults();return;}
  if(['library-provider','library-category','library-kind','library-sort'].includes(id)){
    state.filter[{ 'library-provider':'provider','library-category':'category','library-kind':'kind','library-sort':'sort'}[id]]=event.target.value;state.limit=36;
    if(id==='library-provider'){
      state.filter.category='';const options=[...new Set(currentLibrary().filter(x=>!state.filter.provider||x.provider===state.filter.provider).flatMap(x=>x.categories??[]))].sort();
      $('library-category').innerHTML='<option value="">All categories</option>'+options.map(x=>`<option>${e(x)}</option>`).join('');
    }renderResults();return;
  }
  if(id==='prefer-captions'){store.data.settings.captions=event.target.checked;store.save();toast('Caption preference saved.');}
  if(id==='import-backup'){
    const file=event.target.files?.[0];if(!file)return;
    try{if(file.size>1_000_000)throw Error('Choose a backup smaller than 1 MB.');const count=store.import(JSON.parse(await file.text()));renderRoute();toast(`Backup merged · ${count} saved favorites.`);}catch(error){toast(error instanceof SyntaxError?'That file is not valid JSON. Choose a SheepBox web backup.':error.message);}
  }
});
function toggleFavorite(id){
  const saved=store.toggleFavorite(id);
  for(const button of document.querySelectorAll('[data-favorite]'))if(button.dataset.favorite===id){button.classList.toggle('saved',saved);button.setAttribute('aria-pressed',String(saved));const title=state.byId.get(id)?.title??providerById(id.slice(9))?.name??'item';button.setAttribute('aria-label',`${saved?'Remove':'Save'} ${title} ${saved?'from':'to'} favorites`);if(button.classList.contains('button'))button.innerHTML=icon('star')+(saved?' Saved':' Save favorite');}
  renderNavigation();toast(saved?'Saved to your favorites.':'Removed from favorites.');
  if(state.route.name==='favorites')renderFavorites();
}
async function refreshCatalogue(){
  if(state.refreshing)return;state.refreshing=true;
  for(const button of document.querySelectorAll('[data-action="refresh-nasa"]'))button.disabled=true;
  try {
    const catalog=await refreshNasa(state.catalog,{onProgress:(done,total,count)=>{if($('refresh-status'))$('refresh-status').textContent=`Loading NASA+ · ${done}/${total} pages · ${count} videos`;}});
    try {const cache=await caches.open('sheepbox-library-data-v1');await cache.put(new URL('../data/browser-catalog.json',import.meta.url),new Response(JSON.stringify({...catalog,baseGeneratedAt:state.catalog.generatedAt}),{headers:{'Content-Type':'application/json'}}));}catch{}
    indexCatalog(catalog);if(state.route.name!=='watch')renderRoute();toast('NASA+ catalogue refreshed and saved.');
  }catch{toast('NASA+ could not finish refreshing. Your saved catalogue is still available.');}
  finally{state.refreshing=false;for(const button of document.querySelectorAll('[data-action="refresh-nasa"]'))button.disabled=false;if($('refresh-status'))$('refresh-status').textContent='';}
}
document.addEventListener('click',async event=>{
  const favorite=event.target.closest('[data-favorite]');if(favorite){event.preventDefault();toggleFavorite(favorite.dataset.favorite);return;}
  const external=event.target.closest('[data-open-provider]');if(external)store.record(`provider:${external.dataset.openProvider}`);
  const history=event.target.closest('[data-remove-history]');if(history){store.removeHistory(history.dataset.removeHistory);renderHistory();toast('Removed from history.');return;}
  const action=event.target.closest('[data-action]')?.dataset.action;if(!action)return;
  switch(action){
    case 'more':{const old=state.limit;state.limit+=36;renderResults();document.querySelectorAll('.media-card .card-art')[old]?.focus({preventScroll:true});break;}
    case 'clear-filters':state.filter={};state.limit=36;if(state.route.name==='live'||state.route.name==='ondemand')renderLibrary();else if(state.route.name==='provider')renderProvider(providerById(state.route.id));else if(state.route.name==='favorites')renderFavorites();else renderSearch();break;
    case 'retry-player':renderRoute();break;
    case 'captions':store.data.settings.captions=!store.data.settings.captions;store.save();state.player?.captions(store.data.settings.captions);$('captions-toggle')?.setAttribute('aria-pressed',String(store.data.settings.captions));break;
    case 'fullscreen':try{await state.player?.fullscreen();}catch{toast('Full screen is unavailable in this browser.');}break;
    case 'pip':try{if(!await state.player?.pictureInPicture())toast('Picture-in-picture is unavailable for this video.');}catch{toast('Press Play before opening picture-in-picture.');}break;
    case 'refresh-nasa':refreshCatalogue();break;
    case 'export':{const blob=new Blob([JSON.stringify(store.backup(),null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`sheepbox-web-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Your SheepBox web backup is ready.');break;}
    case 'clear-library':$('confirm-dialog').returnValue='cancel';$('confirm-dialog').showModal();break;
  }
});
$('confirm-dialog').addEventListener('close',()=>{if($('confirm-dialog').returnValue==='clear'){store.clear();renderRoute();toast('This browser’s favorites and history were cleared.');}});
$('search-form').addEventListener('submit',event=>{event.preventDefault();navigate(`#search/${encodeURIComponent($('global-search').value.trim())}`);});
$('search-icon').innerHTML=icon('search');$('settings-link').innerHTML=icon('settings');
document.addEventListener('error',event=>{
  const img=event.target;if(!(img instanceof HTMLImageElement)||!img.closest('.card-art'))return;
  const item=state.byId.get(img.closest('[data-item-id]')?.dataset.itemId);const attempts=Number(img.dataset.attempt??0);const alternate=item?.imageAlternatives?.[attempts];
  if(safeUrl(alternate)&&attempts<4){img.dataset.attempt=String(attempts+1);img.src=alternate;}else img.remove();
},true);
document.querySelector('.skip-link').addEventListener('click',event=>{event.preventDefault();$('main').focus();});
document.addEventListener('keydown',event=>{
  if(event.target.matches?.('input,textarea,select')||event.ctrlKey||event.metaKey||event.altKey)return;
  if(event.key==='/'){event.preventDefault();$('global-search').focus();return;}
  if(event.key==='Escape'&&state.route.name==='watch'&&!document.fullscreenElement){event.preventDefault();navigate(state.byId.get(state.route.id)?.kind==='live'?'#live':'#ondemand');return;}
  if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)||event.target.closest?.('.player-surface'))return;
  const elements=[...document.querySelectorAll('a[href],button:not(:disabled),input,select')].filter(el=>el.getClientRects().length&&!el.closest('[hidden]')&&!el.classList.contains('skip-link'));
  const active=document.activeElement;const rect=active?.getBoundingClientRect();if(!rect||!elements.includes(active)){elements.find(el=>el.closest('main'))?.focus();return;}
  const horizontal=event.key==='ArrowLeft'||event.key==='ArrowRight';const sign=event.key==='ArrowLeft'||event.key==='ArrowUp'?-1:1;
  const cx=rect.x+rect.width/2,cy=rect.y+rect.height/2;
  const candidates=elements.filter(el=>el!==active).map(el=>{const r=el.getBoundingClientRect();const dx=r.x+r.width/2-cx,dy=r.y+r.height/2-cy;return {el,main:(horizontal?dx:dy)*sign,cross:Math.abs(horizontal?dy:dx)};}).filter(x=>x.main>4).sort((a,b)=>(a.main+2*a.cross)-(b.main+2*b.cross));
  if(candidates.length){event.preventDefault();candidates[0].el.focus();candidates[0].el.scrollIntoView({block:'nearest',inline:'nearest'});}
});
window.addEventListener('hashchange',renderRoute);window.addEventListener('online',updateConnection);window.addEventListener('offline',updateConnection);updateConnection();
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;$('install-button').hidden=false;});
$('install-button').addEventListener('click',async()=>{if(!installPrompt)return;await installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;$('install-button').hidden=true;});
window.addEventListener('appinstalled',()=>$('install-button').hidden=true);
window.addEventListener('pagehide',()=>{if(state.player?.video&&state.route.name==='watch'){const v=state.player.video;if(state.byId.get(state.route.id)?.kind!=='live')store.record(state.route.id,v.currentTime,Number.isFinite(v.duration)?v.duration:0);}});

async function start(){
  try {
    let catalog=await loadCatalog();
    try{const cache=await caches.open('sheepbox-library-data-v1');const response=await cache.match(new URL('../data/browser-catalog.json',import.meta.url));const saved=response?await response.json():null;if(saved?.schema===1&&saved.baseGeneratedAt===catalog.generatedAt&&Array.isArray(saved.items)&&Array.isArray(saved.live))catalog=saved;}catch{}
    indexCatalog(catalog);renderRoute();
  }catch{$('main').innerHTML=empty('Your library couldn’t load.','Check your connection and reload SheepBox. Your favorites are still saved.','<button class="button" data-action="reload-page">Try again</button>');$('main').querySelector('button').addEventListener('click',()=>location.reload());}
  if('serviceWorker' in navigator){try{const registration=await navigator.serviceWorker.register(new URL('../sw.js',import.meta.url),{scope:new URL('../',import.meta.url).pathname});
    function showUpdate(){if(registration.waiting&&navigator.serviceWorker.controller){$('update-banner').hidden=false;$('reload-update').onclick=()=>{registration.waiting?.postMessage('SKIP_WAITING');};}}
    showUpdate();registration.addEventListener('updatefound',()=>{const worker=registration.installing;worker?.addEventListener('statechange',()=>{if(worker.state==='installed')showUpdate();});});let refreshing=false;navigator.serviceWorker.addEventListener('controllerchange',()=>{if(!refreshing&&$('update-banner').hidden===false){refreshing=true;location.reload();}});
  }catch{}}
}
start();
