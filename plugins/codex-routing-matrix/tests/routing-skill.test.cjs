'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const skillRoot = path.join(root, 'skills', 'codex-quality-routing-team');
const skill = fs.readFileSync(path.join(skillRoot, 'SKILL.md'), 'utf8');
const metadata = fs.readFileSync(path.join(skillRoot, 'agents', 'openai.yaml'), 'utf8');
const rule = fs.readFileSync(path.join(root, 'references', 'ROUTING_MATRIX.md'), 'utf8');

for (const text of ['multi-step implementation', 'cross-file changes', 'located fixes', 'research', 'independent verification', 'simple questions', 'clear tiny edits', 'undiagnosed', 'architectural', 'security']) {
  assert.match(skill, new RegExp(text));
}
for (const text of [
  'MUST choose `luna_worker`',
  'Never trial uncertain work on Luna',
  'use `sol_medium_worker` for bounded, moderate-judgment',
  'deep reasoning alone never selects it',
  'Use Radar once at most per root task',
  'Freeze each route',
  'Sol MUST inspect every Worker result or diff',
  'Preserve the root model and reasoning effort',
  'For homogeneous batches, verify one unit, fill host capacity, and replace completed Workers',
  'Use one blocking wait; never poll',
  'No task-wide cumulative cap',
  'Selected model is at capacity. Please try a different model.',
]) assert.match(rule, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

assert.match(skill, /For `spawn_agent`, always pass `agent_type`, `task_name`, and `fork_turns`/);
assert.match(skill, /Default to `fork_turns:"none"`/);
assert.match(skill, /Pass `reasoning_effort` for `terra_worker`/);
assert.match(skill, /prefer `sol_medium_worker`/);
assert.match(skill, /Never pass `model` for a named agent/);
assert.match(skill, /\[CQO_WORK_PACKET_V1\]/);
for (const field of ['route:', 'goal:', 'scope:', 'acceptance:', 'fallback:']) assert.match(skill, new RegExp(field));
assert.match(skill, /node \.\.\/\.\.\/scripts\/radar-routing-evidence\.cjs/);
assert.match(skill, /do not run it again/);
assert.match(skill, /Freeze the selected route/);
assert.match(skill, /call `wait_agent` once with `timeout_ms:3600000`/);
assert.match(skill, /Never poll `list_agents` or repeat short waits/);
assert.match(skill, /verify one unit, then fill host capacity and replace completed Workers/);
assert.match(skill, /In normal mode, Workers do not delegate/);
assert.match(skill, /Super mode, only an explicitly authorized `d1-d3` Worker may delegate/);
assert.doesNotMatch(skill, /two or three|never exceed three/);
assert.doesNotMatch(rule, /two or three|never exceed three/);
assert.doesNotMatch(skill, /Ledger|wave|slot|attempt/);
assert.ok(Buffer.from(skill).every((byte) => byte < 128));
assert.ok(Buffer.byteLength(skill, 'utf8') < 3400);
assert.ok(Buffer.byteLength(rule, 'utf8') < 3200);
assert.match(metadata, /allow_implicit_invocation: true/);
assert.match(metadata, /\$codex-quality-routing-team/);
process.stdout.write('PASS concise semantic routing and minimal worker packet\n');
