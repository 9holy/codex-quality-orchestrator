'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

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

function nonemptyStringArray(value) {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((item) => nonemptyString(item))
  );
}

function validDeclaredPath(value) {
  if (!nonemptyString(value)) return false;
  const normalized = value.replaceAll('\\', '/');
  return !(
    normalized.startsWith('/') ||
    /^[A-Za-z]:/.test(normalized) ||
    normalized.startsWith('//') ||
    normalized.split('/').includes('..')
  );
}

function extractWorkPacket(message, config) {
  if (!nonemptyString(message)) return { error: '代理调用缺少 message。' };

  const open = `[${config.marker}]`;
  const close = `[/${config.marker}]`;
  const start = message.indexOf(open);
  const end = start < 0 ? -1 : message.indexOf(close, start + open.length);
  if (start < 0 || end < 0) {
    return { error: `message 必须包含完整的 ${config.marker}。` };
  }
  if (
    message.indexOf(open, start + open.length) >= 0 ||
    message.indexOf(close, end + close.length) >= 0
  ) {
    return { error: `${config.marker} 只能出现一次。` };
  }

  try {
    const packet = JSON.parse(message.slice(start + open.length, end).trim());
    if (!packet || typeof packet !== 'object' || Array.isArray(packet)) {
      return { error: `${config.marker} 必须是 JSON 对象。` };
    }
    return { packet };
  } catch (error) {
    return { error: `${config.marker} 不是有效 JSON：${error.message}` };
  }
}

function validateWorkPacket(input, agentType, policy) {
  const config = policy.workPacket;
  const extracted = extractWorkPacket(input.message, config);
  if (extracted.error) return extracted.error;
  const packet = extracted.packet;

  if (
    !nonemptyString(packet.work_unit_id) ||
    !/^[a-z0-9][a-z0-9_-]{2,63}$/.test(packet.work_unit_id)
  ) {
    return `${config.marker} 的 work_unit_id 格式无效。`;
  }
  if (input.task_name !== packet.work_unit_id) {
    return 'task_name 必须与工作包 work_unit_id 完全一致。';
  }
  if (!nonemptyString(packet.objective)) {
    return `${config.marker} 缺少 objective。`;
  }
  for (const field of ['scope', 'acceptance', 'verification']) {
    if (!nonemptyStringArray(packet[field])) {
      return `${config.marker} 的 ${field} 必须是非空字符串数组。`;
    }
  }
  if (
    !Array.isArray(packet.write_paths) ||
    !packet.write_paths.every((item) => validDeclaredPath(item))
  ) {
    return `${config.marker} 的 write_paths 必须是工作区内相对路径，不能含绝对路径或 ..。`;
  }
  if (!config.allowedTaskIntents.includes(packet.task_intent)) {
    return `${config.marker} 的 task_intent 无效。`;
  }
  if (!config.allowedMutationAuthorities.includes(packet.mutation_authority)) {
    return `${config.marker} 的 mutation_authority 无效。`;
  }
  if (packet.mutation_authority === 'none') {
    if (packet.write_paths.length !== 0 || packet.backup_required !== false) {
      return '无写入权限的工作包不得声明写入路径或备份操作。';
    }
    if (!['inspect', 'verify'].includes(packet.task_intent)) {
      return 'mutation_authority=none 只允许 inspect 或 verify。';
    }
  } else if (
    packet.task_intent !== 'mutate' ||
    packet.write_paths.length === 0 ||
    packet.backup_required !== true
  ) {
    return '写入工作包必须声明 mutate、非空 write_paths 和 backup_required=true。';
  }
  if (packet.selected_agent !== agentType) {
    return '工作包 selected_agent 必须与 agent_type 一致。';
  }
  const agentConfig = policy.namedAgents[agentType];
  const allowedEfforts =
    agentConfig.effortMode === 'fixed'
      ? [agentConfig.fixedEffort]
      : agentConfig.allowedEfforts;
  if (!allowedEfforts.includes(packet.selected_effort)) {
    return `${config.marker} 的 selected_effort 不适用于 ${agentType}。`;
  }
  if (
    agentConfig.effortMode === 'required' &&
    input.reasoning_effort !== packet.selected_effort
  ) {
    return '工作包 selected_effort 必须与 Terra reasoning_effort 一致。';
  }
  if (!config.allowedFallbacks[agentType]?.includes(packet.fallback_agent)) {
    return `${agentType} 的 fallback_agent 不在预声明链中。`;
  }
  if (
    !Number.isInteger(packet.worker_attempt) ||
    packet.worker_attempt < 1 ||
    packet.worker_attempt > policy.team.maxWorkerAttemptsPerWorkUnit ||
    (agentType === 'luna_worker' && packet.worker_attempt !== 1)
  ) {
    return `${config.marker} 的 worker_attempt 无效。`;
  }
  return null;
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

    const packetError = validateWorkPacket(input, input.agent_type, policy);
    if (packetError) {
      deny(packetError);
      return;
    }

    const profileError = validateInstalledProfile(input.agent_type, config);
    if (profileError) {
      deny(profileError);
      return;
    }

    if (config.effortMode === 'required') {
      if (
        typeof input.reasoning_effort !== 'string' ||
        !config.allowedEfforts.includes(input.reasoning_effort)
      ) {
        deny(
          `${input.agent_type} 只允许 reasoning_effort=` +
            `${config.allowedEfforts.join(' 或 ')}。`,
        );
      }
      return;
    }

    if (hasOwn(input, 'reasoning_effort')) {
      deny(`${input.agent_type} 已由代理配置固定推理档位，不得在调用中覆盖。`);
    }
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
