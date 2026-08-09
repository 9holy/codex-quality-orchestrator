'use strict';

const fs = require('node:fs');
const path = require('node:path');

const policyPath = path.resolve(__dirname, '..', 'routing-policy.json');
const os = require('node:os');
const statePath = path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), '.codex-quality-orchestrator', 'root-capacity-attempts.json');

async function main() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8').replace(/^\uFEFF+/, '');
  const payload = JSON.parse(raw);
  const event = payload?.hook_event_name;
  if (!['SubagentStop', 'Stop'].includes(event)) return;
  if (event === 'SubagentStop' && payload.stop_hook_active === true) return;

  const policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
  if (typeof payload.last_assistant_message !== 'string' ||
      payload.last_assistant_message.trim() !== policy.capacityRecovery.message) return;

  if (event === 'Stop') {
    let attempts = {};
    try { attempts = JSON.parse(fs.readFileSync(statePath, 'utf8')); } catch {}
    const key = String(payload.thread_id || payload.session_id || payload.conversation_id || 'default');
    const count = Number(attempts[key] || 0);
    if (count >= policy.rootCapacityRecovery.maxAttempts) return;
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    attempts[key] = count + 1;
    fs.writeFileSync(statePath, `${JSON.stringify(attempts)}\n`, 'utf8');
  }
  process.stdout.write(`${JSON.stringify({
    decision: 'block',
    reason: policy.capacityRecovery.automaticContinuationPrompt,
  })}\n`);
}

main().catch((error) => {
  process.stderr.write(`容量续交 Hook 失败：${error.message}\n`);
  process.exitCode = 1;
});
