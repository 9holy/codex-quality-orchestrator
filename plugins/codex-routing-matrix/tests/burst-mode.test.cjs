'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const hook = path.resolve(__dirname, '..', 'hooks', 'burst-mode.cjs');
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cqo-burst-'));
const emptyHome = fs.mkdtempSync(path.join(os.tmpdir(), 'cqo-context-empty-'));
const configPath = path.join(home, 'config.toml');

function invoke(sessionId, prompt, targetHome = home) {
  const result = spawnSync(process.execPath, [hook], {
    input: JSON.stringify({ session_id: sessionId, prompt }),
    encoding: 'utf8',
    env: { ...process.env, CODEX_HOME: targetHome },
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim() ? JSON.parse(result.stdout).hookSpecificOutput.additionalContext : '';
}

try {
  fs.writeFileSync(configPath, '\uFEFFmodel_context_window = 353400\nmodel_auto_compact_token_limit = 300000\n\n[agents]\nmax_concurrent_threads_per_session = 25\n', 'utf8');
  assert.equal(invoke('a', '普通请求'), '');
  assert.match(invoke('a', '开启爆种模式'), /CQO_BURST_MODE:ON/);
  assert.equal(invoke('a', '继续'), '');
  assert.equal(invoke('b', '继续'), '');
  assert.match(invoke('a', 'disable super mode'), /CQO_BURST_MODE:OFF/);
  assert.match(invoke('a', 'disable super mode'), /Return to normal routing/);
  assert.match(invoke('b', 'enable super mode'), /CQO_BURST_MODE:ON/);
  assert.match(invoke('b', '关闭爆种模式'), /CQO_BURST_MODE:OFF/);
  assert.match(invoke('b', '关闭爆种模式'), /current Sol handles the remainder and final review/);
  assert.match(invoke('a', '开启1M上下文'), /CQO_CONTEXT_WINDOW:ON/);
  assert.match(invoke('a', '开启1M上下文'), /Restart Codex and reopen this task/);
  const enabledConfig = fs.readFileSync(configPath, 'utf8');
  assert.equal(enabledConfig.startsWith('\uFEFF'), true);
  const enabledBody = enabledConfig.replace(/^\uFEFF/, '');
  assert.match(enabledBody, /^model_context_window = 1000000$/m);
  assert.match(enabledBody, /^model_auto_compact_token_limit = 900000$/m);
  assert.doesNotMatch(enabledBody, /^model_context_window = "1000000"$/m);
  const backupCount = fs.readdirSync(home).filter((name) => name.startsWith('config.toml-')).length;
  assert.match(invoke('a', 'enable 1M context'), /CQO_CONTEXT_WINDOW:ON/);
  assert.equal(fs.readdirSync(home).filter((name) => name.startsWith('config.toml-')).length, backupCount);
  assert.match(invoke('a', 'disable 1M context'), /CQO_CONTEXT_WINDOW:OFF/);
  const restoredConfig = fs.readFileSync(configPath, 'utf8').replace(/^\uFEFF/, '');
  assert.match(restoredConfig, /^model_context_window = 353400$/m);
  assert.match(restoredConfig, /^model_auto_compact_token_limit = 300000$/m);
  assert.match(invoke('a', '关闭1M上下文'), /CQO_CONTEXT_WINDOW:OFF/);
  assert.match(invoke('empty', 'enable 1M context', emptyHome), /CQO_CONTEXT_WINDOW:ON/);
  assert.match(fs.readFileSync(path.join(emptyHome, 'config.toml'), 'utf8'), /^model_context_window = 1000000$/m);
  assert.match(invoke('empty', 'disable 1M context', emptyHome), /CQO_CONTEXT_WINDOW:OFF/);
  assert.doesNotMatch(fs.readFileSync(path.join(emptyHome, 'config.toml'), 'utf8'), /model_(?:context_window|auto_compact_token_limit)/);
  process.stdout.write('PASS exact Super mode and reversible 1M context commands\n');
} finally {
  fs.rmSync(home, { recursive: true, force: true });
  fs.rmSync(emptyHome, { recursive: true, force: true });
}
