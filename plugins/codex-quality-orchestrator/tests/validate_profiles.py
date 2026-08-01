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
skill = (
    PLUGIN_ROOT / "skills" / "codex-quality-orchestrator" / "SKILL.md"
).read_text(encoding="utf-8")

assert manifest["name"] == "codex-quality-orchestrator"
assert manifest["version"] == policy["policyVersion"]
assert manifest["version"] == "0.1.6"
assert manifest["interface"]["defaultPrompt"] == [
    "Audit my current model routing configuration.",
    "Verify that the orchestrator plugin and hooks are active.",
]
assert "路由预检" in rule
assert "Sol 负责理解、路由预检、分配、整合和最终验收" in rule
assert "提供商和错误" in rule
assert "按完整工作单元最高要求" in rule
assert "文件数、行数和验证步骤仅作辅助判断" in rule
assert "同单元生产执行者和最低层级稳定" in rule
assert "交回 Sol 验收不算改派" in rule
assert "目标、范围或验收不清由 Sol" in rule
assert "边界清楚但 Luna/Terra 难判选 Terra" in rule
assert "生产数据、不可逆迁移、公共数据契约" in rule
assert "需求模糊、重复失败或其他高风险用 `gpt-5.6-sol / max`" in rule
assert "Luna 不因短而用" in rule
assert "无需判断、诊断或跨上下文推断" in rule
assert "中等生产默认下派者" in rule
assert "合格方案中算力开支最低者优先" in rule
assert "可独立验收且可靠胜任的单元必须下派" in rule
assert "不能因 Sol 也能完成而保留" in rule
assert "插件不改已启动根模型/档位" in rule
assert len(rule.strip()) <= 1500
capacity_message = "Selected model is at capacity. Please try a different model."
assert capacity_message in rule
assert rule.count(capacity_message) == 1
assert "仅错误包含精确消息" in rule
assert "保留已完成结果、上下文和计数" in rule
assert "相同 `agent_type`、模型、`reasoning_effort`、`fork_turns` 和输入原样重试一次" in rule
assert "只重试失败的同一次代理调用" in rule
assert "不重做已完成工作、不重新拆分或重启整个任务" in rule
assert "第二次仍包含该消息才 Luna→Terra→Sol 上调" in rule
assert "Sol 两次即停" in rule
assert "每层仅一次，改提示词不重置" in rule
assert "除该消息外，所有错误均公开模型、提供商和错误并上调或停止" in rule
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
for forbidden_work in ("方案选择", "问题诊断", "跨上下文推断"):
    assert forbidden_work in luna_instructions

for effort in policy["sol"]["allowedEfforts"]:
    assert f"`{effort}`" in rule
assert policy["sol"]["model"] in rule
for agent_type in policy["namedAgents"]:
    assert f"`{agent_type}`" in rule

for path in PLUGIN_ROOT.rglob("*"):
    if path.is_file() and path.suffix.lower() in {".md", ".json", ".toml", ".cjs", ".ps1"}:
        assert "[TODO:" not in path.read_text(encoding="utf-8"), path

print("PASS manifest, Rule 16 capacity retry policy, and agent profiles")
