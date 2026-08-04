'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const policyPath = path.resolve(__dirname, '..', 'routing-policy.json');
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

function deny(reason) {
  process.stdout.write(`${JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  })}\n`);
}

function codexHome() {
  return process.env.CODEX_HOME
    ? path.resolve(process.env.CODEX_HOME)
    : path.join(os.homedir(), '.codex');
}

function parseTomlString(text, key) {
  const match = text.match(new RegExp(`^${key}\\s*=\\s*["']([^"']*)["']\\s*$`, 'm'));
  return match ? match[1] : null;
}

function validateInstalledProfile(agentType, config) {
  const profilePath = path.join(codexHome(), 'agents', config.profileFile);
  if (!fs.existsSync(profilePath)) return `${agentType} 的代理配置不存在：${profilePath}。`;

  const text = fs.readFileSync(profilePath, 'utf8');
  if (parseTomlString(text, 'name') !== agentType) {
    return `${config.profileFile} 的 name 与 ${agentType} 不一致。`;
  }
  if (parseTomlString(text, 'model') !== config.model) {
    return `${agentType} 未固定为 ${config.model}。`;
  }

  const effort = parseTomlString(text, 'model_reasoning_effort');
  if (config.effortMode === 'required' && effort !== null) {
    return `${agentType} 的推理档位必须由调用参数选择。`;
  }
  if (config.effortMode === 'fixed' && effort !== config.fixedEffort) {
    return `${agentType} 必须固定为 ${config.fixedEffort}。`;
  }
  if (config.sandboxMode && parseTomlString(text, 'sandbox_mode') !== config.sandboxMode) {
    return `${agentType} 必须使用 sandbox_mode=${config.sandboxMode}。`;
  }
  return null;
}

function validForkTurns(value, config) {
  if (typeof value !== 'string') return false;
  if (config.allowedLiterals.includes(value)) return true;
  return config.allowPositiveIntegerString && /^[1-9]\d*$/.test(value);
}

function selectedEffort(input, agentType, config) {
  if (config.effortMode === 'required') {
    if (typeof input.reasoning_effort !== 'string' ||
        !config.allowedEfforts.includes(input.reasoning_effort)) {
      return { error: `${agentType} 只允许 reasoning_effort=${config.allowedEfforts.join('、')}。` };
    }
    return { effort: input.reasoning_effort };
  }
  if (hasOwn(input, 'reasoning_effort')) {
    return { error: `${agentType} 已固定推理档位，不得在调用中覆盖。` };
  }
  return { effort: config.fixedEffort };
}

function routeLabel(agentType, effort) {
  if (agentType === 'luna_worker') return 'luna_max';
  if (agentType === 'sol_medium_worker') return 'sol_medium';
  if (agentType === 'terra_worker') return `terra_${effort}`;
  return 'sol_reviewer_xhigh';
}

function validate(payload, policy) {
  if (!policy.toolNames.includes(payload?.tool_name)) return;
  const input = payload.tool_input;
  if (!input || typeof input !== 'object' || Array.isArray(input)) return;

  const agentType = input.agent_type;
  if (typeof agentType !== 'string' || !hasOwn(policy.namedAgents, agentType)) return;
  if (typeof input.message !== 'string' || input.message.trim().length === 0) {
    deny(`${agentType} 缺少工作包 message。`);
    return;
  }
  if (!validForkTurns(input.fork_turns, policy.forkTurns)) {
    deny('fork_turns 必须显式设置为 "none" 或正整数字符串。');
    return;
  }
  if (hasOwn(input, 'model')) {
    deny(`${agentType} 已由代理配置固定模型，不得在调用中覆盖。`);
    return;
  }

  const config = policy.namedAgents[agentType];
  const profileError = validateInstalledProfile(agentType, config);
  if (profileError) {
    deny(profileError);
    return;
  }
  const effortResult = selectedEffort(input, agentType, config);
  if (effortResult.error) {
    deny(effortResult.error);
    return;
  }

  const label = routeLabel(agentType, effortResult.effort);
  const taskMatch = typeof input.task_name === 'string'
    ? input.task_name.match(new RegExp(policy.workPacket.hostVisibleTaskNamePattern))
    : null;
  if (!taskMatch) {
    deny(`task_name 必须使用 ${policy.workPacket.hostVisibleTaskNameExample} 格式。`);
    return;
  }
  if (taskMatch[1] !== label) {
    deny(`task_name 的路由前缀必须是 ${label}。`);
    return;
  }

}

(async () => {
  try {
    const policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString('utf8').replace(/^\uFEFF+/, '');
    validate(JSON.parse(raw), policy);
  } catch (error) {
    deny(`代理路由 Hook 失败：${error.message}`);
  }
})();
