'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { releaseFailedDispatch } = require('./routing-ledger.cjs');

const pluginRoot = path.resolve(__dirname, '..');
const policy = JSON.parse(
  fs.readFileSync(path.join(pluginRoot, 'routing-policy.json'), 'utf8'),
);

const taskName = process.argv[2];
const sessionId = process.env.CODEX_THREAD_ID;
const match = typeof taskName === 'string'
  ? taskName.match(new RegExp(policy.workPacket.hostVisibleTaskNamePattern))
  : null;

if (!match) {
  process.stderr.write(
    `用法：node release-failed-dispatch.cjs ${policy.workPacket.hostVisibleTaskNameExample}\n`,
  );
  process.exitCode = 2;
} else {
  const error = releaseFailedDispatch(sessionId, match[1], policy);
  if (error) {
    process.stderr.write(`${error}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write(
      `${JSON.stringify({ sessionId, workUnitId: match[1], status: 'failed' })}\n`,
    );
  }
}
