'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const hookPath = path.resolve(
  __dirname,
  '..',
  'hooks',
  'continue-capacity-subagent.cjs',
);
const capacityMessage =
  'Selected model is at capacity. Please try a different model.';
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cqo-capacity-'));

function invoke(payload, prefix = '') {
  return spawnSync(process.execPath, [hookPath], {
    input: `${prefix}${JSON.stringify(payload)}`,
    encoding: 'utf8',
    env: { ...process.env, CODEX_HOME: tempRoot },
  });
}

try {
  const first = invoke({
    session_id: 'capacity-session',
    agent_id: 'capacity-agent',
    hook_event_name: 'SubagentStop',
    agent_type: 'luna_worker',
    stop_hook_active: false,
    last_assistant_message: capacityMessage,
  });
  assert.equal(first.status, 0, first.stderr);
  assert.deepEqual(JSON.parse(first.stdout), {
    decision: 'block',
    reason: '继续',
  });

  const doubleBom = invoke(
  {
    session_id: 'capacity-double-bom',
    agent_id: 'capacity-double-bom-agent',
    hook_event_name: 'SubagentStop',
    agent_type: 'luna_worker',
    stop_hook_active: false,
    last_assistant_message: capacityMessage,
  },
  '\uFEFF\uFEFF',
);
  assert.equal(doubleBom.status, 0, doubleBom.stderr);
  assert.deepEqual(JSON.parse(doubleBom.stdout), {
    decision: 'block',
    reason: '继续',
  });

  for (const payload of [
  {
    session_id: 'capacity-active',
    agent_id: 'capacity-active-agent',
    hook_event_name: 'SubagentStop',
    agent_type: 'luna_worker',
    stop_hook_active: true,
    last_assistant_message: capacityMessage,
  },
  {
    session_id: 'capacity-complete',
    agent_id: 'capacity-complete-agent',
    hook_event_name: 'SubagentStop',
    agent_type: 'terra_worker',
    stop_hook_active: false,
    last_assistant_message: '任务完成。',
  },
  {
    session_id: 'capacity-other-event',
    agent_id: 'capacity-other-event-agent',
    hook_event_name: 'PostToolUse',
    stop_hook_active: false,
    last_assistant_message: capacityMessage,
  },
]) {
    const ignored = invoke(payload);
    assert.equal(ignored.status, 0, ignored.stderr);
    assert.equal(ignored.stdout, '');
  }

  const invalid = spawnSync(process.execPath, [hookPath], {
    input: '{not-json',
    encoding: 'utf8',
    env: { ...process.env, CODEX_HOME: tempRoot },
  });
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stderr, /容量续交 Hook 失败/);

  process.stdout.write('PASS one automatic in-place capacity continuation\n');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
