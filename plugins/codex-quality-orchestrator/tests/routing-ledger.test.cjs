'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const pluginRoot = path.resolve(__dirname, '..');
const policy = JSON.parse(
  fs.readFileSync(path.join(pluginRoot, 'routing-policy.json'), 'utf8'),
);
const {
  registerDispatch,
  trackSubagentStart,
  trackSubagentStop,
} = require('../hooks/routing-ledger.cjs');

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cqo-ledger-'));
const previousHome = process.env.CODEX_HOME;
process.env.CODEX_HOME = tempRoot;

function payload(sessionId, sequence) {
  return {
    session_id: sessionId,
    turn_id: `turn-${sequence}`,
    tool_use_id: `tool-${sequence}`,
  };
}

function packet(id, overrides = {}) {
  return {
    work_unit_id: id,
    selected_agent: 'luna_worker',
    selected_effort: 'max',
    fallback_agent: 'terra_worker',
    worker_attempt: 1,
    wave_id: 'wave-1',
    wave_size: 1,
    worker_slot: 1,
    ...overrides,
  };
}

function startStop(sessionId, agentId, agentType) {
  trackSubagentStart({
    session_id: sessionId,
    agent_id: agentId,
    agent_type: agentType,
  }, policy);
  trackSubagentStop({ session_id: sessionId, agent_id: agentId }, policy, false);
}

try {
  assert.equal(registerDispatch(payload('duplicate', 1), packet('unit-a'), policy), null);
  assert.match(
    registerDispatch(payload('duplicate', 2), packet('unit-a'), policy),
    /不能重复 attempt=1/,
  );

  assert.match(
    registerDispatch(payload('missing-first', 1), packet('unit-b', {
      selected_agent: 'terra_worker',
      selected_effort: 'xhigh',
      fallback_agent: 'sol_controller',
      worker_attempt: 2,
    }), policy),
    /必须存在.*attempt=1/,
  );

  assert.equal(registerDispatch(payload('fallback', 1), packet('unit-c'), policy), null);
  startStop('fallback', 'agent-c1', 'luna_worker');
  assert.equal(registerDispatch(payload('fallback', 2), packet('unit-c', {
    selected_agent: 'terra_worker',
    selected_effort: 'xhigh',
    fallback_agent: 'sol_controller',
    worker_attempt: 2,
  }), policy), null);
  assert.match(
    registerDispatch(payload('fallback', 3), packet('unit-c', {
      selected_agent: 'terra_worker',
      selected_effort: 'xhigh',
      fallback_agent: 'sol_controller',
      worker_attempt: 2,
    }), policy),
    /已经使用过 attempt=2/,
  );

  for (let slot = 1; slot <= 3; slot += 1) {
    assert.equal(registerDispatch(payload('parallel', slot), packet(`parallel-${slot}`, {
      wave_id: 'wave-parallel',
      wave_size: 3,
      worker_slot: slot,
    }), policy), null);
  }
  assert.match(
    registerDispatch(payload('parallel', 4), packet('parallel-4', {
      wave_id: 'wave-next',
    }), policy),
    /达到并发上限/,
  );
  trackSubagentStart({
    session_id: 'parallel',
    agent_id: 'parallel-agent-1',
    agent_type: 'luna_worker',
  }, policy);
  trackSubagentStop({
    session_id: 'parallel',
    agent_id: 'parallel-agent-1',
  }, policy, false);
  assert.equal(registerDispatch(payload('parallel', 5), packet('parallel-4', {
    wave_id: 'wave-next',
  }), policy), null);

  assert.equal(registerDispatch(payload('slot-conflict', 1), packet('slot-a', {
    wave_id: 'wave-shared',
    wave_size: 2,
    worker_slot: 1,
  }), policy), null);
  assert.match(
    registerDispatch(payload('slot-conflict', 2), packet('slot-b', {
      wave_id: 'wave-shared',
      wave_size: 2,
      worker_slot: 1,
    }), policy),
    /slot=1 已被占用/,
  );

  for (let index = 1; index <= policy.team.maxRootWorkerAttempts; index += 1) {
    assert.equal(registerDispatch(payload('root-budget', index), packet(`budget-${index}`, {
      wave_id: `budget-wave-${index}`,
    }), policy), null);
    startStop('root-budget', `budget-agent-${index}`, 'luna_worker');
  }
  assert.match(
    registerDispatch(payload('root-budget', 9), packet('budget-9', {
      wave_id: 'budget-wave-9',
    }), policy),
    /根任务最多允许 8 次 Worker 调用/,
  );

  process.stdout.write('PASS governed session routing ledger\n');
} finally {
  if (previousHome === undefined) delete process.env.CODEX_HOME;
  else process.env.CODEX_HOME = previousHome;
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
