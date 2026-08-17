'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const pluginRoot = path.resolve(__dirname, '..');
const hookPath = path.join(pluginRoot, 'hooks', 'inject-routing-policy.cjs');
const templateDir = path.join(pluginRoot, 'templates', 'agents');
const canonical = fs.readFileSync(path.join(pluginRoot, 'references', 'ROUTING_MATRIX.md'), 'utf8').trim();
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cqo-session-'));
const codexHome = path.join(tempRoot, '.codex');
const agentsDir = path.join(codexHome, 'agents');

function installProfiles() {
  fs.mkdirSync(agentsDir, { recursive: true });
  for (const file of fs.readdirSync(templateDir)) {
    if (file.endsWith('.toml')) fs.copyFileSync(path.join(templateDir, file), path.join(agentsDir, file));
  }
}

function invoke(options = {}) {
  const env = { ...process.env, CODEX_HOME: codexHome, CQO_RADAR_DISABLE: '1' };
  delete env.CQO_RUNTIME_SMOKE_NONCE;
  delete env.CQO_RUNTIME_SMOKE_PROOF_PATH;
  if (options.nonce) env.CQO_RUNTIME_SMOKE_NONCE = options.nonce;
  if (options.proofPath) env.CQO_RUNTIME_SMOKE_PROOF_PATH = options.proofPath;
  const result = spawnSync(process.execPath, [hookPath], { encoding: 'utf8', env });
  assert.equal(result.status, 0, result.stderr);
  if (!result.stdout.trim()) return '';
  return JSON.parse(result.stdout).hookSpecificOutput.additionalContext;
}

try {
  installProfiles();
  fs.writeFileSync(path.join(codexHome, 'AGENTS.md'), `${canonical}\n`);
  assert.equal(invoke(), '', 'matching routing matrix must stay silent');

  const nonce = '0123456789abcdef0123456789abcdef';
  const proofPath = path.join(tempRoot, 'proof.json');
  assert.match(invoke({ nonce, proofPath }), new RegExp(`CQO_RUNTIME_SMOKE:${nonce}`));
  assert.deepEqual(JSON.parse(fs.readFileSync(proofPath, 'utf8')), {
    schemaVersion: 1,
    hookEventName: 'SessionStart',
    nonce,
    routingMatrixStatus: 'match',
    missingProfiles: [],
    radarStatus: 'disabled',
  });

  fs.rmSync(path.join(agentsDir, 'luna-worker.toml'));
  assert.match(invoke(), /CQO_AGENT_PROFILES_MISSING.*luna-worker\.toml/s);
  installProfiles();

  fs.writeFileSync(path.join(codexHome, 'AGENTS.md'), '## User Project Rule\n\nuser content\n');
  const inserted = invoke();
  assert.match(inserted, /^\[CQO_ROUTING_MATRIX_INJECTED\]/);
  assert.match(inserted, /Codex Routing Matrix/);
  assert.doesNotMatch(inserted, /暂停具名代理|全局路由矩阵与插件规则不一致/);

  fs.writeFileSync(path.join(codexHome, 'AGENTS.md'), canonical.replace(/^## .*$/m, '## Rule 8 - user numbering'));
  assert.equal(invoke(), '', 'matching rule with a non-16 number must stay silent');

  fs.rmSync(path.join(codexHome, 'AGENTS.md'));
  assert.equal(invoke(), `[CQO_ROUTING_MATRIX_INJECTED]\n${canonical}`);

  const outside = path.join(os.homedir(), '.cqo-outside-proof.json');
  fs.rmSync(outside, { force: true });
  assert.match(invoke({ nonce, proofPath: outside }), /CQO_RUNTIME_SMOKE_PROOF_ERROR/);
  assert.equal(fs.existsSync(outside), false);

  process.stdout.write('PASS silent matching session rule and nonblocking refresh\n');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
