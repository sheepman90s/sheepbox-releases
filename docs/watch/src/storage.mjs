// Keep the original key so existing web libraries migrate in place.
const KEY='sheepbox-web-library-v1';
const validId=id=>typeof id==='string'&&id.length<=240&&/^[A-Za-z0-9][A-Za-z0-9:._-]*$/.test(id)&&!['constructor','prototype'].includes(id);
const own=(map,id)=>Object.hasOwn(map,id)?map[id]:undefined;
const newest=history=>Object.fromEntries(Object.entries(history).sort((a,b)=>b[1].at-a[1].at).slice(0,1000));
const empty=()=>({schema:2,favorites:[],history:{},marks:{},hidden:[],settings:{captions:false,theme:'Purple',autoplayNext:false}});
export function validateBackup(value) {
  if(!value||![1,2].includes(value.schema)||!Array.isArray(value.favorites)||value.favorites.length>100000)throw Error('Choose a SheepBox web backup file.');
  const favorites=[...new Set(value.favorites.filter(validId))];
  if(favorites.length!==new Set(value.favorites).size)throw Error('This backup contains invalid favorites.');
  const history=newest(Object.fromEntries(Object.entries(value.history??{}).filter(([id,v])=>validId(id)&&v&&Number.isFinite(v.at)&&v.at>=0&&Number.isFinite(v.position)&&v.position>=0&&v.position<604800)
    .map(([id,v])=>[id,{at:v.at,position:v.position,duration:Number.isFinite(v.duration)&&v.duration>0?Math.min(v.duration,604800):0}])));
  const marks=Object.fromEntries(Object.entries(value.marks??{}).filter(([id,v])=>validId(id)&&v&&typeof v.watched==='boolean'&&Number.isFinite(v.at)&&v.at>=0).map(([id,v])=>[id,{watched:v.watched,at:v.at}]));
  if(Object.keys(marks).length>200000)throw Error('This backup contains too many watched entries.');
  for(const [id,mark] of Object.entries(marks))if(mark.watched||mark.at>=(history[id]?.at??0))delete history[id];
  const hidden=[...new Set((Array.isArray(value.hidden)?value.hidden:[]).filter(validId))];if(hidden.length>100000)throw Error('Too many hidden items.');
  return {schema:2,favorites,history,marks,hidden,settings:{captions:value.settings?.captions===true,theme:['Purple','Emerald','Ocean','Amber'].includes(value.settings?.theme)?value.settings.theme:'Purple',autoplayNext:value.settings?.autoplayNext===true}};
}
export class LibraryStore {
  constructor(storage) {
    this.storage=storage;this.persistent=!!storage;this.clock=0;
    let raw;try{raw=storage?.getItem(KEY);}catch{this.persistent=false;this.storage=undefined;}
    try {this.data=validateBackup(JSON.parse(raw??'null'));}catch {this.data=empty();}
  }
  save(){try{this.storage?.setItem(KEY,JSON.stringify(this.data));}catch{this.persistent=false;}return this.data;}
  isFavorite(id){return this.data.favorites.includes(id);}
  toggleFavorite(id){if(!validId(id))return false;this.data.favorites=this.isFavorite(id)?this.data.favorites.filter(x=>x!==id):[...this.data.favorites,id];this.save();return this.isFavorite(id);}
  isWatched(id,episodes){return episodes?.length?episodes.every(key=>own(this.data.marks,key)?.watched===true):own(this.data.marks,id)?.watched===true;}
  setWatched(id,watched,episodes=[]){
    if(!validId(id))return;const ids=[id,...episodes.filter(validId)];
    const at=this.clock=Math.max(Date.now(),this.clock+1,...ids.map(key=>(own(this.data.marks,key)?.at??0)+1));
    for(const key of ids){this.data.marks[key]={watched:!!watched,at};delete this.data.history[key];}this.save();
  }
  isHidden(id){return this.data.hidden.includes(id);}
  hide(id){if(validId(id)&&!this.isHidden(id)){this.data.hidden.push(id);this.save();}}
  restore(id){this.data.hidden=this.data.hidden.filter(key=>key!==id);this.save();}
  restoreAll(){this.data.hidden=[];this.save();}
  playbackSession(id){return own(this.data.marks,id)?.at??0;}
  record(id,position=0,duration=0,session){
    if(!validId(id)||session!==undefined&&session!==this.playbackSession(id))return;
    if(this.isWatched(id))return;
    position=Math.max(0,Math.min(Number(position)||0,604799));duration=Math.max(0,Math.min(Number(duration)||0,604800));
    if(duration>0&&position>=duration*.9){this.setWatched(id,true);return;}
    this.data.history[id]={at:Date.now(),position,duration};this.data.history=newest(this.data.history);this.save();
  }
  finish(id,session){if(session===undefined||session===this.playbackSession(id))this.setWatched(id,true);}
  resume(id){const h=own(this.data.history,id);return !this.isWatched(id)&&h&&h.position>=20&&(!h.duration||h.position<h.duration-20)?h.position:0;}
  removeHistory(id){delete this.data.history[id];this.save();}
  import(value){
    const imported=validateBackup(value);this.data.favorites=[...new Set([...this.data.favorites,...imported.favorites])];
    for(const [id,h] of Object.entries(imported.history))if(!own(this.data.history,id)||h.at>this.data.history[id].at)this.data.history[id]=h;
    for(const [id,m] of Object.entries(imported.marks))if(!own(this.data.marks,id)||m.at>this.data.marks[id].at)this.data.marks[id]=m;
    for(const [id,m] of Object.entries(this.data.marks))if(m.watched||m.at>=(this.data.history[id]?.at??0))delete this.data.history[id];
    this.data.hidden=[...new Set([...this.data.hidden,...imported.hidden])];if(['Purple','Emerald','Ocean','Amber'].includes(value.settings?.theme))this.data.settings.theme=value.settings.theme;if(typeof value.settings?.autoplayNext==='boolean')this.data.settings.autoplayNext=value.settings.autoplayNext;
    this.data.history=newest(this.data.history);if(typeof value.settings?.captions==='boolean')this.data.settings.captions=value.settings.captions;this.save();return imported.favorites.length;
  }
  backup(){return {...this.data,exportedAt:new Date().toISOString()};}
  clear(){this.data={...this.data,favorites:[],history:{},marks:{}};this.save();}
}
export function browserStore(){let storage;try{storage=globalThis.localStorage;}catch{}return new LibraryStore(storage);}
