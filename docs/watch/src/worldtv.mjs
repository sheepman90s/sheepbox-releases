import {safeUrl} from './core.mjs';
import {EXTRA_WORLD_TV_KEYS,resolveExtraWorldTv,loadExtraWorldTvSelection} from './worldtv-extra.mjs';

const SOURCES = Object.freeze([
  {key: 'france24-en', title: 'France 24 English', sourceName: 'France 24', country: 'fr',
    official: 'https://www.france24.com/en/live',
    countrySource: 'https://www.francemediasmonde.com/en/the-group/organisation/'},
  {key: 'aljazeera-en', title: 'Al Jazeera English', sourceName: 'Al Jazeera', country: 'qa',
    official: 'https://www.aljazeera.com/video/live/', countrySource: 'https://www.aljazeera.com/about-us'},
]);
const sourceFor = key => SOURCES.find(source => source.key === key);
const videoId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{11}$/.test(value);

function jsonLdValues(html) {
  const values = [];
  for (const match of String(html).matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { values.push(JSON.parse(match[1])); } catch { /* A separate malformed metadata block does not supply a source. */ }
  }
  return values;
}
function embedValues(value) {
  if (!value || typeof value !== 'object') return [];
  const events = Array.isArray(value.publication) ? value.publication : [value.publication];
  const live = events.some(event => event?.isLiveBroadcast === true || event?.isLiveBroadcast === 'true');
  return [...(live && typeof value.embedUrl === 'string' ? [value.embedUrl] : []),
    ...Object.values(value).filter(child => child && typeof child === 'object').flatMap(embedValues)];
}

/** Maintainer-side discovery of publisher-published embed metadata, never YouTube scraping. */
export function parseWorldTvMetadata(key, html, {checkedAt = new Date().toISOString()} = {}) {
  const source = sourceFor(key);
  if (!source) throw Error('Unsupported World TV broadcaster.');
  const candidates = jsonLdValues(html).flatMap(embedValues);
  let sourceId = '';
  if (key === 'france24-en') {
    if (candidates.some(value => value === 'https://embed.france24.com/en/live')) sourceId = 'france24-en';
  } else {
    for (const value of candidates) {
      const url = safeUrl(value, ['www.youtube.com']);
      if (!url) continue;
      const parsed = new URL(url);
      if (!parsed.search && !parsed.hash && /^\/embed\/[A-Za-z0-9_-]{11}$/.test(parsed.pathname)) {
        sourceId = parsed.pathname.slice(7); break;
      }
    }
  }
  if (!sourceId) throw Error(`${source.sourceName} did not publish the expected live-player embed.`);
  const stamp = new Date(checkedAt).toISOString();
  return {
    id: `worldtv-${key}`, provider: 'worldtv', providerName: 'World TV', sourceName: source.sourceName,
    kind: 'live', title: source.title, country: source.country, countries: [source.country],
    description: `${source.sourceName}'s official live news player. The publisher controls access, advertising and captions.`,
    categories: ['News', 'World TV'], official: source.official,
    image: key === 'aljazeera-en' ? `https://i.ytimg.com/vi/${sourceId}/hqdefault.jpg` : '',
    mode: 'worldtv', worldSource: key, sourceId, metadataCheckedAt: stamp,
    countrySource: source.countrySource,
  };
}

/** The France24 alias is stable. Al Jazeera uses the last publisher-checked embed ID. */
export function resolveWorldTv(item) {
  if(EXTRA_WORLD_TV_KEYS.includes(item?.worldSource))return resolveExtraWorldTv(item);
  const source = sourceFor(item?.worldSource);
  if (!source || item?.provider !== 'worldtv' || item?.mode !== 'worldtv' || item.country !== source.country) {
    throw Error('Unsupported World TV broadcaster.');
  }
  if (source.key === 'france24-en') {
    if (item.sourceId !== 'france24-en') throw Error('The France 24 source is invalid.');
    return {kind: 'embed', url: 'https://embed.france24.com/en/live', live: true};
  }
  if (!videoId(item.sourceId)) throw Error('This Al Jazeera live-player reference is invalid.');
  return {kind: 'embed', url: `https://www.youtube-nocookie.com/embed/${item.sourceId}`, live: true};
}

export async function loadWorldTvSelection({fetcher = fetch, signal, extraLoader = loadExtraWorldTvSelection} = {}) {
  const checkedAt = new Date().toISOString();
  const live = [];
  for (const source of SOURCES) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (signal?.aborted) controller.abort();
    signal?.addEventListener('abort', abort, {once: true});
    const timeout = setTimeout(abort, 25000);
    try {
      const response = await fetcher(source.official, {credentials: 'omit', signal: controller.signal});
      if (!response.ok) throw Error(`${source.sourceName} returned HTTP ${response.status}.`);
      const html = await response.text();
      if (html.length > 2_000_000) throw Error('The broadcaster metadata page is unexpectedly large.');
      live.push(parseWorldTvMetadata(source.key, html, {checkedAt}));
    } finally {
      clearTimeout(timeout); signal?.removeEventListener('abort', abort);
    }
  }
  const extra=await extraLoader({fetcher,signal});
  live.push(...extra.live);
  return {live, source: {name: 'World TV — official broadcasters', checkedAt, complete: false,
    scope: `Curated selection of ${live.length} official broadcaster live players; not a complete country or IPTV-org lineup.`,
    countryBasis: 'Broadcaster headquarters or national identity from the linked primary source; not viewer IP, language or programme location.',
    refresh: 'Maintainer-only metadata refresh. Al Jazeera’s stored live embed ID may change; no real-time freshness is claimed. '+extra.source.refresh,
    broadcasters: SOURCES.map(source => ({name: source.sourceName, key: source.key, country: source.country,
      official: source.official, countrySource: source.countrySource})).concat(extra.source.broadcasters),
  }};
}
