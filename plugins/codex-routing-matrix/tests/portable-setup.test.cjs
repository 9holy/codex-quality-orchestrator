'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const cli = path.join(root, 'scripts', 'portable-setup.cjs');
const templateDir = path.join(root, 'templates', 'agents');
const canonical = fs.readFileSync(path.join(root, 'references', 'ROUTING_MATRIX.md'), 'utf8').trim();
const policy = JSON.parse(fs.readFileSync(path.join(root, 'routing-policy.json'), 'utf8'));
const profileFiles = Object.values(policy.namedAgents).map((config) => config.profileFile).sort();
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cqo-portable-'));

function invoke(command, home, options = {}) {
  const args = [cli, command];
  const env = { ...process.env };
  if (options.useEnv) env.CODEX_HOME = home;
  else args.push('--codex-home', home);
  if (options.force) args.push('--force');
  const result = spawnSync(process.execPath, args, { encoding: 'utf8', env });
  let output;
  try {
    output = JSON.parse(result.stdout);
  } catch (error) {
    assert.fail(`CLI did not emit JSON (${error.message}): ${result.stdout}\n${result.stderr}`);
  }
  if (options.fail) assert.notEqual(result.status, 0, result.stdout);
  else assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.equal(fs.existsSync(path.join(home, '.codex-routing-matrix.install.lock')), false);
  return output;
}

function state(home) {
  return JSON.parse(fs.readFileSync(path.join(home, '.codex-routing-matrix.install-state.json'), 'utf8'));
}

function copyTemplate(home, file, suffix = '') {
  const agents = path.join(home, 'agents');
  fs.mkdirSync(agents, { recursive: true });
  const text = fs.readFileSync(path.join(templateDir, file), 'utf8');
  fs.writeFileSync(path.join(agents, file), `${text}${suffix}`, 'utf8');
}

function count(text, value) {
  return text.split(value).length - 1;
}

