export const VERSION = '2.0.0-RC3';
// Imported Roku episode files do not inflate the top-level catalogue count.
export function catalogEntryCount(catalog){
  return catalog.items.filter(item=>!(item.kind==='episode'&&item.seriesId)).length+
    (catalog.providerSeries??[]).length;
}
export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const plainText = value => String(Array.isArray(value) ? value[0] ?? '' : value ?? '')
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<[^>]+>/g,' ')
  .replace(/&#(\d+);/g,(_,n)=>{const code=Number(n);return code<=0x10ffff?String.fromCodePoint(code):'';})
  .replace(/&(?:amp|quot|apos|lt|gt|nbsp|#8217|#8211|#8212);/g,c=>({'&amp;':'&','&quot;':'"','&apos;':"'",'&lt;':'<','&gt;':'>','&nbsp;':' ','&#8217;':"'",'&#8211;':'–','&#8212;':'—'}[c]))
  .replace(/\s+/g,' ').trim();
export const fold = value => String(value ?? '').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase();
export function safeUrl(value, hosts) {
  try {
    if(typeof value!=='string'||/[\u0000-\u0020\\]/.test(value))return '';
    const u=new URL(value);
    if(u.protocol!=='https:'||u.username||u.password||u.port)return '';
    if(hosts&&!hosts.some(host=>u.hostname===host||host.startsWith('.')&&u.hostname.endsWith(host)))return '';
    return u.href;
  } catch { return ''; }
}
export function archiveLicense(value) {
  const url=safeUrl(String(Array.isArray(value)?value[0]??'':value??'').replace(/^http:/,'https:'),['creativecommons.org','www.creativecommons.org']);
  if(!url)return '';
  return /^\/(?:publicdomain\/(?:zero|mark)\/1\.0|licenses\/(?:publicdomain|by(?:-nc)?(?:-sa|-nd)?)\/(?:\d\.\d\/?)?)\/?$/.test(new URL(url).pathname)?url:'';
}
export function durationSeconds(value) {
  const s=String(value??'').trim();
  if(/^\d+(?::\d+){1,2}$/.test(s))return s.split(':').reduce((a,n)=>a*60+Number(n),0);
  if(/^\d+(?:\.\d+)?$/.test(s))return Number(s);
  let total=0;for(const m of s.matchAll(/(\d+(?:\.\d+)?)\s*(h(?:ours?)?|min(?:utes?)?|m|s(?:econds?)?)/gi))total+=Number(m[1])*(m[2][0].toLowerCase()==='h'?3600:m[2][0].toLowerCase()==='m'?60:1);
  return Math.round(total);
}
export function durationLabel(seconds) {
  const n=Math.floor(Number(seconds)||0);if(n<=0)return '';
  return n>=3600?`${Math.floor(n/3600)}h ${Math.floor(n%3600/60)}m`:n>=60?`${Math.floor(n/60)} min`:`${n} sec`;
}
export function filterItems(items,{query='',provider='',category='',kind=''}={}) {
  const words=fold(query).split(/\s+/).filter(Boolean);
  return items.filter(item=>(!provider||item.provider===provider)&&(!category||item.categories?.includes(category))&&(!kind||(kind==='video'?['video','episode'].includes(item.kind):item.kind===kind))&&
    words.every(word=>fold([item.title,item.description,item.providerName,...(item.categories??[])].join(' ')).includes(word)));
}
export function parseRoute(hash) {
  try {const [name='home',...parts]=hash.replace(/^#\/?/,'').split('/');return ['home','live','simple','world','webcams','ondemand','favorites','providers','settings','watch','provider','series','search','history','status','guide','party'].includes(name)?{name,id:decodeURIComponent(parts.join('/'))}:{name:'home',id:''};}
  catch {return {name:'home',id:''};}
}
export function parseNasaVideo(row,terms={}) {
  const id=String(row.id??'');const official=safeUrl(row.link,['plus.nasa.gov']);
  if(!/^[1-9]\d*$/.test(id)||!official||!new URL(official).pathname.startsWith('/video/')||row.status&&row.status!=='publish')return null;
  const title=plainText(row.title?.rendered);if(!title)return null;
  const meta=row.meta??{};
  const categories=[...new Set([...(row.topic??[]).map(n=>terms[`topic:${n}`]),...(row.genre??[]).map(n=>terms[`genre:${n}`])].filter(Boolean).map(plainText))];
  const images=[row.featured_image,meta['featured-image'],meta['featured-image-with-text'],meta['vertical-featured-image']].map(value=>safeUrl(value,['plus.nasa.gov','www.nasa.gov','images-assets.nasa.gov','.nasa.gov'])).filter(Boolean);
  return {id:`nasa-${id}`,sourceId:id,provider:'nasaplus',providerName:'NASA+',kind:'video',title,
    description:plainText(row.excerpt?.rendered||row.content?.rendered).slice(0,1400),
    image:images[0]??'',imageAlternatives:[...new Set(images)].slice(1),
    official,categories:categories.length?categories:['Space & science'],duration:durationSeconds(meta.runtime),
    series:(row.series??[]).map(String),published:row.date_gmt??'',mode:'nasa'};
}
export function parseArchiveRow(row,category='Classic films') {
  const id=String(row.identifier??'');const license=archiveLicense(row.licenseurl);
  if(!/^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(id)||!license)return null;
  const title=plainText(row.title);if(!title)return null;
  return {id:`archive-${id}`,sourceId:id,provider:'archive',providerName:'Internet Archive',kind:'film',title,
    description:plainText(row.description).slice(0,1400),image:`https://archive.org/services/img/${encodeURIComponent(id)}`,
    official:`https://archive.org/details/${encodeURIComponent(id)}`,license,categories:[category],
    duration:/^\d+(?:\.\d+)?$/.test(String(row.runtime??''))&&Number(row.runtime)<=600?Number(row.runtime)*60:durationSeconds(row.runtime),year:String(row.year??'').slice(0,4),mode:'archive'};
}
export function parseNfbFilm(row) {
  const id=String(row.id??'');const slug=String(row.slug??'');const a=row.availability;
  if(row.category!=='film'||!/^[1-9]\d*$/.test(id)||!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,199}$/.test(slug)||!a?.is_public||row.geoblocked!==false)return null;
  const official=`https://www.nfb.ca/film/${slug}/`;if(a.resource_url!==official)return null;
  const title=plainText(row.title);if(!title)return null;
  const thumb=String(row.thumbnail??'');
  const image=thumb&&!thumb.includes('..')&&!/[:\\]/.test(thumb)&&!thumb.startsWith('/')?`https://assets.nfbcdn.ca/medias/norman/${thumb.split('/').map(encodeURIComponent).join('/')}?w=640&h=360`:'';
  const genres=(row.genres??[]).map(plainText).filter(Boolean);
  const description=[row.year?String(row.year):'',genres.join(' · '),'National Film Board of Canada'].filter(Boolean).join(' · ');
  return {id:`nfb-${id}`,sourceId:id,slug,provider:'nfb',providerName:'NFB',kind:'film',title,description,
    image,official,categories:[...new Set([...(row.genres??[]),row.cataloging_language==='fr'?'French':'English'])],
    duration:durationSeconds(row.duration),year:String(row.year??''),mode:'nfb'};
}
export function archiveSchedule(items,category,now=Date.now()) {
  const rows=items.filter(x=>x.provider==='archive'&&x.duration>=60&&(!category||x.categories.includes(category))).sort((a,b)=>a.id.localeCompare(b.id));
  const cycle=rows.reduce((s,x)=>s+x.duration,0);if(!cycle)return null;
  let offset=((Math.floor(now/1000)-1767225600)%cycle+cycle)%cycle;
  for(let index=0;index<rows.length;index++){if(offset<rows[index].duration)return {item:rows[index],offset,next:rows[(index+1)%rows.length]};offset-=rows[index].duration;}
  return null;
}
