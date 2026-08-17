#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const pluginRoot = path.resolve(__dirname, '..');
const templateDir = path.join(pluginRoot, 'templates', 'agents');
const policyPath = path.join(pluginRoot, 'routing-policy.json');
const matrixPath = path.join(pluginRoot, 'references', 'ROUTING_MATRIX.md');
const stateName = '.codex-routing-matrix.install-state.json';
const legacyStateName = '.codex-quality-orchestrator.install-state.json';
const lockName = '.codex-routing-matrix.install.lock';

const DEFAULT_RULES = `## Meta Rule - Conflict Resolution

Data safety, correctness, and recoverability are veto constraints. For routine matters, explicit user instructions take precedence over efficiency and simplicity.
When rules conflict, prioritize correctness, safety, and recoverability, then choose the most direct implementation. If the user insists on a high-risk approach, record the risk and ask for confirmation. Refuse irreversible data destruction by default unless the user explicitly accepts the consequences.

## Implementation

Fix the root cause with the smallest clear and debuggable change.
Avoid unrelated refactoring, excessive defensive checks, redundant fallback logic, and compatibility paths for unsupported or hypothetical scenarios.
Stay focused on the current task. Pursue improvements only when they materially advance the requested outcome.
Do not pursue excessive consistency or over-testing. Do not add unnecessary gates, SHA-256 hashes, checksums, verification layers, or redundant tests unless they are required for correctness or by the task.
Follow the existing code style.
Minimal local refactoring is allowed when the existing structure directly prevents a correct fix. Security, permission, and necessary input validation are not excessive defensive measures.`;

