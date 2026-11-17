import {safeUrl, plainText} from './core.mjs';

const SITE = 'https://play.xumo.com/live-guide';
const API_ORIGIN = 'https://valencia-app-mds.xumo.com';
const CONFIG_ORIGIN = 'https://valencia-app.xumo.com';
const channelId = value => /^[1-9]\d{0,11}$/.test(String(value ?? ''));
const assetId = value => /^XM[A-Z0-9]{6,24}$/.test(String(value ?? ''));

async function request(url, {signal, json = true} = {}) {
  const address = new URL(url);
  if (![new URL(SITE).origin, API_ORIGIN, CONFIG_ORIGIN].includes(address.origin)) throw Error('Unsupported Xumo metadata service.');
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener('abort', abort, {once: true});
  const timer = setTimeout(abort, 25000);
  try {
    const response = await fetch(address.href, {signal: controller.signal, credentials: 'omit', cache: 'no-store'});
    if (!response.ok) throw Error(`Xumo returned HTTP ${response.status}.`);
    const text = await response.text();
    if (text.length > 12_000_000) throw Error('The Xumo response is too large.');
    return json ? JSON.parse(text) : text;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

async function configuration({signal} = {}) {
  const html = await request(SITE, {signal, json: false});
  const raw = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/)?.[1];
  const config = raw ? JSON.parse(raw).runtimeConfig : null;
  if (!config || config.XUMO_API_URL !== 'valencia-app-mds.xumo.com' || config.CHANNEL_LIST_PATH !== '/proxy/channels/list' ||
      !/^\d{1,12}$/.test(String(config.CHANNEL_LIST_ID)) || !/^[A-Za-z0-9_-]{1,100}$/.test(config.CHANNEL_LIST_GEO_ID) ||
      config.CONFIG_URL !== CONFIG_ORIGIN + '/config' || !/^[\w.-]{1,100}$/.test(config.APP_VERSION)) {
    throw Error('Xumo has changed its public website configuration.');
  }
  return config;
}

async function directory(config, {signal} = {}) {
  const url = new URL(API_ORIGIN + '/v2' + config.CHANNEL_LIST_PATH + '/' + config.CHANNEL_LIST_ID + '.json');
  url.searchParams.set('sort', 'hybrid');
  url.searchParams.set('geoId', config.CHANNEL_LIST_GEO_ID);
  const data = await request(url, {signal});
  const rows = data?.channel?.item;
  if (!Array.isArray(rows) || !rows.length || rows.length > 2000) throw Error('Xumo did not return a current channel directory.');
  const liveRows = rows.filter(row => row?.properties?.is_live === 'true');
  if (liveRows.some(row => !channelId(row.guid?.value) || !plainText(row.title))) throw Error('Xumo returned an invalid live channel.');
  const ids = liveRows.map(row => String(row.guid.value));
  if (new Set(ids).size !== ids.length) throw Error('Xumo repeated a live channel identity.');
  return liveRows;
}

function activeAssets(broadcast) {
  const rows = Array.isArray(broadcast.assets) ? broadcast.assets : [];
  if (rows.length > 200) throw Error('Xumo returned an unexpected current programme list.');
  const now = Date.now() / 1000;
  return rows.filter(row => Number(row.timestamps?.start) <= now && Number(row.timestamps?.end) > now && assetId(row.id)).slice(0,4);
}

function explicitTracking(data) {
  return ['trackingUrl', 'tracking_url', 'adTrackingUrl', 'ssaiTrackingUrl'].some(key => !!data?.[key]);
}

function directOffer(broadcast) {
  if (broadcast.drm || broadcast.licenseUrl || explicitTracking(broadcast)) throw Error('Xumo returned an unsupported protected or client-tracked live offer.');
  if (Array.isArray(broadcast.ssaiStreamUrls)) {
    if (broadcast.ssaiStreamUrls.length > 100) throw Error('Xumo returned an unexpected source list.');
    const row = broadcast.ssaiStreamUrls.find(source => /mpegurl/i.test(source?.mimeType ?? '') && safeUrl(source?.url));
    if (row) {
      if (row.drm || row.licenseUrl || explicitTracking(row)) throw Error('Xumo returned an unsupported protected or client-tracked source.');
      return row.url;
    }
  }
  return safeUrl(broadcast.ssaiStreamUrl) ? broadcast.ssaiStreamUrl : '';
}

function assetOffer(asset) {
  if (!Array.isArray(asset.providers) || asset.providers.length > 100) return '';
  for (const provider of asset.providers) {
    if (!Array.isArray(provider.sources) || provider.sources.length > 100) continue;
    for (const source of provider.sources) {
      if (!/mpegurl/i.test(source?.produces ?? '') || !safeUrl(source.uri)) continue;
      if ((source.drm && Object.keys(source.drm).length) || source.licenseUrl || source.keySystem || explicitTracking(source)) continue;
      return source.uri;
    }
  }
  return '';
}

function browserIdentity() {
  const agent = globalThis.navigator?.userAgent ?? '';
  const platform = globalThis.navigator?.userAgentData?.platform;
  const os = platform || (/Windows/.test(agent) ? 'Windows' : /Android/.test(agent) ? 'Android' : /iPhone|iPad/.test(agent) ? 'iOS' : /Mac OS/.test(agent) ? 'macOS' : /Linux/.test(agent) ? 'Linux' : '');
  const version = /Windows NT ([\d.]+)/.exec(agent)?.[1] || /Android ([\d.]+)/.exec(agent)?.[1] || /(?:iPhone OS|CPU OS|Mac OS X) ([\d_]+)/.exec(agent)?.[1]?.replaceAll('_', '.') || '';
  return {os, version};
}

function replaceMacros(template, {row, config, players, iab, asset}) {
  const identity = browserIdentity();
  const genre = Array.isArray(row.genre) ? row.genre : [];
  const href = globalThis.location?.href || 'https://sheepman90s.github.io/sheepbox-releases/watch/';
  const duration = Number(asset?.duration ?? asset?.runtime);
  const firstProvider = asset?.providers?.[0];
  const values = {
    PLATFORM: 'desktopweb', // The current publisher web player uses this literal.
    PLATFORM_CHILD: players.platformChild || 'desktop',
    DEVICETYPE: players.devicetype || '2-Personal_Computer',
    IFA_TYPE: players.ifa_type || 'dpid', IFA: '', DEVICEID: '', PPID: '', PUID: '',
    AMZN_APP_ID: '', LAT: '', LON: '', DEVICE_MAKE: '', DEVICE_MODEL: '',
    OS: identity.os, OS_VERSION: identity.version,
    IS_LAT: '1', LMT: '1', LIMITED_AD_TRACKING: '1', CCPA_VALUE: '1YYN', GPP: '', GPP_SID: '',
    PUBLICA_SITE_ID: players.site_id || '', APP_VERSION: config.APP_VERSION,
    APP_BUNDLE: '', APP_STORE_URL: '', APP_NAME: 'xumo',
    IAB_CONTENT_CATEGORY: iab[genre[0]?.genreId] || '',
    CONTENT_GENRE: genre.map(value => plainText(value.value)).filter(Boolean).join(','),
    CONTENT_LANGUAGE: 'en', CONTENT_RATING: '',
    CHANNEL_ID: String(row.guid.value),
    REFERRER_URL: href, DESCRIPTION_URL: href, TIMESTAMP: String(Date.now()),
    WIDTH: String(globalThis.innerWidth || Number(players.width) || 1280),
    HEIGHT: String(globalThis.innerHeight || Number(players.height) || 720),
    CBSN_CSID: 'vcbs_xumo_desktop_web_live_cbsnews',
    DABL_CSID: 'vcbs_xumo_desktop_web_live_dabl',
    ETONLINE_CSID: 'vcbs_xumo_desktop_web_live_etonline',
    CBSSPORTS_CSID: 'vcbs_xumo_desktop_web_live_cbssports',
  };
  if (assetId(asset?.id)) values.ASSET_ID = asset.id;
  if (plainText(asset?.title)) values.CONTENT_TITLE = plainText(asset.title);
  if (Number.isFinite(duration) && duration > 0) values.CONTENT_LENGTH = String(duration);
  if (firstProvider?.id) values.PROVIDER_ID = String(firstProvider.id);
  if (firstProvider?.title) values.PROVIDER_NAME = plainText(firstProvider.title);
  const unknown = new Set();
  let resolved = template.replace(/\[([^\]]+)\]/g, (_, name) => {
    const key = name.toUpperCase();
    if (!(key in values)) unknown.add(key);
    return encodeURIComponent(values[key] ?? '');
  }).replace(/3-Connected_TV/gi, '2-Personal_Computer');
  if (unknown.size || /\[[^\]]+\]|%5B[^\s]*%5D/i.test(resolved)) throw Error('Xumo requires unsupported live advertising metadata.');
  if (!safeUrl(resolved)) throw Error('Xumo returned an invalid live stream.');
  // Match the publisher's SSAI web setup. Keep all offered ad parameters and
  // broadcaster identity; append its published site fields without a relay.
  if (typeof players.site_name !== 'string' || typeof players.site_page !== 'string') throw Error('Xumo advertising configuration is incomplete.');
  resolved += (resolved.includes('?') ? '&' : '?') + 'ads.site_name=' + encodeURIComponent(players.site_name) + '&ads.site_page=' + encodeURIComponent(players.site_page);
  return resolved;
}

