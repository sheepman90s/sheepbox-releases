import {escapeHtml as e,fold} from './core.mjs';
import {mountGlobe} from './globe.mjs';
import {worldDirectory,worldSelection,countryItems,worldResults} from './world-content.mjs';

const modes={tv:{label:'Live TV',noun:'channels',color:[.35,.7,1,1],colorName:'Blue'},cameras:{label:'Web Cams',noun:'webcams',color:[.125,1,.933,1],colorName:'Turquoise'}};
export async function renderWorldView(container,{catalog,selected='',webcamsOnly=false,signal,renderCards,onRouteChange=()=>{}}) {
  container.innerHTML='<div class="initial-loading"><h1>Opening World View…</h1><p>Loading the country map and your complete channel directory.</p><progress aria-label="Loading world directory"></progress></div>';
  try{
    const response=await fetch(new URL('../data/world-countries.json',import.meta.url),{signal});
    if(!response.ok)throw Error('The country map could not be loaded.');
    const countries=await response.json();if(signal.aborted)return;
    const directory=worldDirectory(catalog,countries),initial=worldSelection(selected,{webcamsOnly});
    let mode=initial.mode,country=['all','global'].includes(initial.country)||Object.hasOwn(countries,initial.country)?initial.country:'all';
    let limit=24,provider='',category='',query='',globe;
    const codes=Object.keys(countries).sort((a,b)=>countries[a].name.localeCompare(countries[b].name));
    const count=(code,kind=mode)=>countryItems(directory,kind,code).length;
    const available=()=>[...(mode==='tv'?directory.tv:directory.cams).keys()];
    const name=code=>code==='all'?'All countries':code==='global'?'Global & other channels':countries[code].name;
    container.innerHTML=`<a class="back-link" href="#home">‹ Home</a><div class="page-heading"><div><div class="eyebrow">SHEEPBOX</div><h1>${webcamsOnly?'Web Cams':'World View'}</h1><p>${webcamsOnly?'Explore the same webcam directory as the Android app.':'Choose Live TV or Web Cams, then select a country on the globe or in the list.'}</p></div></div>${webcamsOnly?'':`<div class="world-mode-switch" role="group" aria-label="Explore Live TV or Web Cams"><button class="button world-mode-button" id="world-tv-tab">Live TV <span>${directory.channels.length.toLocaleString()}</span></button><button class="button world-mode-button" id="world-cameras-tab">Web Cams <span>${directory.cameras.length.toLocaleString()}</span></button><p id="world-mode-summary"></p></div>`}<section class="world-layout${webcamsOnly?' world-cameras-only':''}"><aside class="world-country-panel"><label for="world-country-query">Find a country</label><input id="world-country-query" type="search" placeholder="Search countries…" autocomplete="off"><label class="world-availability-filter"><input id="world-available-only" type="checkbox" checked><span id="world-available-label"></span></label><p class="world-count" id="world-country-count"></p><div class="world-country-list" id="world-country-list" aria-label="Countries"></div></aside><div class="world-main">${webcamsOnly?'':`<div class="world-visual"><div class="world-stage world-globe" id="world-stage" aria-label="Interactive Earth globe" aria-describedby="world-legend"></div><div class="world-legend" id="world-legend"></div><div class="world-toolbar"><button class="button secondary small" id="world-zoom-in" aria-label="Zoom in">＋</button><button class="button secondary small" id="world-zoom-out" aria-label="Zoom out">−</button><button class="button ghost small" id="world-reset">Reset globe</button><span id="world-hover" class="caption-message" role="status">Drag to rotate · Select a country · Scroll to zoom</span></div></div>`}<section class="world-selection" aria-label="Selected country channels and cameras"><div class="world-selection-heading"><div><div class="eyebrow" id="world-content-type"></div><h2 id="world-selection-name"></h2></div><a id="world-open-map" class="text-button" ${webcamsOnly?'':'hidden'} href="#world/cameras/all">View on globe ↗</a></div><p class="result-note" id="world-item-count" role="status"></p><div class="world-content-filters"><label class="sr-only" for="world-content-query">Search selected country</label><input id="world-content-query" class="filter-input" type="search"><label class="sr-only" for="world-provider">Provider</label><select id="world-provider"></select><label class="sr-only" for="world-category">Category</label><select id="world-category"></select></div><div id="world-content"></div></section><p class="world-credit">Country associations follow listed broadcaster/provider metadata; global and unlisted-country channels are grouped separately. Regional access still comes from each publisher.<br>Earth: NASA Blue Marble · Map: Natural Earth · Webcam directory: Famelack, MIT. <a href="./data/world-view-sources.txt" target="_blank" rel="noopener">Map credits</a> · <a href="./data/FAMELACK-LICENSE.txt" target="_blank" rel="noopener">Directory license</a></p></div></section>`;
    const find=id=>container.querySelector('#'+id);
    function route(){
      const id=webcamsOnly?country:`${mode}/${country}`;
      history.replaceState(null,'',`#${webcamsOnly?'webcams':'world'}/${id}`);onRouteChange(id);
    }
    function countryList(){
      const search=fold(find('world-country-query').value),onlyAvailable=find('world-available-only').checked;
      const matches=codes.filter(code=>(!onlyAvailable||count(code)>0||code===country)&&fold(`${countries[code].name} ${code}`).includes(search));
      find('world-country-count').textContent=`${matches.length} ${matches.length===1?'country or territory':'countries & territories'}`;
      const row=(code,label)=>`<button class="world-country${country===code?' selected':''}${count(code)?mode==='tv'?' has-tv':' has-webcams':''}" data-world-country="${code}" aria-pressed="${country===code}"><span>${e(label)}</span><small>${count(code,'tv').toLocaleString()} TV · ${count(code,'cameras').toLocaleString()} cams</small></button>`;
      find('world-country-list').innerHTML=(!search?row('all','All countries')+(count('global')||country==='global'?row('global',mode==='tv'?'Global & other channels':'Other locations'):''):'')+matches.map(code=>row(code,countries[code].name)).join('');
    }
    function filters(){
      const items=countryItems(directory,mode,country),providers=new Map(items.map(item=>[item.provider,item.providerName]));
      if(!providers.has(provider))provider='';
      find('world-provider').innerHTML='<option value="">All providers</option>'+[...providers].sort((a,b)=>a[1].localeCompare(b[1])).map(([id,label])=>`<option value="${e(id)}"${id===provider?' selected':''}>${e(label)}</option>`).join('');
      find('world-provider').hidden=mode==='cameras';
      const categories=[...new Set(items.filter(item=>!provider||item.provider===provider).flatMap(item=>item.categories??[]))].sort((a,b)=>a.localeCompare(b));
      if(!categories.includes(category))category='';
      find('world-category').innerHTML='<option value="">All categories</option>'+categories.map(value=>`<option${value===category?' selected':''}>${e(value)}</option>`).join('');
      find('world-content-query').placeholder=mode==='tv'?'Search channels…':'Search webcams…';
    }
    function content(){
      const items=worldResults(directory,{mode,country,provider,category,query});
      find('world-content-type').textContent=modes[mode].label;
      find('world-selection-name').textContent=name(country);find('world-open-map').href='#world/cameras/'+country;
      find('world-item-count').textContent=`${items.length.toLocaleString()} ${modes[mode].noun}${query||provider||category?' match your filters':''}`;
      const alternate=mode==='tv'?count(country,'cameras'):count(country,'tv');
      find('world-content').innerHTML=items.length?`${renderCards(items.slice(0,limit))}${items.length>limit?`<button class="button secondary" id="world-load-more">Show more · ${Math.min(limit,items.length)} of ${items.length.toLocaleString()}</button>`:''}`:`<div class="empty-state"><h3>${query||provider||category?'No matching results.':`No ${modes[mode].noun} listed for this country yet.`}</h3><p>${mode==='tv'?'Choose All countries, another country, or Web Cams.':'Choose another country or clear your filters. Cameras can be offline or unavailable by region.'}</p>${!webcamsOnly&&alternate?`<button class="button secondary" id="world-alternate">View ${alternate.toLocaleString()} ${mode==='tv'?'webcams':'TV channels'}</button>`:''}<a class="text-button" href="#providers">Browse all providers ↗</a></div>`;
      find('world-load-more')?.addEventListener('click',()=>{limit+=24;content();},{signal});
      find('world-alternate')?.addEventListener('click',()=>setMode(mode==='tv'?'cameras':'tv'),{signal});
    }
    function view(){
      find('world-available-label').textContent=`Only countries with ${mode==='tv'?'live TV':'webcams'}`;
      if(!webcamsOnly){
        for(const [key,id] of [['tv','world-tv-tab'],['cameras','world-cameras-tab']]){find(id).classList.toggle('selected',mode===key);find(id).classList.toggle('secondary',mode!==key);find(id).setAttribute('aria-pressed',String(mode===key));}
        find('world-mode-summary').textContent=mode==='tv'?'Play channels directly from the selected country. Global and unlisted-country channels remain available under All countries.':'Watch original webcam players from the selected country.';
        find('world-legend').innerHTML=`<span><i class="world-legend-key${mode==='tv'?' tv':''}" aria-hidden="true"></i>${modes[mode].colorName}: ${available().length} ${available().length===1?'country':'countries'} with ${mode==='tv'?'live TV':'webcams'}</span><span><i class="world-legend-key selected" aria-hidden="true"></i>Yellow: selected country</span>`;
      }
      countryList();filters();content();
    }
    function select(code){
      if(!['all','global'].includes(code)&&!Object.hasOwn(countries,code))return;
      country=code;limit=24;provider='';category='';query='';find('world-content-query').value='';route();view();
      globe?.select(country);if(['all','global'].includes(country))globe?.reset();
    }
    function setMode(next){
      if(webcamsOnly||!modes[next]||next===mode)return;
      mode=next;limit=24;provider='';category='';query='';find('world-content-query').value='';route();view();
      globe?.setAvailability(available(),modes[mode].color);
    }
    find('world-country-list').addEventListener('click',event=>{const code=event.target.closest('[data-world-country]')?.dataset.worldCountry;if(code)select(code);},{signal});
    find('world-country-query').addEventListener('input',countryList,{signal});find('world-available-only').addEventListener('change',countryList,{signal});
    find('world-content-query').addEventListener('input',event=>{query=event.target.value;limit=24;content();},{signal});
    find('world-provider').addEventListener('change',event=>{provider=event.target.value;category='';limit=24;filters();content();},{signal});
    find('world-category').addEventListener('change',event=>{category=event.target.value;limit=24;content();},{signal});
    find('world-tv-tab')?.addEventListener('click',()=>setMode('tv'),{signal});find('world-cameras-tab')?.addEventListener('click',()=>setMode('cameras'),{signal});
    route();view();
    if(!webcamsOnly){
      globe=mountGlobe(find('world-stage'),{countries,availableCountries:available(),outlineColor:modes[mode].color,selected:country,signal,onSelect:place=>select(place.code),onHover:place=>{find('world-hover').textContent=place?`${place.name} · ${count(place.code,'tv')} TV · ${count(place.code,'cameras')} cams`:'Drag to rotate · Select a country · Scroll to zoom';}});
      find('world-zoom-in').addEventListener('click',()=>globe.zoom(1),{signal});find('world-zoom-out').addEventListener('click',()=>globe.zoom(-1),{signal});find('world-reset').addEventListener('click',()=>globe.reset(),{signal});
      signal.addEventListener('abort',()=>globe.destroy(),{once:true});
    }
  }catch(error){if(!signal.aborted)container.innerHTML=`<a class="back-link" href="#home">‹ Home</a><div class="empty-state"><h1>World View couldn’t open.</h1><p>${e(error.message)}</p><button class="button" data-action="retry-player">Retry</button></div>`;}
}
