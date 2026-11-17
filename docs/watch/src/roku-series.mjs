// Public metadata only. Roku retains its external player, accounts, ads and DRM.
import {plainText, safeUrl} from './core.mjs';

const ROOT = 'https://app.roku.com';
const SOURCE = 'https://content.sr.roku.com/content/v1/roku-trc/';
const ID = /^[a-f0-9]{32}$/;
const RECORD = /^[a-f0-9]{32}(?:-\d+)?$/;
const LIMIT = 16_000_000; // Per response, never a per-show episode/season cap.
const EPISODE_FIELDS = 'meta,type,title,seasonNumber,episodeNumber,shortDescription,description,runTimeSeconds,imageMap.grid.path,imageMap.detailBackground.path,genres,categoryObjects,viewOptions.providerId,viewOptions.disabled,viewOptions.providerProductId';
const INCLUDE = ['meta', 'type', 'title', 'imageMap.grid.path', 'imageMap.detailBackground.path', 'shortDescription', 'description', 'genres', 'categoryObjects',
  'seasons.meta', 'seasons.title', 'seasons.seasonNumber', ...EPISODE_FIELDS.split(',').map(key => 'seasons.episodes.' + key),
  ...EPISODE_FIELDS.split(',').map(key => 'episodes.' + key)].join(',');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const number = value => /^\d+$/.test(String(value ?? '')) && Number.isSafeInteger(Number(value)) ? Number(value) : undefined;

function recordId(row) {
  const id = row?.meta?.id;
  if (typeof id === 'string' && RECORD.test(id)) return id;
  for (const raw of [row?.meta?.href, row?.meta?.hrefV2]) {
    const url = safeUrl(raw, ['content.sr.roku.com']);
    if (!url) continue;
    const u = new URL(url);
    const match = /^\/content\/v[12]\/roku-trc\/([a-f0-9]{32}(?:-\d+)?)$/.exec(u.pathname);
    if (match && !u.search && !u.hash) return match[1];
  }
  return '';
}

export function rokuEpisodeIsFree(row) {
  if (!Array.isArray(row?.viewOptions)) return false;
  return row.viewOptions.some(option => {
    if (option?.providerId !== 'rokuavod') return false;
    const disabled = option.disabled;
    const enabled = disabled === undefined || disabled === null || disabled === false || disabled === 0 || ['false', '0', ''].includes(String(disabled).toLowerCase());
    return enabled && (option.providerProductId === undefined || option.providerProductId === null || String(option.providerProductId).trim() === '');
  });
}

function artwork(row) {
  const values = ['grid', 'detailBackground', 'gridEpg', 'detailPoster'].map(key => row?.imageMap?.[key]?.path);
  values.push(...(Array.isArray(row?.images) ? row.images.map(image => image?.path) : []));
  return values.map(value => safeUrl(value)).find(Boolean) || '';
}

function genres(row) {
  return [...new Set([...(Array.isArray(row?.genres) ? row.genres : []),
    ...(Array.isArray(row?.categoryObjects) ? row.categoryObjects.map(category => category?.title) : [])]
    .filter(value => typeof value === 'string').map(plainText).filter(Boolean))];
}

function apiUrl(id, expand) {
  if (!RECORD.test(id)) throw Error('Invalid Roku metadata identity.');
  const url = new URL(ROOT + '/api/v2/homescreen/content/' + encodeURIComponent(SOURCE + id));
  if (expand) url.searchParams.set('expand', expand);
  url.searchParams.set('include', INCLUDE);
  return url.href;
}

