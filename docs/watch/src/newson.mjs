import {safeUrl, plainText} from './core.mjs';

const API = 'https://newson-api.triple-it.nl/v5api/';
const numericId = value => /^[1-9]\d{0,17}$/.test(String(value ?? ''));
// An ephemeral client identifier, never an account, advertising ID or saved cookie.
const deviceId = globalThis.crypto.randomUUID();
let lastCompletedAdSeconds = 0;

async function request(path, {signal} = {}) {
  if (!(path === 'search?query=' || /^detail\/station\/[1-9]\d{0,17}$/.test(path) || /^item\/(?:program|clip|stream)\/[1-9]\d{0,17}$/.test(path))) {
    throw Error('Unsupported NewsON request.');
  }
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener('abort', abort, {once: true});
  const timer = setTimeout(abort, 25000);
  try {
    const response = await fetch(API + path + (path.includes('?') ? '&' : '?') + 'platformType=website', {
      signal: controller.signal,
      credentials: 'omit',
      cache: 'no-store',
      headers: {'X-deviceId': deviceId, 'X-advertiserId': ''},
    });
    if (!response.ok) throw Error(`NewsON returned HTTP ${response.status}.`);
    const text = await response.text();
    if (text.length > 16_000_000) throw Error('The NewsON response is too large.');
    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

function station(row) {
  if (row?.type !== 'STATION' || !numericId(row.id) || !plainText(row.name)) return null;
  return {
    id: String(row.id), name: plainText(row.name), state: plainText(row.state), city: plainText(row.city),
    image: safeUrl(row.logoUrl) || '',
    tags: Array.isArray(row.tags) ? row.tags.filter(tag => ['LIVE', 'ALWAYSON'].includes(tag)) : [],
  };
}

function detailStation(data, id) {
  const selected = station(data?.item?.station);
  if (!selected || selected.id !== String(id)) throw Error('NewsON returned another or unavailable station.');
  return selected;
}

function liveChoice(data) {
  for (const key of ['live', 'alwayson']) {
    const row = data?.item?.playables?.[key];
    if (row && ['program', 'stream'].includes(row.videoType) && numericId(row.id)) {
      return {type: row.videoType, id: String(row.id)};
    }
  }
  return null; // A previous newscast is never presented as a live fallback.
}

function latestChoice(data, stationId) {
  const currentLive = data?.item?.playables?.live;
  const rows = Array.isArray(data?.rows) ? data.rows : [];
  if (rows.length > 1000) throw Error('NewsON returned an unexpected station directory.');
  return rows.filter(row => row.type === 'VOD_ROW').flatMap(row => {
    if (!Array.isArray(row.items) || row.items.length > 10000) throw Error('NewsON returned an unexpected video directory.');
    return row.items;
  }).filter(row => row?.type === 'VOD' && row.videoType === 'program' && numericId(row.id) &&
      String(row.station?.id) === String(stationId) && plainText(row.title) &&
      !(currentLive?.videoType === 'program' && String(currentLive.id) === String(row.id)))
    .sort((a, b) => (Number(b.airDate) || 0) - (Number(a.airDate) || 0))
    .map(row => ({type: 'program', id: String(row.id)}))[0] || null;
}

function offer(data, stationId, choice, live, lastAdEnded = 0) {
  const item = data?.item;
  if (String(item?.id) !== choice.id || item?.videoType !== choice.type || String(item?.station?.id) !== String(stationId) || data.isLive !== live) {
    throw Error('NewsON returned a different or unavailable media offer.');
  }
  if (data.adBreakCheck !== false) throw Error('This NewsON stream requires unsupported live ad-break negotiation.');
  const source = Array.isArray(data.sources) ? data.sources[0] : null;
  const url = safeUrl(source?.file);
  if (source?.type !== 'HLS' || !url || source.drm || source.licenseUrl || source.keySystems || data.drm) {
    throw Error('NewsON did not offer supported guest HLS playback.');
  }
  // NewsON expects Unix seconds of the most recently completed ad, or zero.
  // This is not the current time and is not a timestamp in milliseconds.
  if (!Number.isFinite(lastAdEnded) || lastAdEnded < 0 || lastAdEnded > 100_000_000_000) {
    throw Error('Invalid NewsON completed-ad time.');
  }
  const template = typeof data.ads?.default === 'string' ? data.ads.default : '';
  const adTag = template.replaceAll('{date}', String(Math.floor(lastAdEnded)));
  if (adTag && (!safeUrl(adTag) || /\{[^}]*\}/.test(adTag))) throw Error('NewsON returned an unsupported advertising schedule.');
  // For adBreakCheck=false, the publisher schedules ads.default; its other ad
  // fields are used by the separate break-negotiation mode, not extra prerolls.
  return {kind: 'hls', url, adTag, live, nowPlaying: plainText(item.title), tracks: []};
}

/** Recheck current station availability and select a fresh guest offer on every play. */
export async function resolveNewsOn(item, {signal, lastAdEnded = lastCompletedAdSeconds} = {}) {
  const id = String(item?.sourceId ?? '');
  if (!numericId(id) || !['newson-live', 'newson-latest'].includes(item.mode)) throw Error('Invalid NewsON station.');
  const detail = await request('detail/station/' + id, {signal});
  detailStation(detail, id);
  const live = item.mode === 'newson-live';
  const choice = live ? liveChoice(detail) : latestChoice(detail, id);
  if (!choice) throw Error(live ? 'This NewsON station is not currently live.' : 'This station has no current guest newscast.');
  const data = await request('item/' + choice.type + '/' + choice.id, {signal});
  return {
    ...offer(data, id, choice, live, lastAdEnded),
    onAdComplete: () => { lastCompletedAdSeconds = Math.floor(Date.now() / 1000); },
  };
}

function metadata(row, live) {
  return {
    id: 'newson-' + (live ? 'live-' : 'latest-') + row.id,
    provider: 'newson', providerName: 'NewsON', kind: live ? 'live' : 'video',
    title: live ? row.name : 'Latest newscast — ' + row.name,
    description: `${row.name}${row.city ? ' in ' + row.city : ''}${row.state ? ', ' + row.state : ''}. ${live ? 'The current live or always-on offer' : 'The latest available guest newscast'} is checked with NewsON when you press Play.`,
    categories: [...new Set(['Local news', row.state].filter(Boolean))],
    country: 'us', image: row.image, official: 'https://www.newson.us/',
    sourceId: row.id, mode: live ? 'newson-live' : 'newson-latest',
  };
}

/** Maintainer snapshot: stable station cards only, never expiring clips or media offers. */
export async function loadNewsOnSelection({signal, onProgress = () => {}} = {}) {
  const data = await request('search?query=', {signal});
  if (!Array.isArray(data.results) || data.results.length > 2000) throw Error('NewsON station search changed.');
  const unique = new Map();
  for (const group of data.results.filter(row => row?.type === 'STATION_ROW')) {
    if (!Array.isArray(group.items) || group.items.length > 2000) throw Error('NewsON station search changed.');
    for (const raw of group.items) {
      const row = station(raw);
      if (row) unique.set(row.id, row);
    }
  }
  const stations = [...unique.values()].sort((a, b) => a.name.localeCompare(b.name));
  if (!stations.length) throw Error('NewsON did not return a station directory.');
  const live = stations.filter(row => row.tags.length).map(row => metadata(row, true));
  const items = [], failed = [], unsupported = [];
  let next = 0, checked = 0, withoutNewscast = 0;
  await Promise.all(Array.from({length: Math.min(4, stations.length)}, async () => {
    while (next < stations.length) {
      const row = stations[next++];
      try {
        const detail = await request('detail/station/' + row.id, {signal});
        detailStation(detail, row.id);
        const choice = latestChoice(detail, row.id);
        if (!choice) withoutNewscast++;
        else {
          const current = await request('item/' + choice.type + '/' + choice.id, {signal});
          try {
            offer(current, row.id, choice, false);
            items.push(metadata(row, false));
          } catch { unsupported.push(row.id); }
        }
      } catch (error) {
        if (signal?.aborted || error.name === 'AbortError') throw error;
        failed.push(row.id);
      }
      onProgress(++checked, stations.length);
    }
  }));
  items.sort((a, b) => a.title.localeCompare(b.title));
  return {
    items, live,
    report: {
      source: 'NewsON current public website API', country: 'us', stationDirectoryComplete: true,
      stations: stations.length, live: live.length, latestNewscasts: items.length,
      latestStationsChecked: checked, latestDirectoryComplete: failed.length === 0,
      withoutNewscast, unsupportedOffers: unsupported.length, failedStationIds: failed,
      selection: 'Complete advertised live directory plus fresh-resolving latest-newscast cards only where a current supported guest offer was confirmed. No expiring clip or playback URL is persisted.',
    },
  };
}
