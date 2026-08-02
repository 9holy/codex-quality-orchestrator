'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const pluginRoot = path.resolve(__dirname, '..');
const skillRoot = path.join(pluginRoot, 'skills', 'codex-quality-routing-team');
const skill = fs.readFileSync(path.join(skillRoot, 'SKILL.md'), 'utf8');
const metadata = fs.readFileSync(path.join(skillRoot, 'agents', 'openai.yaml'), 'utf8');
const rule = fs.readFileSync(path.join(pluginRoot, 'references', 'RULE16.md'), 'utf8');

assert.match(skill, /^---\nname: codex-quality-routing-team\n/m);
for (const trigger of [
  '多步骤实现',
  '跨文件修改',
  '已定位问题的修复',
  '测试',
  '扫描',
  '调研',
  '独立验证',
  '单个较大且边界明确',
  '未完成诊断',
]) {
  assert.match(skill, new RegExp(trigger));
}
for (const exclusion of [
  '简单问答',
  '状态查询',
  '明确小改',
  '模糊需求',
  '架构',
  '安全',
  '生产数据',
  '不可逆操作',
]) {
  assert.match(skill, new RegExp(exclusion));
}
assert.match(skill, /已加载时不得再次读取或复述/);
assert.match(skill, /\[CQO_WORK_PACKET_V1\]/);
assert.match(skill, /selected_agent/);
assert.match(skill, /selected_effort/);
assert.match(skill, /fallback/);
assert.match(skill, /调用 `spawn_agent` 必须显式传 `agent_type` 和 `fork_turns`/);
assert.match(skill, /默认 `fork_turns:"none"`/);
assert.match(skill, /`terra_worker` 另传 `reasoning_effort`/);
assert.match(skill, /均不传 `model`/);
assert.match(skill, /Luna 适用或只有一个能胜任候选时不读取 Radar/);
assert.match(skill, /node \.\.\/\.\.\/hooks\/radar-routing-evidence\.cjs/);
assert.match(skill, /\.\.\/\.\.\/references\/RULE16\.md/);
assert.match(skill, /\.\.\/\.\.\/routing-policy\.json/);
assert.ok(Buffer.byteLength(skill, 'utf8') < 1900);
assert.doesNotMatch(skill, /Sol 只做冻结边界所需的调研/);
assert.doesNotMatch(skill, /Worker 结果必须由 Sol 检查/);
assert.match(metadata, /allow_implicit_invocation: true/);
assert.match(metadata, /\$codex-quality-routing-team/);
assert.match(rule, /使用 `\$codex-quality-routing-team`/);
assert.match(rule, /单个单元即可下派，不要求并行/);
assert.match(rule, /Luna Max 能可靠完成时直接选择，不读取 Radar/);
assert.match(rule, /仅当 Luna 不适用且同时存在多个能胜任候选时/);
assert.match(rule, /只读不等于可下派/);
assert.match(rule, /根因未确定的诊断/);
assert.doesNotMatch(rule, /CQO_WORK_PACKET_V1|selected_effort|hostVisibleTaskNamePattern/);

process.stdout.write('PASS routing skill trigger boundaries and single-worker path\n');
