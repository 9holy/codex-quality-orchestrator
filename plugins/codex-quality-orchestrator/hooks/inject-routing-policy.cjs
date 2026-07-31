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

function parseRootTomlString(text, key) {
  for (const rawLine of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) continue;
    if (line.startsWith('[')) break;

    const match = rawLine.match(
      new RegExp(`^\\s*${key}\\s*=\\s*["']([^"']*)["']\\s*(?:#.*)?$`),
    );
    if (match) return match[1];
  }
  return null;
}

function configuredRootNote(home, policy) {
  const configPath = path.join(home, 'config.toml');
  if (!fs.existsSync(configPath)) return null;

  const text = fs.readFileSync(configPath, 'utf8');
  const model = parseRootTomlString(text, 'model');
  const effort = parseRootTomlString(text, 'model_reasoning_effort');
  if (model === null && effort === null) return null;

  const configured = `${model ?? '未设置模型'} / ${effort ?? '未设置档位'}`;
  return (
    `全局 config.toml 的根代理默认值为 ${configured}。` +
    '该值由任务创建时的模型选择器或配置决定，插件不会改写；' +
    `普通非短任务默认使用 ${policy.sol.model} / ${policy.sol.defaultCoordinatorEffort}，` +
    `高风险任务升级到 ${policy.sol.highRiskEffort}，ultra 仅用于极少数超复杂长任务。`
  );
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
      })}\n`,
      { encoding: 'utf8', flag: 'wx' },
    );
    fs.renameSync(temporaryPath, proofPath);
  } finally {
    if (fs.existsSync(temporaryPath)) fs.rmSync(temporaryPath, { force: true });
  }
  return proofPath;
}

function main() {
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

  const notes = ['[CQO_SESSION_START_LOADED]'];
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
    notes.push(
      '[CQO_RULE16_MATCH] Codex Quality Orchestrator 已启用，' +
        '全局 Rule 16 与插件规则一致。',
    );
  }

  const rootNote = configuredRootNote(home, policy);
  if (rootNote !== null) notes.push(rootNote);

  if (missingProfiles.length > 0) {
    notes.push(
      `[CQO_AGENT_PROFILES_MISSING] 缺少具名代理配置：${missingProfiles.join(', ')}。` +
        '在完成显式安装前不得调用这些代理，也不得静默回退。',
    );
  }

  if (/^[a-f0-9]{32}$/.test(runtimeSmokeNonce ?? '')) {
    notes.push(`[CQO_RUNTIME_SMOKE:${runtimeSmokeNonce}]`);
    try {
      writeRuntimeSmokeProof(runtimeSmokeNonce, {
        rule16Status,
        missingProfiles,
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

try {
  main();
} catch (error) {
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
}
