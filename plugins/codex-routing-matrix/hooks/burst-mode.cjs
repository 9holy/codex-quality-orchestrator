'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const policy = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'routing-policy.json'), 'utf8'));
const home = path.resolve(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'));
const stateDir = path.join(home, '.codex-routing-matrix');
const statePath = path.join(stateDir, 'burst-sessions.json');

function sessionId(payload) {
  return String(payload?.session_id || payload?.sessionId || process.env.CODEX_SESSION_ID || 'default').trim() || 'default';
}

function readState() {
  try {
    const value = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
}

function writeState(state) {
  fs.mkdirSync(stateDir, { recursive: true });
  const temp = `${statePath}.${process.pid}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(state)}\n`, 'utf8');
  fs.renameSync(temp, statePath);
}

async function main() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8').replace(/^\uFEFF+/, '');
  const payload = raw ? JSON.parse(raw) : {};
  const text = String(payload?.prompt || payload?.user_prompt || payload?.message || '').trim();
  const id = sessionId(payload);
  const state = readState();
  const enabledCommand = [policy.burstMode.enabledByExactCommand, policy.burstMode.enabledByExactCommandEnglish].includes(text);
  const disabledCommand = [policy.burstMode.disabledByExactCommand, policy.burstMode.disabledByExactCommandEnglish].includes(text);
  if (!enabledCommand && !disabledCommand) return;
  state[id] = enabledCommand;
  writeState(state);
  const modeContext = enabledCommand
    ? '[CQO_BURST_MODE:ON] Super mode is enabled for this session.'
    : '[CQO_BURST_MODE:OFF] Super mode is disabled. Return to normal routing: do not dispatch burst-depth work; the current Sol handles the remainder and final review.';
  process.stdout.write(`${JSON.stringify({ hookSpecificOutput: {
    hookEventName: 'UserPromptSubmit',
    additionalContext: modeContext,
  } })}\n`);
}

main().catch((error) => process.stdout.write(`${JSON.stringify({ hookSpecificOutput: {
  hookEventName: 'UserPromptSubmit',
  additionalContext: `[CQO_BURST_MODE_ERROR] ${error.message}`,
} })}\n`));
