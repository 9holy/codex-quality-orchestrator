'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  ROUTES,
  SOURCE_URL,
  buildRadarSnapshot,
  formatRadarContext,
  getRadarEvidence,
  loadRadarCache,
} = require('../hooks/radar-routing-evidence.cjs');

const NOW = Date.parse('2026-08-02T00:00:00.000Z');
const config = {
  enabled: true,
  sourceUrl: SOURCE_URL,
  refreshSeconds: 6 * 60 * 60,
  maxStaleSeconds: 24 * 60 * 60,
  requestTimeoutMs: 50,
  maxResponseBytes: 1024 * 1024,
  minSamples: 2,
};

function run(passed, gradedAt, cost, duration, extra = {}) {
  return {
    passed,
    graded_at: gradedAt,
    actual_cost_usd: cost,
    duration_sec: duration,
    nickname: 'untrusted participant text',
    ...extra,
  };
}

function payload() {
  return {
    source: 'attacker-controlled source text',
    tasks: [{ title: 'attacker-controlled task title' }],
    cells: {
      'task-a|gpt-5.6-luna|max': {
        ran_by: [
          run(false, '2026-07-30T00:00:00Z', 99, 600),
          run(true, '2026-08-01T00:00:00Z', 1, 60),
        ],
      },
      'task-b|gpt-5.6-luna|max': {
        ran_by: [run(false, '2026-08-01T01:00:00Z', 3, 120)],
      },
      'task-a|gpt-5.6-sol|medium': {
        ran_by: [run(true, '2026-08-01T02:00:00Z', 2, 180)],
      },
      'task-b|gpt-5.6-sol|medium': {
        ran_by: [run(true, '2026-08-01T03:00:00Z', Number.NaN, Infinity)],
      },
      'task-a|gpt-5.6-terra|xhigh': {
        ran_by: [run(true, '2026-08-01T04:00:00Z', 4, 240)],
      },
      'task-b|gpt-5.6-terra|xhigh': {
        ran_by: [run(false, '2026-08-01T05:00:00Z', 6, 300)],
      },
      'task-c|gpt-5.6-sol|high': {
        ran_by: [run(true, undefined, 1, 60)],
      },
      'task-a|gpt-5.5|high': {
        ran_by: [run(true, '2026-08-01T06:00:00Z', 0.01, 1)],
      },
      'malformed|gpt-5.6-sol|medium': {
        ran_by: [{ passed: 'true', graded_at: '2026-08-01T07:00:00Z' }],
      },
    },
  };
}

function responseFor(value) {
  return {
    ok: true,
    text: async () => JSON.stringify(value),
  };
}

