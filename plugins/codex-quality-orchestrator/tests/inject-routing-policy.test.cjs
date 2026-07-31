'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const pluginRoot = path.resolve(__dirname, '..');
const hookPath = path.join(pluginRoot, 'hooks', 'inject-routing-policy.cjs');
const templateDir = path.join(pluginRoot, 'templates', 'agents');
const canonicalPath = path.join(pluginRoot, 'references', 'RULE16.md');
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-quality-session-'));
const codexHome = path.join(tempRoot, '.codex');
const agentsDir = path.join(codexHome, 'agents');

function installProfiles() {
  fs.mkdirSync(agentsDir, { recursive: true });
  for (const file of fs.readdirSync(templateDir)) {
    fs.copyFileSync(path.join(templateDir, file), path.join(agentsDir, file));
  }
}

function invoke(runtimeSmokeNonce, runtimeSmokeProofPath) {
  const env = { ...process.env, CODEX_HOME: codexHome };
  delete env.CQO_RUNTIME_SMOKE_NONCE;
  delete env.CQO_RUNTIME_SMOKE_PROOF_PATH;
  if (runtimeSmokeNonce !== undefined) {
    env.CQO_RUNTIME_SMOKE_NONCE = runtimeSmokeNonce;
  }
  if (runtimeSmokeProofPath !== undefined) {
    env.CQO_RUNTIME_SMOKE_PROOF_PATH = runtimeSmokeProofPath;
  }
  const result = spawnSync(process.execPath, [hookPath], {
    encoding: 'utf8',
    env,
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout).hookSpecificOutput.additionalContext;
}

try {
  installProfiles();
  fs.writeFileSync(
    path.join(codexHome, 'AGENTS.md'),
    fs.readFileSync(canonicalPath, 'utf8'),
    'utf8',
  );
  fs.writeFileSync(
    path.join(codexHome, 'config.toml'),
    [
      'model = "gpt-5.6-sol"',
      'model_reasoning_effort = "xhigh"',
      '[profiles.unrelated]',
      'model = "nested-model-must-not-win"',
      'model_reasoning_effort = "ultra"',
      '',
    ].join('\n'),
    'utf8',
  );

  const canonical = invoke();
  assert.match(canonical, /\[CQO_SESSION_START_LOADED\]/);
  assert.match(canonical, /\[CQO_RULE16_MATCH\]/);
  assert.match(canonical, /全局 Rule 16 与插件规则一致/);
  assert.match(canonical, /gpt-5\.6-sol \/ xhigh/);
  assert.doesNotMatch(canonical, /nested-model-must-not-win/);
  assert.match(canonical, /插件不会改写/);
  assert.match(canonical, /普通非短任务默认使用 gpt-5\.6-sol \/ xhigh/);

  const nonce = '0123456789abcdef0123456789abcdef';
  const proofPath = path.join(tempRoot, 'session-start-proof.json');
  assert.match(invoke(nonce, proofPath), new RegExp(`\\[CQO_RUNTIME_SMOKE:${nonce}\\]`));
  assert.deepEqual(JSON.parse(fs.readFileSync(proofPath, 'utf8')), {
    schemaVersion: 1,
    hookEventName: 'SessionStart',
    nonce,
    rule16Status: 'match',
    missingProfiles: [],
  });
  const outsideProofPath = path.join(os.homedir(), '.cqo-runtime-smoke-outside-proof.json');
  fs.rmSync(outsideProofPath, { force: true });
  assert.match(invoke(nonce, outsideProofPath), /\[CQO_RUNTIME_SMOKE_PROOF_ERROR\]/);
  assert.equal(fs.existsSync(outsideProofPath), false);
  assert.doesNotMatch(invoke('invalid nonce'), /\[CQO_RUNTIME_SMOKE:/);

  fs.writeFileSync(
    path.join(codexHome, 'config.toml'),
    '[profiles.unrelated]\nmodel = "nested-only"\nmodel_reasoning_effort = "ultra"\n',
    'utf8',
  );
  assert.doesNotMatch(invoke(), /全局 config\.toml 的根代理默认值为/);

  fs.rmSync(path.join(agentsDir, 'luna-worker.toml'));
  const missingProfile = invoke();
  assert.match(missingProfile, /\[CQO_AGENT_PROFILES_MISSING\]/);
  assert.match(missingProfile, /缺少具名代理配置：luna-worker\.toml/);
  installProfiles();

  fs.writeFileSync(path.join(codexHome, 'AGENTS.md'), '## Rule 16 — stale\n', 'utf8');
  const mismatch = invoke();
  assert.match(mismatch, /\[CQO_RULE16_MISMATCH\]/);
  assert.match(mismatch, /全局 Rule 16 与插件规则不一致/);

  fs.rmSync(path.join(codexHome, 'AGENTS.md'));
  fs.rmSync(path.join(codexHome, 'config.toml'));
  const injected = invoke();
  assert.match(injected, /\[CQO_SESSION_START_LOADED\]/);
  assert.match(injected, /\[CQO_RULE16_INJECTED\]/);
  assert.match(injected, /## Rule 16 — 默认多模型质量编排/);

  process.stdout.write('PASS session policy injection and root-default advisory\n');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
