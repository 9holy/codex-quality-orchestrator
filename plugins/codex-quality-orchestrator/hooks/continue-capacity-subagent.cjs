'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { trackSubagentStop } = require('./routing-ledger.cjs');

const policyPath = path.resolve(__dirname, '..', 'routing-policy.json');

async function main() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8').replace(/^\uFEFF+/, '');
  const payload = JSON.parse(raw);

  if (payload?.hook_event_name !== 'SubagentStop') return;
  const policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
  const shouldContinue =
    payload.stop_hook_active !== true &&
    typeof payload.last_assistant_message === 'string' &&
    payload.last_assistant_message.includes(policy.capacityRecovery.message);
  trackSubagentStop(payload, policy, shouldContinue);
  if (!shouldContinue) return;

  process.stdout.write(
    `${JSON.stringify({
      decision: 'block',
      reason: policy.capacityRecovery.automaticContinuationPrompt,
    })}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`容量续交 Hook 失败：${error.message}\n`);
  process.exitCode = 1;
});
