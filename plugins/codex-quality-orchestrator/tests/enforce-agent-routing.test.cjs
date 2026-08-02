'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const pluginRoot = path.resolve(__dirname, '..');
const hookPath = path.join(pluginRoot, 'hooks', 'enforce-agent-routing.cjs');
const templateDir = path.join(pluginRoot, 'templates', 'agents');
const canonicalPath = path.join(pluginRoot, 'references', 'RULE16.md');
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-quality-orchestrator-'));
const codexHome = path.join(tempRoot, '.codex');
const agentsDir = path.join(codexHome, 'agents');
let invocation = 0;

function installProfiles() {
  fs.mkdirSync(agentsDir, { recursive: true });
  for (const file of fs.readdirSync(templateDir)) {
    const source = path.join(templateDir, file);
    if (!file.endsWith('.toml') || !fs.statSync(source).isFile()) continue;
    fs.copyFileSync(source, path.join(agentsDir, file));
  }
}

function payloadFor(sessionId, toolUseId, input) {
  return JSON.stringify({
    session_id: sessionId,
    turn_id: `turn-${toolUseId}`,
    tool_use_id: toolUseId,
    tool_name: 'collaborationspawn_agent',
    tool_input: input,
  });
}

function invoke(input, rawInput) {
  invocation += 1;
  const payload = rawInput ?? payloadFor(
    `routing-test-${invocation}`,
    `tool-${invocation}`,
    input,
  );
  const result = spawnSync(process.execPath, [hookPath], {
    input: Buffer.from(payload, 'utf8'),
    encoding: 'utf8',
    env: { ...process.env, CODEX_HOME: codexHome },
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function expectAllow(name, input, rawInput) {
  assert.equal(invoke(input, rawInput), '', `${name} should be allowed`);
}

function expectDeny(name, input, rawInput) {
  const output = invoke(input, rawInput);
  assert.notEqual(output, '', `${name} should be denied`);
  assert.equal(JSON.parse(output).hookSpecificOutput.permissionDecision, 'deny');
}

function routeName(id, overrides = {}) {
  const agentType = overrides.agentType ?? 'luna_worker';
  const effort = overrides.effort ?? (
    agentType === 'luna_worker' ? 'max' : agentType === 'sol_reviewer' ? 'xhigh' : 'ultra'
  );
  const routeLabel = `${agentType.replace(/_worker$/, '')}_${effort}`;
  const wave = overrides.wave ?? 1;
  const slot = overrides.slot ?? 1;
  const size = overrides.size ?? 1;
  const attempt = overrides.attempt ?? 1;
  return `${routeLabel}__${id}__w${wave}__s${slot}of${size}__a${attempt}`;
}

function workerInput(agentType, input = {}, route = {}) {
  const effort = input.reasoning_effort ?? (
    agentType === 'luna_worker' ? 'max' : agentType === 'sol_reviewer' ? 'xhigh' : 'ultra'
  );
  return {
    agent_type: agentType,
    fork_turns: '1',
    task_name: routeName(route.id ?? `${agentType}_task`, {
      ...route,
      agentType,
      effort,
    }),
    message: 'gAAAA-host-encrypted-subagent-message',
    ...input,
  };
}

try {
  installProfiles();

  for (const effort of ['medium', 'high', 'xhigh', 'max', 'ultra']) {
    expectDeny(`sol-child-${effort}`, {
      model: 'gpt-5.6-sol',
      reasoning_effort: effort,
      fork_turns: '1',
    });
  }
  expectAllow('terra-ultra', workerInput('terra_worker', {
    reasoning_effort: 'ultra',
    fork_turns: 'none',
  }, { id: 'terra_ultra' }));
  expectAllow('luna-profile', workerInput('luna_worker'));
  expectAllow('sol-reviewer', workerInput('sol_reviewer', { fork_turns: 'none' }));
  expectAllow('hyphenated-unit', workerInput('luna_worker', {}, { id: 'luna-audit-01' }));
  expectAllow('encrypted-host-message', workerInput('luna_worker', {}, { id: 'encrypted_message' }));
  expectAllow(
    'double-bom',
    null,
    `\uFEFF\uFEFF${payloadFor(
      'routing-test-double-bom',
      'tool-double-bom',
      workerInput('luna_worker', {}, { id: 'double_bom' }),
    )}`,
  );

  expectDeny('gpt-5.5', { model: 'gpt-5.5', reasoning_effort: 'high', fork_turns: '1' });
  expectDeny('bare-terra', { model: 'gpt-5.6-terra', reasoning_effort: 'max', fork_turns: '1' });
  expectDeny('bare-luna', { model: 'gpt-5.6-luna', reasoning_effort: 'max', fork_turns: '1' });
  expectDeny('terra-high', workerInput('terra_worker', { reasoning_effort: 'high' }));
  expectDeny('terra-xhigh', workerInput('terra_worker', { reasoning_effort: 'xhigh' }));
  expectDeny('terra-max', workerInput('terra_worker', { reasoning_effort: 'max' }));
  expectDeny('luna-effort-override', workerInput('luna_worker', { reasoning_effort: 'high' }));
  expectDeny('reviewer-effort-override', workerInput('sol_reviewer', { reasoning_effort: 'max' }));
  expectDeny('reviewer-model-override', workerInput('sol_reviewer', { model: 'gpt-5.6-sol' }));
  expectDeny('reviewer-parallel', workerInput('sol_reviewer', {}, { id: 'review_parallel', size: 2 }));
  expectDeny('reviewer-attempt-two', workerInput('sol_reviewer', {}, { id: 'review_retry', attempt: 2 }));
  expectDeny('default-agent', { agent_type: 'default', fork_turns: '1' });
  expectDeny('fork-all', workerInput('luna_worker', { fork_turns: 'all' }));
  expectDeny('invalid-json', null, '{not-json');
  expectDeny('missing-message', workerInput('luna_worker', { message: '' }));
  expectDeny('invalid-route-name', workerInput('luna_worker', { task_name: 'plain_name' }));
  expectDeny('mismatched-route-effort', workerInput('terra_worker', {
    reasoning_effort: 'ultra',
    task_name: routeName('wrong_effort', {
      agentType: 'terra_worker',
      effort: 'max',
    }),
  }));
  expectDeny('mismatched-route-agent', workerInput('terra_worker', {
    reasoning_effort: 'ultra',
    task_name: routeName('wrong_agent'),
  }));
  expectDeny('invalid-wave-slot', workerInput('luna_worker', {}, { id: 'bad_slot', slot: 3, size: 2 }));
  expectDeny('luna-attempt-two', workerInput('luna_worker', {}, { id: 'luna_retry', attempt: 2 }));
  expectDeny('terra-attempt-two-without-first', workerInput(
    'terra_worker',
    { reasoning_effort: 'ultra' },
    { id: 'terra_retry', attempt: 2 },
  ));

  const duplicate = workerInput('luna_worker', {}, { id: 'duplicate_unit' });
  expectAllow('first-dispatch', null, payloadFor('duplicate-session', 'duplicate-1', duplicate));
  expectDeny('duplicate-dispatch', null, payloadFor('duplicate-session', 'duplicate-2', duplicate));

  fs.rmSync(path.join(agentsDir, 'luna-worker.toml'));
  expectDeny('missing-profile', workerInput('luna_worker'));
  installProfiles();

  fs.appendFileSync(
    path.join(agentsDir, 'terra-worker.toml'),
    '\nmodel_reasoning_effort = "ultra"\n',
    'utf8',
  );
  expectDeny('terra-pinned-effort', workerInput('terra_worker', { reasoning_effort: 'ultra' }));
  installProfiles();

  fs.writeFileSync(path.join(codexHome, 'AGENTS.md'), '## Rule 16 - stale\n', 'utf8');
  expectDeny('global-rule-conflict', workerInput('luna_worker'));
  fs.writeFileSync(
    path.join(codexHome, 'AGENTS.md'),
    fs.readFileSync(canonicalPath, 'utf8'),
    'utf8',
  );
  expectAllow('canonical-global-rule', workerInput('luna_worker', {}, { id: 'canonical_rule' }));

  process.stdout.write('PASS host-visible routing key and worker contract matrix\n');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
