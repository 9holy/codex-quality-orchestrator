'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const SCHEMA_VERSION = 1;
const LOCK_WAIT_MS = 2000;

function codexHome() {
  return process.env.CODEX_HOME
    ? path.resolve(process.env.CODEX_HOME)
    : path.join(os.homedir(), '.codex');
}

function sleep(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function processIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function acquireLock(lockPath) {
  const started = Date.now();
  while (Date.now() - started < LOCK_WAIT_MS) {
    try {
      const fd = fs.openSync(lockPath, 'wx');
      fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, createdAt: Date.now() }));
      return fd;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      try {
        const owner = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
        if (!processIsAlive(owner.pid)) {
          fs.unlinkSync(lockPath);
          continue;
        }
      } catch (readError) {
        if (readError.code === 'ENOENT') continue;
      }
      sleep(20);
    }
  }
  throw new Error('路由账本正被其他 Hook 占用。');
}

function freshState() {
  return { schemaVersion: SCHEMA_VERSION, sessions: {} };
}

function readState(statePath) {
  if (!fs.existsSync(statePath)) return freshState();
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  if (state?.schemaVersion !== SCHEMA_VERSION || !state.sessions) {
    throw new Error('路由账本格式无效。');
  }
  return state;
}

function writeState(statePath, state) {
  const temporaryPath = `${statePath}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
    fs.renameSync(temporaryPath, statePath);
  } finally {
    if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
  }
}

function pruneSession(session, policy, now) {
  const pendingTtl = policy.team.pendingDispatchTtlSeconds * 1000;
  const activeTtl = policy.team.activeDispatchTtlSeconds * 1000;
  for (const attempt of session.attempts) {
    const age = now - attempt.updatedAt;
    if (attempt.status === 'pending' && age > pendingTtl) attempt.status = 'expired';
    if (attempt.status === 'active' && age > activeTtl) attempt.status = 'expired';
  }
}

function withLedger(policy, callback) {
  const home = codexHome();
  fs.mkdirSync(home, { recursive: true });
  const statePath = path.join(home, policy.team.ledgerFile);
  const lockPath = `${statePath}.lock`;
  const fd = acquireLock(lockPath);
  try {
    const state = readState(statePath);
    const result = callback(state, Date.now());
    writeState(statePath, state);
    return result;
  } finally {
    fs.closeSync(fd);
    fs.unlinkSync(lockPath);
  }
}

function getSession(state, sessionId, now) {
  state.sessions[sessionId] ??= {
    createdAt: now,
    updatedAt: now,
    waves: {},
    attempts: [],
  };
  state.sessions[sessionId].updatedAt = now;
  return state.sessions[sessionId];
}

function registerDispatch(payload, packet, policy) {
  if (typeof payload.session_id !== 'string' || payload.session_id.length === 0) {
    return 'Hook 输入缺少 session_id，无法建立路由账本。';
  }

  return withLedger(policy, (state, now) => {
    const session = getSession(state, payload.session_id, now);
    pruneSession(session, policy, now);

    const existing = session.attempts.filter(
      (item) => item.workUnitId === packet.work_unit_id,
    );
    if (packet.worker_attempt === 1 && existing.length > 0) {
      return `工作单元 ${packet.work_unit_id} 已经派发，不能重复 attempt=1。`;
    }
    if (packet.worker_attempt === 2) {
      const first = existing.find((item) => item.workerAttempt === 1);
      if (!first) return 'attempt=2 必须存在同一工作单元的 attempt=1。';
      if (['pending', 'active'].includes(first.status)) {
        return 'attempt=1 尚未结束，不得提前启动 attempt=2。';
      }
      if (first.fallbackAgent !== packet.selected_agent) {
        return 'attempt=2 必须使用 attempt=1 预声明的 fallback_agent。';
      }
      if (existing.some((item) => item.workerAttempt === 2)) {
        return `工作单元 ${packet.work_unit_id} 已经使用过 attempt=2。`;
      }
    }

    const wave = session.waves[packet.wave_id] ??= {
      waveSize: packet.wave_size,
      slots: {},
    };
    if (wave.waveSize !== packet.wave_size) {
      return `波次 ${packet.wave_id} 的 wave_size 不一致。`;
    }
    const occupied = wave.slots[String(packet.worker_slot)];
    if (occupied && occupied !== packet.work_unit_id) {
      return `波次 ${packet.wave_id} 的 slot=${packet.worker_slot} 已被占用。`;
    }

    const activeAttempts = session.attempts.filter((item) =>
      ['pending', 'active'].includes(item.status),
    );
    const activeCount = activeAttempts.length;
    if (
      (packet.selected_agent === 'sol_reviewer' && activeCount > 0) ||
      activeAttempts.some((item) => item.agentType === 'sol_reviewer')
    ) {
      return 'sol_reviewer 必须与生产 Worker 分开执行。';
    }
    if (activeCount >= policy.team.maxWorkersPerWave) {
      return `当前已有 ${activeCount} 个 Worker 在运行或等待，达到并发上限。`;
    }

    wave.slots[String(packet.worker_slot)] = packet.work_unit_id;
    session.attempts.push({
      workUnitId: packet.work_unit_id,
      waveId: packet.wave_id,
      waveSize: packet.wave_size,
      workerSlot: packet.worker_slot,
      workerAttempt: packet.worker_attempt,
      agentType: packet.selected_agent,
      selectedEffort: packet.selected_effort,
      fallbackAgent: packet.fallback_agent,
      toolUseId: payload.tool_use_id ?? null,
      turnId: payload.turn_id ?? null,
      agentId: null,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    });
    return null;
  });
}

function trackSubagentStart(payload, policy) {
  if (!payload.session_id || !payload.agent_id || !payload.agent_type) return;
  withLedger(policy, (state, now) => {
    const session = state.sessions[payload.session_id];
    if (!session) return;
    pruneSession(session, policy, now);
    const pending = session.attempts.find(
      (item) => item.status === 'pending' && item.agentType === payload.agent_type,
    );
    if (!pending) return;
    pending.agentId = payload.agent_id;
    pending.status = 'active';
    pending.updatedAt = now;
    session.updatedAt = now;
  });
}

function trackSubagentStop(payload, policy, continuing) {
  if (!payload.session_id || !payload.agent_id) return;
  withLedger(policy, (state, now) => {
    const session = state.sessions[payload.session_id];
    if (!session) return;
    const attempt = session.attempts.find(
      (item) => item.agentId === payload.agent_id && item.status === 'active',
    );
    if (!attempt) return;
    attempt.status = continuing ? 'active' : 'stopped';
    attempt.updatedAt = now;
    session.updatedAt = now;
  });
}

function releaseFailedDispatch(sessionId, workUnitId, policy) {
  if (!sessionId || !workUnitId) return '缺少会话或工作单元标识。';
  return withLedger(policy, (state, now) => {
    const session = state.sessions[sessionId];
    if (!session) return `会话 ${sessionId} 没有路由账本。`;
    pruneSession(session, policy, now);
    const attempt = [...session.attempts].reverse().find(
      (item) =>
        item.workUnitId === workUnitId &&
        ['pending', 'active'].includes(item.status),
    );
    if (!attempt) return `工作单元 ${workUnitId} 没有待释放的调用。`;
    attempt.status = 'failed';
    attempt.updatedAt = now;
    session.updatedAt = now;
    return null;
  });
}

module.exports = {
  registerDispatch,
  releaseFailedDispatch,
  trackSubagentStart,
  trackSubagentStop,
};
