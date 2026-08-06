'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const hook = path.resolve(__dirname, '..', 'hooks', 'burst-mode.cjs');
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cqo-burst-'));

function invoke(sessionId, prompt) {
  const result = spawnSync(process.execPath, [hook], {
    input: JSON.stringify({ session_id: sessionId, prompt }),
    encoding: 'utf8',
    env: { ...process.env, CODEX_HOME: home },
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout).hookSpecificOutput.additionalContext;
}

try {
  assert.match(invoke('a', '普通请求'), /CQO_BURST_MODE:OFF/);
  assert.match(invoke('a', '开启爆种模式'), /CQO_BURST_MODE:ON/);
  assert.match(invoke('a', '继续'), /CQO_BURST_MODE:ON/);
  assert.match(invoke('b', '继续'), /CQO_BURST_MODE:OFF/);
  assert.match(invoke('a', '关闭爆种模式'), /CQO_BURST_MODE:OFF/);
  process.stdout.write('PASS burst mode exact commands and session isolation\n');
} finally {
  fs.rmSync(home, { recursive: true, force: true });
}
