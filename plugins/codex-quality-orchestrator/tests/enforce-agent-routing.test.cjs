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

function installProfiles() {
  fs.mkdirSync(agentsDir, { recursive: true });
  for (const file of fs.readdirSync(templateDir)) {
    const source = path.join(templateDir, file);
    if (!file.endsWith('.toml') || !fs.statSync(source).isFile()) continue;
    fs.copyFileSync(source, path.join(agentsDir, file));
  }
}

function invoke(input, rawInput) {
  const payload = rawInput ?? JSON.stringify({
    tool_name: 'collaborationspawn_agent',
    tool_input: input,
  });
  const result = spawnSync(process.execPath, [hookPath], {
    input: Buffer.from(payload, 'utf8'),
    encoding: 'utf8',
    env: { ...process.env, CODEX_HOME: codexHome },
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function expectAllow(name, input) {
  assert.equal(invoke(input), '', `${name} should be allowed`);
}

function expectDeny(name, input, rawInput) {
  const output = invoke(input, rawInput);
  assert.notEqual(output, '', `${name} should be denied`);
  const parsed = JSON.parse(output);
  assert.equal(parsed.hookSpecificOutput.permissionDecision, 'deny');
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
  for (const effort of ['xhigh', 'max']) {
    expectAllow(`terra-${effort}`, {
      agent_type: 'terra_worker',
      reasoning_effort: effort,
      fork_turns: 'none',
    });
  }
  expectAllow('luna-profile', { agent_type: 'luna_worker', fork_turns: '1' });

  expectDeny('gpt-5.5', {
    model: 'gpt-5.5',
    reasoning_effort: 'high',
    fork_turns: '1',
  });
  expectDeny('bare-terra', {
    model: 'gpt-5.6-terra',
    reasoning_effort: 'max',
    fork_turns: '1',
  });
  expectDeny('bare-luna', {
    model: 'gpt-5.6-luna',
    reasoning_effort: 'max',
    fork_turns: '1',
  });
  expectDeny('terra-high', {
    agent_type: 'terra_worker',
    reasoning_effort: 'high',
    fork_turns: '1',
  });
  expectDeny('luna-effort-override', {
    agent_type: 'luna_worker',
    reasoning_effort: 'high',
    fork_turns: '1',
  });
  expectDeny('retired-reviewer', {
    agent_type: 'sol_reviewer',
    fork_turns: '1',
  });
  expectDeny('default-agent', { agent_type: 'default', fork_turns: '1' });
  expectDeny('fork-all', { agent_type: 'luna_worker', fork_turns: 'all' });
  expectDeny('invalid-json', null, '{not-json');

  fs.rmSync(path.join(agentsDir, 'luna-worker.toml'));
  expectDeny('missing-profile', { agent_type: 'luna_worker', fork_turns: '1' });
  installProfiles();

  fs.appendFileSync(
    path.join(agentsDir, 'terra-worker.toml'),
    '\nmodel_reasoning_effort = "max"\n',
    'utf8',
  );
  expectDeny('terra-pinned-effort', {
    agent_type: 'terra_worker',
    reasoning_effort: 'max',
    fork_turns: '1',
  });
  installProfiles();

  fs.writeFileSync(path.join(codexHome, 'AGENTS.md'), '## Rule 16 — stale\n', 'utf8');
  expectDeny('global-rule-conflict', {
    model: 'gpt-5.6-sol',
    reasoning_effort: 'xhigh',
    fork_turns: '1',
  });

  fs.writeFileSync(
    path.join(codexHome, 'AGENTS.md'),
    fs.readFileSync(canonicalPath, 'utf8'),
    'utf8',
  );
  expectAllow('canonical-global-rule', {
    agent_type: 'luna_worker',
    fork_turns: '1',
  });

  process.stdout.write('PASS worker-only routing hook matrix (4 allow, 17 deny)\n');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
