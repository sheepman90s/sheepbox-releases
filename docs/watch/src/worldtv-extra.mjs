import {safeUrl} from './core.mjs';

// These video references were explicitly provided by Share > Embed on the
// broadcaster-owned YouTube live pages. oEmbed validates an existing reference;
// it does not discover a replacement live ID or establish current live status.
const SOURCES = Object.freeze([
  {key: 'dw-en', title: 'DW English', sourceName: 'DW', country: 'de', videoId: 'LuKwFajn37U',
    owner: 'DW News', ownerPath: '/@dwnews', official: 'https://www.dw.com/en/live-tv/channel-english',
    channel: 'https://www.youtube.com/dwnews/live', countrySource: 'https://www.dw.com/en/live-tv/channel-english',
    checkedAt: '2026-11-17T11:31:06.520Z', observed: 'active programme'},
  {key: 'abcnews-au', title: 'ABC News Australia', sourceName: 'ABC News (Australia)', country: 'au', videoId: 'vOTiJkg1voo',
    owner: 'ABC News (Australia)', ownerPath: '/@abcnewsaustralia', official: 'https://www.abc.net.au/news/newschannel',
    channel: 'https://www.youtube.com/@abcnewsaustralia/live', countrySource: 'https://www.abc.net.au/about',
    checkedAt: '2026-11-17T11:29:41.373Z', observed: 'active programme'},
  {key: 'trtworld', title: 'TRT World', sourceName: 'TRT World', country: 'tr', videoId: 'JV5w1MhzcfQ',
    owner: 'TRT World', ownerPath: '/@trtworld', official: 'https://www.trtworld.com/',
    channel: 'https://www.youtube.com/@TRTWorld/live', countrySource: 'https://www.trtworld.com/contact',
    checkedAt: '2026-11-17T11:31:25.974Z', observed: 'active programme'},
  {key: 'nhkworld', title: 'NHK WORLD-JAPAN News', sourceName: 'NHK WORLD-JAPAN', country: 'jp', videoId: 'IimtbuqYIE8',
    owner: 'NHK WORLD-JAPAN', ownerPath: '/@nhkworldjapan', official: 'https://www3.nhk.or.jp/nhkworld/en/live_tv/',
    channel: 'https://www.youtube.com/@NHKWORLDJAPAN/live', countrySource: 'https://www3.nhk.or.jp/nhkworld/en/about/',
    checkedAt: '2026-11-17T11:31:25.976Z', observed: 'publisher standby between scheduled news bulletins'},
  {key: 'euronews-en', title: 'Euronews English', sourceName: 'Euronews', country: 'fr',
    official: 'https://www.euronews.com/live', countrySource: 'https://www.euronews.com/contact',
    embedSupport: 'https://www.euronews.com/widgets', checkedAt: '2026-11-17T11:30:24.303Z', observed: 'active programme'},
]);
const definition = key => SOURCES.find(source => source.key === key);
export const EXTRA_WORLD_TV_KEYS = Object.freeze(SOURCES.map(source => source.key));

function ownEmbedHtml(value, source) {
  const src = String(value ?? '').match(/<iframe\b[^>]*\bsrc=["']([^"']+)["']/i)?.[1];
  const url = safeUrl(src, ['www.youtube.com']);
  if (!url) return false;
  const parsed = new URL(url);
  return parsed.pathname === `/embed/${source.videoId}` && !parsed.hash &&
    [...parsed.searchParams].every(([key, value]) => key === 'feature' && value === 'oembed');
}
function expectedEuronewsEmbed(html) {
  function contains(value) {
    if (!value || typeof value !== 'object') return false;
    const types = Array.isArray(value['@type']) ? value['@type'] : [value['@type']];
    return types.includes('VideoObject') && (value.embedURL ?? value.embedUrl) === 'https://www.euronews.com/embed/live' ||
      Object.values(value).some(child => child && typeof child === 'object' && contains(child));
  }
  for (const match of String(html).matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { if (contains(JSON.parse(match[1]))) return true; } catch { /* Ignore unrelated malformed metadata. */ }
  }
  return false;
}

