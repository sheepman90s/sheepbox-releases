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
  if (item?.mode !== 'filmzie-movie' || !slug(item.sourceId)) throw Error('Invalid Filmzie movie.');
  const detail = (await request('/content/' + encodeURIComponent(item.sourceId), {signal})).data;
  if (detail?.type !== 'MOVIE' || detail.sefName !== item.sourceId || flag(detail.comingSoon) || unavailable(detail) ||
      (Object.hasOwn(detail, 'status') && detail.status !== 'APPROVED') ||
      ['requiresAuthentication', 'requiresLogin', 'isPremium', 'subscriptionRequired'].some(key => flag(detail[key]))) {
    throw Error('This Filmzie movie is not currently available to guests.');
  }
  if (!Array.isArray(detail.videos) || detail.videos.length > 1000) throw Error('Filmzie did not supply its full movie video.');
  const feature = detail.videos.find(video => video?.type === 'PAID_CONTENT' && videoId(video.id));
  if (!feature) throw Error('Filmzie did not supply its full movie video.');
  const stream = (await request('/video/stream/' + feature.id, {signal})).data;
  // PAID_CONTENT is the publisher's main-feature type, distinct from TRAILER.
  // CPM is its free advertising-funded license. Other license modes are refused.
  if (stream?.id !== feature.id || stream.type !== 'PAID_CONTENT' || stream.licenseFee !== 'CPM' || unavailable(stream) ||
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
