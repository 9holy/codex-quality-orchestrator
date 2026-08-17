'use strict';

const fs = require('node:fs');
const path = require('node:path');

const managedKeys = ['model_context_window', 'model_auto_compact_token_limit'];

function stamp() {
  const now = new Date();
  const pad = (value, length = 2) => String(value).padStart(length, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}${pad(now.getMilliseconds(), 3)}`;
}

function newlineFor(text) {
  return text.includes('\r\n') ? '\r\n' : '\n';
}

function rootEnd(text) {
  const match = /^[ \t]*\[[^\r\n]+\][ \t]*(?:#.*)?$/m.exec(text);
  return match ? match.index : text.length;
}

function rootKeyMatches(text, key) {
  const root = text.slice(0, rootEnd(text));
  const pattern = new RegExp(`^[ \\t]*${key}[ \\t]*=[^\\r\\n]*$`, 'gm');
  return [...root.matchAll(pattern)];
}

function snapshotKey(text, key) {
  const matches = rootKeyMatches(text, key);
  if (matches.length > 1) throw new Error(`Duplicate top-level TOML key: ${key}`);
  return matches.length === 1
    ? { present: true, line: matches[0][0] }
    : { present: false, line: null };
}

function setRootLine(text, key, line) {
  const matches = rootKeyMatches(text, key);
  if (matches.length > 1) throw new Error(`Duplicate top-level TOML key: ${key}`);
  if (matches.length === 1) {
    const match = matches[0];
    return text.slice(0, match.index) + line + text.slice(match.index + match[0].length);
  }

  const newline = newlineFor(text);
  const end = rootEnd(text);
  let prefix = text.slice(0, end);
  const suffix = text.slice(end);
  if (prefix.length > 0 && !prefix.endsWith('\n')) prefix += newline;
  prefix += `${line}${newline}`;
  if (suffix.length > 0 && !prefix.endsWith(`${newline}${newline}`)) prefix += newline;
  return prefix + suffix;
}

function removeRootKey(text, key) {
  const matches = rootKeyMatches(text, key);
  if (matches.length > 1) throw new Error(`Duplicate top-level TOML key: ${key}`);
  if (matches.length === 0) return text;

  const match = matches[0];
  let end = match.index + match[0].length;
  if (text.slice(end, end + 2) === '\r\n') end += 2;
  else if (text[end] === '\n') end += 1;
  return text.slice(0, match.index) + text.slice(end);
}

function writeAtomic(filePath, text) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  try {
    fs.writeFileSync(temp, text, 'utf8');
    fs.renameSync(temp, filePath);
  } finally {
    if (fs.existsSync(temp)) fs.rmSync(temp, { force: true });
  }
}

function backupConfig(configPath) {
  if (!fs.existsSync(configPath)) return null;
  const directory = path.join(path.dirname(configPath), `${path.basename(configPath)}-${stamp()}`);
  fs.mkdirSync(directory, { recursive: false });
  fs.copyFileSync(configPath, path.join(directory, path.basename(configPath)));
  return directory;
}

function readState(statePath) {
  if (!fs.existsSync(statePath)) return null;
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  if (state?.schemaVersion !== 1 || typeof state.enabled !== 'boolean') {
    throw new Error(`Invalid 1M context state: ${statePath}`);
  }
  return state;
}

function setContextWindowMode({ home, enabled, modelContextWindow, autoCompactTokenLimit }) {
  if (!Number.isInteger(modelContextWindow) || !Number.isInteger(autoCompactTokenLimit) ||
      autoCompactTokenLimit <= 0 || autoCompactTokenLimit >= modelContextWindow) {
    throw new Error('Invalid 1M context limits');
  }
  const configPath = path.join(home, 'config.toml');
  const stateDir = path.join(home, '.codex-routing-matrix');
  const statePath = path.join(stateDir, 'context-window-state.json');
  const original = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8') : '';
  const bom = original.startsWith('\uFEFF') ? '\uFEFF' : '';
  const originalBody = original.slice(bom.length);
  const existingState = readState(statePath);

  if (!enabled && existingState?.enabled !== true) {
    return { enabled: false, changed: false, configPath, backup: null };
  }

  const previous = existingState?.enabled === true
    ? existingState.previous
    : Object.fromEntries(managedKeys.map((key) => [key, snapshotKey(originalBody, key)]));
  let nextBody = originalBody;

  if (enabled) {
    nextBody = setRootLine(nextBody, 'model_context_window', `model_context_window = ${modelContextWindow}`);
    nextBody = setRootLine(nextBody, 'model_auto_compact_token_limit', `model_auto_compact_token_limit = ${autoCompactTokenLimit}`);
  } else {
    for (const key of managedKeys) {
      const saved = previous[key];
      if (!saved || typeof saved.present !== 'boolean') throw new Error(`Missing saved value for ${key}`);
      nextBody = saved.present ? setRootLine(nextBody, key, saved.line) : removeRootKey(nextBody, key);
    }
  }

  const next = bom + nextBody;
  const changed = next !== original;
  const backup = changed ? backupConfig(configPath) : null;
  fs.mkdirSync(stateDir, { recursive: true });
  if (enabled) writeAtomic(statePath, `${JSON.stringify({ schemaVersion: 1, enabled, previous })}\n`);
  if (changed) writeAtomic(configPath, next);
  if (!enabled) writeAtomic(statePath, `${JSON.stringify({ schemaVersion: 1, enabled, previous })}\n`);
  return { enabled, changed, configPath, backup };
}

module.exports = { setContextWindowMode };
