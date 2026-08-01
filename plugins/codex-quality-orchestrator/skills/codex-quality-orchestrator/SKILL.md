---
name: codex-quality-orchestrator
description: Audit, install, or troubleshoot the Codex quality-first Sol, Terra, and Luna routing policy, agent profiles, and enforcement hooks.
---

# Codex Quality Orchestrator

Use this skill when the user asks to inspect, install, change, or diagnose this plugin's model routing.

1. Read `../../references/RULE16.md` for the model-facing semantic policy.
2. Read `../../routing-policy.json` for mechanically enforced names, models, efforts, and `fork_turns` values.
3. Read only the relevant agent template under `../../templates/agents/` when checking a named role.
4. Treat Sol as the semantic router. A short task must be unambiguous, low-risk, need no design choice or diagnosis, use little context, and be directly verifiable; file count and change size are only supporting signals, and high-risk work is never short. Route the whole work unit by its highest requirement, choose the lowest tier with safety margin, and keep the production executor and minimum capability tier stable. Do not switch models because one step becomes simpler, the wording changes, or cost is lower; re-evaluate only after a material boundary change, repeated capability failure, or route unavailability, and only upgrade within the same work unit. Normal handoff to Sol for integration and final acceptance is not rerouting.
5. Use Luna only for deterministic low-risk subtasks with fixed inputs, outputs, procedure, and mechanical verification. Use Terra as the default delegated producer when implementation judgment, multi-step context, debugging, testing, review, multi-file work, test or configuration data, or ordinary integration under decided interfaces is required. Keep unclear goals, scope or acceptance directly with Sol; if only the Luna-versus-Terra capability tier is uncertain for a clear work unit, choose Terra. Keep architecture, security, public interfaces, production data, irreversible migrations, public data contracts, cross-agent final integration, and final acceptance with Sol.
6. Separate the root task from subagent routing. The desktop selector, a configuration manager, or `config.toml` chooses the root model and effort before plugin hooks run; this plugin cannot rewrite that selection.
7. When auditing runtime state, run `codex plugin list --json` and require an installed, enabled entry. A cache directory alone is not evidence that the plugin or its hooks are active.
8. After installation and Hook trust, run `../../scripts/runtime-smoke.ps1`; it proves only that the host loaded `SessionStart`. Verify the separate `PreToolUse` Hook before removing any legacy routing protection.
9. Treat Hook rejection as a visible configuration or call-contract failure; never silently downgrade.
10. Before changing an existing file, create the required timestamped backup and preserve unrelated content.
11. Run `../../scripts/verify.ps1` after any plugin change. Do not claim success from a subagent report alone.
12. If another program replaces `config.toml`, use `../../scripts/config-guard.ps1`. It restores only the native marketplace registration, plugin enablement, and exact Hook trust hashes that the user already approved; it must reject changed Hook trust instead of approving it automatically.

The plugin cannot register custom agents directly. Use `../../scripts/install.ps1` for explicit profile installation, and require a new task after installation or policy changes.
