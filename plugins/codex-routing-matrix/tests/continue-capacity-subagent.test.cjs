'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const hookPath = path.resolve(__dirname, '..', 'hooks', 'continue-capacity-subagent.cjs');
const message = 'Selected model is at capacity. Please try a different model.';

function invoke(overrides = {}, prefix = '') {
  const payload = {
    hook_event_name: 'SubagentStop',
    agent_type: 'luna_worker',
    stop_hook_active: false,
    last_assistant_message: message,
    ...overrides,
  };
  return spawnSync(process.execPath, [hookPath], {
    input: `${prefix}${JSON.stringify(payload)}`,
    encoding: 'utf8',
  });
}

for (const [name, overrides, prefix] of [
  ['exact', {}, ''],
  ['trimmed', { last_assistant_message: `  ${message}\n` }, ''],
  ['double-bom', {}, '\uFEFF\uFEFF'],
]) {
  const result = invoke(overrides, prefix);
  assert.equal(result.status, 0, `${name}: ${result.stderr}`);
  assert.deepEqual(JSON.parse(result.stdout), { decision: 'block', reason: '继续' });
}

for (const overrides of [
  { stop_hook_active: true },
  { last_assistant_message: `前文 ${message}` },
  { last_assistant_message: `${message} 后文` },
  { last_assistant_message: '任务完成。' },
  { hook_event_name: 'PostToolUse' },
]) {
  const result = invoke(overrides);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '');
}

const invalid = spawnSync(process.execPath, [hookPath], { input: '{bad-json', encoding: 'utf8' });
assert.notEqual(invalid.status, 0);
assert.match(invalid.stderr, /容量续交 Hook 失败/);
process.stdout.write('PASS exact one-shot in-place capacity continuation\n');
