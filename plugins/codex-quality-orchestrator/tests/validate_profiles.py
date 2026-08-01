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

assert manifest["name"] == "codex-quality-orchestrator"
assert manifest["version"] == policy["policyVersion"]
assert "路由预检" in rule
assert "Sol 负责理解、路由预检、分配、整合和最终验收" in rule
assert "提供商和错误" in rule
assert "完整工作单元的最高要求" in rule
assert "文件数、行数和验证步骤只能辅助判断" in rule
assert "同一工作单元的生产执行者和最低层级保持稳定" in rule
assert "交回 Sol 验收不算改派" in rule
assert "目标、范围或验收不清直接由 Sol" in rule
assert "生产数据、不可逆迁移、公共数据契约" in rule
assert "Luna 不能仅因任务短使用" in rule
assert "在所有满足硬约束的方案中，选择算力开支最低的执行组合" in rule
assert "目标代理可靠胜任的工作单元时必须下派" in rule
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

for effort in policy["sol"]["allowedEfforts"]:
    assert f"`{effort}`" in rule
assert policy["sol"]["model"] in rule
for agent_type in policy["namedAgents"]:
    assert f"`{agent_type}`" in rule

for path in PLUGIN_ROOT.rglob("*"):
    if path.is_file() and path.suffix.lower() in {".md", ".json", ".toml", ".cjs", ".ps1"}:
        assert "[TODO:" not in path.read_text(encoding="utf-8"), path

print("PASS manifest, Rule 16, and agent profiles")
