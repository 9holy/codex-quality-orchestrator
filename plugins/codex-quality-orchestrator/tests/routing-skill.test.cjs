'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const skillRoot = path.join(root, 'skills', 'codex-quality-routing-team');
const skill = fs.readFileSync(path.join(skillRoot, 'SKILL.md'), 'utf8');
const metadata = fs.readFileSync(path.join(skillRoot, 'agents', 'openai.yaml'), 'utf8');
const rule = fs.readFileSync(path.join(root, 'references', 'RULE16.md'), 'utf8');

for (const text of ['多步骤实现', '跨文件修改', '已定位问题的修复', '调研', '独立验证', '简单问答', '明确小改', '未完成诊断', '架构', '安全']) {
  assert.match(skill, new RegExp(text));
}
for (const text of [
  'Luna Max 能可靠完成',
  '必须优先派 `luna_worker`',
  '不能胜任或不确定就由 Sol 处理',
  '不适用的独立单元才派给能胜任的 Terra 最低档位',
  'Sol 必须检查 Worker 的实际差异',
  '保持当前根模型和推理档位',
]) assert.match(rule, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

assert.match(skill, /调用 `spawn_agent` 时显式传 `agent_type`、`task_name` 和 `fork_turns`/);
assert.match(skill, /默认 `fork_turns:"none"`/);
assert.match(skill, /`terra_worker` 另传 `reasoning_effort`/);
assert.match(skill, /任何具名代理都不传 `model`/);
assert.match(skill, /\[CQO_WORK_PACKET_V1\]/);
for (const field of ['route:', '目标:', '范围:', '验收:']) assert.match(skill, new RegExp(field));
assert.match(skill, /node \.\.\/\.\.\/scripts\/radar-routing-evidence\.cjs/);
assert.doesNotMatch(skill, /Ledger|wave|slot|attempt|fallback/);
assert.ok(Buffer.byteLength(skill, 'utf8') < 2400);
assert.ok(Buffer.byteLength(rule, 'utf8') < 2200);
assert.match(metadata, /allow_implicit_invocation: true/);
assert.match(metadata, /\$codex-quality-routing-team/);
process.stdout.write('PASS concise semantic routing and minimal worker packet\n');
