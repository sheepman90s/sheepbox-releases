const KEY='sheepbox-web-library-v1';
const validId=id=>typeof id==='string'&&id.length<=240&&/^[A-Za-z0-9][A-Za-z0-9:._-]*$/.test(id);
export function validateBackup(value) {
  if(!value||value.schema!==1||!Array.isArray(value.favorites)||value.favorites.length>20000)throw Error('Choose a SheepBox web backup file.');
  const favorites=[...new Set(value.favorites.filter(validId))];
  if(favorites.length!==new Set(value.favorites).size)throw Error('This backup contains invalid favorites.');
  const history=Object.fromEntries(Object.entries(value.history??{}).filter(([id,v])=>validId(id)&&v&&Number.isFinite(v.at)&&Number.isFinite(v.position)&&v.position>=0&&v.position<604800).slice(0,1000)
    .map(([id,v])=>[id,{at:v.at,position:v.position,duration:Number.isFinite(v.duration)&&v.duration>0?Math.min(v.duration,604800):0}]));
  return {schema:1,favorites,history,settings:{captions:value.settings?.captions===true}};
}
export class LibraryStore {
  constructor(storage) {
    this.storage=storage;this.persistent=!!storage;
    let raw;try{raw=storage?.getItem(KEY);}catch{this.persistent=false;this.storage=undefined;}
    try {this.data=validateBackup(JSON.parse(raw??'null'));}catch {this.data={schema:1,favorites:[],history:{},settings:{captions:false}};}
  }
  save(){try{this.storage?.setItem(KEY,JSON.stringify(this.data));}catch{this.persistent=false;}return this.data;}
  isFavorite(id){return this.data.favorites.includes(id);}
  toggleFavorite(id){if(!validId(id))return false;this.data.favorites=this.isFavorite(id)?this.data.favorites.filter(x=>x!==id):[...this.data.favorites,id];this.save();return this.isFavorite(id);}
  record(id,position=0,duration=0){if(!validId(id))return;this.data.history[id]={at:Date.now(),position:Math.max(0,Math.min(Number(position)||0,604799)),duration:Math.max(0,Number(duration)||0)};
    this.data.history=Object.fromEntries(Object.entries(this.data.history).sort((a,b)=>b[1].at-a[1].at).slice(0,1000));this.save();}
  resume(id){const h=this.data.history[id];return h&&h.position>=20&&(!h.duration||h.position<h.duration-20)?h.position:0;}
  removeHistory(id){delete this.data.history[id];this.save();}
  import(value){const imported=validateBackup(value);this.data.favorites=[...new Set([...this.data.favorites,...imported.favorites])];
    for(const [id,h] of Object.entries(imported.history))if(!this.data.history[id]||h.at>this.data.history[id].at)this.data.history[id]=h;
    this.save();return imported.favorites.length;}
  backup(){return {...this.data,exportedAt:new Date().toISOString()};}
  clear(){this.data={schema:1,favorites:[],history:{},settings:{captions:false}};this.save();}
}
export function browserStore(){let storage;try{storage=globalThis.localStorage;}catch{}return new LibraryStore(storage);}
