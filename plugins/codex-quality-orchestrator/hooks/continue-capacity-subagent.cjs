'use strict';

const CAPACITY_MESSAGE =
  'Selected model is at capacity. Please try a different model.';

async function main() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8').replace(/^\uFEFF+/, '');
  const payload = JSON.parse(raw);

  if (payload?.hook_event_name !== 'SubagentStop') return;
  if (payload.stop_hook_active === true) return;
  if (typeof payload.last_assistant_message !== 'string') return;
  if (!payload.last_assistant_message.includes(CAPACITY_MESSAGE)) return;

  process.stdout.write(
    `${JSON.stringify({
      decision: 'block',
      reason: '继续',
    })}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`容量续交 Hook 失败：${error.message}\n`);
  process.exitCode = 1;
});