function parseArgs(argv) {
  const command = argv.shift();
  if (!['install', 'status', 'uninstall'].includes(command)) {
    throw new Error('Usage: portable-setup.cjs <install|status|uninstall> [--codex-home <path>] [--force]');
  }
  let codexHome;
  let force = false;
  while (argv.length) {
    const option = argv.shift();
    if (option === '--codex-home') {
      if (!argv.length || argv[0].startsWith('--')) throw new Error('--codex-home requires a path');
      codexHome = argv.shift();
    } else if (option === '--force') {
      if (command !== 'install') throw new Error('--force is valid only with install');
      force = true;
    } else {
      throw new Error(`Unknown option: ${option}`);
    }
  }
  const selectedHome = codexHome || process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
  return { command, codexHome: path.resolve(selectedHome), force };
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function atomicWrite(file, text) {
  const temp = `${file}.tmp-${crypto.randomUUID()}`;
  try {
    fs.writeFileSync(temp, text, 'utf8');
    fs.renameSync(temp, file);
  } finally {
    fs.rmSync(temp, { force: true });
  }
}

function loadState(codexHome) {
  const current = path.join(codexHome, stateName);
  const legacy = path.join(codexHome, legacyStateName);
  const source = fs.existsSync(current) ? current : (fs.existsSync(legacy) ? legacy : null);
  if (!source) return { profiles: {}, source: null };
  const state = readJson(source);
  if (state.schemaVersion !== 1 || !state.profiles || Array.isArray(state.profiles)) {
    throw new Error(`Unsupported install state schema: ${state.schemaVersion}`);
  }
  const profiles = {};
  for (const [name, entry] of Object.entries(state.profiles)) {
    if (!entry || !['created', 'replaced'].includes(entry.ownership)) {
      throw new Error(`Invalid ownership in install state: ${name}`);
    }
    profiles[name] = {
      ownership: entry.ownership,
      backupFile: entry.backupFile == null ? null : String(entry.backupFile),
    };
  }
  return { profiles, source };
}

function writeState(codexHome, profiles) {
  const statePath = path.join(codexHome, stateName);
  const names = Object.keys(profiles).sort();
  if (!names.length) {
    fs.rmSync(statePath, { force: true });
    return;
  }
  const ordered = {};
  for (const name of names) ordered[name] = profiles[name];
  atomicWrite(statePath, `${JSON.stringify({ schemaVersion: 1, profiles: ordered }, null, 2)}\n`);
}

function hashFile(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function tomlString(text, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = text.match(new RegExp(`^${escaped}\\s*=\\s*["']([^"']*)["']\\s*$`, 'm'));
  return match ? match[1] : null;
}

function profileProblem(file, config, agentType) {
  const text = fs.readFileSync(file, 'utf8');
  if (tomlString(text, 'name') !== agentType) return `name is not ${agentType}`;
  if (tomlString(text, 'model') !== config.model) return `model is not ${config.model}`;
  const effort = tomlString(text, 'model_reasoning_effort');
  if (config.effortMode === 'required' && effort !== null) {
    return 'reasoning effort must be selected at spawn time, not pinned in TOML';
  }
  if (config.effortMode === 'fixed' && effort !== config.fixedEffort) {
    return `fixed effort is not ${config.fixedEffort}`;
  }
  if (Object.hasOwn(config, 'sandboxMode') && tomlString(text, 'sandbox_mode') !== config.sandboxMode) {
    return `sandbox_mode is not ${config.sandboxMode}`;
  }
  return null;
}

function acquireLock(codexHome) {
  fs.mkdirSync(codexHome, { recursive: true });
  const lock = path.join(codexHome, lockName);
  const fd = fs.openSync(lock, 'wx');
  try {
    fs.writeFileSync(fd, `PID=${process.pid}\nStarted=${new Date().toISOString()}\n`, 'utf8');
  } finally {
    fs.closeSync(fd);
  }
  return () => fs.rmSync(lock, { force: true });
}

function uniqueBackupDir(parent, fileName) {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 17);
  let candidate = path.join(parent, `${fileName}-${stamp}`);
  let suffix = 0;
  while (fs.existsSync(candidate)) candidate = path.join(parent, `${fileName}-${stamp}-${++suffix}`);
  fs.mkdirSync(candidate);
  return candidate;
}

function backupProfile(target, agentsDir) {
  const fileName = path.basename(target);
  const directory = uniqueBackupDir(agentsDir, fileName);
  const backupFile = path.join(directory, `${fileName}.bak`);
  fs.copyFileSync(target, backupFile);
  atomicWrite(path.join(directory, 'SHA256SUMS'), `${hashFile(backupFile)} *${path.basename(backupFile)}\n`);
  return { directory, file: backupFile };
}

function backupFile(target) {
  const directory = uniqueBackupDir(path.dirname(target), path.basename(target));
  fs.copyFileSync(target, path.join(directory, path.basename(target)));
  return directory;
}

function resolveRestorePath(codexHome, agentsDir, relative, fileName) {
  if (!relative || path.isAbsolute(relative)) throw new Error(`Invalid restore path for ${fileName}`);
  const portable = relative.replace(/\\/g, '/');
  const resolved = path.resolve(codexHome, ...portable.split('/'));
  const prefix = `${path.resolve(agentsDir)}${path.sep}`;
  const compare = process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  const comparePrefix = process.platform === 'win32' ? prefix.toLowerCase() : prefix;
  if (!compare.startsWith(comparePrefix)) throw new Error(`Restore path escapes the agents directory: ${relative}`);
  if (![fileName, `${fileName}.bak`].includes(path.basename(resolved))) {
    throw new Error(`Restore file name does not match ${fileName}`);
  }
  return resolved;
}

function normalizeBackups(codexHome, agentsDir, profiles) {
  let changed = false;
  for (const [fileName, entry] of Object.entries(profiles)) {
    if (entry.ownership !== 'replaced') continue;
    const current = resolveRestorePath(codexHome, agentsDir, entry.backupFile, fileName);
    let normalized = current;
    if (path.basename(current) === fileName) {
      normalized = `${current}.bak`;
      if (!fs.existsSync(current)) throw new Error(`Original profile backup is missing: ${current}`);
      if (fs.existsSync(normalized)) {
        if (hashFile(current) !== hashFile(normalized)) {
          throw new Error(`Non-loadable backup conflicts with legacy backup: ${normalized}`);
        }
        fs.rmSync(current);
      } else {
        fs.renameSync(current, normalized);
      }
      atomicWrite(path.join(path.dirname(normalized), 'SHA256SUMS'), `${hashFile(normalized)} *${path.basename(normalized)}\n`);
      changed = true;
    }
    const portable = path.relative(codexHome, normalized).split(path.sep).join('/');
    if (entry.backupFile !== portable) {
      entry.backupFile = portable;
      changed = true;
    }
  }
  if (changed) writeState(codexHome, profiles);
}

function installDefaultRules(codexHome, firstOwnedInstall) {
  if (!firstOwnedInstall) return { status: 'skipped', backup: null };
  const target = path.join(codexHome, 'AGENTS.md');
  if (fs.existsSync(target)) {
    const text = fs.readFileSync(target, 'utf8');
    if (/^## Meta Rule - Conflict Resolution\s*$/m.test(text) && /^## Implementation\s*$/m.test(text)) {
      return { status: 'kept', backup: null };
    }
    const backup = backupFile(target);
    atomicWrite(target, `${DEFAULT_RULES}\n\n${text.trimStart().trimEnd()}\n`);
    return { status: 'prepended', backup };
  }
  atomicWrite(target, `${DEFAULT_RULES}\n`);
  return { status: 'created', backup: null };
}

function h2Sections(text) {
  const matches = [...text.matchAll(/^## [^\r\n]+/gm)];
  return matches.map((match, index) => ({
    heading: match[0],
    start: match.index,
    end: index + 1 < matches.length ? matches[index + 1].index : text.length,
    text: text.slice(match.index, index + 1 < matches.length ? matches[index + 1].index : text.length),
  }));
}

function normalizedSection(section) {
  return section.replace(/^## [^\r\n]+/m, '## ROUTING').replace(/\r\n/g, '\n').trim();
}

function syncRoutingMatrix(codexHome) {
  const canonical = fs.readFileSync(matrixPath, 'utf8').trim();
  const heading = canonical.match(/^## [^\r\n]+/)[0];
  const target = path.join(codexHome, 'AGENTS.md');
  if (!fs.existsSync(target)) {
    atomicWrite(target, `${canonical}\n`);
    return { status: 'created', backup: null };
  }
  const original = fs.readFileSync(target, 'utf8');
  const sections = h2Sections(original);
  let owned = sections.filter((section) => section.heading === heading);
  let status = owned.length > 1 ? 'deduplicated' : 'refreshed';
  if (!owned.length) {
    owned = sections.filter((section) => normalizedSection(section.text) === normalizedSection(canonical));
    status = owned.length > 1 ? 'deduplicated' : (owned.length ? 'migrated-heading' : 'appended');
  }
  if (owned.length === 1 && owned[0].heading === heading && owned[0].text.trim() === canonical) {
    return { status: 'kept', backup: null };
  }
  let updated;
  if (!owned.length) {
    updated = `${original.trimEnd()}\n\n${canonical}`;
  } else {
    const selected = new Set(owned);
    let inserted = false;
    let cursor = 0;
    const chunks = [];
    for (const section of sections) {
      if (!selected.has(section)) continue;
      chunks.push(original.slice(cursor, section.start));
      if (!inserted) {
        chunks.push(`${canonical}\n\n`);
        inserted = true;
      }
      cursor = section.end;
    }
    chunks.push(original.slice(cursor));
    updated = chunks.join('');
  }
  const backup = backupFile(target);
  atomicWrite(target, `${updated.trimEnd()}\n`);
  return { status, backup };
}

function policyData() {
  const policy = readJson(policyPath);
  return { policy, entries: Object.entries(policy.namedAgents) };
}

function inspectProfiles(codexHome, profiles, entries) {
  const agentsDir = path.join(codexHome, 'agents');
  return entries.map(([agent, config]) => {
    const target = path.join(agentsDir, config.profileFile);
    const template = path.join(templateDir, config.profileFile);
    const exists = fs.existsSync(target);
    const problem = exists ? profileProblem(target, config, agent) : 'missing';
    return {
      agent,
      file: config.profileFile,
      exists,
      valid: problem === null,
      contentMatches: exists && hashFile(target) === hashFile(template),
      ownership: profiles[config.profileFile]?.ownership || 'external',
      problem,
    };
  });
}

function install(codexHome, force) {
  const agentsDir = path.join(codexHome, 'agents');
  fs.mkdirSync(agentsDir, { recursive: true });
  const { profiles, source } = loadState(codexHome);
  const { entries } = policyData();
  const firstInstall = source === null;
  const actions = inspectProfiles(codexHome, profiles, entries).map((item) => {
    if (!item.exists) return { ...item, action: 'install', reason: null };
    if (item.valid && item.contentMatches && (!force || item.ownership !== 'external')) {
      return { ...item, action: 'keep', reason: null };
    }
    if (item.valid && item.ownership !== 'external') {
      return { ...item, action: 'refresh', reason: 'plugin-owned profile content changed' };
    }
    if (item.valid && !force) {
      return { ...item, action: 'keep', reason: 'compatible external profile' };
    }
    return { ...item, action: 'replace', reason: item.valid ? 'forced adoption of compatible external profile' : item.problem };
  });
  const conflicts = actions.filter((item) => item.action === 'replace');
  if (conflicts.length && !force) {
    const error = new Error('Existing agent profiles conflict with the plugin contract. No profile, state, or AGENTS files were changed.');
    error.conflicts = conflicts.map(({ agent, file, reason }) => ({ agent, file, reason }));
    throw error;
  }

  normalizeBackups(codexHome, agentsDir, profiles);
  const currentStatePath = path.join(codexHome, stateName);
  const legacyStatePath = path.join(codexHome, legacyStateName);
  if (source === legacyStatePath && !fs.existsSync(currentStatePath)) {
    writeState(codexHome, profiles);
  }
  const results = [];
  for (const item of actions) {
    const target = path.join(agentsDir, item.file);
    const template = path.join(templateDir, item.file);
    if (item.action === 'keep') {
      results.push({ agent: item.agent, status: 'kept', ownership: item.ownership, backup: null });
      continue;
    }
    let backup = null;
    if (['replace', 'refresh'].includes(item.action)) backup = backupProfile(target, agentsDir);
    if (!profiles[item.file]) {
      profiles[item.file] = item.action === 'install'
        ? { ownership: 'created', backupFile: null }
        : { ownership: 'replaced', backupFile: path.relative(codexHome, backup.file).split(path.sep).join('/') };
      writeState(codexHome, profiles);
    }
    fs.copyFileSync(template, target);
    results.push({ agent: item.agent, status: item.action, ownership: profiles[item.file].ownership, backup: backup?.directory || null });
  }
  for (const [agent, config] of entries) {
    const target = path.join(agentsDir, config.profileFile);
    const problem = profileProblem(target, config, agent);
    if (problem) throw new Error(`Post-install verification failed: ${target}: ${problem}`);
  }
  const defaultRules = installDefaultRules(codexHome, firstInstall);
  const routingMatrix = syncRoutingMatrix(codexHome);
  return { command: 'install', codexHome, results, defaultRules, routingMatrix, verified: true };
}

function status(codexHome) {
  const { profiles } = loadState(codexHome);
  const { entries } = policyData();
  const results = inspectProfiles(codexHome, profiles, entries);
  return {
    command: 'status',
    codexHome,
    installed: results.every((item) => item.valid),
    stateSchemaVersion: Object.keys(profiles).length ? 1 : null,
    results,
  };
}

function uninstall(codexHome) {
  const agentsDir = path.join(codexHome, 'agents');
  fs.mkdirSync(agentsDir, { recursive: true });
  const { profiles } = loadState(codexHome);
  const { entries, policy } = policyData();
  const legacyStatePath = path.join(codexHome, legacyStateName);
  normalizeBackups(codexHome, agentsDir, profiles);
  const expected = new Map(entries.map(([, config]) => [config.profileFile, hashFile(path.join(templateDir, config.profileFile))]));
  for (const retired of policy.retiredProfiles || []) expected.set(retired.profileFile, String(retired.templateSha256).toLowerCase());
  const restorePaths = {};
  for (const [fileName, entry] of Object.entries(profiles)) {
    if (entry.ownership !== 'replaced') continue;
    const restore = resolveRestorePath(codexHome, agentsDir, entry.backupFile, fileName);
    if (!fs.existsSync(restore)) throw new Error(`Original profile backup is missing: ${restore}`);
    restorePaths[fileName] = restore;
  }

  const remaining = { ...profiles };
  const names = [...new Set([...entries.map(([, config]) => config.profileFile), ...Object.keys(profiles)])].sort();
  const results = [];
  for (const fileName of names) {
    const target = path.join(agentsDir, fileName);
    const entry = profiles[fileName];
    if (!entry) {
      results.push({ file: fileName, status: fs.existsSync(target) ? 'preserved-not-owned' : 'missing-not-owned', backup: null, restoredFrom: null });
      continue;
    }
    if (!fs.existsSync(target)) {
      if (entry.ownership === 'replaced') {
        fs.copyFileSync(restorePaths[fileName], target);
        results.push({ file: fileName, status: 'restored-original', backup: null, restoredFrom: restorePaths[fileName] });
      } else {
        results.push({ file: fileName, status: 'missing', backup: null, restoredFrom: null });
      }
      delete remaining[fileName];
      writeState(codexHome, remaining);
      continue;
    }
    if (!expected.has(fileName) || hashFile(target) !== expected.get(fileName)) {
      delete remaining[fileName];
      writeState(codexHome, remaining);
      results.push({ file: fileName, status: 'preserved-modified', backup: null, restoredFrom: restorePaths[fileName] || null });
      continue;
    }
    const backup = backupProfile(target, agentsDir);
    if (entry.ownership === 'created') {
      fs.rmSync(target);
      results.push({ file: fileName, status: 'removed', backup: backup.directory, restoredFrom: null });
    } else {
      fs.copyFileSync(restorePaths[fileName], target);
      results.push({ file: fileName, status: 'restored-original', backup: backup.directory, restoredFrom: restorePaths[fileName] });
    }
    delete remaining[fileName];
    writeState(codexHome, remaining);
  }
  let legacyStateBackup = null;
  if (!Object.keys(remaining).length && fs.existsSync(legacyStatePath)) {
    legacyStateBackup = backupFile(legacyStatePath);
    fs.rmSync(legacyStatePath);
  }
  return {
    command: 'uninstall',
    codexHome,
    results,
    legacyStateBackup,
    note: 'Only plugin-owned profiles were removed or restored. External and modified profiles were preserved.',
  };
}

function main() {
  let release;
  try {
    const options = parseArgs(process.argv.slice(2));
    release = acquireLock(options.codexHome);
    const output = options.command === 'install'
      ? install(options.codexHome, options.force)
      : options.command === 'status'
        ? status(options.codexHome)
        : uninstall(options.codexHome);
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  } catch (error) {
    process.exitCode = 1;
    process.stdout.write(`${JSON.stringify({ ok: false, error: error.message, conflicts: error.conflicts || [] }, null, 2)}\n`);
  } finally {
    if (release) release();
  }
}

if (require.main === module) main();

module.exports = { install, status, uninstall };
