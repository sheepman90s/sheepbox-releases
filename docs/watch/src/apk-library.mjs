import {safeUrl,plainText} from './core.mjs';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
function philoId(id,type){try{return /^[A-Za-z0-9_-]+$/.test(id)&&new RegExp('^'+type+':[1-9][0-9]{0,24}$').test(atob(id.replaceAll('-','+').replaceAll('_','/')));}catch{return false;}}
export function apkPublisherUrl(item){
  if(item?.mode!=='apk-publisher'||item.freeGuestVerified!==true)return '';
  if(item.provider==='byutv'&&uuid.test(item.sourceId)&&item.id==='byutv-'+item.sourceId)return 'https://www.byutv.org/?player-open=true&content-id='+item.sourceId;
  if(item.provider==='philo'&&philoId(item.showId,'Show')){
    if(item.kind==='episode'&&(!philoId(item.sourceId,'Episode')||item.id!=='philo-episode-'+item.sourceId))return '';
    if(item.kind!=='episode'&&(item.sourceId!==item.showId||item.id!=='philo-vod-'+item.showId))return '';
    if(item.presentationId&&!philoId(item.presentationId,'VOD'))return '';
    return item.presentationId?'https://www.philo.com/player/presentation/'+item.presentationId:'https://www.philo.com/player/show/'+item.showId;
  }
  return '';
}
export function validateApkLibrary(bundle){
  if(bundle?.schema!==1||!Array.isArray(bundle.items)||!Array.isArray(bundle.providerSeries)||!bundle.sources?.byutv||!bundle.sources?.philo)throw Error('The app provider library is incomplete.');
  const ids=new Set();
  for(const row of [...bundle.items,...bundle.providerSeries]){
    if(!apkPublisherUrl(row)||!row.title||ids.has(row.id))throw Error('The app provider metadata is invalid.');
    // Persist metadata only. Guest sessions, media and authorization stay with publishers.
    for(const key of ['url','streams','headers','cookies','token','session','adTag','license'])if(key in row)throw Error('Transient playback data cannot be packaged.');
    ids.add(row.id);
  }
  const items=new Map(bundle.items.map(row=>[row.id,row]));
  for(const show of bundle.providerSeries)if(!show.episodes?.length||new Set(show.episodes).size!==show.episodes.length||show.episodes.some(id=>items.get(id)?.provider!==show.provider))throw Error('The saved episode list is incomplete.');
  return bundle;
}
export function mergeApkLibrary(catalog,bundle){
  validateApkLibrary(bundle);
  const ids=new Set([...catalog.items,...catalog.live,...(catalog.providerSeries??[])].map(row=>row.id));
  if([...bundle.items,...bundle.providerSeries].some(row=>ids.has(row.id)))throw Error('Provider catalogue identities conflict.');
  return {...catalog,items:[...catalog.items,...bundle.items],providerSeries:[...(catalog.providerSeries??[]),...bundle.providerSeries],sources:{...catalog.sources,...bundle.sources}};
}
export function exportApkLibrary(byu,philo){
  if(byu.complete!==true||byu.coverage?.rootExhausted!==true||byu.coverage?.offerAuditComplete!==true||byu.coverage?.unresolvedEligible!==0||philo.report?.providerWideComplete!==true||philo.report?.selectionComplete!==true)throw Error('Only complete verified free snapshots can be exported.');
  const items=new Map(),providerSeries=[];
  const common=(row,provider)=>({provider,providerName:provider==='byutv'?'BYUtv':'Philo Free',mode:'apk-publisher',title:plainText(row.name??row.title),description:plainText(row.description),image:safeUrl(row.image),categories:[...new Set([...(row.categories??[]),...(row.genres??[])])],freeGuestVerified:true});
  for(const title of byu.titles){
    if(!uuid.test(title.id))throw Error('Invalid BYUtv identity.');
    const root={...common(title,'byutv'),id:'byutv-'+title.id,sourceId:title.id,kind:title.kind==='series'?'series':/trailer/i.test(title.name)?'video':'film'};
    if(title.kind!=='series'){root.official=apkPublisherUrl(root);items.set(root.id,root);continue;}
    const series=byu.series[title.id];if(!series?.seasons?.length)throw Error('BYUtv season details are missing.');
    root.episodes=[];root.official='https://www.byutv.org/';
    for(const season of series.seasons)for(const episode of season.episodes){
      const row={...common(episode,'byutv'),id:'byutv-'+episode.id,sourceId:episode.id,kind:'episode',seriesId:root.id,seasonNumber:season.number,episodeNumber:episode.number,categories:[...root.categories,...(episode.path!=='episode'?['Extras']:[])]};
      row.official=apkPublisherUrl(row);if(!row.official)throw Error('Invalid BYUtv episode.');items.set(row.id,row);if(!root.episodes.includes(row.id))root.episodes.push(row.id);
    }
    providerSeries.push(root);
  }
  for(const title of philo.titles){
    if(title.freeGuestOnDemandVerified!==true||!philoId(title.id,'Show'))throw Error('Unverified Philo title.');
    const root={...common(title,'philo'),id:'philo-vod-'+title.id,sourceId:title.id,showId:title.id,kind:title.kind==='show'?'series':'film',year:title.year??''};
    if(title.presentationId&&philoId(title.presentationId,'VOD'))root.presentationId=title.presentationId;
    root.official=apkPublisherUrl(root);
    if(title.kind!=='show'){items.set(root.id,root);continue;}
    root.episodes=[];
    for(const episode of title.episodes){
      if(episode.freeGuestOnDemandVerified!==true||!philoId(episode.id,'Episode'))throw Error('Unverified Philo episode.');
      const row={...common(episode,'philo'),id:'philo-episode-'+episode.id,sourceId:episode.id,showId:title.id,seriesId:root.id,kind:'episode',seasonNumber:episode.season,episodeNumber:episode.number,duration:episode.duration,categories:root.categories};
      if(episode.delivery==='vod'&&philoId(episode.presentationId,'VOD'))row.presentationId=episode.presentationId;
      row.official=apkPublisherUrl(row);items.set(row.id,row);if(!root.episodes.includes(row.id))root.episodes.push(row.id);
    }
    providerSeries.push(root);
  }
  const byuItems=[...items.values()].filter(row=>row.provider==='byutv'),philoShows=providerSeries.filter(row=>row.provider==='philo');
  if(byuItems.length!==byu.libraryCounts.playableItems||providerSeries.filter(row=>row.provider==='byutv').length!==byu.libraryCounts.shows||philoShows.length!==philo.report.shows||[...items.values()].filter(row=>row.provider==='philo'&&row.kind==='film').length!==philo.report.movies||philoShows.reduce((n,row)=>n+row.episodes.length,0)!==philo.report.episodes)throw Error('Exported totals differ from the complete source snapshots.');
  return validateApkLibrary({schema:1,items:[...items.values()],providerSeries,sources:{byutv:{generatedAt:byu.checkedAt,scope:'Complete audited free US/English catalogue: 145 standalone videos and 150 shows; 8,581 playable videos including episodes and extras. Playback opens BYUtv’s official player; current region and access still apply.'},philo:{generatedAt:philo.report.generatedAt,scope:'Complete audited free guest on-demand snapshot: 2,202 movies, 897 shows and 11,680 episodes, plus the separately listed free live channels. Official Philo playback; current guest access, replays and regional availability may change.'}}});
}
