'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const hookPath = path.resolve(__dirname, '..', 'hooks', 'continue-capacity-subagent.cjs');
const message = 'Selected model is at capacity. Please try a different model.';
const testHome = fs.mkdtempSync(require('node:path').join(os.tmpdir(), 'cqo-capacity-'));

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
    env: { ...process.env, CODEX_HOME: testHome },
  });
}

const rootSession = `root-${process.pid}`;
for (let i = 1; i <= 10; i += 1) {
  const result = invoke({ hook_event_name: 'Stop', session_id: rootSession, stop_hook_active: true });
  assert.equal(result.status, 0);
  assert.deepEqual(JSON.parse(result.stdout), { decision: 'block', reason: '继续' });
}
const exhausted = invoke({ hook_event_name: 'Stop', session_id: rootSession, stop_hook_active: true });
assert.equal(exhausted.status, 0);
assert.equal(exhausted.stdout, '');

for (const [name, overrides, prefix] of [
  ['exact', {}, ''],
  ['trimmed', { last_assistant_message: `  ${message}\n` }, ''],
  ['double-bom', {}, '\uFEFF\uFEFF'],
  ['root-stop', { hook_event_name: 'Stop' }, ''],
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
fs.rmSync(testHome, { recursive: true, force: true });
