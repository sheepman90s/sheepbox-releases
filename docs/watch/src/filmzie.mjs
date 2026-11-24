import {safeUrl, plainText} from './core.mjs';

const SITE = 'https://filmzie.com';
const API = SITE + '/api/v1';
const VMAP_NAMESPACE = 'http://www.iab.net/videosuite/vmap';
const slug = value => /^[A-Za-z0-9_-]{1,240}$/.test(String(value ?? ''));
const videoId = value => /^[a-f0-9]{24}$/.test(String(value ?? ''));
const flag = value => value === true || value === 1 || ['true', '1'].includes(String(value ?? '').toLowerCase());
const unavailable = row => ['available', 'isAvailable'].some(key => row?.[key] === false || row?.[key] === 0 || ['false', '0'].includes(String(row?.[key] ?? '').toLowerCase()));
const active = value => value !== undefined && value !== null && value !== '' && value !== false && value !== 0 &&
  (typeof value !== 'object' || Object.keys(value).length > 0);

async function request(path, {signal, json = true} = {}) {
  if (!path.startsWith('/') || path.startsWith('//')) throw Error('Unsupported Filmzie request.');
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener('abort', abort, {once: true});
  const timer = setTimeout(abort, 25000);
  try {
    const response = await fetch(API + path, {signal: controller.signal, credentials: 'omit', cache: 'no-store'});
    if (!response.ok) throw Error(`Filmzie returned HTTP ${response.status}.`);
    const text = await response.text();
    if (text.length > (json ? 12_000_000 : 2_000_000)) throw Error('The Filmzie response is too large.');
    if (!json) return text;
    const data = JSON.parse(text);
    if (data.error) throw Error('Filmzie did not authorize this guest request.');
    return data;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

function image(row, key) {
  const raw = row?.images?.[key]?.amazonKey;
  if (typeof raw !== 'string') return '';
  if (raw.startsWith('content-assets/') && !raw.includes('..') && !raw.includes('\\')) {
    return safeUrl('https://d3qxhvuywdalwo.cloudfront.net/' + raw);
  }
  return safeUrl(raw);
}

function movieMetadata(row, groups) {
  if (row?.type !== 'MOVIE' || row.status !== 'APPROVED' || flag(row.comingSoon) || unavailable(row) ||
      !Array.isArray(row.licenseType) || !row.licenseType.includes('VOD') || !slug(row.sefName) || !plainText(row.title)) return null;
  const categories = (Array.isArray(row.category) ? row.category : []).map(key => groups.get(key)).filter(Boolean);
  const duration = Number(row.duration);
  const year = Number.parseInt(String(row.released ?? ''), 10);
  const facts = [Number.isInteger(year) && year >= 1880 && year <= 2100 ? String(year) : '',
    Number.isFinite(duration) && duration > 0 ? `${Math.round(duration / 60)} min` : '', ...categories].filter(Boolean);
  return {
    id: 'filmzie-' + row.sefName, provider: 'filmzie', providerName: 'Filmzie', kind: 'film',
    title: plainText(row.title),
    description: `Filmzie film${facts.length ? ' · ' + facts.join(' · ') : ''}. Guest availability and the publisher's advertising schedule are checked when you press Play.`,
    categories: [...new Set(categories.length ? categories : ['Films'])],
    ...(Number.isFinite(duration) && duration > 0 ? {duration} : {}),
    ...(Number.isInteger(year) && year >= 1880 && year <= 2100 ? {year} : {}),
    image: image(row, 'featured2') || image(row, 'poster'),
    official: SITE + '/content/' + encodeURIComponent(row.sefName),
    sourceId: row.sefName, mode: 'filmzie-movie',
  };
}

function validateVmap(xml) {
  if (typeof xml !== 'string' || !xml.length || xml.length > 2_000_000 || /<!DOCTYPE|<!ENTITY/i.test(xml)) {
    throw Error('Filmzie returned an unsupported advertising schedule.');
  }
  if (typeof DOMParser !== 'undefined') {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (doc.querySelector('parsererror') || doc.documentElement.localName !== 'VMAP' || doc.documentElement.namespaceURI !== VMAP_NAMESPACE) {
      throw Error('Filmzie did not supply its original VMAP advertising schedule.');
    }
    return;
  }
  // Node diagnostics/build tools have no browser DOM. Production uses the XML
  // parser above; this check also rejects a missing root/namespace or truncation.
  const source = xml.replace(/^\s*<\?xml[^?]*\?>/, '').replace(/<!--[^]*?-->/g, '').trim();
  const root = /^<((?:[A-Za-z_][\w.-]*:)?VMAP)\b([^>]*?)(\/?)>/.exec(source);
  const prefix = root?.[1].includes(':') ? root[1].split(':')[0] : '';
  const attribute = prefix ? 'xmlns:' + prefix : 'xmlns';
  const namespace = root?.[2].match(new RegExp('(?:^|\\s)' + attribute + '\\s*=\\s*(["\'])' + VMAP_NAMESPACE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\1'));
  if (!root || !namespace || (!root[3] && !source.endsWith('</' + root[1] + '>'))) {
    throw Error('Filmzie did not supply its original VMAP advertising schedule.');
  }
}

/** Current public guest movie offer; no homepage cookie, account or media cache. */
export async function resolveFilmzie(item, {signal} = {}) {
  const episode=item?.mode==='filmzie-episode';
  if (!['filmzie-movie','filmzie-episode'].includes(item?.mode) || !slug(item.sourceId)||episode&&!videoId(item.videoId)) throw Error('Invalid Filmzie movie.');
  const detail = (await request('/content/' + encodeURIComponent(item.sourceId), {signal})).data;
  if (detail?.type !== (episode?'TV_SHOW':'MOVIE') || detail.sefName !== item.sourceId || flag(detail.comingSoon) || unavailable(detail) ||
      (Object.hasOwn(detail, 'status') && detail.status !== 'APPROVED') ||
      ['requiresAuthentication', 'requiresLogin', 'isPremium', 'subscriptionRequired'].some(key => flag(detail[key]))) {
    throw Error('This Filmzie movie is not currently available to guests.');
  }
  if (!Array.isArray(detail.videos) || detail.videos.length > 1000) throw Error('Filmzie did not supply its full movie video.');
  const expected=episode?'EPISODE':'PAID_CONTENT';
  const feature = detail.videos.find(video => video?.type === expected && videoId(video.id)&&(!episode||video.id===item.videoId));
  if (!feature) throw Error('Filmzie did not supply its full movie video.');
  const stream = (await request('/video/stream/' + feature.id, {signal})).data;
  // PAID_CONTENT is the publisher's main-feature type, distinct from TRAILER.
  // CPM is its free advertising-funded license. Other license modes are refused.
  if (stream?.id !== feature.id || stream.type !== expected || stream.licenseFee !== 'CPM' || unavailable(stream) ||
      ['isPreview', 'preview', 'isTrailer', 'trailer', 'subscriberOnly', 'isSubscriberOnly', 'requiresSubscription', 'subscriptionRequired', 'requiresPurchase', 'requiresPayment', 'requiresAuthentication', 'requiresLogin'].some(key => flag(stream[key])) ||
      ['drm', 'drmInfo', 'licenseUrl', 'license_url'].some(key => active(stream[key])) ||
      ['drm', 'drmInfo', 'licenseUrl'].some(key => active(stream.source?.[key]))) {
    throw Error('Filmzie did not authorize a supported free movie offer.');
  }
  const url = safeUrl(stream.source?.hlsV2);
  if (!url) throw Error('Filmzie did not offer supported movie playback.');
  const path = '/video/stream/' + feature.id + '/ad/vmap?platform=web&noAdBuffer=true&deviceType=web';
  validateVmap(await request(path, {signal, json: false}));
  const tracks = (Array.isArray(stream.externalSubtitles) ? stream.externalSubtitles : []).filter(track => safeUrl(track?.url)).map(track => ({
    url: safeUrl(track.url), language: /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/.test(track.lang ?? '') ? track.lang : 'und',
    label: plainText(track.label || track.lang) || 'Captions',
  }));
  return {kind: 'hls', url, adTag: API + path, live: false, tracks};
}

/** Complete current MOVIE directory only. Series and media offers are not saved. */
export async function loadFilmzieSelection({signal, onProgress = () => {}} = {}) {
  const categoryData = (await request('/category', {signal})).data;
  if (!Array.isArray(categoryData) || !categoryData.length || categoryData.length > 1000) throw Error('Filmzie categories changed.');
  const groups = new Map(categoryData.filter(row => typeof row.key === 'string' && plainText(row.name)).map(row => [row.key, plainText(row.name)]));
  const movies = new Map(), seenIds = new Set(), pageFingerprints = new Set();
  let total, read = 0, excluded = 0, pages = 0;
  async function page(offset) {
    const response = await request('/content?limit=100&offset=' + offset + '&type=MOVIE', {signal});
    const data = response.data, paging = data?.paging, rows = data?.data;
    if (!paging || !Array.isArray(rows) || rows.length > 100 || paging.offset !== offset || paging.limit !== 100 ||
        !Number.isInteger(paging.total) || paging.total < 1 || paging.total > 50000 || (total !== undefined && paging.total !== total)) {
      throw Error('Filmzie returned an incomplete or changed movie directory.');
    }
    if (total === undefined) total = paging.total;
    const expected = Math.min(100, total - offset);
    if (rows.length !== expected) throw Error('Filmzie returned an incomplete movie page.');
    const fingerprint = rows.map(row => row.id).join('|');
    if (pageFingerprints.has(fingerprint)) throw Error('Filmzie repeated a movie page.');
    pageFingerprints.add(fingerprint);
    for (const row of rows) {
      if (!videoId(row?.id) || seenIds.has(row.id)) throw Error('Filmzie repeated or omitted a movie identity.');
      seenIds.add(row.id);
      const movie = movieMetadata(row, groups);
      if (!movie) { excluded++; continue; }
      const previous = movies.get(movie.id);
      if (previous) previous.categories = [...new Set([...previous.categories, ...movie.categories])];
      else movies.set(movie.id, movie);
    }
    read += rows.length; pages++;
    onProgress(read, total);
  }
  await page(0);
  const offsets = [];
  for (let offset = 100; offset < total; offset += 100) offsets.push(offset);
  let next = 0;
  await Promise.all(Array.from({length: Math.min(4, offsets.length)}, async () => {
    while (next < offsets.length) await page(offsets[next++]);
  }));
  if (read !== total || seenIds.size !== total || !movies.size) throw Error('Filmzie movie traversal is incomplete.');
  const items = [...movies.values()].sort((a, b) => a.title.localeCompare(b.title));
  return {items, live: [], report: {
    source: 'Filmzie current public MOVIE API directory', complete: true, movieDirectoryComplete: true,
    publisherRows: total, rowsRead: read, pages, movies: items.length, excludedRows: excluded,
    seriesIncluded: false, allPlaybackOffersChecked: false,
    countrySource: 'No catalogue country is supplied; real publisher guest offers determine current availability without country overrides.',
    advertising: 'Fresh original public VMAP URL and all returned breaks are passed to Google IMA. Only current CPM main-feature HLS offers are accepted.',
  }};
}

/** Reconcile every published season against the current playable episode set. */
export function parseFilmzieShow(row,detail,groups=new Map()){
  if(row?.type!=='TV_SHOW')return null;
  const base=movieMetadata({...row,type:'MOVIE'},groups);if(!base)return null;
  if(detail?.type!=='TV_SHOW'||detail.sefName!==row.sefName||!Array.isArray(detail.videos)||!Array.isArray(row.seasons))throw Error('Filmzie season metadata is incomplete.');
  if(flag(detail.comingSoon)||unavailable(detail)||['requiresAuthentication','requiresLogin','isPremium','subscriptionRequired'].some(key=>flag(detail[key])))return null;
  const allowed=new Set(),references=new Set(),items=[];
  for(const video of detail.videos.filter(video=>video.type==='EPISODE')){if(!videoId(video.id)||allowed.has(video.id))throw Error('Filmzie repeated an episode identity.');allowed.add(video.id);}
  const show={...base,id:'filmzie-series-'+row.sefName,kind:'series',mode:'series',episodes:[],categories:[...new Set(['Series',...base.categories])],description:plainText(detail.description||row.description)};
  let excluded=0;
  for(const season of row.seasons){
    if(!Number.isInteger(season.seasonNumber)||season.seasonNumber<0||!Array.isArray(season.episodes))throw Error('Filmzie returned an invalid season.');
    for(const [index,episode] of season.episodes.entries()){
      const video=episode.videoId;if(!videoId(video)||references.has(video))throw Error('Filmzie repeated or omitted a season video identity.');references.add(video);
      if(!allowed.has(video)||episode.integrators?.platform?.enabled===false||unavailable(episode)){excluded++;continue;}
      const item={id:'filmzie-episode-'+video,provider:'filmzie',providerName:'Filmzie',kind:'episode',mode:'filmzie-episode',sourceId:row.sefName,videoId:video,seriesId:show.id,title:plainText(episode.title)||'Episode '+(index+1),description:plainText(episode.description),categories:show.categories,image:image(episode,'featured2')||base.image,official:base.official,seasonNumber:season.seasonNumber,episodeNumber:index+1,duration:Number(episode.duration)||0};
      items.push(item);show.episodes.push(item.id);
    }
  }
  if([...allowed].some(id=>!references.has(id)))throw Error('Filmzie has playable episodes missing from its season directory. The previous catalogue is retained.');
  return {show:items.length?show:null,items,excluded,seasons:row.seasons.length};
}
export async function loadFilmzieLibrary({signal,onProgress=()=>{}}={}){
  const movies=await loadFilmzieSelection({signal,onProgress});
  const categoryData=(await request('/category',{signal})).data;
  if(!Array.isArray(categoryData))throw Error('Filmzie categories changed.');
  const groups=new Map(categoryData.map(row=>[row.key,plainText(row.name)]));
  const rows=[],seen=new Set();let total,pages=0;
  for(let offset=0;total===undefined||offset<total;offset+=100){
    const data=(await request('/content?limit=100&offset='+offset+'&type=TV_SHOW',{signal})).data,paging=data?.paging;
    if(!paging||!Array.isArray(data.data)||paging.limit!==100||paging.offset!==offset||!Number.isInteger(paging.total)||paging.total<0||paging.total>50000||total!==undefined&&total!==paging.total||data.data.length!==Math.min(100,paging.total-offset))throw Error('Filmzie series directory is incomplete or changed.');
    total=paging.total;pages++;
    for(const row of data.data){if(!videoId(row.id)||seen.has(row.id))throw Error('Filmzie repeated a series page.');seen.add(row.id);rows.push(row);}
  }
  const whole=(await request('/content?limit=1&offset=0',{signal})).data?.paging?.total;
  if(whole!==movies.report.publisherRows+total)throw Error('Filmzie has additional catalogue types or changed during traversal. The previous catalogue is retained.');
  const results=new Array(rows.length);let next=0,done=0;
  await Promise.all(Array.from({length:Math.min(4,rows.length)},async()=>{while(next<rows.length){const index=next++,row=rows[index];if(movieMetadata({...row,type:'MOVIE'},groups)&&row.type==='TV_SHOW'){const detail=(await request('/content/'+encodeURIComponent(row.sefName),{signal})).data;results[index]=parseFilmzieShow(row,detail,groups);}onProgress(++done,rows.length);}}));
  const series=results.filter(Boolean),episodes=series.flatMap(row=>row.items),providerSeries=series.map(row=>row.show).filter(Boolean);
  const identities=[...movies.items,...episodes,...providerSeries].map(row=>row.id);if(new Set(identities).size!==identities.length)throw Error('Filmzie episode ownership or catalogue identities conflict.');
  return {items:[...movies.items,...episodes],live:[],providerSeries,report:{...movies.report,source:'Complete Filmzie public MOVIE and TV_SHOW directories with all published seasons reconciled against current episode details',generatedAt:new Date().toISOString(),seriesDirectoryComplete:true,providerWideComplete:true,seriesIncluded:true,seriesDirectoryRows:total,seriesPages:pages,series:providerSeries.length,episodes:episodes.length,seasons:series.reduce((n,row)=>n+row.seasons,0),excludedSeries:total-providerSeries.length,excludedEpisodes:series.reduce((n,row)=>n+row.excluded,0),scope:'Complete supported public movie and series directories, all published seasons and currently listed guest episode metadata. Current free CPM playback and all publisher advertising/access restrictions are checked again when you watch.'}};
}