(async () => {
  assert.deepEqual(ROUTES.map((route) => `${route.model}|${route.effort}`), [
    'gpt-5.6-luna|max',
    'gpt-5.6-sol|medium',
    'gpt-5.6-sol|high',
    'gpt-5.6-sol|xhigh',
    'gpt-5.6-sol|max',
    'gpt-5.6-sol|ultra',
    'gpt-5.6-terra|xhigh',
    'gpt-5.6-terra|max',
    'gpt-5.6-terra|ultra',
  ]);

  const snapshot = buildRadarSnapshot(payload(), {
    nowMs: NOW,
    minSamples: 2,
  });
  assert.equal(snapshot.source, SOURCE_URL);
  assert.equal(snapshot.collected_at, '2026-08-02T00:00:00.000Z');
  assert.deepEqual(snapshot.items, [
    {
      model: 'gpt-5.6-luna',
      effort: 'max',
      iq: 75,
      samples: 2,
      average_cost_usd: 2,
      cost_samples: 2,
      average_duration_minutes: 1.5,
    },
    {
      model: 'gpt-5.6-sol',
      effort: 'medium',
      iq: 150,
      samples: 2,
      average_cost_usd: 2,
      cost_samples: 1,
      average_duration_minutes: 3,
    },
    {
      model: 'gpt-5.6-terra',
      effort: 'xhigh',
      iq: 75,
      samples: 2,
      average_cost_usd: 5,
      cost_samples: 2,
      average_duration_minutes: 4.5,
    },
  ]);
  const itemKeys = Object.keys(snapshot.items[0]).sort();
  assert.deepEqual(itemKeys, [
    'average_cost_usd',
    'average_duration_minutes',
    'cost_samples',
    'effort',
    'iq',
    'model',
    'samples',
  ]);
  const serialized = JSON.stringify(snapshot);
  assert.doesNotMatch(serialized, /attacker-controlled|nickname|task-a|gpt-5\.5/);

  const context = formatRadarContext(snapshot);
  assert.match(context, /Luna Max 能可靠完成且可独立验收时必须选择，绝不上调/);
  assert.match(context, /仅 Luna Max 不适用后比较/);
  assert.match(context, /IQ 差小于稳定区间（3\.00）视为近似持平/);
  assert.match(context, /Luna Max：IQ=75\.00/);
  assert.ok(context.length < 1400);
  assert.doesNotMatch(context, /attacker-controlled|untrusted/);
  assert.match(formatRadarContext(snapshot, { iqTieMargin: 7 }), /稳定区间（7\.00）/);

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cqo-radar-'));
  const cachePath = path.join(tempRoot, 'radar.json');
  let fetchCalls = 0;
  const fakeFetch = async (url) => {
    fetchCalls += 1;
    assert.equal(url, SOURCE_URL);
    return responseFor(payload());
  };
  try {
    const refreshed = await getRadarEvidence({
      codexHome: tempRoot,
      cachePath,
      config,
      fetchImpl: fakeFetch,
      nowMs: NOW,
    });
    assert.equal(refreshed.status, 'refreshed');
    assert.equal(fetchCalls, 1);
    assert.equal(fs.existsSync(cachePath), true);
    assert.equal(loadRadarCache(cachePath, { minSamples: 2 }).items.length, 3);
    assert.equal(fs.readdirSync(tempRoot).some((name) => name.includes('.tmp-')), false);

    const fresh = await getRadarEvidence({
      codexHome: tempRoot,
      cachePath,
      config,
      fetchImpl: async () => { throw new Error('network must not be used for fresh cache'); },
      nowMs: NOW + 5 * 60 * 60 * 1000,
    });
    assert.equal(fresh.status, 'fresh-cache');
    assert.equal(fetchCalls, 1);

    const stale = await getRadarEvidence({
      codexHome: tempRoot,
      cachePath,
      config,
      fetchImpl: async () => { throw new Error('offline'); },
      nowMs: NOW + 7 * 60 * 60 * 1000,
    });
    assert.equal(stale.status, 'stale-cache');
    assert.notEqual(stale.context, '');

    const expired = await getRadarEvidence({
      codexHome: tempRoot,
      cachePath,
      config,
      fetchImpl: async () => { throw new Error('offline'); },
      nowMs: NOW + 25 * 60 * 60 * 1000,
    });
    assert.equal(expired.status, 'unavailable');
    assert.equal(expired.context, '');
    assert.equal(expired.snapshot, null);

    fs.writeFileSync(cachePath, `${JSON.stringify({
      ...snapshot,
      collected_at: '2099-01-01T00:00:00.000Z',
    })}\n`, 'utf8');
    const futureDated = await getRadarEvidence({
      codexHome: tempRoot,
      cachePath,
      config,
      fetchImpl: async () => { throw new Error('offline'); },
      nowMs: NOW,
    });
    assert.equal(futureDated.status, 'unavailable');
    assert.equal(futureDated.context, '');

    const disabled = await getRadarEvidence({
      codexHome: tempRoot,
      cachePath,
      config: { ...config, sourceUrl: 'https://example.invalid/not-radar' },
      fetchImpl: async () => { throw new Error('disabled source must not be fetched'); },
      nowMs: NOW,
    });
    assert.equal(disabled.status, 'disabled');
    assert.equal(disabled.context, '');

    const invalidPriority = await getRadarEvidence({
      codexHome: tempRoot,
      cachePath,
      config: { ...config, lunaMaxAlwaysFirstWhenCapable: false },
      fetchImpl: async () => { throw new Error('invalid priority must not be fetched'); },
      nowMs: NOW,
    });
    assert.equal(invalidPriority.status, 'disabled');
    assert.equal(invalidPriority.context, '');

    const oversized = await getRadarEvidence({
      codexHome: tempRoot,
      cachePath: path.join(tempRoot, 'oversized.json'),
      config: { ...config, maxResponseBytes: 10 },
      fetchImpl: async () => responseFor(payload()),
      nowMs: NOW,
    });
    assert.equal(oversized.status, 'unavailable');
    assert.equal(oversized.context, '');
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }

  process.stdout.write('PASS sanitized radar aggregation, priority context, and cache lifecycle\n');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
