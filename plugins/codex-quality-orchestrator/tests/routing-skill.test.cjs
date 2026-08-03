'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const skillRoot = path.join(root, 'skills', 'codex-quality-routing-team');
const skill = fs.readFileSync(path.join(skillRoot, 'SKILL.md'), 'utf8');
const metadata = fs.readFileSync(path.join(skillRoot, 'agents', 'openai.yaml'), 'utf8');
const rule = fs.readFileSync(path.join(root, 'references', 'RULE16.md'), 'utf8');

for (const text of ['multi-step implementation', 'cross-file changes', 'located fixes', 'research', 'independent verification', 'simple questions', 'clear tiny edits', 'undiagnosed', 'architectural', 'security']) {
  assert.match(skill, new RegExp(text));
}
for (const text of [
  'Luna Max can reliably complete',
  'MUST choose `luna_worker`',
  'when Luna capability is uncertain, keep the unit on Sol',
  'lowest capable Terra effort',
  "Sol MUST inspect the Worker's actual result or diff",
  'Preserve the root model and reasoning effort',
]) assert.match(rule, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

assert.match(skill, /For `spawn_agent`, always pass `agent_type`, `task_name`, and `fork_turns`/);
assert.match(skill, /Default to `fork_turns:"none"`/);
assert.match(skill, /Also pass `reasoning_effort` for `terra_worker`/);
assert.match(skill, /Never pass `model` for a named agent/);
assert.match(skill, /\[CQO_WORK_PACKET_V1\]/);
for (const field of ['route:', 'goal:', 'scope:', 'acceptance:']) assert.match(skill, new RegExp(field));
assert.match(skill, /node \.\.\/\.\.\/scripts\/radar-routing-evidence\.cjs/);
assert.doesNotMatch(skill, /Ledger|wave|slot|attempt|fallback/);
assert.ok(Buffer.from(skill).every((byte) => byte < 128));
assert.ok(Buffer.from(rule).every((byte) => byte < 128));
assert.ok(Buffer.byteLength(skill, 'utf8') < 2400);
assert.ok(Buffer.byteLength(rule, 'utf8') < 2200);
assert.match(metadata, /allow_implicit_invocation: true/);
assert.match(metadata, /\$codex-quality-routing-team/);
process.stdout.write('PASS concise semantic routing and minimal worker packet\n');