async function publicJson(id, expand, options, counters) {
  const {fetcher, signal} = options;
  const unavailableStatuses = new Map();
  for (let attempt = 0; attempt < 3; attempt++) {
    signal?.throwIfAborted();
    await options.beforeRequest?.();
    signal?.throwIfAborted();
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, {once: true});
    const timer = setTimeout(abort, 30000);
    try {
      counters.requests++;
      const url = apiUrl(id, expand);
      const response = await fetcher(url, {method: 'GET', signal: controller.signal, credentials: 'omit', cache: 'no-store', redirect: 'error'});
      if (!response.ok) {
        const error = Error(`Roku metadata returned HTTP ${response.status}.`);
        error.status = response.status;
        const retryAfter = response.headers?.get('retry-after');
        if (retryAfter) {
          const seconds = /^\d+$/.test(retryAfter.trim()) ? Number(retryAfter) : Math.ceil((Date.parse(retryAfter) - Date.now()) / 1000);
          if (Number.isFinite(seconds) && seconds >= 0) error.retryAfterSeconds = seconds;
        }
        if ([404,410].includes(response.status)) {
          const confirmed = (unavailableStatuses.get(response.status) || 0) + 1;
          unavailableStatuses.set(response.status, confirmed);
          error.confirmedUnavailable = confirmed > 1;
        }
        throw error;
      }
      if (response.url) {
        const final = safeUrl(response.url, ['app.roku.com']);
        if (!final || new URL(final).pathname !== new URL(url).pathname) throw Error('Roku returned an unexpected metadata address.');
      }
      const text = await response.text();
      const bytes = new TextEncoder().encode(text).length;
      counters.bytes += bytes;
      if (bytes > LIMIT) throw Error('Roku metadata exceeds the per-response size limit.');
      let data;
      try { data = JSON.parse(text); } catch { throw Error('Roku returned unexpected metadata instead of JSON.'); }
      if (recordId(data) !== id) throw Error('Roku returned a different metadata identity.');
      return data;
    } catch (error) {
      if (signal?.aborted) throw error;
      const retryable = !error.confirmedUnavailable && !(error.retryAfterSeconds > 0) && (error.name === 'AbortError' || [404, 410, 500, 502, 503, 504].includes(error.status) || error instanceof TypeError);
      if (!retryable || attempt === 2) throw error;
      counters.retries++;
      await wait(250 * (attempt + 1));
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    }
  }
}

function metadataFailure(resourceId, stage, error) {
  return {resourceId, stage, reason: String(error?.message || 'Roku metadata could not be loaded.').replace(/https?:\/\/\S+/g, '[metadata service]').slice(0,240),
    ...(Number.isInteger(error?.status) ? {status: error.status} : {}),
    ...(Number.isFinite(error?.retryAfterSeconds) ? {retryAfterSeconds:error.retryAfterSeconds} : {})};
}

function unresolved(row) {
  return !Array.isArray(row?.viewOptions) && row?.meta?.hasViewOptions !== false;
}

