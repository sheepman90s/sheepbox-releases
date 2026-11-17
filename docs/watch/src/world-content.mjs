import {filterItems} from './core.mjs';

export function countryCode(value) {
  const code=typeof value==='string'?value.trim().toLowerCase():'';
  return code==='gb'?'uk':/^[a-z]{2}$/.test(code)?code:'';
}
export function itemCountries(item,countries) {
  const values=Array.isArray(item.countries)&&item.countries.length?item.countries:[item.country];
  return [...new Set(values.map(countryCode).filter(code=>code&&Object.hasOwn(countries,code)))];
}
export function worldDirectory(catalog,countries) {
  const channels=(catalog.live??[]).filter(item=>item.kind==='live');
  const cameras=catalog.cameras??[];
  const tv=new Map(),cams=new Map();
  const add=(map,item)=>{for(const code of itemCountries(item,countries)){if(!map.has(code))map.set(code,[]);map.get(code).push(item);}};
  for(const channel of channels)add(tv,channel);for(const camera of cameras)add(cams,camera);
  return {countries,channels,cameras,tv,cams,globalTV:channels.filter(item=>!itemCountries(item,countries).length),globalCams:cameras.filter(item=>!itemCountries(item,countries).length)};
}
export function worldSelection(value,{webcamsOnly=false}={}) {
  const parts=String(value??'').toLowerCase().split('/');
  const explicit=['tv','cameras'].includes(parts[0]);
  const mode=webcamsOnly?'cameras':explicit?parts[0]:'tv';
  const raw=explicit?parts[1]:parts[0];
  return {mode,country:['all','global'].includes(raw)?raw:countryCode(raw)||'all'};
}
export function countryItems(directory,mode,code) {
  if(code==='all')return mode==='tv'?directory.channels:directory.cameras;
  if(code==='global')return mode==='tv'?directory.globalTV:directory.globalCams;
  return (mode==='tv'?directory.tv:directory.cams).get(code)??[];
}
export function worldResults(directory,{mode,country,query='',provider='',category=''}={}) {
  return filterItems(countryItems(directory,mode,country),{query,provider,category}).sort((a,b)=>a.title.localeCompare(b.title,undefined,{numeric:true,sensitivity:'base'}));
}
