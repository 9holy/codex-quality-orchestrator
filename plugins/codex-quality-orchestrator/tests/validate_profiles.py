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
assert base_version == policy["policyVersion"] == "0.2.1"
assert not separator or cachebuster
assert list((PLUGIN_ROOT / "skills").rglob("SKILL.md")) == [skill_path]
assert manifest["interface"]["defaultPrompt"] == [
    "Audit my current model routing configuration.",
    "Verify that the orchestrator plugin and hooks are active.",
]
assert "gpt-5.6-sol` 主控" in rule
assert "路由预检" in rule
assert "最低成本层级" in rule
assert "完整工作单元最高要求" in rule
assert "每波默认 2、最多 3 个 Worker" in rule
assert "CQO_WORK_PACKET_V1" in rule
assert "selected_effort" in rule
assert "共享文件只允许一个写者" in rule
assert "Worker 不得下派" in rule
assert "当前 Sol 直接接管" in rule
assert "不创建 Sol 子代理" in rule
assert "关键变更另派 Terra Max 只读复核" in rule
assert "gpt-5.6-luna / max" in rule
assert "gpt-5.6-terra / xhigh|max" in rule
assert "生产数据、不可逆迁移、公共数据契约" in rule
assert "插件不改已启动根档位" in rule
assert len(rule.strip()) <= 1500
capacity_message = "Selected model is at capacity. Please try a different model."
assert capacity_message in rule
assert rule.count(capacity_message) == 1
assert "自动续交“继续”一次" in rule
assert "保留上下文和进度" in rule
assert "不得重做、重拆或重启整项任务" in rule
assert "再次失败才按预声明 `Luna→Terra→当前 Sol` 上调" in rule
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
assert hooks["hooks"]["SubagentStop"][0]["matcher"] == (
    "^(luna_worker|terra_worker)$"
)
assert hooks["hooks"]["SubagentStop"][0]["hooks"][0]["commandWindows"] == (
    'node "$env:PLUGIN_ROOT\\hooks\\continue-capacity-subagent.cjs"'
)
assert policy["sol"]["spawnAllowed"] is False
assert policy["schemaVersion"] == 3
assert policy["sol"]["defaultCoordinatorEffort"] == "high"
assert policy["sol"]["complexCoordinatorEffort"] == "xhigh"
assert policy["team"] == {
    "defaultWorkersPerWave": 2,
    "maxWorkersPerWave": 3,
    "maxWorkerAttemptsPerWorkUnit": 2,
    "maxFollowupsPerWorker": 1,
    "singleWriterForSharedFiles": True,
    "workersMayDelegate": False,
}
assert policy["workPacket"] == {
    "marker": "CQO_WORK_PACKET_V1",
    "required": True,
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
assert set(policy["namedAgents"]) == {"luna_worker", "terra_worker"}

routing_hook = (PLUGIN_ROOT / "hooks" / "enforce-agent-routing.cjs").read_text(
    encoding="utf-8"
)
capacity_hook = (
    PLUGIN_ROOT / "hooks" / "continue-capacity-subagent.cjs"
).read_text(encoding="utf-8")
assert "validateWorkPacket" in routing_hook
assert "selected_agent" in routing_hook
assert "fallback_agent" in routing_hook
assert "replace(/^\\uFEFF+/, '')" in routing_hook
assert "replace(/^\\uFEFF+/, '')" in capacity_hook

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
for forbidden_work in ("方案选择", "问题诊断", "跨上下文推断", "不得创建子代理"):
    assert forbidden_work in luna_instructions

assert "中大型实现" in luna_instructions
assert "关键只读复核" in tomllib.loads(
    (PLUGIN_ROOT / "templates" / "agents" / "terra-worker.toml").read_text(
        encoding="utf-8"
    )
)["developer_instructions"]

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

for effort in policy["sol"]["allowedEfforts"]:
    assert f"`{effort}`" in rule
assert policy["sol"]["model"] in rule
for agent_type in policy["namedAgents"]:
    assert f"`{agent_type}`" in rule

for path in PLUGIN_ROOT.rglob("*"):
    if path.is_file() and path.suffix.lower() in {".md", ".json", ".toml", ".cjs", ".ps1"}:
        assert "[TODO:" not in path.read_text(encoding="utf-8"), path

print("PASS team routing, capacity continuation, retired profile, and agent contracts")
