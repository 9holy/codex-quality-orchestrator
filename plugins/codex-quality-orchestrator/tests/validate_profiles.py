from __future__ import annotations

import json
import pathlib
import tomllib


ROOT = pathlib.Path(__file__).resolve().parent.parent
policy = json.loads((ROOT / "routing-policy.json").read_text(encoding="utf-8"))
manifest = json.loads((ROOT / ".codex-plugin" / "plugin.json").read_text(encoding="utf-8"))
hooks = json.loads((ROOT / "hooks" / "hooks.json").read_text(encoding="utf-8"))
rule = (ROOT / "references" / "RULE16.md").read_text(encoding="utf-8")
maintenance = (ROOT / "skills" / "codex-quality-orchestrator" / "SKILL.md").read_text(encoding="utf-8")
routing = (ROOT / "skills" / "codex-quality-routing-team" / "SKILL.md").read_text(encoding="utf-8")

base_version = manifest["version"].partition("+codex.")[0]
assert manifest["name"] == "codex-quality-orchestrator"
assert base_version == policy["policyVersion"] == "0.7.0"
assert policy["schemaVersion"] == 8
assert set(policy) == {
    "schemaVersion", "policyVersion", "toolNames", "workPacket",
    "capacityRecovery", "rootCapacityRecovery", "radarEvidence", "namedAgents", "retiredProfiles", "burstMode", "forkTurns",
}
assert "team" not in policy and "sol" not in policy
assert "allowedFallbacks" not in json.dumps(policy)
assert "maxWorkerAttempts" not in json.dumps(policy)
assert policy["workPacket"] == {
    "hostVisibleTaskNamePattern": "^(luna_max|sol_medium|terra_(?:xhigh|max|ultra)|sol_reviewer_xhigh)__([a-z0-9][a-z0-9_]{1,47})$",
    "hostVisibleTaskNameExample": "luna_max__unit_name",
}
assert policy["capacityRecovery"] == {
    "message": "Selected model is at capacity. Please try a different model.",
    "automaticContinuationPrompt": "继续",
}
assert set(policy["namedAgents"]) == {"luna_worker", "sol_medium_worker", "terra_worker", "sol_reviewer"}
assert policy["namedAgents"]["sol_medium_worker"]["fixedEffort"] == "medium"
assert policy["namedAgents"]["terra_worker"]["allowedEfforts"] == ["xhigh", "max", "ultra"]
assert set(hooks["hooks"]) == {"SessionStart", "UserPromptSubmit", "PreToolUse", "SubagentStop", "Stop"}
assert "SubagentStart" not in hooks["hooks"]

for agent_type, config in policy["namedAgents"].items():
    profile_path = ROOT / "templates" / "agents" / config["profileFile"]
    profile = tomllib.loads(profile_path.read_text(encoding="utf-8"))
    assert profile["name"] == agent_type
    assert profile["model"] == config["model"]
    if config["effortMode"] == "required":
        assert "model_reasoning_effort" not in profile
    else:
        assert profile["model_reasoning_effort"] == config["fixedEffort"]
    instructions = profile["developer_instructions"]
    if agent_type != "sol_reviewer":
        assert "delegate to other agents" in instructions
        assert "acceptance criterion" in instructions
        assert "instead of guessing" in instructions

assert "MUST choose `luna_worker`" in rule
assert "Never trial uncertain work on Luna" in rule
assert "use `sol_medium_worker` for bounded, moderate-judgment" in rule
assert "deep reasoning alone never selects it" in rule
assert "Use Radar once at most per root task" in rule
assert "Freeze each route" in rule
assert "Selected model is at capacity. Please try a different model." in rule
assert "Preserve the root model and reasoning effort" in rule
assert "For homogeneous batches, verify one unit, fill host capacity, and replace completed Workers" in rule
assert "Use one blocking wait; never poll" in rule
assert "No task-wide cumulative cap" in rule
assert "call `wait_agent` once with `timeout_ms:3600000`" in routing
assert "Never poll `list_agents` or repeat short waits" in routing
assert "two or three" not in rule and "never exceed three" not in rule
assert "[CQO_WORK_PACKET_V1]" not in rule
assert "[CQO_WORK_PACKET_V1]" in routing
assert "fallback: current Sol; preserve completed work" in routing
assert "do not run it again" in routing
assert "sole semantic routing rule" in maintenance
for model_path in [
    ROOT / "routing-policy.json",
    ROOT / "skills" / "codex-quality-orchestrator" / "SKILL.md",
    ROOT / "skills" / "codex-quality-routing-team" / "SKILL.md",
]:
    assert model_path.read_bytes().isascii(), f"model-facing file is not ASCII: {model_path}"
for removed in [
    ROOT / "hooks" / "routing-ledger.cjs",
    ROOT / "hooks" / "release-failed-dispatch.cjs",
    ROOT / "hooks" / "track-subagent-start.cjs",
    ROOT / "tests" / "routing-ledger.test.cjs",
]:
    assert not removed.exists(), removed
assert (ROOT / "scripts" / "radar-routing-evidence.cjs").is_file()
assert not (ROOT / "hooks" / "radar-routing-evidence.cjs").exists()

for path in ROOT.rglob("*"):
    if path.is_file() and path.suffix.lower() in {".md", ".json", ".toml", ".cjs", ".ps1"}:
        assert "[TODO:" not in path.read_text(encoding="utf-8"), path

assert policy["burstMode"]["maxChildThreads"] == 20
assert policy["rootCapacityRecovery"]["maxAttempts"] == 10
assert policy["burstMode"]["depths"] == [1, 2, 3, 4]
print("PASS minimal policy, burst contract, and concise agent contracts")