/** Fresh regional directory and SSAI offer; no signed manifest/session is cached. */
export async function resolveXumo(item, {signal} = {}) {
  const id = String(item?.sourceId ?? '');
  if (item.mode !== 'xumo-live' || !channelId(id)) throw Error('Invalid Xumo live channel.');
  const config = await configuration({signal});
  const rows = await directory(config, {signal});
  const row = rows.find(value => String(value.guid.value) === id);
  if (!row) throw Error('This Xumo channel is not currently available in your region.');
  const [broadcast, players, iab] = await Promise.all([
    request(API_ORIGIN + '/v2/channels/channel/' + id + '/broadcast.json?hour=' + new Date().getUTCHours(), {signal}),
    request(config.CONFIG_URL + '/players.json', {signal}),
    request(config.CONFIG_URL + '/iab-genre-mapping.json', {signal}),
  ]);
  let template = directOffer(broadcast);
  let current;
  if (!template) {
    for (const active of activeAssets(broadcast)) {
      const asset = await request(API_ORIGIN + '/v2/assets/asset/' + active.id + '.json?f=providers&f=title', {signal});
      template = assetOffer(asset);
      if (template) { current = asset; break; }
    }
  }
  if (!template) throw Error('Xumo did not offer a current supported live stream.');
  // A provider can add asset-level ad macros later; fetch real programme metadata
  // only when needed rather than inventing duration/provider values.
  if (!current && /\[(?:ASSET_ID|CONTENT_TITLE|CONTENT_LENGTH|PROVIDER_ID|PROVIDER_NAME)\]/i.test(template)) {
    const active = activeAssets(broadcast)[0];
    if (active) current = await request(API_ORIGIN + '/v2/assets/asset/' + active.id + '.json?f=providers&f=title&f=duration&f=runtime', {signal});
  }
  const url = replaceMacros(template, {row, config, players, iab, asset: current});
  return {kind: 'hls', url, adTag: '', live: true, tracks: [], nowPlaying: plainText(current?.title)};
}

