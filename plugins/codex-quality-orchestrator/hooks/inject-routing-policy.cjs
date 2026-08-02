'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { getRadarEvidence } = require('./radar-routing-evidence.cjs');

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

function writeRuntimeSmokeProof(nonce, details) {
  const requestedPath = process.env.CQO_RUNTIME_SMOKE_PROOF_PATH;
  if (!/^[a-f0-9]{32}$/.test(nonce ?? '') || !requestedPath) return null;

  const tempRoot = `${path.resolve(os.tmpdir())}${path.sep}`.toLowerCase();
  const proofPath = path.resolve(requestedPath);
  if (!proofPath.toLowerCase().startsWith(tempRoot)) {
    throw new Error('runtime smoke proof path must be inside the OS temporary directory');
  }

  const temporaryPath = `${proofPath}.tmp-${process.pid}-${Date.now()}`;
  try {
    fs.writeFileSync(
      temporaryPath,
      `${JSON.stringify({
        schemaVersion: 1,
        hookEventName: 'SessionStart',
        nonce,
        rule16Status: details.rule16Status,
        missingProfiles: details.missingProfiles,
        radarStatus: details.radarStatus,
      })}\n`,
      { encoding: 'utf8', flag: 'wx' },
    );
    fs.renameSync(temporaryPath, proofPath);
  } finally {
    if (fs.existsSync(temporaryPath)) fs.rmSync(temporaryPath, { force: true });
  }
  return proofPath;
}

async function main() {
  const canonical = fs.readFileSync(canonicalPath, 'utf8').trim();
  const policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
  const home = codexHome();
  const agentsDir = path.join(home, 'agents');
  const missingProfiles = Object.values(policy.namedAgents)
    .map((agent) => agent.profileFile)
    .filter((file) => !fs.existsSync(path.join(agentsDir, file)));

  const globalAgentsPath = path.join(home, 'AGENTS.md');
  const installedRule = fs.existsSync(globalAgentsPath)
    ? extractRule16(fs.readFileSync(globalAgentsPath, 'utf8'))
    : null;

  const notes = [];
  const runtimeSmokeNonce = process.env.CQO_RUNTIME_SMOKE_NONCE;
  const rule16Status =
    installedRule === null ? 'injected' : installedRule === canonical ? 'match' : 'mismatch';
  if (installedRule === null) {
    notes.push(`[CQO_RULE16_INJECTED]\n${canonical}`);
  } else if (installedRule !== canonical) {
    notes.push(
      '[CQO_RULE16_MISMATCH] Codex Quality Orchestrator 检测到' +
        '全局 Rule 16 与插件规则不一致。' +
        '暂停具名代理调度并公开报告，完成规则同步后再继续。',
    );
  } else {
    notes.push('[CQO_ACTIVE]');
  }

  if (missingProfiles.length > 0) {
    notes.push(
      `[CQO_AGENT_PROFILES_MISSING] 缺少具名代理配置：${missingProfiles.join(', ')}。` +
        '在完成显式安装前不得调用这些代理，也不得静默回退。',
    );
  }

  let radarStatus = 'skipped';
  if (
    rule16Status === 'match' &&
    missingProfiles.length === 0 &&
    process.env.CQO_RADAR_DISABLE !== '1'
  ) {
    const radar = await getRadarEvidence({
      codexHome: home,
      config: policy.radarEvidence,
    });
    radarStatus = radar.status;
    if (radar.context) {
      notes.push(radar.context);
    }
  } else if (process.env.CQO_RADAR_DISABLE === '1') {
    radarStatus = 'disabled';
  }

  if (/^[a-f0-9]{32}$/.test(runtimeSmokeNonce ?? '')) {
    notes.push(`[CQO_RUNTIME_SMOKE:${runtimeSmokeNonce}]`);
    try {
      writeRuntimeSmokeProof(runtimeSmokeNonce, {
        rule16Status,
        missingProfiles,
        radarStatus,
      });
      notes.push('[CQO_RUNTIME_SMOKE_PROOF_WRITTEN]');
    } catch (error) {
      notes.push(`[CQO_RUNTIME_SMOKE_PROOF_ERROR] ${error.message}`);
    }
  }

  process.stdout.write(
    `${JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: notes.join('\n\n'),
      },
    })}\n`,
  );
}

main().catch((error) => {
  process.stdout.write(
    `${JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext:
          `[CQO_SESSION_START_ERROR] Codex Quality Orchestrator 加载失败：${error.message}。` +
          '停止自动调度并公开报告。',
      },
    })}\n`,
  );
});
