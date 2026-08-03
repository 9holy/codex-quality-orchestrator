'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const pluginRoot = path.resolve(__dirname, '..');
const canonicalPath = path.join(pluginRoot, 'references', 'RULE16.md');
const policyPath = path.join(pluginRoot, 'routing-policy.json');

function codexHome() {
  return process.env.CODEX_HOME
    ? path.resolve(process.env.CODEX_HOME)
    : path.join(os.homedir(), '.codex');
}

function extractRule16(text) {
  const marker = '## Rule 16';
  const start = text.indexOf(marker);
  if (start < 0) return null;
  const section = text.slice(start);
  const nextRule = section.slice(marker.length).search(/^## Rule \d+/m);
  return (nextRule < 0 ? section : section.slice(0, marker.length + nextRule)).trim();
}

function writeRuntimeSmokeProof(nonce, requestedPath, details) {
  if (!/^[a-f0-9]{32}$/.test(nonce ?? '') || !requestedPath) return;
  const tempRoot = `${path.resolve(os.tmpdir())}${path.sep}`.toLowerCase();
  const proofPath = path.resolve(requestedPath);
  if (!proofPath.toLowerCase().startsWith(tempRoot)) {
    throw new Error('runtime smoke proof path must be inside the OS temporary directory');
  }

  const temporaryPath = `${proofPath}.tmp-${process.pid}-${Date.now()}`;
  try {
    fs.writeFileSync(temporaryPath, `${JSON.stringify({
      schemaVersion: 1,
      hookEventName: 'SessionStart',
      nonce,
      ...details,
    })}\n`, { encoding: 'utf8', flag: 'wx' });
    fs.renameSync(temporaryPath, proofPath);
  } finally {
    if (fs.existsSync(temporaryPath)) fs.rmSync(temporaryPath, { force: true });
  }
}

async function main() {
  const canonical = fs.readFileSync(canonicalPath, 'utf8').trim();
  const policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
  const home = codexHome();
  const agentsDir = path.join(home, 'agents');
  const missingProfiles = Object.values(policy.namedAgents)
    .map((agent) => agent.profileFile)
    .filter((file) => !fs.existsSync(path.join(agentsDir, file)));

  const globalPath = path.join(home, 'AGENTS.md');
  const installedRule = fs.existsSync(globalPath)
    ? extractRule16(fs.readFileSync(globalPath, 'utf8'))
    : null;
  const rule16Status = installedRule === null
    ? 'injected'
    : installedRule === canonical ? 'match' : 'refreshed';

  const notes = [];
  if (rule16Status === 'injected') {
    notes.push(`[CQO_RULE16_INJECTED]\n${canonical}`);
  } else if (rule16Status === 'refreshed') {
    notes.push(`[CQO_RULE16_REFRESHED]\n${canonical}`);
  }
  if (missingProfiles.length > 0) {
    notes.push(`[CQO_AGENT_PROFILES_MISSING] 缺少具名代理配置：${missingProfiles.join(', ')}。不得调用缺失的代理。`);
  }

  const runtimeSmokeNonce = process.env.CQO_RUNTIME_SMOKE_NONCE;
  const radarStatus = process.env.CQO_RADAR_DISABLE === '1' ? 'disabled' : 'deferred';
  if (/^[a-f0-9]{32}$/.test(runtimeSmokeNonce ?? '')) {
    notes.push(`[CQO_RUNTIME_SMOKE:${runtimeSmokeNonce}]`);
    try {
      writeRuntimeSmokeProof(runtimeSmokeNonce, process.env.CQO_RUNTIME_SMOKE_PROOF_PATH, {
        rule16Status,
        missingProfiles,
        radarStatus,
      });
      notes.push('[CQO_RUNTIME_SMOKE_PROOF_WRITTEN]');
    } catch (error) {
      notes.push(`[CQO_RUNTIME_SMOKE_PROOF_ERROR] ${error.message}`);
    }
  }

  if (notes.length === 0) return;
  process.stdout.write(`${JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: notes.join('\n\n'),
    },
  })}\n`);
}

main().catch((error) => {
  process.stdout.write(`${JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: `[CQO_SESSION_START_ERROR] 质量路由规则加载失败：${error.message}。停止 CQO 分派并公开报告。`,
    },
  })}\n`);
});
