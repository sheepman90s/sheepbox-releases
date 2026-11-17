import {safeUrl,plainText} from './core.mjs';

export function publisherEmbedUrl(value) {
  const url=safeUrl(value);if(!url)return '';
  const u=new URL(url);if(u.search||u.hash)return '';
  if(u.hostname==='www.nfb.ca'&&/^\/film\/[A-Za-z0-9][A-Za-z0-9_-]{0,199}\/embed\/player\/$/.test(u.pathname))return url;
  if(u.hostname==='player.pbs.org'&&/^\/viralplayer\/[1-9]\d{5,11}\/$/.test(u.pathname))return url;
  if(u.hostname==='www.youtube-nocookie.com'&&/^\/embed\/[A-Za-z0-9_-]{11}$/.test(u.pathname))return url;
  if(u.hostname==='embed.france24.com'&&u.pathname==='/en/live')return url;
  return '';
}

const cameraCategories={airport:'Airports',animals:'Animals',beach:'Beaches',city:'Cities',construction:'Construction',harbor:'Harbors',lake:'Lakes',landmark:'Landmarks',mountain:'Mountains',nature:'Nature',park:'Parks',river:'Rivers',ski:'Ski resorts',space:'Space',sports:'Sports',traffic:'Traffic',train:'Trains',underwater:'Underwater',volcano:'Volcanoes',weather:'Weather',other:'Other'};
export function parseWebcams(snapshot) {
  const cameras=new Map();
  for(const row of snapshot?.cameras??[]) {
    if(!/^[A-Za-z0-9_-]{6,64}$/.test(row.nanoid??'')||!row.name||!/^[a-z]{2}$/.test(row.country??'')||row.isGeoBlocked===true)continue;
    const videos=[...new Set((row.sources?.youtube??[]).map(value=>{
      const url=safeUrl(value,['www.youtube-nocookie.com','youtube-nocookie.com','www.youtube.com','youtube.com']);
      if(!url)return '';const path=new URL(url).pathname;
      return /^\/embed\/[A-Za-z0-9_-]{11}$/.test(path)?path.slice(7):'';
    }).filter(Boolean))];
    if(!videos.length)continue;
    const categories=[...new Set((row.categories??[]).map(key=>cameraCategories[key]).filter(Boolean))];
    const item={id:`webcam-${row.nanoid}`,provider:'webcams',providerName:'Web Cams',kind:'camera',title:plainText(row.name).slice(0,200),
      sourceId:videos[0],videoIds:videos,country:row.country==='gb'?'uk':row.country,
      description:'A webcam listed in the same Famelack directory used by the Android app. The original YouTube player controls availability and advertising.',
      categories:categories.length?categories:['Other'],image:`https://i.ytimg.com/vi/${videos[0]}/hqdefault.jpg`,official:`https://www.youtube.com/watch?v=${videos[0]}`,mode:'youtube'};
    cameras.set(item.id,item);
  }
  return [...cameras.values()].sort((a,b)=>a.title.localeCompare(b.title));
}

export function providerSeriesCards(catalog) {
  const items=new Map(catalog.items.map(item=>[item.id,item]));const seen=new Set(items.keys());const result=[];
  for(const row of catalog.providerSeries??[]) {
    if(!/^[A-Za-z0-9][A-Za-z0-9:._-]{0,239}$/.test(row.id??'')||seen.has(row.id)||!row.title)continue;
    const episodes=[...new Set(row.episodes??[])].filter(id=>items.get(id)?.provider===row.provider);
    if(!episodes.length)continue;const first=items.get(episodes[0]);seen.add(row.id);
    result.push({...first,id:row.id,title:plainText(row.title),description:plainText(row.description??''),kind:'series',mode:'series',categories:['Series'],episodes,image:safeUrl(row.image)||first.image,official:safeUrl(row.official)||first.official});
  }
  return result;
}
