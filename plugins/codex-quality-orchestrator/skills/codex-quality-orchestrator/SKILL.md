---
name: codex-quality-orchestrator
description: Audit, install, or troubleshoot the Codex quality-first Sol, Terra, and Luna routing policy, agent profiles, and enforcement hooks.
---

# Codex Quality Orchestrator

Use this skill when the user asks to inspect, install, change, or diagnose this plugin's model routing.

1. Read `../../references/RULE16.md` for the model-facing semantic policy.
2. Read `../../routing-policy.json` for mechanically enforced names, models, efforts, and `fork_turns` values.
3. Read only the relevant agent template under `../../templates/agents/` when checking a named role.
4. Treat Sol as the semantic router. Do not turn task meaning into a hard-coded decision tree.
5. Treat Hook rejection as a visible configuration or call-contract failure; never silently downgrade.
6. Before changing an existing file, create the required timestamped backup and preserve unrelated content.
7. Run `../../scripts/verify.ps1` after any plugin change. Do not claim success from a subagent report alone.

The plugin cannot register custom agents directly. Use `../../scripts/install.ps1` for explicit profile installation, and require a new task after installation or policy changes.
