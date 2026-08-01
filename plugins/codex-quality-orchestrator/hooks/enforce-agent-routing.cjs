'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { registerDispatch } = require('./routing-ledger.cjs');

const pluginRoot = path.resolve(__dirname, '..');
const policyPath = path.join(pluginRoot, 'routing-policy.json');
const canonicalPath = path.join(pluginRoot, 'references', 'RULE16.md');
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

function deny(reason) {
  process.stdout.write(
    `${JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason,
      },
    })}\n`,
  );
}

function codexHome() {
  return process.env.CODEX_HOME
    ? path.resolve(process.env.CODEX_HOME)
    : path.join(os.homedir(), '.codex');
}

function extractRule16(text) {
  const marker = '## Rule 16';
  const start = text.indexOf(marker);
  if (start < 0) return null;

  const section = text.slice(start);
  const nextRule = section.slice(marker.length).search(/^## Rule \d+/m);
  return (nextRule < 0 ? section : section.slice(0, marker.length + nextRule)).trim();
}

function parseTomlString(text, key) {
  const match = text.match(new RegExp(`^${key}\\s*=\\s*["']([^"']*)["']\\s*$`, 'm'));
  return match ? match[1] : null;
}

function validateInstalledProfile(agentType, config) {
  const profilePath = path.join(codexHome(), 'agents', config.profileFile);
  if (!fs.existsSync(profilePath)) {
    return `${agentType} 的代理配置不存在：${profilePath}。`;
  }

  const text = fs.readFileSync(profilePath, 'utf8');
  if (parseTomlString(text, 'name') !== agentType) {
    return `${config.profileFile} 的 name 与 ${agentType} 不一致。`;
  }
  if (parseTomlString(text, 'model') !== config.model) {
    return `${agentType} 未固定为 ${config.model}。`;
  }

  const configuredEffort = parseTomlString(text, 'model_reasoning_effort');
  if (config.effortMode === 'required' && configuredEffort !== null) {
    return `${agentType} 的推理档位必须由调用参数选择，不得在 TOML 中固定。`;
  }
  if (config.effortMode === 'fixed' && configuredEffort !== config.fixedEffort) {
    return `${agentType} 必须在 TOML 中固定为 ${config.fixedEffort}。`;
  }
  if (
    config.sandboxMode &&
    parseTomlString(text, 'sandbox_mode') !== config.sandboxMode
  ) {
    return `${agentType} 必须使用 sandbox_mode=${config.sandboxMode}。`;
  }
  return null;
}

function hasGlobalRuleConflict(canonical) {
  const globalPath = path.join(codexHome(), 'AGENTS.md');
  if (!fs.existsSync(globalPath)) return false;

  const installed = extractRule16(fs.readFileSync(globalPath, 'utf8'));
  return installed !== null && installed !== canonical;
}

function validForkTurns(value, config) {
  if (typeof value !== 'string') return false;
  if (config.allowedLiterals.includes(value)) return true;
  return config.allowPositiveIntegerString && /^[1-9]\d*$/.test(value);
}

function nonemptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function parseRouteTaskName(value, agentType, selectedEffort, policy) {
  const match = nonemptyString(value)
    ? value.match(new RegExp(policy.workPacket.hostVisibleTaskNamePattern))
    : null;
  if (!match) {
    return {
      error: `task_name 必须使用 ${policy.workPacket.hostVisibleTaskNameExample} 格式。`,
    };
  }

  const waveSize = Number(match[4]);
  const workerSlot = Number(match[3]);
  const workerAttempt = Number(match[5]);
  if (waveSize > policy.team.maxWorkersPerWave || workerSlot > waveSize) {
    return { error: 'task_name 的波次槽位超出允许范围。' };
  }
  if (
    workerAttempt > policy.team.maxWorkerAttemptsPerWorkUnit ||
    (agentType === 'luna_worker' && workerAttempt !== 1)
  ) {
    return { error: 'task_name 的 Worker 尝试次数无效。' };
  }

  return {
    packet: {
      work_unit_id: match[1],
      wave_id: `wave-${match[2]}`,
      wave_size: waveSize,
      worker_slot: workerSlot,
      worker_attempt: workerAttempt,
      selected_agent: agentType,
      selected_effort: selectedEffort,
      fallback_agent: policy.workPacket.allowedFallbacks[agentType][0],
    },
  };
}

function validate(payload, policy, canonical) {
  if (!policy.toolNames.includes(payload?.tool_name)) return;

  const input = payload.tool_input;
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    deny('代理路由参数必须是 JSON 对象。');
    return;
  }

  if (!validForkTurns(input.fork_turns, policy.forkTurns)) {
    deny('fork_turns 必须显式设置为 "none" 或正整数字符串。');
    return;
  }

  if (hasGlobalRuleConflict(canonical)) {
    deny('全局 Rule 16 与插件规则不一致，已暂停代理调度。');
    return;
  }

  if (hasOwn(input, 'agent_type')) {
    const config = policy.namedAgents[input.agent_type];
    if (!config) {
      deny(`禁止使用未登记的具名代理 ${input.agent_type ?? 'null'}。`);
      return;
    }
    if (hasOwn(input, 'model')) {
      deny(`${input.agent_type} 已由代理配置固定模型，不得在调用中覆盖。`);
      return;
    }
    if (!nonemptyString(input.message)) {
      deny('代理调用缺少 message。');
      return;
    }

    const profileError = validateInstalledProfile(input.agent_type, config);
    if (profileError) {
      deny(profileError);
      return;
    }

    let selectedEffort;
    if (config.effortMode === 'required') {
      if (
        typeof input.reasoning_effort !== 'string' ||
        !config.allowedEfforts.includes(input.reasoning_effort)
      ) {
        deny(
          `${input.agent_type} 只允许 reasoning_effort=` +
            `${config.allowedEfforts.join(' 或 ')}。`,
        );
        return;
      }
      selectedEffort = input.reasoning_effort;
    } else if (hasOwn(input, 'reasoning_effort')) {
      deny(`${input.agent_type} 已由代理配置固定推理档位，不得在调用中覆盖。`);
      return;
    } else {
      selectedEffort = config.fixedEffort;
    }

    const route = parseRouteTaskName(
      input.task_name,
      input.agent_type,
      selectedEffort,
      policy,
    );
    if (route.error) {
      deny(route.error);
      return;
    }
    const ledgerError = registerDispatch(payload, route.packet, policy);
    if (ledgerError) deny(ledgerError);
    return;
  }

  deny(
    `${policy.sol.model} 只允许作为当前主控直接执行和兜底，` +
      '不得创建 Sol 子代理；请使用已登记的 Luna/Terra Worker。',
  );
}

(async () => {
  try {
    const policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
    const canonical = fs.readFileSync(canonicalPath, 'utf8').trim();
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString('utf8').replace(/^\uFEFF+/, '');
    validate(JSON.parse(raw), policy, canonical);
  } catch (error) {
    deny(`代理路由 Hook 失败：${error.message}`);
  }
})();
