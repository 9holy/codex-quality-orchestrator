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

function expectAllow(name, input, rawInput) {
  assert.equal(invoke(input, rawInput), '', `${name} should be allowed`);
}

function expectDeny(name, input, rawInput) {
  const output = invoke(input, rawInput);
  assert.notEqual(output, '', `${name} should be denied`);
  const parsed = JSON.parse(output);
  assert.equal(parsed.hookSpecificOutput.permissionDecision, 'deny');
}

function makePacket(agentType, overrides = {}) {
  const workUnitId = overrides.work_unit_id ?? `${agentType}_task`;
  const packet = {
    work_unit_id: workUnitId,
    objective: '完成隔离测试工作单元。',
    scope: ['仅处理声明范围。'],
    write_paths: [],
    acceptance: ['结果满足验收条件。'],
    verification: ['运行指定验证命令。'],
    task_intent: 'verify',
    mutation_authority: 'none',
    backup_required: false,
    selected_agent: agentType,
    selected_effort: agentType === 'luna_worker' ? 'max' : 'xhigh',
    fallback_agent:
      agentType === 'luna_worker' ? 'terra_worker' : 'sol_controller',
    worker_attempt: 1,
    ...overrides,
  };
  return {
    task_name: workUnitId,
    message:
      `[CQO_WORK_PACKET_V1]\n${JSON.stringify(packet)}\n` +
      '[/CQO_WORK_PACKET_V1]',
  };
}

function workerInput(agentType, input = {}, packetOverrides = {}) {
  return {
    agent_type: agentType,
    fork_turns: '1',
    ...makePacket(agentType, packetOverrides),
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
  for (const effort of ['xhigh', 'max']) {
    expectAllow(`terra-${effort}`, workerInput('terra_worker', {
      reasoning_effort: effort,
      fork_turns: 'none',
    }, { selected_effort: effort }));
  }
  expectAllow('luna-profile', workerInput('luna_worker'));
  expectAllow(
    'hyphenated-work-unit',
    workerInput('luna_worker', {}, { work_unit_id: 'luna-audit-01' }),
  );
  expectAllow(
    'terra-second-attempt',
    workerInput('terra_worker', { reasoning_effort: 'max' }, {
      selected_effort: 'max',
      worker_attempt: 2,
    }),
  );
  expectAllow(
    'luna-double-bom',
    null,
    `\uFEFF\uFEFF${JSON.stringify({
      tool_name: 'collaborationspawn_agent',
      tool_input: workerInput('luna_worker'),
    })}`,
  );

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
  expectDeny('terra-high', workerInput('terra_worker', {
    reasoning_effort: 'high',
  }));
  expectDeny('luna-effort-override', workerInput('luna_worker', {
    reasoning_effort: 'high',
  }));
  expectDeny('retired-reviewer', {
    agent_type: 'sol_reviewer',
    fork_turns: '1',
  });
  expectDeny('default-agent', { agent_type: 'default', fork_turns: '1' });
  expectDeny('fork-all', { agent_type: 'luna_worker', fork_turns: 'all' });
  expectDeny('invalid-json', null, '{not-json');
  expectDeny('missing-work-packet', {
    agent_type: 'luna_worker',
    fork_turns: '1',
  });
  expectDeny(
    'selected-agent-mismatch',
    workerInput('luna_worker', {}, { selected_agent: 'terra_worker' }),
  );
  expectDeny(
    'readonly-with-write-path',
    workerInput('terra_worker', { reasoning_effort: 'xhigh' }, {
      write_paths: ['src/app.js'],
    }),
  );
  for (const badPath of [
    '../../outside',
    'C:/Windows/system32',
    'C:drive-relative',
    '\\server\\share',
  ]) {
    expectDeny(
      `path-boundary-${badPath}`,
      workerInput('terra_worker', { reasoning_effort: 'xhigh' }, {
        selected_effort: 'xhigh',
        task_intent: 'mutate',
        mutation_authority: 'declared_paths',
        backup_required: true,
        write_paths: [badPath],
      }),
    );
  }
  expectDeny(
    'invalid-worker-attempt',
    workerInput('terra_worker', { reasoning_effort: 'xhigh' }, { worker_attempt: 3 }),
  );
  expectDeny(
    'selected-effort-mismatch',
    workerInput('terra_worker', { reasoning_effort: 'max' }, { selected_effort: 'xhigh' }),
  );
  expectDeny(
    'invalid-terra-fallback',
    workerInput('terra_worker', { reasoning_effort: 'xhigh' }, {
      fallback_agent: 'luna_worker',
    }),
  );
  expectDeny(
    'invalid-luna-direct-sol-fallback',
    workerInput('luna_worker', {}, { fallback_agent: 'sol_controller' }),
  );
  expectDeny(
    'task-name-mismatch',
    workerInput('luna_worker', { task_name: 'different_task' }),
  );

  fs.rmSync(path.join(agentsDir, 'luna-worker.toml'));
  expectDeny('missing-profile', workerInput('luna_worker'));
  installProfiles();

  fs.appendFileSync(
    path.join(agentsDir, 'terra-worker.toml'),
    '\nmodel_reasoning_effort = "max"\n',
    'utf8',
  );
  expectDeny('terra-pinned-effort', workerInput('terra_worker', {
    reasoning_effort: 'max',
  }));
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
  expectAllow('canonical-global-rule', workerInput('luna_worker'));

  process.stdout.write('PASS worker-only routing hook matrix (7 allow, 28 deny)\n');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
