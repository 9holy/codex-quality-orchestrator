'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const SOURCE_URL = 'https://codexradar.com/api/intelligence-efficiency';
const DEFAULT_CACHE_FILE = path.join(
  'cache',
  'codex-quality-orchestrator',
  'radar-routing-evidence.json',
);
const DEFAULT_CONFIG = Object.freeze({
  enabled: true,
  sourceUrl: SOURCE_URL,
  refreshSeconds: 86400,
  maxStaleSeconds: 259200,
  requestTimeoutMs: 1800,
  maxResponseBytes: 12582912,
  minSamples: 30,
  iqTieMargin: 3,
  lunaMaxAlwaysFirstWhenCapable: true,
});

// This is deliberately duplicated here. The radar must not be able to add a route.
const ROUTES = Object.freeze([
  Object.freeze({ model: 'gpt-5.6-luna', effort: 'max' }),
  Object.freeze({ model: 'gpt-5.6-sol', effort: 'medium' }),
  Object.freeze({ model: 'gpt-5.6-sol', effort: 'high' }),
  Object.freeze({ model: 'gpt-5.6-sol', effort: 'xhigh' }),
  Object.freeze({ model: 'gpt-5.6-sol', effort: 'max' }),
  Object.freeze({ model: 'gpt-5.6-sol', effort: 'ultra' }),
  Object.freeze({ model: 'gpt-5.6-terra', effort: 'xhigh' }),
  Object.freeze({ model: 'gpt-5.6-terra', effort: 'max' }),
  Object.freeze({ model: 'gpt-5.6-terra', effort: 'ultra' }),
]);
const ROUTE_KEYS = new Set(ROUTES.map(({ model, effort }) => `${model}|${effort}`));
const ROUTE_ORDER = new Map(
  ROUTES.map(({ model, effort }, index) => [`${model}|${effort}`, index]),
);

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function nonnegativeNumber(value) {
  const number = finiteNumber(value);
  return number !== null && number >= 0 ? number : null;
}