async function expandOne(candidate, options) {
  const sourceId = candidate?.sourceId;
  if (!ID.test(sourceId ?? '')) throw Error('Invalid Roku series identity.');
  const counters = {requests: 0, bytes: 0, retries: 0};
  const episodes = new Map(), seasons = new Map(), unavailable = new Map(), invalid = [], failures = [];
  let root = null, accessRestricted = false;
  const doneRecords = new Set();
  function addEpisode(row, seasonNumber) {
    const id = recordId(row);
    if (!ID.test(id)) { invalid.push({kind: 'episode', reason: 'Invalid or missing 32-character episode identity.'}); return; }
    const previous = episodes.get(id) || {};
    const merged = {...previous, ...row, meta: {...previous.meta, ...row.meta}};
    const selectedSeason = number(row.seasonNumber) ?? number(row.meta?.seasonNumber) ?? number(row.season?.seasonNumber) ?? seasonNumber ?? previous.resolvedSeason;
    if (selectedSeason !== undefined) merged.resolvedSeason = selectedSeason;
    episodes.set(id, merged);
  }
  function consume(data, context = {}) {
    if (!root && data.type === 'series') root = data;
    for (const field of ['seasons', 'episodes']) if (data[field] !== undefined && !Array.isArray(data[field])) {
      failures.push({resourceId: context.resourceId || sourceId, stage: field, layout: true, reason: 'Roku returned an unsupported paged collection shape; completeness is not assumed.'});
    }
    const currentSeason = seasons.get(context.resourceId);
    if (currentSeason && Array.isArray(data.episodes)) {
      currentSeason.hasEpisodeArray = true;
      currentSeason.number ??= number(data.seasonNumber);
      currentSeason.episodeIds = [...new Set([...currentSeason.episodeIds, ...data.episodes.map(recordId).filter(value => ID.test(value))])];
    }
    if (Array.isArray(data.episodes)) for (const row of data.episodes) addEpisode(row, context.seasonNumber ?? number(data.seasonNumber));
    if (Array.isArray(data.seasons)) for (const row of data.seasons) {
      const n = number(row.seasonNumber) ?? number(row.meta?.seasonNumber);
      let id = recordId(row);
      // The season number is publisher-supplied, not a guessed 1..N scan.
      if (!id && n !== undefined) id = sourceId + '-' + n;
      if (!id) { invalid.push({kind: 'season', reason: 'Missing published season identity/number.'}); continue; }
      const previous = seasons.get(id) || {};
      const ids = Array.isArray(row.episodes) ? row.episodes.map(recordId).filter(value => ID.test(value)) : previous.episodeIds || [];
      seasons.set(id, {...previous, sourceId: id, number: n ?? previous.number, title: plainText(row.title) || previous.title || '',
        episodeIds: [...new Set([...(previous.episodeIds || []), ...ids])],
        hasEpisodeArray: Array.isArray(row.episodes) || previous.hasEpisodeArray || false});
      if (Array.isArray(row.episodes)) for (const episode of row.episodes) addEpisode(episode, n);
    }
  }
  async function read(id, expand, stage, context = {}) {
    try {
      const data = await publicJson(id, expand, options, counters);
      unavailable.delete(id);
      if (id === sourceId && data.type && data.type !== 'series') throw Error('Roku did not return this series.');
      if (context.isEpisode) addEpisode(data, context.seasonNumber);
      else consume(data, {resourceId: id, ...context});
      doneRecords.add(id + ':' + (expand || 'references'));
      return true;
    } catch (error) {
      if (options.signal?.aborted) throw error;
      if ([403,429].includes(error.status) || error.retryAfterSeconds > 0) accessRestricted = true;
      if (error.confirmedUnavailable) {
        unavailable.set(id, {resourceId: id, stage, status: error.status, confirmed: true,
          sourcePath: 'roku-trc/' + id, recordType: id === sourceId ? 'series' : context.isEpisode ? 'episode' : 'season'});
        return false;
      }
      failures.push(metadataFailure(id, stage, error));
      return false;
    }
  }

  const nested = await read(sourceId, 'seasons,seasons.episodes', 'nested seasons');
  if (!nested && !accessRestricted && !unavailable.has(sourceId)) await read(sourceId, 'seasons', 'season references');
  // Ask the flat layout only where the nested layout left stubs/unknown access.
  if (!accessRestricted && !unavailable.has(sourceId) && (!episodes.size || [...episodes.values()].some(unresolved))) await read(sourceId, 'episodes', 'flat episodes');

  // Every published season is considered; there is no per-show season cap.
  for (const season of seasons.values()) {
    if (accessRestricted) break;
    if (season.hasEpisodeArray && season.episodeIds.every(id => episodes.has(id) && !unresolved(episodes.get(id)))) continue;
    const loaded = await read(season.sourceId, 'episodes', 'season episodes', {seasonNumber: season.number});
    if (!loaded && !accessRestricted && !unavailable.has(season.sourceId)) await read(season.sourceId, '', 'season episode references', {seasonNumber: season.number});
  }
  // A record may advertise episodes only as metadata references. Fetch all of
  // those references, including ones whose series parent advertised paid plans.
  for (const [id, row] of episodes) if (unresolved(row)) {
    if (accessRestricted) break;
    await read(id, '', 'episode eligibility', {seasonNumber: row.resolvedSeason, isEpisode: true});
  }

  const sharedCategories = [...new Set([...(candidate.categories || []), ...genres(root)].map(plainText).filter(Boolean))];
  const title = plainText(root?.title || candidate.title).slice(0,240) || 'Roku series';
  const seriesId = 'roku-series-' + sourceId;
  const image = artwork(root) || safeUrl(candidate.image) || '';
  const items = [];
  let paidEpisodes = 0, noOfferEpisodes = 0, unresolvedEpisodes = 0;
  for (const [id, row] of episodes) {
    if (unavailable.has(id)) continue;
    if (unresolved(row)) { unresolvedEpisodes++; continue; }
    if (!rokuEpisodeIsFree(row)) {
      if (Array.isArray(row.viewOptions) && row.viewOptions.length) paidEpisodes++;
      else noOfferEpisodes++;
      continue;
    }
    const seasonNumber = row.resolvedSeason ?? number(row.seasonNumber) ?? number(row.meta?.seasonNumber);
    const episodeNumber = number(row.episodeNumber) ?? number(row.meta?.episodeNumber);
    const fallback = [seasonNumber === undefined ? '' : 'Season ' + seasonNumber, episodeNumber === undefined ? '' : 'Episode ' + episodeNumber].filter(Boolean).join(' · ') || 'Episode';
    const duration = Number(row.runTimeSeconds);
    items.push({id: 'roku-' + id, sourceId: id, provider: 'roku', providerName: 'Roku', kind: 'episode', mode: 'roku-link',
      title: plainText(row.title).slice(0,240) || fallback,
      description: plainText(row.description || row.shortDescription).slice(0,1600) || `${title} · ${fallback}. This episode has a current enabled free Roku Channel option; Roku retains playback and access decisions.`,
      image: artwork(row) || image,
      categories: [...new Set([...sharedCategories, ...genres(row), ...(seasonNumber === undefined ? [] : ['Season ' + seasonNumber])])],
      seriesId, episodeOf: seriesId, seriesTitle: title,
      ...(seasonNumber === undefined ? {} : {seasonNumber}), ...(episodeNumber === undefined ? {} : {episodeNumber}),
      ...(Number.isFinite(duration) && duration > 0 ? {duration: Math.round(duration)} : {}),
      official: ROOT + '/details/' + id, watchUrl: ROOT + '/watch/' + id, freeGuestVerified: true});
  }
  items.sort((a,b) => (a.seasonNumber ?? Infinity) - (b.seasonNumber ?? Infinity) || (a.episodeNumber ?? Infinity) - (b.episodeNumber ?? Infinity) || a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
  // A failed large/legacy layout is recovered if every advertised identity is
  // now resolved. Unrecovered fetch failures remain explicit in the report.
  const unresolvedFailures = failures.filter(failure => {
    if (failure.layout) return true;
    if (unavailable.has(failure.resourceId)) return false;
    if (failure.resourceId === sourceId) return !root || unresolvedEpisodes > 0 || !episodes.size;
    if (ID.test(failure.resourceId)) return unresolved(episodes.get(failure.resourceId));
    const season = seasons.get(failure.resourceId);
    return !season?.hasEpisodeArray || season.episodeIds.some(id => !unavailable.has(id) && (!episodes.has(id) || unresolved(episodes.get(id))));
  });
  const complete = !accessRestricted && (!!root || unavailable.has(sourceId)) && !invalid.length && !unresolvedEpisodes && !unresolvedFailures.length;
  const providerSeries = items.length ? [{id: seriesId, sourceId, provider: 'roku', providerName: 'Roku', title,
    description: plainText(root?.description || root?.shortDescription || candidate.description).slice(0,4000),
    image, categories: [...new Set(['Series', ...sharedCategories])], shelves: candidate.shelves || [],
    official: ROOT + '/details/' + sourceId, episodes: items.map(item => item.id), episodeCount: items.length,
    freeEpisodeCount: items.length, publishedEpisodeCount: episodes.size, complete,
    freeGuestVerified: true, parentFreeOptionVerified: candidate.freeOptionVerified === true}] : [];
  return {sourceId, items, providerSeries, report: {sourceId, title, complete, parentCardAccess: candidate.cardAccess || '',
    candidateFreeOptionVerified: candidate.freeOptionVerified === true, seasons: seasons.size, publishedEpisodes: episodes.size,
    freeEpisodes: items.length, paidEpisodes, noOfferEpisodes, unresolvedEpisodes, invalidReferences: invalid,
    availability: unavailable.has(sourceId) ? 'unavailable' : root ? 'available' : 'unresolved',
    accessRestricted,
    restrictionStatuses: [...new Set(failures.filter(failure=>[403,429].includes(failure.status) || failure.retryAfterSeconds > 0).map(failure=>failure.status))],
    retryAfterSeconds: Math.max(0,...failures.map(failure=>failure.retryAfterSeconds || 0)),
    unavailableSourceRecords: [...unavailable.values()],
    metadataRequests: counters.requests, metadataBytes: counters.bytes, retries: counters.retries,
    recoveredFailures: failures.length - unresolvedFailures.length, failures: unresolvedFailures}};
}

/** Metadata-only, unbounded-by-title expansion of every supplied candidate. */
export async function expandRokuSeries(candidates, {fetcher = globalThis.fetch, signal, concurrency = 3,
  requestIntervalMs = 0, resume = [], onProgress = () => {}, onCheckpoint = () => {}} = {}) {
  if (!Array.isArray(candidates) || typeof fetcher !== 'function') throw Error('Roku series candidates/fetcher are required.');
  const unique = new Map();
  for (const candidate of candidates) {
    if (!ID.test(candidate?.sourceId ?? '')) throw Error('Invalid Roku series candidate identity.');
    unique.set(candidate.sourceId, candidate);
  }
  const restored = new Map((Array.isArray(resume) ? resume : []).filter(result => ID.test(result?.sourceId ?? '') && result.report?.complete === true && Array.isArray(result.items) && Array.isArray(result.providerSeries)).map(result => [result.sourceId,result]));
  const results = new Map(), queue = [...unique.values()];
  let next = 0, done = 0, accessRestricted = false;
  let nextRequestAt = 0;
  const interval = Math.max(0,Number(requestIntervalMs) || 0);
  const beforeRequest = async () => {
    const start = Math.max(Date.now(),nextRequestAt);
    nextRequestAt = start + interval;
    if (start > Date.now()) await wait(start-Date.now());
  };
  await Promise.all(Array.from({length: Math.max(1, Math.min(8, Number(concurrency) || 3, queue.length || 1))}, async () => {
    while (next < queue.length && !accessRestricted) {
      signal?.throwIfAborted();
      const candidate = queue[next++];
      let result = restored.get(candidate.sourceId);
      if (!result) {
        try { result = await expandOne(candidate, {fetcher, signal, beforeRequest}); }
        catch (error) {
          if (signal?.aborted) throw error;
          result = {sourceId: candidate.sourceId, items: [], providerSeries: [], report: {sourceId: candidate.sourceId, title: plainText(candidate.title), complete: false, freeEpisodes: 0, failures: [metadataFailure(candidate.sourceId, 'series expansion', error)]}};
        }
      }
      results.set(candidate.sourceId, result);
      if (result.report.accessRestricted) accessRestricted = true;
      onProgress(++done, queue.length, result.report);
      await onCheckpoint({schema: 1, completed: [...results.values()].filter(value => value.report.complete).map(value => value.sourceId), processed: done, total: queue.length}, result);
    }
  }));
  const ordered = queue.map(candidate => results.get(candidate.sourceId)).filter(Boolean);
  const items = ordered.flatMap(result => result.items), providerSeries = ordered.flatMap(result => result.providerSeries);
  const owners = new Map();
  for (const item of items) { const ids = owners.get(item.id) || new Set(); ids.add(item.seriesId); owners.set(item.id,ids); }
  const sharedEpisodeIds = [...owners].filter(([,ids]) => ids.size > 1).map(([episodeId,ids]) => ({episodeId,seriesIds:[...ids]}));
  const report = {scope: 'All published season/episode metadata reachable under the supplied candidate series. No per-show season/episode cap and no paid-parent pruning.',
    complete: ordered.length === queue.length && ordered.every(result => result.report.complete), candidates: queue.length, checked: ordered.length,
    accessRestricted, remainingCandidates: queue.filter(candidate => !results.has(candidate.sourceId)).map(candidate => candidate.sourceId),
    retryAfterSeconds: Math.max(0,...ordered.map(result=>result.report.retryAfterSeconds || 0)),
    includedSeries: providerSeries.length, episodeCards: items.length, uniqueEpisodeIds: owners.size,
    sharedEpisodeIds, emptySeries: ordered.filter(result => result.report.complete && !result.items.length).length,
    noFreeSeries: ordered.filter(result => result.report.complete && result.report.availability !== 'unavailable' && !result.items.length).length,
    unavailableSeries: ordered.filter(result => result.report.availability === 'unavailable').length,
    unavailableSourceRecords: ordered.flatMap(result => (result.report.unavailableSourceRecords || []).map(record => ({seriesId:'roku-series-'+result.sourceId,...record}))),
    incompleteSeries: ordered.filter(result => !result.report.complete).map(result => result.report),
    metadataRequests: ordered.reduce((sum,result) => sum + (result.report.metadataRequests || 0), 0),
    metadataBytes: ordered.reduce((sum,result) => sum + (result.report.metadataBytes || 0), 0)};
  return {items, providerSeries, report, results: ordered, checkpoint: {schema: 1, completed: ordered.filter(result => result.report.complete).map(result => result.sourceId)}};
}