try {
  const fresh = path.join(tempRoot, 'fresh');
  fs.mkdirSync(fresh);
  const unrelatedBefore = '## User Before\n\nkeep before';
  const unrelatedAfter = '## User After\n\nkeep after';
  const staleMatrix = canonical.replace('Handle clear, low-risk short work directly', 'Handle ALL work directly');
  fs.writeFileSync(path.join(fresh, 'AGENTS.md'), `${unrelatedBefore}\n\n${staleMatrix}\n\n${unrelatedAfter}\n`);

  const installed = invoke('install', fresh);
  assert.equal(installed.verified, true);
  assert.equal(installed.results.length, 4);
  assert.ok(installed.results.every((item) => item.status === 'install'));
  assert.equal(state(fresh).schemaVersion, 1);
  assert.deepEqual(Object.keys(state(fresh).profiles).sort(), profileFiles);
  for (const file of profileFiles) {
    assert.deepEqual(
      fs.readFileSync(path.join(fresh, 'agents', file)),
      fs.readFileSync(path.join(templateDir, file)),
    );
  }
  const agentsText = fs.readFileSync(path.join(fresh, 'AGENTS.md'), 'utf8');
  assert.match(agentsText, /## Meta Rule - Conflict Resolution/);
  assert.match(agentsText, /## Implementation/);
  assert.match(agentsText, /## User Before\n\nkeep before/);
  assert.match(agentsText, /## User After\n\nkeep after/);
  assert.equal(count(agentsText, canonical.match(/^## .*$/m)[0]), 1);
  assert.doesNotMatch(agentsText, /Handle ALL work directly/);

  const agentsAfterFirstInstall = fs.readFileSync(path.join(fresh, 'AGENTS.md'), 'utf8');
  const idempotent = invoke('install', fresh);
  assert.ok(idempotent.results.every((item) => item.status === 'kept'));
  assert.equal(idempotent.defaultRules.status, 'skipped');
  assert.equal(idempotent.routingMatrix.status, 'kept');
  assert.equal(fs.readFileSync(path.join(fresh, 'AGENTS.md'), 'utf8'), agentsAfterFirstInstall);
  const inspected = invoke('status', fresh, { useEnv: true });
  assert.equal(inspected.installed, true);
  assert.ok(inspected.results.every((item) => item.valid && item.contentMatches));

  const conflict = path.join(tempRoot, 'conflict');
  copyTemplate(conflict, 'luna-worker.toml');
  fs.writeFileSync(path.join(conflict, 'agents', 'sol-medium-worker.toml'), 'name = "wrong"\nmodel = "wrong"\n');
  fs.writeFileSync(path.join(conflict, 'agents', 'terra-worker.toml'), 'name = "wrong-terra"\nmodel = "wrong"\n');
  fs.writeFileSync(path.join(conflict, 'AGENTS.md'), '## User\n\nuntouched\n');
  const conflictOutput = invoke('install', conflict, { fail: true });
  assert.deepEqual(conflictOutput.conflicts.map((item) => item.file).sort(), [
    'sol-medium-worker.toml',
    'terra-worker.toml',
  ]);
  assert.equal(fs.existsSync(path.join(conflict, '.codex-routing-matrix.install-state.json')), false);
  assert.equal(fs.existsSync(path.join(conflict, 'agents', 'sol-reviewer.toml')), false);
  assert.equal(fs.readFileSync(path.join(conflict, 'agents', 'terra-worker.toml'), 'utf8'), 'name = "wrong-terra"\nmodel = "wrong"\n');
  assert.equal(fs.readFileSync(path.join(conflict, 'AGENTS.md'), 'utf8'), '## User\n\nuntouched\n');

  const external = path.join(tempRoot, 'external');
  copyTemplate(external, 'luna-worker.toml', '\n# local compatible customization\n');
  fs.writeFileSync(path.join(external, 'AGENTS.md'), '## User\n\nexternal-only setup\n');
  const externalInstall = invoke('install', external);
  assert.equal(externalInstall.results.find((item) => item.agent === 'luna_worker').ownership, 'external');
  assert.equal(Object.hasOwn(state(external).profiles, 'luna-worker.toml'), false);
  const externalUninstall = invoke('uninstall', external);
  assert.equal(externalUninstall.results.find((item) => item.file === 'luna-worker.toml').status, 'preserved-not-owned');
  assert.match(fs.readFileSync(path.join(external, 'agents', 'luna-worker.toml'), 'utf8'), /local compatible customization/);

  const externalOnly = path.join(tempRoot, 'external-only');
  for (const file of profileFiles) copyTemplate(externalOnly, file);
  fs.writeFileSync(path.join(externalOnly, 'AGENTS.md'), '## User\n\nall profiles are external\n');
  const externalOnlyInstall = invoke('install', externalOnly);
  assert.ok(externalOnlyInstall.results.every((item) => item.ownership === 'external'));
  assert.equal(externalOnlyInstall.defaultRules.status, 'prepended');
  assert.equal(fs.existsSync(path.join(externalOnly, '.codex-routing-matrix.install-state.json')), false);
  assert.match(fs.readFileSync(path.join(externalOnly, 'AGENTS.md'), 'utf8'), /## Meta Rule - Conflict Resolution/);

  const locked = path.join(tempRoot, 'locked');
  fs.mkdirSync(locked);
  fs.writeFileSync(path.join(locked, '.codex-routing-matrix.install-state.json'), '{broken json');
  fs.writeFileSync(path.join(locked, '.codex-routing-matrix.install.lock'), 'held\n');
  const lockedRun = spawnSync(process.execPath, [cli, 'status', '--codex-home', locked], { encoding: 'utf8' });
  assert.notEqual(lockedRun.status, 0);
  assert.match(JSON.parse(lockedRun.stdout).error, /EEXIST/);
  assert.equal(fs.readFileSync(path.join(locked, '.codex-routing-matrix.install.lock'), 'utf8'), 'held\n');

  const forced = path.join(tempRoot, 'forced');
  fs.mkdirSync(path.join(forced, 'agents'), { recursive: true });
  const original = 'name = "private_luna"\nmodel = "private-model"\n';
  fs.writeFileSync(path.join(forced, 'agents', 'luna-worker.toml'), original);
  const forcedInstall = invoke('install', forced, { force: true });
  const forcedResult = forcedInstall.results.find((item) => item.agent === 'luna_worker');
  assert.equal(forcedResult.status, 'replace');
  assert.ok(fs.existsSync(forcedResult.backup));
  let forcedState = state(forced);
  let backupRelative = forcedState.profiles['luna-worker.toml'].backupFile;
  assert.match(backupRelative, /^agents\/.+\/luna-worker\.toml\.bak$/);

  const backupFile = path.resolve(forced, ...backupRelative.split('/'));
  const legacyBackup = backupFile.slice(0, -4);
  fs.renameSync(backupFile, legacyBackup);
  forcedState.profiles['luna-worker.toml'].backupFile = path.relative(forced, legacyBackup).replace(/\//g, '\\');
  fs.writeFileSync(
    path.join(forced, '.codex-routing-matrix.install-state.json'),
    `${JSON.stringify(forcedState, null, 2)}\n`,
  );
  invoke('install', forced);
  backupRelative = state(forced).profiles['luna-worker.toml'].backupFile;
  assert.equal(backupRelative.includes('\\'), false);
  assert.match(backupRelative, /luna-worker\.toml\.bak$/);
  assert.equal(fs.existsSync(legacyBackup), false);
  assert.equal(fs.existsSync(path.resolve(forced, ...backupRelative.split('/'))), true);

  const forcedUninstall = invoke('uninstall', forced);
  assert.equal(forcedUninstall.results.find((item) => item.file === 'luna-worker.toml').status, 'restored-original');
  assert.equal(fs.readFileSync(path.join(forced, 'agents', 'luna-worker.toml'), 'utf8'), original);
  assert.equal(fs.existsSync(path.join(forced, '.codex-routing-matrix.install-state.json')), false);

  const modified = path.join(tempRoot, 'modified');
  invoke('install', modified);
  const modifiedFile = path.join(modified, 'agents', 'terra-worker.toml');
  fs.appendFileSync(modifiedFile, '\n# user modification\n');
  const modifiedUninstall = invoke('uninstall', modified);
  assert.equal(modifiedUninstall.results.find((item) => item.file === 'terra-worker.toml').status, 'preserved-modified');
  assert.match(fs.readFileSync(modifiedFile, 'utf8'), /user modification/);
  assert.equal(fs.existsSync(path.join(modified, '.codex-routing-matrix.install-state.json')), false);
  for (const file of profileFiles.filter((file) => file !== 'terra-worker.toml')) {
    assert.equal(fs.existsSync(path.join(modified, 'agents', file)), false);
    assert.ok(fs.readdirSync(path.join(modified, 'agents')).some((name) => name.startsWith(`${file}-`)));
  }

  const legacyCreated = path.join(tempRoot, 'legacy-created');
  for (const file of profileFiles) copyTemplate(legacyCreated, file);
  const legacyStatePath = path.join(legacyCreated, '.codex-quality-orchestrator.install-state.json');
  const legacyProfiles = Object.fromEntries(profileFiles.map((file) => [file, {
    ownership: 'created',
    backupFile: null,
  }]));
  fs.writeFileSync(legacyStatePath, `${JSON.stringify({ schemaVersion: 1, profiles: legacyProfiles }, null, 2)}\n`);
  const legacyInstall = invoke('install', legacyCreated);
  assert.ok(legacyInstall.results.every((item) => item.status === 'kept'));
  assert.equal(fs.existsSync(path.join(legacyCreated, '.codex-routing-matrix.install-state.json')), true);
  const legacyUninstall = invoke('uninstall', legacyCreated);
  assert.ok(legacyUninstall.results.every((item) => item.status === 'removed'));
  assert.equal(fs.existsSync(path.join(legacyCreated, '.codex-routing-matrix.install-state.json')), false);
  assert.equal(fs.existsSync(legacyStatePath), false);
  assert.ok(legacyUninstall.legacyStateBackup);
  assert.equal(fs.existsSync(path.join(legacyUninstall.legacyStateBackup, path.basename(legacyStatePath))), true);
  const legacyStatus = invoke('status', legacyCreated);
  assert.equal(legacyStatus.stateSchemaVersion, null);
  assert.ok(legacyStatus.results.every((item) => item.ownership === 'external'));

  const freshUninstall = invoke('uninstall', fresh);
  assert.ok(freshUninstall.results.every((item) => item.status === 'removed'));
  assert.equal(fs.existsSync(path.join(fresh, '.codex-routing-matrix.install-state.json')), false);
  for (const file of profileFiles) assert.equal(fs.existsSync(path.join(fresh, 'agents', file)), false);

  process.stdout.write('PASS portable setup install, status, recovery, preservation, and uninstall\n');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