/** Complete public live lineup, with stable factual metadata and publisher art. */
export async function loadXumoSelection({signal} = {}) {
  const config = await configuration({signal});
  const rows = await directory(config, {signal});
  const live = rows.map(row => {
    const id = String(row.guid.value);
    const categories = (Array.isArray(row.genre) ? row.genre : []).map(value => plainText(value.value)).filter(Boolean);
    return {
      id: 'xumo-live-' + id, provider: 'xumo', providerName: 'Xumo Play', kind: 'live',
      title: plainText(row.title), description: `Watch ${plainText(row.title)} on Xumo Play. The current regional stream and publisher-inserted advertising are checked when you press Play.`,
      categories: categories.length ? categories : ['Live TV'], country: 'us',
      image: 'https://image.xumo.com/v1/channels/channel/' + id + '/200x200.webp?type=color_onBlack',
      imageAlternatives: ['https://image.xumo.com/v1/channels/channel/' + id + '/100x56.webp?type=channelTile'],
      official: SITE, sourceId: id, mode: 'xumo-live',
    };
  }).sort((a, b) => a.title.localeCompare(b.title));
  return {items: [], live, report: {source: 'Xumo current public website regional live directory', country: 'us', complete: true, live: live.length, onDemandIncluded: false, advertising: 'Fresh publisher SSAI offers and full ad query parameters retained; no client VMAP or tracking URL is supplied by the current live offer.'}};
}
