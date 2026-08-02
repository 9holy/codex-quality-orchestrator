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
assert.match(skill, /不得为单个单元建立 TeamPlan/);
assert.match(skill, /仅当 2–3 个单元互不依赖、写入不冲突且并行收益更大时建立 TeamPlan/);
assert.match(skill, /不得派生产 Worker/);
assert.match(skill, /仅关键高风险变更可使用只读 `sol_reviewer`/);
assert.match(skill, /\[CQO_WORK_PACKET_V1\]/);
assert.match(skill, /selected_agent/);
assert.match(skill, /selected_effort/);
assert.match(skill, /fallback/);
assert.match(skill, /不要为使用 Worker 切碎任务/);
assert.match(skill, /\.\.\/\.\.\/references\/RULE16\.md/);
assert.match(skill, /\.\.\/\.\.\/routing-policy\.json/);
assert.match(metadata, /allow_implicit_invocation: true/);
assert.match(metadata, /\$codex-quality-routing-team/);
assert.match(rule, /使用 `\$codex-quality-routing-team`/);
assert.match(rule, /单个单元即可下派，不要求并行/);
assert.doesNotMatch(rule, /CQO_WORK_PACKET_V1|selected_effort|hostVisibleTaskNamePattern/);

process.stdout.write('PASS routing skill trigger boundaries and single-worker path\n');
