---
name: codex-routing-matrix
description: Maintain, install, verify, or diagnose the quality-first Sol, Terra, and Luna routing plugin.
---

# Codex Routing Matrix

1. Treat `../../references/RULE16.md` as the sole semantic routing rule and `../../routing-policy.json` as the mechanical contract.
2. Effective state is proven only by an installed and enabled record from `codex plugin list --json`, four trusted current Hooks, and one unique profile for each named agent in `~/.codex/agents`.
3. Back up files as required before changes. After changes run `../../scripts/verify.ps1`; after installation run `../../scripts/runtime-smoke.ps1`.
4. Use `../../scripts/install.ps1` to install agent profiles and the unnumbered `Codex Quality Routing` section. The two first-install default rules are not guarded. When another program may replace `config.toml`, use `../../scripts/config-guard.ps1`; it may merge only this plugin's registration and current Hook trust.
5. A task name, work-packet text, unit test, or subagent claim alone is not evidence that the requested model actually ran.
