'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const repoRoot = path.resolve(root, '..', '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const rule = read('references/RULE16.md');
const skill = read('skills/codex-quality-routing-team/SKILL.md');

for (const required of [
  'MUST choose `luna_worker`',
  'Never trial uncertain work on Luna',
  'use `sol_medium_worker` for bounded, moderate-judgment',
  'deep reasoning alone never selects it',
  'clear task-specific quality, context, concurrency, or total-cost advantage',
  'Use Radar once at most per root task',
  'Freeze each route',
  'Selected model is at capacity. Please try a different model.',
  'never switch silently',
  'Preserve the root model and reasoning effort',
]) assert.match(rule, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

for (const forbidden of [
  /high-risk work is never short/i,
  /if Luna is unsuitable, dispatch/i,
  /Luna (?:being )?unsuitable[^.]*must[^.]*Terra/i,
  /trial-dispatch uncertainty is allowed/i,
]) assert.doesNotMatch(rule, forbidden);

assert.ok(rule.indexOf('MUST choose `luna_worker`') < rule.indexOf('When Luna is unsuitable'));
for (const field of ['allowed paths and single-writer owner', 'dependencies', 'acceptance', 'integration order']) {
  assert.match(skill, new RegExp(field));
}
assert.match(skill, /run `node \.\.\/\.\.\/scripts\/radar-routing-evidence\.cjs` once/);
assert.match(skill, /do not run it again/);
assert.match(skill, /Freeze the selected route/);
assert.match(skill, /fallback: current Sol; preserve completed work/);

const docsRoot = path.join(repoRoot, 'docs');
const docPaths = [
  path.join(repoRoot, 'README.md'),
  path.join(docsRoot, 'ROUTING_MATRIX.md'),
  path.join(docsRoot, 'OPERATING_GUIDE.md'),
  path.join(docsRoot, 'REQUIREMENTS.md'),
];
if (docPaths.every((file) => fs.existsSync(file))) {
  const [readme, matrix, guide, requirements] = docPaths.map((file) => fs.readFileSync(file, 'utf8'));
  for (const document of [readme, matrix, guide]) {
    assert.match(document, /Luna/);
    assert.match(document, /Terra/);
    assert.match(document, /Sol/);
    for (const conflict of [
      /Luna 不适用时.{0,12}直接(?:使用|选择|下派) Terra/,
      /Luna 不适用.{0,12}必须(?:使用|选择|下派) Terra/,
      /Luna 不适用时.{0,12}默认(?:使用|选择|下派)? Terra/,
      /Luna 不适用自动触发 Terra/,
    ]) assert.doesNotMatch(document, conflict);
  }
  assert.match(readme, /常规独立判断工作优先 Sol Medium/);
  assert.match(matrix, /适合独立下派的单元优先 Sol Medium/);
  assert.match(guide, /适合独立下派的单元优先使用 Sol Medium/);
  for (const document of [readme, matrix, guide]) assert.match(document, /深推理/);
  assert.match(matrix, /路由确定后冻结/);
  assert.match(guide, /路由选择在当前根任务内冻结/);
  for (const id of [
    'Q01', 'Q02', 'Q03', 'Q04', 'Q05', 'Q06', 'Q07', 'Q08', 'Q09', 'Q10', 'Q11',
    'T01', 'T02', 'T03', 'T04', 'T05', 'T06', 'T07',
    'M01', 'M02', 'M03', 'M04', 'M05', 'M06', 'M07', 'M08',
  ]) assert.match(requirements, new RegExp(`\\| ${id} \\|`));
}

assert.ok(Buffer.from(skill).every((byte) => byte < 128));
assert.ok(Buffer.byteLength(rule, 'utf8') < 3200);
assert.ok(Buffer.byteLength(skill, 'utf8') < 3400);

process.stdout.write('PASS routing semantics and reference-derived plan contract\n');