function round(value, digits) {
  if (value === null || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function asNowMs(value) {
  const number = finiteNumber(value);
  return number === null ? Date.now() : number;
}

function toIso(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toISOString();
}

function configNumber(config, key, fallback, minimum) {
  const value = finiteNumber(config?.[key]);
  return value !== null && value >= minimum ? value : fallback;
}

function normalizeConfig(config = {}) {
  const sourceUrl = (config.sourceUrl ?? SOURCE_URL) === SOURCE_URL ? SOURCE_URL : null;
  const lunaMaxAlwaysFirstWhenCapable =
    config.lunaMaxAlwaysFirstWhenCapable === undefined
      ? true
      : config.lunaMaxAlwaysFirstWhenCapable === true;
  return {
    enabled: config.enabled !== false && sourceUrl !== null && lunaMaxAlwaysFirstWhenCapable,
    sourceUrl,
    refreshSeconds: configNumber(
      config,
      'refreshSeconds',
      DEFAULT_CONFIG.refreshSeconds,
      0,
    ),
    maxStaleSeconds: configNumber(
      config,
      'maxStaleSeconds',
      DEFAULT_CONFIG.maxStaleSeconds,
      0,
    ),
    requestTimeoutMs: configNumber(
      config,
      'requestTimeoutMs',
      DEFAULT_CONFIG.requestTimeoutMs,
      1,
    ),
    maxResponseBytes: Math.floor(
      configNumber(
        config,
        'maxResponseBytes',
        DEFAULT_CONFIG.maxResponseBytes,
        1,
      ),
    ),
    minSamples: Math.floor(
      configNumber(config, 'minSamples', DEFAULT_CONFIG.minSamples, 1),
    ),
    iqTieMargin: configNumber(config, 'iqTieMargin', DEFAULT_CONFIG.iqTieMargin, 0),
    lunaMaxAlwaysFirstWhenCapable,
  };
}

function routeFromKey(key) {
  if (typeof key !== 'string') return null;
  const parts = key.split('|');
  if (parts.length < 3) return null;
  const model = parts[parts.length - 2];
  const effort = parts[parts.length - 1];
  const routeKey = `${model}|${effort}`;
  return ROUTE_KEYS.has(routeKey) ? { model, effort, routeKey } : null;
}

function latestValidRun(cell) {
  if (!isPlainObject(cell) || !Array.isArray(cell.ran_by)) return null;
  const valid = cell.ran_by
    .map((run, index) => {
      if (!isPlainObject(run) || typeof run.passed !== 'boolean') return null;
      const gradedAt = toIso(run.graded_at);
      if (gradedAt === null) return null;
      return {
        run,
        index,
        gradedMs: Date.parse(gradedAt),
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.gradedMs - left.gradedMs || left.index - right.index);
  return valid.length > 0 ? valid[0].run : null;
}

function emptyAggregate(model, effort) {
  return {
    model,
    effort,
    samples: 0,
    passed: 0,
    costs: [],
    durations: [],
  };
}

function canonicalItem(aggregate, minSamples) {
  if (!aggregate || aggregate.samples < minSamples) return null;
  const averageCost = aggregate.costs.length
    ? aggregate.costs.reduce((sum, value) => sum + value, 0) / aggregate.costs.length
    : null;
  const averageDuration = aggregate.durations.length
    ? aggregate.durations.reduce((sum, value) => sum + value, 0) /
      aggregate.durations.length
    : null;
  return {
    model: aggregate.model,
    effort: aggregate.effort,
    iq: round((aggregate.passed / aggregate.samples) * 150, 2),
    samples: aggregate.samples,
    average_cost_usd: round(averageCost, 6),
    cost_samples: aggregate.costs.length,
    average_duration_minutes: round(averageDuration, 2),
  };
}

/**
 * Aggregate only the latest valid run in each task/model/effort cell.
 * Task ids, participant fields, and all other upstream text are discarded.
 */
function buildRadarSnapshot(payload, options = {}) {
  const nowMs = asNowMs(options.nowMs);
  const collectedAt = toIso(options.collectedAt ?? nowMs);
  if (collectedAt === null) throw new Error('invalid collection time');
  const minSamples = Math.max(1, Math.floor(finiteNumber(options.minSamples) ?? 1));
  const cells = isPlainObject(payload) && isPlainObject(payload.cells)
    ? payload.cells
    : Array.isArray(payload?.cells)
      ? Object.fromEntries(
          payload.cells
            .filter((cell) => isPlainObject(cell) && typeof cell.key === 'string')
            .map((cell) => [cell.key, cell]),
        )
      : null;
  if (!cells) throw new Error('radar response has no cells');

  const aggregates = new Map();
  for (const [key, cell] of Object.entries(cells)) {
    const route = routeFromKey(key);
    if (!route) continue;
    const run = latestValidRun(cell);
    if (!run) continue;
    const aggregate = aggregates.get(route.routeKey) ?? emptyAggregate(route.model, route.effort);
    aggregate.samples += 1;
    if (run.passed) aggregate.passed += 1;
    const cost = nonnegativeNumber(run.actual_cost_usd);
    if (cost !== null) aggregate.costs.push(cost);
    const duration = nonnegativeNumber(run.duration_sec);
    if (duration !== null) aggregate.durations.push(duration / 60);
    aggregates.set(route.routeKey, aggregate);
  }

  const items = [...aggregates.entries()]
    .sort(([left], [right]) => ROUTE_ORDER.get(left) - ROUTE_ORDER.get(right))
    .map(([, aggregate]) => canonicalItem(aggregate, minSamples))
    .filter(Boolean);
  return {
    source: SOURCE_URL,
    collected_at: collectedAt,
    items,
  };
}

function normalizeItem(item, minSamples) {
  if (!isPlainObject(item)) return null;
  const model = typeof item.model === 'string' ? item.model : null;
  const effort = typeof item.effort === 'string' ? item.effort : null;
  if (!model || !effort || !ROUTE_KEYS.has(`${model}|${effort}`)) return null;
  const iq = finiteNumber(item.iq);
  const samples = finiteNumber(item.samples);
  const costSamples = finiteNumber(item.cost_samples);
  const averageCost = item.average_cost_usd === null
    ? null
    : nonnegativeNumber(item.average_cost_usd);
  const averageDuration = item.average_duration_minutes === null
    ? null
    : nonnegativeNumber(item.average_duration_minutes);
  if (
    iq === null || iq < 0 || iq > 150 ||
    samples === null || !Number.isInteger(samples) || samples < minSamples ||
    costSamples === null || !Number.isInteger(costSamples) ||
    costSamples < 0 || costSamples > samples ||
    (item.average_cost_usd !== null && averageCost === null) ||
    (item.average_duration_minutes !== null && averageDuration === null)
  ) {
    return null;
  }
  return {
    model,
    effort,
    iq: round(iq, 2),
    samples,
    average_cost_usd: round(averageCost, 6),
    cost_samples: costSamples,
    average_duration_minutes: round(averageDuration, 2),
  };
}

function normalizeSnapshot(snapshot, options = {}) {
  if (!isPlainObject(snapshot) || snapshot.source !== SOURCE_URL) return null;
  const collectedAt = toIso(snapshot.collected_at ?? snapshot.collectedAt);
  if (collectedAt === null || !Array.isArray(snapshot.items)) return null;
  const minSamples = Math.max(1, Math.floor(finiteNumber(options.minSamples) ?? 1));
  const seen = new Set();
  const items = snapshot.items
    .map((item) => normalizeItem(item, minSamples))
    .filter((item) => {
      if (!item) return false;
      const key = `${item.model}|${item.effort}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((left, right) =>
      ROUTE_ORDER.get(`${left.model}|${left.effort}`) -
      ROUTE_ORDER.get(`${right.model}|${right.effort}`),
    );
  return { source: SOURCE_URL, collected_at: collectedAt, items };
}

function resolveCachePath(codexHome, config, explicitPath) {
  const home = path.resolve(
    typeof codexHome === 'string' && codexHome.trim() ? codexHome : path.join(os.homedir(), '.codex'),
  );
  const configured = explicitPath ?? config?.cachePath ?? config?.cacheFile;
  if (typeof configured === 'string' && configured.trim()) {
    return path.resolve(path.isAbsolute(configured) ? configured : path.join(home, configured));
  }
  return path.join(home, DEFAULT_CACHE_FILE);
}

function loadRadarCache(cachePath, options = {}) {
  try {
    const stat = fs.statSync(cachePath);
    const maxBytes = Math.max(1, Math.floor(finiteNumber(options.maxBytes) ?? DEFAULT_CONFIG.maxResponseBytes));
    if (!stat.isFile() || stat.size > maxBytes) return null;
    const parsed = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    return normalizeSnapshot(parsed, { minSamples: options.minSamples });
  } catch {
    return null;
  }
}

function writeRadarCache(cachePath, snapshot) {
  const normalized = normalizeSnapshot(snapshot, { minSamples: 1 });
  if (!normalized) throw new Error('refusing to cache an invalid radar snapshot');
  const directory = path.dirname(cachePath);
  fs.mkdirSync(directory, { recursive: true });
  const temporaryPath = `${cachePath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  try {
    fs.writeFileSync(temporaryPath, `${JSON.stringify(normalized)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
    });
    try {
      fs.renameSync(temporaryPath, cachePath);
    } catch (error) {
      // Windows cannot replace an existing file with renameSync; keep the write atomic
      // whenever possible and only replace the controlled cache target on that platform.
      if (!['EEXIST', 'EPERM', 'ENOTEMPTY'].includes(error.code) || !fs.existsSync(cachePath)) {
        throw error;
      }
      fs.rmSync(cachePath, { force: true });
      fs.renameSync(temporaryPath, cachePath);
    }
  } finally {
    if (fs.existsSync(temporaryPath)) fs.rmSync(temporaryPath, { force: true });
  }
  return normalized;
}

async function readResponseText(response, maxBytes) {
  const contentLength = Number(response?.headers?.get?.('content-length'));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new Error('radar response exceeds size limit');
  }
  if (response?.body?.getReader) {
    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      const chunk = Buffer.from(next.value);
      total += chunk.length;
      if (total > maxBytes) {
        try { await reader.cancel(); } catch { /* best effort */ }
        throw new Error('radar response exceeds size limit');
      }
      chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString('utf8');
  }
  if (typeof response?.text === 'function') {
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > maxBytes) {
      throw new Error('radar response exceeds size limit');
    }
    return text;
  }
  if (typeof response?.json === 'function') {
    const value = await response.json();
    const text = JSON.stringify(value);
    if (Buffer.byteLength(text, 'utf8') > maxBytes) {
      throw new Error('radar response exceeds size limit');
    }
    return text;
  }
  if (isPlainObject(response)) {
    const text = JSON.stringify(response);
    if (Buffer.byteLength(text, 'utf8') > maxBytes) {
      throw new Error('radar response exceeds size limit');
    }
    return text;
  }
  throw new Error('radar response is unreadable');
}

async function fetchSnapshot(fetchImpl, config, nowMs) {
  const fetcher = fetchImpl ?? globalThis.fetch;
  if (typeof fetcher !== 'function') throw new Error('fetch is unavailable');
  const controller = new AbortController();
  let timeout;
  try {
    const request = Promise.resolve().then(() => fetcher(SOURCE_URL, {
      method: 'GET',
      headers: { accept: 'application/json' },
      signal: controller.signal,
    }));
    const timeoutPromise = new Promise((_, reject) => {
      timeout = setTimeout(() => {
        controller.abort();
        reject(new Error('radar request timed out'));
      }, config.requestTimeoutMs);
    });
    const response = await Promise.race([request, timeoutPromise]);
    clearTimeout(timeout);
    timeout = null;
    if (response?.ok === false) throw new Error(`radar request failed (${response.status ?? 'http'})`);
    const responseTimeout = new Promise((_, reject) => {
      timeout = setTimeout(() => {
        controller.abort();
        reject(new Error('radar response timed out'));
      }, config.requestTimeoutMs);
    });
    const text = await Promise.race([readResponseText(response, config.maxResponseBytes), responseTimeout]);
    const payload = JSON.parse(text);
    return buildRadarSnapshot(payload, {
      nowMs,
      minSamples: config.minSamples,
    });
  } finally {
    if (timeout) clearTimeout(timeout);
    controller.abort();
  }
}

function evidenceResult(status, snapshot, config) {
  return {
    context: snapshot ? formatRadarContext(snapshot, config) : '',
    status,
    snapshot: snapshot ?? null,
  };
}

/**
 * Load a fresh cached snapshot, refresh it at most every six hours, and use a
 * cache no older than 24 hours when the fixed endpoint is unavailable.
 */
async function getRadarEvidence({
  codexHome,
  config = DEFAULT_CONFIG,
  fetchImpl,
  nowMs,
  cachePath,
} = {}) {
  const normalizedConfig = normalizeConfig(config);
  if (!normalizedConfig.enabled) return evidenceResult('disabled', null, normalizedConfig);
  const currentMs = asNowMs(nowMs);
  const resolvedCachePath = resolveCachePath(codexHome, config, cachePath);
  let cached = loadRadarCache(resolvedCachePath, {
    maxBytes: normalizedConfig.maxResponseBytes,
    minSamples: normalizedConfig.minSamples,
  });
  if (cached && Date.parse(cached.collected_at) > currentMs) cached = null;
  const cacheAgeMs = cached
    ? Math.max(0, currentMs - Date.parse(cached.collected_at))
    : Number.POSITIVE_INFINITY;
  if (cached && cacheAgeMs < normalizedConfig.refreshSeconds * 1000) {
    return evidenceResult('fresh-cache', cached, normalizedConfig);
  }

  try {
    const snapshot = await fetchSnapshot(fetchImpl, normalizedConfig, currentMs);
    if (snapshot.items.length === 0) return evidenceResult('insufficient', null, normalizedConfig);
    try {
      writeRadarCache(resolvedCachePath, snapshot);
    } catch {
      // A successful network snapshot is still useful for this turn; the next turn retries.
    }
    return evidenceResult('refreshed', snapshot, normalizedConfig);
  } catch {
    if (cached && cacheAgeMs <= normalizedConfig.maxStaleSeconds * 1000) {
      return evidenceResult('stale-cache', cached, normalizedConfig);
    }
    return evidenceResult('unavailable', null, normalizedConfig);
  }
}

function formatNumber(value, digits) {
  return value === null || !Number.isFinite(value) ? 'n/a' : value.toFixed(digits);
}

function findItem(items, model, effort) {
  return items.find((item) => item.model === model && item.effort === effort) ?? null;
}

function isLowerCostPeer(preferred, other, iqTieMargin) {
  const preferredIq = finiteNumber(preferred?.iq);
  const otherIq = finiteNumber(other?.iq);
  const preferredCost = nonnegativeNumber(preferred?.average_cost_usd);
  const otherCost = nonnegativeNumber(other?.average_cost_usd);
  return preferredIq !== null &&
    otherIq !== null &&
    preferredCost !== null &&
    otherCost !== null &&
    preferredIq + iqTieMargin >= otherIq &&
    preferredCost < otherCost;
}

function formatRadarContext(snapshot, config = {}) {
  if (
    config?.lunaMaxAlwaysFirstWhenCapable !== undefined &&
    config.lunaMaxAlwaysFirstWhenCapable !== true
  ) {
    return '';
  }
  const normalized = normalizeSnapshot(snapshot, { minSamples: 1 });
  if (!normalized || normalized.items.length === 0) return '';
  const iqTieMargin = configNumber(
    config,
    'iqTieMargin',
    DEFAULT_CONFIG.iqTieMargin,
    0,
  );
  const item = (model, effort) => findItem(normalized.items, model, effort);
  const relations = [];
  if (isLowerCostPeer(item('gpt-5.6-luna', 'max'), item('gpt-5.6-terra', 'max'), iqTieMargin)) {
    relations.push('可验收执行：Luna Max 优先 Terra Max');
  }
  if (isLowerCostPeer(item('gpt-5.6-sol', 'medium'), item('gpt-5.6-terra', 'max'), iqTieMargin)) {
    relations.push('同角色：Sol Medium 优先 Terra Max');
  }
  if (isLowerCostPeer(item('gpt-5.6-sol', 'medium'), item('gpt-5.6-sol', 'high'), iqTieMargin)) {
    relations.push('Sol：Medium 优先 High');
  }
  if (isLowerCostPeer(item('gpt-5.6-sol', 'xhigh'), item('gpt-5.6-sol', 'max'), iqTieMargin)) {
    relations.push('Sol：XHigh 优先 Max');
  }
  const lines = [
    '[CQO_RADAR]',
    `只比较已通过 Rule 16 能力/风险门槛的候选；IQ 差<${formatNumber(iqTieMargin, 2)} 视为同级，同级先保留热模型/原代理，再选低预计总成本。`,
  ];
  if (relations.length > 0) lines.push(`当前数据：${relations.join('；')}。`);
  lines.push('[/CQO_RADAR]');
  return lines.join('\n');
}

module.exports = {
  DEFAULT_CONFIG,
  ROUTES,
  SOURCE_URL,
  aggregateRadarCells: buildRadarSnapshot,
  buildRadarSnapshot,
  formatRadarContext,
  getRadarEvidence,
  loadRadarCache,
  normalizeConfig,
  normalizeSnapshot,
  resolveCachePath,
  writeRadarCache,
};
