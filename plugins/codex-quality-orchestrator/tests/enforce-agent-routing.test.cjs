'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const pluginRoot = path.resolve(__dirname, '..');
const hookPath = path.join(pluginRoot, 'hooks', 'enforce-agent-routing.cjs');
const templateDir = path.join(pluginRoot, 'templates', 'agents');
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cqo-routing-'));
const codexHome = path.join(tempRoot, '.codex');
const agentsDir = path.join(codexHome, 'agents');
let invocation = 0;

function installProfiles() {
  fs.mkdirSync(agentsDir, { recursive: true });
  for (const file of fs.readdirSync(templateDir)) {
    if (file.endsWith('.toml')) fs.copyFileSync(path.join(templateDir, file), path.join(agentsDir, file));
  }
}

function payload(input, toolName = 'collaborationspawn_agent') {
  invocation += 1;
  return JSON.stringify({
    session_id: `session-${invocation}`,
    tool_use_id: `tool-${invocation}`,
    tool_name: toolName,
    tool_input: input,
  });
}

function invoke(input, options = {}) {
  const result = spawnSync(process.execPath, [hookPath], {
    input: options.raw ?? payload(input, options.toolName),
    encoding: 'utf8',
    env: { ...process.env, CODEX_HOME: codexHome },
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function expectAllow(name, input, options) {
  assert.equal(invoke(input, options), '', `${name} should be allowed`);
}

function expectDeny(name, input, options) {
  const output = invoke(input, options);
  assert.notEqual(output, '', `${name} should be denied`);
  assert.equal(JSON.parse(output).hookSpecificOutput.permissionDecision, 'deny');
}

function label(agentType, effort) {
  if (agentType === 'luna_worker') return 'luna_max';
  if (agentType === 'sol_medium_worker') return 'sol_medium';
  if (agentType === 'terra_worker') return `terra_${effort}`;
  return 'sol_reviewer_xhigh';
}

function workerInput(agentType, overrides = {}) {
  const effort = overrides.reasoning_effort ?? (
    agentType === 'terra_worker' ? 'xhigh' : agentType === 'luna_worker' ? 'max' :
      agentType === 'sol_medium_worker' ? 'medium' : 'xhigh'
  );
  const input = {
    agent_type: agentType,
    fork_turns: 'none',
    task_name: `${label(agentType, effort)}__unit_${invocation + 1}`,
    message: 'gAAAA-host-encrypted-subagent-message',
    ...overrides,
  };
  if (agentType === 'terra_worker' && !Object.hasOwn(overrides, 'reasoning_effort')) {
    input.reasoning_effort = effort;
  }
  return input;
}

try {
  installProfiles();

  expectAllow('luna-max', workerInput('luna_worker'));
  expectAllow('sol-medium', workerInput('sol_medium_worker'));
  expectAllow('reviewer-xhigh', workerInput('sol_reviewer'));
  for (const effort of ['xhigh', 'max', 'ultra']) {
    expectAllow(`terra-${effort}`, workerInput('terra_worker', {
      reasoning_effort: effort,
      task_name: `terra_${effort}__unit_${effort}`,
    }));
  }
  expectAllow('positive-fork', workerInput('luna_worker', { fork_turns: '2' }));
  for (const depth of [1, 2, 3, 4]) {
    expectAllow(`burst-d${depth}`, workerInput('luna_worker', {
      task_name: `luna_max__d${depth}_unit`,
      message: `[CQO_WORK_PACKET_V1]\nburst_depth=d${depth}\nburst_delegate=yes`,
    }));
  }
  expectAllow('dotted-tool-name', workerInput('luna_worker'), { toolName: 'collaboration.spawn_agent' });
  expectAllow('double-bom', null, { raw: `\uFEFF\uFEFF${payload(workerInput('luna_worker'))}` });

  expectAllow('unrelated-named-agent', {
    agent_type: 'default', fork_turns: 'all', task_name: 'other_task', message: 'other skill',
  });
  expectAllow('unrelated-bare-model', {
    model: 'gpt-5.5', reasoning_effort: 'high', fork_turns: '1', message: 'other skill',
  });
  expectAllow('unrelated-tool', workerInput('luna_worker'), { toolName: 'read_file' });

  expectDeny('missing-message', workerInput('luna_worker', { message: '' }));
  expectDeny('missing-fork', workerInput('luna_worker', { fork_turns: undefined }));
  expectDeny('fork-all', workerInput('luna_worker', { fork_turns: 'all' }));
  expectDeny('model-override', workerInput('luna_worker', { model: 'gpt-5.6-luna' }));
  expectDeny('luna-effort-override', workerInput('luna_worker', { reasoning_effort: 'xhigh' }));
  expectDeny('sol-medium-effort-override', workerInput('sol_medium_worker', { reasoning_effort: 'high' }));
  expectDeny('reviewer-effort-override', workerInput('sol_reviewer', { reasoning_effort: 'max' }));
  expectDeny('terra-high', workerInput('terra_worker', { reasoning_effort: 'high' }));
  expectDeny('bad-task-name', workerInput('luna_worker', { task_name: 'plain_name' }));
  expectDeny('burst-missing-depth', workerInput('luna_worker', {
    task_name: 'luna_max__d2_unit', message: 'burst_delegate=yes',
  }));
  expectDeny('burst-wrong-depth', workerInput('luna_worker', {
    task_name: 'luna_max__d3_unit', message: 'burst_depth=d2\nburst_delegate=yes',
  }));
  expectDeny('normal-with-burst-fields', workerInput('luna_worker', {
    task_name: 'luna_max__normal_unit', message: 'burst_depth=d1\nburst_delegate=yes',
  }));
  expectDeny('d4-delegates', workerInput('luna_worker', {
    task_name: 'luna_max__d4_unit', message: 'burst_depth=d4\nburst_delegate=yes\n调用 spawn_agent',
  }));
  expectDeny('wrong-task-route', workerInput('terra_worker', {
    reasoning_effort: 'ultra', task_name: 'terra_max__wrong_effort',
  }));

  const duplicate = workerInput('luna_worker', { task_name: 'luna_max__repeatable_unit' });
  expectAllow('first-same-name', duplicate);
  expectAllow('second-same-name', duplicate);

  fs.rmSync(path.join(agentsDir, 'luna-worker.toml'));
  expectDeny('missing-profile', workerInput('luna_worker'));
  installProfiles();
  fs.appendFileSync(path.join(agentsDir, 'terra-worker.toml'), '\nmodel_reasoning_effort = "max"\n');
  expectDeny('terra-pinned-effort', workerInput('terra_worker', { reasoning_effort: 'max' }));
  installProfiles();

  fs.writeFileSync(path.join(codexHome, 'AGENTS.md'), '## Rule 16 — project override\n');
  expectAllow('rule-text-does-not-block', workerInput('luna_worker'));
  expectDeny('invalid-json', null, { raw: '{not-json' });

  process.stdout.write('PASS CQO-only visible routing contract and unrelated-agent pass-through\n');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
