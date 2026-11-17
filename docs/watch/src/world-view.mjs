import {escapeHtml as e,fold} from './core.mjs';
import {mountGlobe} from './globe.mjs';

export async function renderWorldView(container,{catalog,selected='',webcamsOnly=false,signal,renderCards}) {
  container.innerHTML='<div class="initial-loading"><h1>Opening World View…</h1><p>Loading the same country map and Earth imagery as the TV app.</p><progress aria-label="Loading world directory"></progress></div>';
  try {
    const response=await fetch(new URL('../data/world-countries.json',import.meta.url),{signal});
    if(!response.ok)throw Error('The country map could not be loaded.');
    const countries=await response.json();if(signal.aborted)return;
    const codes=Object.keys(countries).sort((a,b)=>countries[a].name.localeCompare(countries[b].name));
    let country=countries[selected]?selected:webcamsOnly?'us':'global';let mode=country==='global'?'tv':'cameras';let limit=24;let globe;
    const cameras=catalog.cameras??[];
    const cameraCounts=new Map();for(const camera of cameras)cameraCounts.set(camera.country,(cameraCounts.get(camera.country)??0)+1);
    const cameraCount=code=>cameraCounts.get(code)??0;
    const webcamCountries=codes.filter(code=>cameraCount(code)>0);
    const channels=code=>catalog.live.filter(item=>code==='global'?!item.country:item.country===code);
    container.innerHTML=`<a class="back-link" href="#home">‹ Home</a><div class="page-heading"><div><div class="eyebrow">SHEEPBOX</div><h1>${webcamsOnly?'Web Cams':'World View'}</h1><p>${webcamsOnly?'Explore the same webcam directory as the Android app.':'Drag the globe, then select a country. Choose a webcam or an available TV channel.'}</p></div></div><section class="world-layout${webcamsOnly?' world-cameras-only':''}"><aside class="world-country-panel"><label for="world-country-query">Find a country</label><input id="world-country-query" type="search" placeholder="Search countries…" autocomplete="off"><p class="world-count" id="world-country-count"></p><div class="world-country-list" id="world-country-list" aria-label="Countries"></div></aside><div class="world-main">${webcamsOnly?'':`<div class="world-stage" id="world-stage" aria-label="Interactive Earth globe" aria-describedby="world-legend"></div><div class="world-legend" id="world-legend"><span><i class="world-legend-key" aria-hidden="true"></i>Turquoise: ${webcamCountries.length} countries with webcams listed</span><span><i class="world-legend-key selected" aria-hidden="true"></i>Yellow: selected country</span></div><div class="world-toolbar"><button class="button secondary small" id="world-zoom-in" aria-label="Zoom in">＋</button><button class="button secondary small" id="world-zoom-out" aria-label="Zoom out">−</button><button class="button ghost small" id="world-reset">Reset globe</button><span id="world-hover" class="caption-message" role="status">Drag to rotate · Select a country · Scroll to zoom</span></div>`}<section class="world-selection" aria-live="polite"><div class="world-selection-heading"><h2 id="world-selection-name"></h2><a id="world-open-map" class="text-button" href="#world/us" ${webcamsOnly?'':'hidden'}>View on globe ↗</a></div><div class="tabs" aria-label="Country content"><button class="tab active" id="world-cameras-tab" aria-pressed="true">Web Cams</button><button class="tab" id="world-tv-tab" aria-pressed="false">Live TV</button></div><label class="sr-only" for="world-content-query">Search selected country</label><input id="world-content-query" class="filter-input" type="search" placeholder="Search this country’s cameras…"><div id="world-content"></div></section><p class="world-credit">Earth: NASA Blue Marble. Country map: Natural Earth. Webcam directory: Famelack, MIT license. Map boundaries are for browsing. <a href="./data/world-view-sources.txt" target="_blank" rel="noopener">Map credits</a> · <a href="./data/FAMELACK-LICENSE.txt" target="_blank" rel="noopener">Directory license</a></p></div></section>`;
    const find=id=>container.querySelector('#'+id);
    function countryList() {
      const query=fold(find('world-country-query').value);
      const matches=codes.filter(code=>fold(countries[code].name).includes(query));
      find('world-country-count').textContent=`${matches.length} countries & territories`;
      find('world-country-list').innerHTML=matches.map(code=>`<button class="world-country${country===code?' selected':''}${cameraCount(code)?' has-webcams':''}" data-world-country="${e(code)}" aria-pressed="${country===code}"><span>${e(countries[code].name)}</span><small>${cameraCount(code)} cams · ${channels(code).length} TV</small></button>`).join('')+(!query?`<button class="world-country${country==='global'?' selected':''}" aria-pressed="${country==='global'}" data-world-country="global">Global channels<small>Space, science and international programming</small></button>`:'');
    }
    function content() {
      const query=fold(find('world-content-query').value);
      const items=(mode==='cameras'?cameras.filter(item=>item.country===country):channels(country)).filter(item=>fold(`${item.title} ${item.categories.join(' ')}`).includes(query));
      const countryName=country==='global'?'Global channels':countries[country].name;
      find('world-selection-name').textContent=countryName;
      find('world-open-map').href='#world/'+country;
      find('world-cameras-tab').classList.toggle('active',mode==='cameras');find('world-cameras-tab').setAttribute('aria-pressed',String(mode==='cameras'));
      find('world-tv-tab').classList.toggle('active',mode==='tv');find('world-tv-tab').setAttribute('aria-pressed',String(mode==='tv'));
      find('world-content-query').placeholder=mode==='cameras'?'Search this country’s cameras…':'Search this country’s channels…';
      const noun=mode==='cameras'?'webcams':'TV channels';
      find('world-content').innerHTML=items.length?`<p class="result-note">${items.length} ${noun}. ${mode==='cameras'?'The original YouTube player checks whether each camera is online and embeddable.':'Country-specific channels in the current browser preview.'}</p>${renderCards(items.slice(0,limit))}${items.length>limit?'<button class="button secondary" id="world-load-more">Show more</button>':''}`:`<div class="empty-state"><h3>No ${noun} ${query?'matched your search.':'are listed here yet.'}</h3><p>${mode==='tv'?'Try Global channels, Web Cams or the provider directory.':'Try another country or clear your search. Some cameras may be offline or unavailable in your region.'}</p><a class="button secondary" href="#providers">Browse providers</a></div>`;
      find('world-load-more')?.addEventListener('click',()=>{limit+=24;content();},{signal});
    }
    function select(code) {
      if(code!=='global'&&!countries[code])return;
      country=code;limit=24;find('world-content-query').value='';
      if(code==='global')mode='tv';
      else if(mode==='tv'&&!channels(code).length&&cameraCount(code))mode='cameras';
      else if(mode==='cameras'&&!cameraCount(code)&&channels(code).length)mode='tv';
      for(const button of find('world-country-list').querySelectorAll('button')){const active=button.dataset.worldCountry===country;button.classList.toggle('selected',active);button.setAttribute('aria-pressed',String(active));}
      history.replaceState(null,'',`#${webcamsOnly?'webcams':'world'}/${country}`);
      globe?.select(country);content();
    }
    find('world-country-list').addEventListener('click',event=>{const code=event.target.closest('[data-world-country]')?.dataset.worldCountry;if(code)select(code);},{signal});
    find('world-country-query').addEventListener('input',countryList,{signal});
    find('world-content-query').addEventListener('input',()=>{limit=24;content();},{signal});
    find('world-cameras-tab').addEventListener('click',()=>{mode='cameras';limit=24;content();},{signal});
    find('world-tv-tab').addEventListener('click',()=>{mode='tv';limit=24;content();},{signal});
    countryList();content();
    if(!webcamsOnly){
      find('world-stage').classList.add('world-globe');
      globe=await mountGlobe(find('world-stage'),{countries,webcamCountries,selected:country,signal,onSelect:place=>select(place.code),onHover:place=>{find('world-hover').textContent=place?.name??'Drag to rotate · Select a country · Scroll to zoom';}});
      if(signal.aborted){globe?.destroy();return;}
      find('world-zoom-in').addEventListener('click',()=>globe?.zoom(1),{signal});
      find('world-zoom-out').addEventListener('click',()=>globe?.zoom(-1),{signal});
      find('world-reset').addEventListener('click',()=>globe?.reset(),{signal});
      signal.addEventListener('abort',()=>globe?.destroy(),{once:true});
    }
  } catch(error) {
    if(!signal.aborted)container.innerHTML=`<a class="back-link" href="#home">‹ Home</a><div class="empty-state"><h1>World View couldn’t open.</h1><p>${e(error.message)}</p><button class="button" data-action="retry-player">Retry</button></div>`;
  }
}
