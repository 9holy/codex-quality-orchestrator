from __future__ import annotations

import json
import hashlib
import pathlib
import tomllib


PLUGIN_ROOT = pathlib.Path(__file__).resolve().parent.parent


def load_json(path: pathlib.Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


policy = load_json(PLUGIN_ROOT / "routing-policy.json")
manifest = load_json(PLUGIN_ROOT / ".codex-plugin" / "plugin.json")
hooks = load_json(PLUGIN_ROOT / "hooks" / "hooks.json")
rule = (PLUGIN_ROOT / "references" / "RULE16.md").read_text(encoding="utf-8")
skill_path = PLUGIN_ROOT / "skills" / "codex-quality-orchestrator" / "SKILL.md"
skill = skill_path.read_text(encoding="utf-8")

assert manifest["name"] == "codex-quality-orchestrator"
base_version, separator, cachebuster = manifest["version"].partition("+codex.")
assert base_version == policy["policyVersion"] == "0.3.9"
assert not separator or cachebuster
assert list((PLUGIN_ROOT / "skills").rglob("SKILL.md")) == [skill_path]
assert manifest["interface"]["defaultPrompt"] == [
    "Audit my current model routing configuration.",
    "Verify that the orchestrator plugin and hooks are active.",
]
assert "gpt-5.6-sol` 主控" in rule
assert "`medium→xhigh→max→ultra`" in rule
assert "保持当前根档位" in rule
assert "仅在需要建议下一任务档位时使用最低可靠链" in rule
assert "Sol `high` 和 Terra `xhigh` 不自动选择" in rule
assert "`xhigh` 能胜任不得建议 `max`" in rule
assert "先过能力和风险门槛，再考虑热缓存与总成本" in rule
assert "必须优先交 `luna_worker / gpt-5.6-luna / max`" in rule
assert "同一工作单元保持当前模型和原代理" in rule
assert "局部问题最多续交一次定向修正" in rule
assert "能力不足、修正仍失败、容量再次失败或有独立/并行硬需求" in rule
assert "当前 Sol 能可靠完成且无需独立/并行就直接处理" in rule
assert "Terra Max 只做普通独立复核或必须并行的复杂单元" in rule
assert "Terra Ultra 做最深独立推理" in rule
assert "IQ 差小于 3 视为同级" in rule
assert "同级先保留热模型/原代理" in rule
assert "通常 1 个 Worker" in rule
assert "最多 3 个" in rule
assert "CQO_WORK_PACKET_V1" in rule
assert "selected_effort" in rule
assert "每根任务 8 次" in rule
assert "共享文件单写者" in rule
assert "Worker 不得下派" in rule
assert "当前 Sol 接管" in rule
assert "不创建 Sol 子代理" in rule
assert "按风险决定独立复核" in rule
assert "Hook 只校验" not in rule
assert policy["namedAgents"]["terra_worker"]["allowedEfforts"] == [
    "xhigh",
    "max",
    "ultra",
]
assert "生产数据、不可逆迁移、公共数据契约" in rule
assert "插件不改已启动根档位" not in rule
assert len(rule.strip()) <= 1300
capacity_message = "Selected model is at capacity. Please try a different model."
assert capacity_message in rule
assert rule.count(capacity_message) == 1
assert "触发原代理“继续”一次并保留进度" in rule
assert "再次失败按 `Luna→Terra→当前 Sol` 上调" in rule
assert '`fork_turns` 默认 `"none"`' in rule
assert len(skill) <= 1600
assert "唯一语义路由规范" in skill
assert "不要在 Skill 中复述" in skill
assert "在所有满足硬约束的方案中" not in skill
assert hooks["hooks"]["SessionStart"][0]["hooks"][0]["additionalContextLimit"] <= 2500
assert hooks["hooks"]["SessionStart"][0]["hooks"][0]["commandWindows"] == (
    'node "$env:PLUGIN_ROOT\\hooks\\inject-routing-policy.cjs"'
)
assert hooks["hooks"]["PreToolUse"][0]["hooks"][0]["commandWindows"] == (
    'node "$env:PLUGIN_ROOT\\hooks\\enforce-agent-routing.cjs"'
)
assert hooks["hooks"]["SubagentStart"][0]["matcher"] == (
    "^(luna_worker|terra_worker)$"
)
assert hooks["hooks"]["SubagentStart"][0]["hooks"][0]["commandWindows"] == (
    'node "$env:PLUGIN_ROOT\\hooks\\track-subagent-start.cjs"'
)
assert hooks["hooks"]["SubagentStop"][0]["matcher"] == (
    "^(luna_worker|terra_worker)$"
)
assert hooks["hooks"]["SubagentStop"][0]["hooks"][0]["commandWindows"] == (
    'node "$env:PLUGIN_ROOT\\hooks\\continue-capacity-subagent.cjs"'
)
assert policy["sol"]["spawnAllowed"] is False
assert policy["schemaVersion"] == 5
assert policy["sol"]["defaultCoordinatorEffort"] == "medium"
assert policy["sol"]["complexCoordinatorEffort"] == "xhigh"
assert policy["team"] == {
    "defaultWorkersPerWave": 1,
    "maxWorkersPerWave": 3,
    "maxWorkerAttemptsPerWorkUnit": 2,
    "maxRootWorkerAttempts": 8,
    "maxFollowupsPerWorker": 1,
    "singleWriterForSharedFiles": True,
    "workersMayDelegate": False,
    "ledgerFile": ".codex-quality-orchestrator-routing-ledger.json",
    "pendingDispatchTtlSeconds": 300,
    "activeDispatchTtlSeconds": 86400,
}
assert policy["workPacket"] == {
    "marker": "CQO_WORK_PACKET_V1",
    "required": True,
    "hostVisibleTaskNamePattern": "^(luna_max|terra_(?:xhigh|max|ultra))__([a-z0-9][a-z0-9_-]{2,39})__w([1-9]\\d{0,2})__s([1-3])of([1-3])__a([12])$",
    "hostVisibleTaskNameExample": "terra_max__unit_name__w1__s1of2__a1",
    "allowedTaskIntents": ["mutate", "inspect", "verify"],
    "allowedMutationAuthorities": ["none", "declared_paths"],
    "allowedFallbacks": {
        "luna_worker": ["terra_worker"],
        "terra_worker": ["sol_controller"],
    },
}
assert policy["capacityRecovery"] == {
    "message": capacity_message,
    "automaticContinuationPrompt": "继续",
    "maxAutomaticContinuationsPerSubagent": 1,
    "escalationOrder": ["luna_worker", "terra_worker", "sol_controller"],
}
assert policy["radarEvidence"] == {
    "enabled": True,
    "sourceUrl": "https://codexradar.com/api/intelligence-efficiency",
    "refreshSeconds": 86400,
    "maxStaleSeconds": 259200,
    "requestTimeoutMs": 1800,
    "maxResponseBytes": 12582912,
    "minSamples": 30,
    "iqTieMargin": 3.0,
    "lunaMaxAlwaysFirstWhenCapable": True,
}
assert policy["forkTurns"] == {
    "required": True,
    "defaultLiteral": "none",
    "allowedLiterals": ["none"],
    "allowPositiveIntegerString": True,
}
assert set(policy["namedAgents"]) == {"luna_worker", "terra_worker"}

routing_hook = (PLUGIN_ROOT / "hooks" / "enforce-agent-routing.cjs").read_text(
    encoding="utf-8"
)
capacity_hook = (
    PLUGIN_ROOT / "hooks" / "continue-capacity-subagent.cjs"
).read_text(encoding="utf-8")
start_hook = (PLUGIN_ROOT / "hooks" / "track-subagent-start.cjs").read_text(
    encoding="utf-8"
)
ledger_hook = (PLUGIN_ROOT / "hooks" / "routing-ledger.cjs").read_text(
    encoding="utf-8"
)
release_hook = (PLUGIN_ROOT / "hooks" / "release-failed-dispatch.cjs").read_text(
    encoding="utf-8"
)
assert "parseRouteTaskName" in routing_hook
assert "selected_agent" in routing_hook
assert "fallback_agent" in routing_hook
assert "replace(/^\\uFEFF+/, '')" in routing_hook
assert "replace(/^\\uFEFF+/, '')" in capacity_hook
assert "replace(/^\\uFEFF+/, '')" in start_hook
assert "maxRootWorkerAttempts" in ledger_hook
assert "attempt=1 尚未结束" in ledger_hook
assert "releaseFailedDispatch" in ledger_hook
assert "CODEX_THREAD_ID" in release_hook

for agent_type, config in policy["namedAgents"].items():
    profile_path = PLUGIN_ROOT / "templates" / "agents" / config["profileFile"]
    profile = tomllib.loads(profile_path.read_text(encoding="utf-8"))
    assert profile["name"] == agent_type
    assert profile["model"] == config["model"]
    if config["effortMode"] == "required":
        assert "model_reasoning_effort" not in profile
    else:
        assert profile["model_reasoning_effort"] == config["fixedEffort"]
    if "sandboxMode" in config:
        assert profile["sandbox_mode"] == config["sandboxMode"]

luna_instructions = tomllib.loads(
    (PLUGIN_ROOT / "templates" / "agents" / "luna-worker.toml").read_text(
        encoding="utf-8"
    )
)["developer_instructions"]
for forbidden_work in ("重新定义需求", "根因诊断", "跨上下文推断", "不得创建子代理"):
    assert forbidden_work in luna_instructions

assert "已定位问题的修复" in luna_instructions
assert "局部实现选择与修正" in luna_instructions
assert "独立复核" in tomllib.loads(
    (PLUGIN_ROOT / "templates" / "agents" / "terra-worker.toml").read_text(
        encoding="utf-8"
    )
)["developer_instructions"]
terra_instructions = tomllib.loads(
    (PLUGIN_ROOT / "templates" / "agents" / "terra-worker.toml").read_text(
        encoding="utf-8"
    )
)["developer_instructions"]
assert "xhigh 仅接受显式兼容调用" in terra_instructions
assert "max 接受普通独立复核或必须并行的复杂单元" in terra_instructions
assert "ultra 接受最深独立推理" in terra_instructions
assert "xhigh 用于常规判断" not in terra_instructions

retired = policy["retiredProfiles"]
assert retired == [
    {
        "agentType": "sol_reviewer",
        "profileFile": "sol-reviewer.toml",
        "templateSha256": "55c19086f24511a0a4ac88c4860c4c14e67cfacfb8e48eb45dcb3d1204895c11",
    }
]
retired_archive = PLUGIN_ROOT / "templates" / "retired" / "sol-reviewer.toml.bak"
assert retired_archive.is_file()
assert hashlib.sha256(retired_archive.read_bytes()).hexdigest() == retired[0]["templateSha256"]
assert not (PLUGIN_ROOT / "templates" / "agents" / "sol-reviewer.toml").exists()

assert policy["sol"]["allowedEfforts"] == ["medium", "high", "xhigh", "max", "ultra"]
assert "`medium→xhigh→max→ultra`" in rule
assert policy["sol"]["model"] in rule
for agent_type in policy["namedAgents"]:
    assert agent_type in rule

for path in PLUGIN_ROOT.rglob("*"):
    if path.is_file() and path.suffix.lower() in {".md", ".json", ".toml", ".cjs", ".ps1"}:
        assert "[TODO:" not in path.read_text(encoding="utf-8"), path

print("PASS team routing, capacity continuation, retired profile, and agent contracts")
