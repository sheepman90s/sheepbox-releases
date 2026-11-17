import {safeUrl, plainText} from './core.mjs';

const FEED = 'https://data.cwtv.com/feed/app-2/landing/epg/';
const SITE = 'https://www.cwtv.com/channels/';
const COUNTRY_SOURCE = 'The CW US web-service lineup; no per-channel international rights or country override is asserted.';
const validSlug = value => /^[a-z0-9][a-z0-9_-]{0,199}$/.test(String(value ?? ''));
const guest = globalThis.crypto.randomUUID(); // Memory only; no account or device identifier.
const flag = value => value === true || value === 1 || ['true', '1', 'yes'].includes(String(value ?? '').toLowerCase());

async function request(url, {signal, json = true} = {}) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener('abort', abort, {once: true});
  const timer = setTimeout(abort, 25000);
  try {
    const response = await fetch(url, {signal: controller.signal, credentials: 'omit', cache: 'no-store'});
    if (!response.ok) throw Error(`The CW returned HTTP ${response.status}.`);
    const text = await response.text();
    if (text.length > 12_000_000) throw Error('The CW response is too large.');
    return json ? JSON.parse(text) : text;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

function eligible(row) {
  return validSlug(row?.slug) && !!plainText(row?.title) && row.stream_type === 'hls' && !!safeUrl(row.stream_url) &&
    !row.preplay_url && !row.preroll && !row.asset_key && !row.authentication_key &&
    !flag(row.is_adobe_pass_gated) && !flag(row.requiresAuthentication) && !flag(row.isPremium) &&
    !flag(row.is_drm) && !flag(row.has_drm) && !(row.drm_media?.length) && !(row.drm_media_items?.length);
}

async function directory({signal} = {}) {
  const rows = [];
  let total;
  for (let page = 1; page <= 100; page++) {
    const data = await request(FEED + `page_${page}/pagesize_75/device_web/apiversion_24/`, {signal});
    if (data.result !== 'ok' || !Array.isArray(data.channels) || data.channels.length > 75 || data.page !== page ||
        !Number.isInteger(data.channel_count) || data.channel_count < 0 || data.channel_count > 7500) {
      throw Error('The CW live directory has changed.');
    }
    if (total === undefined) total = data.channel_count;
    if (total !== data.channel_count) throw Error('The CW live directory changed during loading.');
    if (!data.channels.length) break;
    rows.push(...data.channels);
    if (rows.length >= total) break;
  }
  if (!rows.length || rows.length !== total || new Set(rows.map(row => row.slug)).size !== rows.length) {
    throw Error('The CW live directory is incomplete or repeated.');
  }
  return rows;
}

function advertisingConfiguration(html) {
  const match = /"fast_params"\s*:/.exec(html);
  if (!match) throw Error('The CW publisher advertising configuration is unavailable.');
  const start = html.indexOf('{', match.index + match[0].length);
  if (start < 0) throw Error('The CW publisher advertising configuration is incomplete.');
  let depth = 0, quoted = false, escaped = false;
  for (let index = start; index < Math.min(html.length, start + 100000); index++) {
    const character = html[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') quoted = false;
    } else if (character === '"') quoted = true;
    else if (character === '{') depth++;
    else if (character === '}' && --depth === 0) {
      const params = JSON.parse(html.slice(start, index + 1));
      if (!params || Array.isArray(params) || Object.keys(params).length > 100 || !Object.keys(params).length) break;
      return params;
    }
  }
  throw Error('The CW publisher advertising configuration is incomplete.');
}

function currentProgramme(row) {
  const now = Date.now() / 1000;
  if (!Array.isArray(row.programs) || row.programs.length > 5000) return '';
  const current = row.programs.find(program => Number(program.program_start_ts) <= now && Number(program.program_end_ts) > now);
  return current ? [plainText(current.title), plainText(current.subtitle)].filter(Boolean).join(' — ') : '';
}

/** Resolve the publisher's current clear guest HLS offer and complete web ad parameters. */
export async function resolveCw(item, {signal} = {}) {
  if (item?.mode !== 'cw-live' || !validSlug(item.sourceId)) throw Error('Invalid CW live channel.');
  const [rows, html] = await Promise.all([directory({signal}), request(SITE, {signal, json: false})]);
  const row = rows.find(candidate => candidate.slug === item.sourceId);
  if (!row || !eligible(row)) throw Error('The CW channel is unavailable or requires unsupported subscriber, advertising or protected playback.');
  const params = advertisingConfiguration(html);
  const userAgent = globalThis.navigator?.userAgent ?? '';
  const osVersion = /Windows NT ([\d.]+)/.exec(userAgent)?.[1] || /Android ([\d.]+)/.exec(userAgent)?.[1] ||
    /(?:iPhone OS|CPU OS|Mac OS X) ([\d_]+)/.exec(userAgent)?.[1]?.replaceAll('_', '.') || '';
  const macros = {
    '{{app.rdid}}': guest, '{{app.is_lat}}': '1', '{{app.us_privacy}}': '1YYN',
    '{{osver}}': osVersion, '{{UserOptOut}}': '1',
  };
  const url = new URL(row.stream_url);
  for (const [key, raw] of Object.entries(params)) {
    if (typeof raw !== 'string') throw Error('The CW returned an unsupported advertising parameter.');
    let value = raw;
    for (const [macro, replacement] of Object.entries(macros)) value = value.replaceAll(macro, replacement);
    if (value.includes('{{')) throw Error('The CW requires an unsupported advertising placeholder.');
    url.searchParams.append(key, value); // Retain every offered stream and ad parameter.
  }
  if (/\{\{|%7B%7B/i.test(url.href)) throw Error('The CW requires unsupported live advertising metadata.');
  return {kind: 'hls', url: url.href, adTag: '', live: true, tracks: [], nowPlaying: currentProgramme(row)};
}

/** Stable factual channel metadata only; every play rechecks the publisher feed. */
export async function loadCwSelection({signal} = {}) {
  const all = await directory({signal});
  const eligibleRows = all.filter(eligible);
  const live = eligibleRows.map(row => ({
    id: 'cw-live-' + row.slug, provider: 'cw', providerName: 'The CW', kind: 'live',
    title: plainText(row.title),
    description: `Watch ${plainText(row.title)} with The CW's current guest live offer and publisher-inserted advertising. Availability is checked when you press Play.`,
    categories: String(row.genre ?? '').split(',').map(value => plainText(value)).filter(Boolean),
    country: 'us', sourceId: row.slug, mode: 'cw-live', official: SITE,
    image: [row.horizontal_url, row.thumbnail_url, row.icon_unfocused_url].map(value => safeUrl(value)).find(Boolean) || '',
  })).sort((a, b) => a.title.localeCompare(b.title));
  if (!live.length) throw Error('The CW did not offer a supported guest live lineup.');
  return {items: [], live, report: {
    source: 'The CW current public web live directory', complete: true, publisherRows: all.length,
    live: live.length, unsupportedRows: all.length - live.length, onDemandIncluded: false,
    country: 'us', countrySource: COUNTRY_SOURCE,
    advertising: 'Fresh publisher fast_params and all offered SSAI stream queries retained. Preplay, client preroll, subscriber and protected modes are excluded.',
  }};
}
