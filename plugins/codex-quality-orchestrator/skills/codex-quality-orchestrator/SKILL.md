---
name: codex-quality-orchestrator
description: Audit, install, or troubleshoot the Codex quality-first Sol, Terra, and Luna routing policy, agent profiles, and enforcement hooks.
---

# Codex Quality Orchestrator

Use this skill when the user asks to inspect, install, change, or diagnose this plugin's model routing.

1. Read `../../references/RULE16.md` for the model-facing semantic policy.
2. Read `../../routing-policy.json` for mechanically enforced names, models, efforts, and `fork_turns` values.
3. Read only the relevant agent template under `../../templates/agents/` when checking a named role.
4. Treat Sol as the semantic router. For every non-short task, check for a bounded, independently verifiable work unit that Terra or Luna can reliably complete; do not retain all work merely because Sol can do it, and do not create an agent-call quota.
5. Separate the root task from subagent routing. The desktop selector, CC Switch, or `config.toml` chooses the root model and effort before plugin hooks run; this plugin cannot rewrite that selection.
6. When auditing runtime state, run `codex plugin list --json` and require an installed, enabled entry. A cache directory alone is not evidence that the plugin or its hooks are active.
7. After installation and Hook trust, run `../../scripts/runtime-smoke.ps1`; it proves only that the host loaded `SessionStart`. Verify the separate `PreToolUse` Hook before removing any legacy routing protection.
8. Treat Hook rejection as a visible configuration or call-contract failure; never silently downgrade.
9. Before changing an existing file, create the required timestamped backup and preserve unrelated content.
10. Run `../../scripts/verify.ps1` after any plugin change. Do not claim success from a subagent report alone.

The plugin cannot register custom agents directly. Use `../../scripts/install.ps1` for explicit profile installation, and require a new task after installation or policy changes.
