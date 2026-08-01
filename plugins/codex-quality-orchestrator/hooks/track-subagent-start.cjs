'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { trackSubagentStart } = require('./routing-ledger.cjs');

const policyPath = path.resolve(__dirname, '..', 'routing-policy.json');

async function main() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8').replace(/^\uFEFF+/, '');
  const payload = JSON.parse(raw);
  if (payload?.hook_event_name !== 'SubagentStart') return;

  const policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
  trackSubagentStart(payload, policy);
}

main().catch((error) => {
  process.stderr.write(`子代理生命周期账本失败：${error.message}\n`);
  process.exitCode = 1;
});