/** Parse an existing YouTube oEmbed response, or Euronews's official live-page metadata. */
export function parseExtraWorldTvMetadata(key, payload, {validatedAt = new Date().toISOString()} = {}) {
  const source = definition(key);
  if (!source) throw Error('Unsupported extra World TV broadcaster.');
  if (source.videoId) {
    const author = safeUrl(payload?.author_url, ['www.youtube.com']);
    if (payload?.provider_name !== 'YouTube' || payload?.type !== 'video' || payload.author_name !== source.owner ||
      !author || new URL(author).pathname.replace(/\/$/, '').toLowerCase() !== source.ownerPath ||
      new URL(author).search || new URL(author).hash || !ownEmbedHtml(payload.html, source)) {
      throw Error(`${source.sourceName}'s existing publisher embed could not be validated.`);
    }
  } else if (!expectedEuronewsEmbed(payload)) {
    throw Error('Euronews did not publish its expected official live embed.');
  }
  return {
    id: `worldtv-${source.key}`, provider: 'worldtv', providerName: 'World TV', sourceName: source.sourceName,
    kind: 'live', title: source.title, country: source.country, countries: [source.country],
    description: source.key === 'nhkworld'
      ? 'Scheduled news bulletins from NHK WORLD-JAPAN. The publisher may show its standby screen between broadcasts. Access, advertising and captions remain with the official player.'
      : `${source.sourceName}'s official live news player. The publisher controls access, advertising and captions.`,
    categories: ['News', 'World TV'], official: source.official,
    image: source.videoId ? `https://i.ytimg.com/vi/${source.videoId}/hqdefault.jpg` : '',
    mode: 'worldtv', worldSource: source.key, sourceId: source.videoId ?? source.key,
    metadataCheckedAt: source.checkedAt, metadataValidatedAt: new Date(validatedAt).toISOString(),
    countrySource: source.countrySource, sourceCheck: source.channel ?? source.official,
  };
}

/** Fixed approved identities: never accept an arbitrary URL, country or replacement video ID. */
export function resolveExtraWorldTv(item) {
  const source = definition(item?.worldSource);
  if (!source || item?.provider !== 'worldtv' || item?.mode !== 'worldtv' || item.country !== source.country ||
    item.sourceId !== (source.videoId ?? source.key)) throw Error('Unsupported extra World TV broadcaster.');
  return {kind: 'embed', url: source.videoId ? `https://www.youtube-nocookie.com/embed/${source.videoId}` : 'https://www.euronews.com/embed/live', live: true};
}

export async function loadExtraWorldTvSelection({fetcher = fetch, signal} = {}) {
  const validatedAt = new Date().toISOString();
  const live = [];
  for (const source of SOURCES) {
    const url = source.videoId
      ? 'https://www.youtube.com/oembed?url=' + encodeURIComponent(`https://www.youtube.com/watch?v=${source.videoId}`) + '&format=json'
      : source.official;
    const controller = new AbortController(); const abort = () => controller.abort();
    if (signal?.aborted) controller.abort();
    signal?.addEventListener('abort', abort, {once: true}); const timer = setTimeout(abort, 25000);
    try {
      const response = await fetcher(url, {credentials: 'omit', signal: controller.signal});
      if (!response.ok) throw Error(`${source.sourceName} returned HTTP ${response.status}.`);
      const text = await response.text();
      if (text.length > 2_000_000) throw Error('The publisher metadata response is unexpectedly large.');
      live.push(parseExtraWorldTvMetadata(source.key, source.videoId ? JSON.parse(text) : text, {validatedAt}));
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
  }
  return {live, source: {
    name: 'World TV — additional official broadcasters', complete: false, metadataValidatedAt: validatedAt,
    scope: 'Five curated official live-news players, not a complete country lineup.',
    refresh: 'Euronews uses its stable publisher alias. YouTube oEmbed validates the existing approved reference and owner only; it does not discover a fresh live ID or prove current live availability. Stored video IDs can change and need a maintainer source/browser check.',
    countryBasis: 'Broadcaster headquarters or national identity from the linked primary source, not viewer IP, language or programme location.',
    broadcasters: SOURCES.map(source => ({key: source.key, name: source.sourceName, country: source.country,
      official: source.official, countrySource: source.countrySource, sourceCheck: source.channel ?? source.official,
      embedSupport: source.embedSupport ?? 'Publisher-owned live page Share > Embed control',
      lastBrowserCheckAt: source.checkedAt, lastObserved: source.observed,
      activeProgrammeVerified: source.key !== 'nhkworld'})),
  }};
}
