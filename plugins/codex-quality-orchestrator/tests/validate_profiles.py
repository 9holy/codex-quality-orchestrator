from __future__ import annotations

import json
import pathlib
import tomllib


PLUGIN_ROOT = pathlib.Path(__file__).resolve().parent.parent


def load_json(path: pathlib.Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


policy = load_json(PLUGIN_ROOT / "routing-policy.json")
manifest = load_json(PLUGIN_ROOT / ".codex-plugin" / "plugin.json")
hooks = load_json(PLUGIN_ROOT / "hooks" / "hooks.json")
rule = (PLUGIN_ROOT / "references" / "RULE16.md").read_text(encoding="utf-8")
maintenance_skill_path = (
    PLUGIN_ROOT / "skills" / "codex-quality-orchestrator" / "SKILL.md"
)
routing_skill_path = (
    PLUGIN_ROOT / "skills" / "codex-quality-routing-team" / "SKILL.md"
)
maintenance_skill = maintenance_skill_path.read_text(encoding="utf-8")
routing_skill = routing_skill_path.read_text(encoding="utf-8")
routing_skill_metadata = (
    routing_skill_path.parent / "agents" / "openai.yaml"
).read_text(encoding="utf-8")

assert manifest["name"] == "codex-quality-orchestrator"
base_version, separator, cachebuster = manifest["version"].partition("+codex.")
assert base_version == policy["policyVersion"] == "0.3.19"
assert not separator or cachebuster
assert sorted((PLUGIN_ROOT / "skills").glob("*/SKILL.md")) == sorted(
    [maintenance_skill_path, routing_skill_path]
)
assert manifest["interface"]["defaultPrompt"] == [
    "Route this task through the lowest-cost capable quality team.",
    "Audit my current model routing configuration.",
    "Verify that the orchestrator plugin and hooks are active.",
]
assert "目标明确、低风险且可直接验证的短任务" in rule
assert "高风险任务不算短任务" in rule
assert "非短任务由当前 `gpt-5.6-sol` 使用 `$codex-quality-routing-team`" in rule
assert "Sol 只做冻结边界所需的调研并先列出已知工作单元" in rule
assert "有足够执行量、交接有净收益" in rule
assert "必须优先派 `luna_worker`" in rule
assert "单个单元即可下派，不要求并行" in rule
assert "不能胜任或不确定就不派" in rule
assert "任务开始时只在能胜任候选间使用一次新鲜 `[CQO_RADAR]` 数据确定执行者" in rule
assert "Luna Max 能胜任时固定优先" in rule
assert "IQ 差≥3 选高 IQ" in rule
assert "差<3 视为同级" in rule
assert "没有新鲜数据就由 Sol 判断" in rule
assert "确定后不重复选模" in rule
assert "仅新增单元、边界变化、执行失败或模型不可用时重判" in rule
assert "通常使用 1 个 Worker" in rule
assert "仅有 2–3 个互不依赖、写入不冲突且并行收益更大的单元时组队" in rule
assert "最多 3 个" in rule
assert "共享文件单写者" in rule
assert "Worker 不得创建子代理" in rule
assert "Luna 不适用时，由当前 Sol 完成" in rule
assert "适合独立执行的单元派给能胜任的 Terra 最低档位" in rule
assert "Worker 结果必须由 Sol 检查实际差异并复跑必要验证" in rule
assert "仅明确、局部的问题可交原 Worker 修正一次" in rule
assert "能力不足、越界或质量不合格立即交回 Sol" in rule
assert "Sol 不创建执行型 Sol 子代理" in rule
assert "仅关键高风险变更可另派 1 个 `sol_reviewer`（Sol XHigh）只读复审" in rule
assert policy["namedAgents"]["terra_worker"]["allowedEfforts"] == [
    "xhigh",
    "max",
    "ultra",
]
assert "生产数据/契约、不可逆迁移" in rule
assert "插件" not in rule
assert "用户" not in rule
assert len(rule.strip()) <= 1400
capacity_message = "Selected model is at capacity. Please try a different model."
assert capacity_message in rule
assert rule.count(capacity_message) == 1
assert "向原代理发送“继续”一次并保留进度" in rule
assert "再次失败交回 Sol" in rule
assert "能力或质量失败不得这样续交" in rule
assert "`fork_turns`" in rule
assert "不传 `model`" in rule
assert "CQO_WORK_PACKET_V1" not in rule
assert len(maintenance_skill) <= 1600
assert "唯一语义路由规范" in maintenance_skill
assert "不要在 Skill 中复述" in maintenance_skill
assert len(routing_skill) <= 1900
assert "单个较大且边界明确" in routing_skill
assert "不得为单个单元建立 TeamPlan" in routing_skill
assert "不得派生产 Worker" in routing_skill
assert "首次分派前读取 `../../routing-policy.json`" in routing_skill
assert "不要为使用 Worker 切碎任务" in routing_skill
assert "allow_implicit_invocation: true" in routing_skill_metadata
assert "$codex-quality-routing-team" in routing_skill_metadata
assert hooks["hooks"]["SessionStart"][0]["hooks"][0]["additionalContextLimit"] <= 2500
assert hooks["hooks"]["SessionStart"][0]["hooks"][0]["commandWindows"] == (
    'node "$env:PLUGIN_ROOT\\hooks\\inject-routing-policy.cjs"'
)
assert hooks["hooks"]["PreToolUse"][0]["hooks"][0]["commandWindows"] == (
    'node "$env:PLUGIN_ROOT\\hooks\\enforce-agent-routing.cjs"'
)
assert hooks["hooks"]["SubagentStart"][0]["matcher"] == (
    "^(luna_worker|terra_worker|sol_reviewer)$"
)
assert hooks["hooks"]["SubagentStart"][0]["hooks"][0]["commandWindows"] == (
    'node "$env:PLUGIN_ROOT\\hooks\\track-subagent-start.cjs"'
)
assert hooks["hooks"]["SubagentStop"][0]["matcher"] == (
    "^(luna_worker|terra_worker|sol_reviewer)$"
)
assert hooks["hooks"]["SubagentStop"][0]["hooks"][0]["commandWindows"] == (
    'node "$env:PLUGIN_ROOT\\hooks\\continue-capacity-subagent.cjs"'
)
assert "executionSubagentsAllowed" not in policy["sol"]
assert "spawnAllowed" not in policy["sol"]
assert policy["schemaVersion"] == 5
assert policy["sol"]["defaultCoordinatorEffort"] == "medium"
assert policy["sol"]["complexCoordinatorEffort"] == "xhigh"
assert policy["team"] == {
    "defaultWorkersPerWave": 1,
    "maxWorkersPerWave": 3,
    "maxWorkerAttemptsPerWorkUnit": 2,
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
    "hostVisibleTaskNamePattern": "^(luna_max|terra_(?:xhigh|max|ultra)|sol_reviewer_xhigh)__([a-z0-9][a-z0-9_-]{2,39})__w([1-9]\\d{0,2})__s([1-3])of([1-3])__a([12])$",
    "hostVisibleTaskNameExample": "terra_ultra__unit_name__w1__s1of2__a1",
    "allowedTaskIntents": ["mutate", "inspect", "verify"],
    "allowedMutationAuthorities": ["none", "declared_paths"],
    "allowedFallbacks": {
        "luna_worker": ["sol_controller", "terra_worker"],
        "terra_worker": ["sol_controller"],
        "sol_reviewer": ["sol_controller"],
    },
}
assert policy["capacityRecovery"] == {
    "message": capacity_message,
    "automaticContinuationPrompt": "继续",
    "maxAutomaticContinuationsPerSubagent": 1,
    "escalationOrder": ["luna_worker", "sol_controller", "terra_worker"],
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
assert set(policy["namedAgents"]) == {"luna_worker", "terra_worker", "sol_reviewer"}

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
assert "maxRootWorkerAttempts" not in ledger_hook
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
terra_instructions = tomllib.loads(
    (PLUGIN_ROOT / "templates" / "agents" / "terra-worker.toml").read_text(
        encoding="utf-8"
    )
)["developer_instructions"]
assert "Sol 已明确" in terra_instructions
assert "不改变已选的 xhigh、max 或 ultra" in terra_instructions
assert "xhigh 用于常规判断" not in terra_instructions
assert "普通独立复核" not in terra_instructions

reviewer_instructions = tomllib.loads(
    (PLUGIN_ROOT / "templates" / "agents" / "sol-reviewer.toml").read_text(
        encoding="utf-8"
    )
)["developer_instructions"]
assert "仅独立复审关键高风险变更" in reviewer_instructions
for forbidden in ("不得修改文件", "执行生产工作", "创建子代理", "作最终裁决"):
    assert forbidden in reviewer_instructions
assert policy["retiredProfiles"] == []
assert not (PLUGIN_ROOT / "templates" / "retired" / "sol-reviewer.toml.bak").exists()

assert policy["sol"]["allowedEfforts"] == ["medium", "high", "xhigh", "max", "ultra"]
assert policy["sol"]["model"] in rule
assert "luna_worker" in rule
assert "Terra" in rule
assert "sol_reviewer" in rule

for path in PLUGIN_ROOT.rglob("*"):
    if path.is_file() and path.suffix.lower() in {".md", ".json", ".toml", ".cjs", ".ps1"}:
        assert "[TODO:" not in path.read_text(encoding="utf-8"), path

print("PASS team routing, capacity continuation, reviewer isolation, and agent contracts")
