// SheepBox-owned static metadata only. Publisher playback stays on Roku.
const SOURCE=/^[a-f0-9]{32}$/;
const EPISODE=/^roku-[a-f0-9]{32}$/;
const SERIES=/^roku-series-[a-f0-9]{32}$/;
const privateFields=['cookies','headers','token','csrf','adTag','license','streams','url'];
const factual=item=>item&&item.provider==='roku'&&SOURCE.test(item.sourceId??'')&&item.mode==='roku-link'&&item.freeGuestVerified===true&&privateFields.every(key=>!(key in item));

export function isRokuSeriesReference(row){
  return !!(row?.provider==='roku'&&SOURCE.test(row.sourceId??'')&&row.id===`roku-series-${row.sourceId}`&&
    row.episodeFile===`roku/series/${row.sourceId}.json`&&Number.isInteger(row.episodeCount)&&row.episodeCount>0&&
    (row.episodes===undefined||Array.isArray(row.episodes)&&(row.episodes.length===0||row.episodeCount===row.episodes.length&&new Set(row.episodes).size===row.episodes.length&&row.episodes.every(id=>EPISODE.test(id)))));
}

export function isRokuExternalSeries(row){
  return !!(row?.provider==='roku'&&SOURCE.test(row.sourceId??'')&&row.id==='roku-series-'+row.sourceId&&
    row.kind==='series'&&row.mode==='series'&&row.externalOnly===true&&row.freeGuestVerified===true&&
    row.parentFreeOptionVerified===true&&row.episodeCount===undefined&&row.episodeFile===undefined&&
    (row.episodes===undefined||Array.isArray(row.episodes)&&row.episodes.length===0)&&
    row.official==='https://app.roku.com/details/'+row.sourceId&&privateFields.every(key=>!(key in row)));
}

export function mergeRokuLibrary(base,library){
  if(library?.schema!==1||library.provider!=='roku'||!Array.isArray(library.items)||!Array.isArray(library.providerSeries))throw Error('The Roku library could not be loaded.');
  if(!library.items.every(item=>factual(item)&&item.kind==='film'&&item.id===`roku-${item.sourceId}`)||!library.providerSeries.every(row=>isRokuSeriesReference(row)||isRokuExternalSeries(row)))throw Error('The Roku library contains incomplete title details.');
  const items=[...base.items.filter(item=>item.provider!=='roku'),...library.items];
  const providerSeries=[...(base.providerSeries??[]).filter(item=>item.provider!=='roku'),...library.providerSeries];
  const ids=[...items,...base.live,...providerSeries].map(item=>item.id);
  if(new Set(ids).size!==ids.length)throw Error('The Roku library contains conflicting title identities.');
  return {...base,items,providerSeries};
}

export function rokuEpisodeSeriesIndex(catalog){
  const index=new Map();
  for(const series of catalog.providerSeries??[])if(isRokuSeriesReference(series))for(const id of series.episodes??[]){
    // An episode can be referenced by an anthology/alternate parent as well.
    // Keep the first publisher-listed parent rather than losing its watch link.
    if(!index.has(id))index.set(id,series.id);
  }
  return index;
}

export function parseRokuEpisodeFile(series,payload){
  if(!isRokuSeriesReference(series)||payload?.schema!==1||payload.provider!=='roku'||payload.seriesId!==series.id||!Array.isArray(payload.items)||payload.items.length!==series.episodeCount)throw Error('The complete episode list could not be loaded.');
  const items=new Map();
  for(const item of payload.items){
    if(!factual(item)||item.kind!=='episode'||item.id!==`roku-${item.sourceId}`||item.seriesId!==series.id||item.episodeOf!==series.id||items.has(item.id))throw Error('The publisher episode list contains inconsistent title details.');
    items.set(item.id,item);
  }
  const ids=payload.episodes??payload.items.map(item=>item.id);
  if(!Array.isArray(ids)||ids.length!==series.episodeCount||new Set(ids).size!==ids.length||!ids.every(id=>items.has(id))||(series.episodes?.length&&!series.episodes.every(id=>items.has(id))))throw Error('The complete episode list could not be loaded.');
  return ids.map(id=>items.get(id));
}

export function parseRokuEpisodeIndex(prefix,payload){
  if(!/^[a-f0-9]{2}$/.test(prefix)||payload?.schema!==1||payload.provider!=='roku'||payload.prefix!==prefix||!payload.episodes||typeof payload.episodes!=='object'||Array.isArray(payload.episodes))throw Error('The episode directory could not be loaded.');
  const entries=Object.entries(payload.episodes);
  if(!entries.every(([id,parent])=>EPISODE.test(id)&&id.slice(5,7)===prefix&&SERIES.test(parent)))throw Error('The episode directory contains inconsistent identities.');
  return new Map(entries);
}

// This small derivative cache remembers only episodes the user opens or saves.
// Full catalogue content is never limited by this cache's eviction policy.
export class RokuParentCache {
  constructor(storage){
    this.storage=storage;this.parents=new Map();
    try{const raw=storage?.getItem('sheepbox-roku-parents-v1');if(raw&&raw.length<=200_000){const data=JSON.parse(raw);if(data.schema===1&&Array.isArray(data.entries))for(const [id,parent]of data.entries.slice(-1000))if(EPISODE.test(id)&&SERIES.test(parent))this.parents.set(id,parent);}}catch{}
  }
  get(id){return this.parents.get(id);}
  remember(id,parent){
    if(!EPISODE.test(id)||!SERIES.test(parent))return;
    this.parents.delete(id);this.parents.set(id,parent);while(this.parents.size>1000)this.parents.delete(this.parents.keys().next().value);
    try{this.storage?.setItem('sheepbox-roku-parents-v1',JSON.stringify({schema:1,entries:[...this.parents]}));}catch{}
  }
}
