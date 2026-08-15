# Operating Guide

## How it works

The current Sol always remains in control. It understands the task, splits the work, chooses suitable Workers, and checks the final result. The plugin never changes the root model or reasoning effort of a running task.

The current Sol handles simple work directly. Larger work is delegated only when its boundaries are clear, its result can be checked, and delegation has a real benefit:

- Luna Max: clear, low-judgment work with straightforward checks.
- Sol Medium: bounded work that needs normal judgment.
- Terra: only when the specific task clearly favors Terra over Sol.
- Sol Reviewer: one read-only review for a critical high-risk change.

Architecture, security, production data, irreversible operations, unclear requirements, and unresolved causes stay with the current Sol.

## Super mode

Super mode is for many independent tasks that do not write to the same files. It uses up to 25 child threads and supports four delegation levels. The deepest level cannot delegate again.

Toggle it for the current session:

```text
enable super mode
disable super mode
开启爆种模式
关闭爆种模式
```

Super mode only increases parallelism. Sol still checks every result, reruns necessary verification, and owns final integration.

## Failure handling

When a subagent returns this exact capacity message, the plugin continues once in the same context instead of restarting the task:

```text
Selected model is at capacity. Please try a different model.
```

A second failure returns to Sol. Capability, scope, and quality failures are never treated as capacity failures. Current Codex Hooks cannot resume a root-controller request, so the plugin does not claim root automatic recovery.

## Install

The plugin is distributed through an independent Git Marketplace and is not yet listed in OpenAI's public plugin marketplace.

```powershell
codex plugin marketplace add 9holy/codex-quality-orchestrator --ref main
codex plugin add codex-quality-orchestrator@codex-quality-orchestrator
powershell -NoProfile -ExecutionPolicy Bypass -File "$HOME\.codex\.tmp\marketplaces\codex-quality-orchestrator\plugins\codex-quality-orchestrator\scripts\install.ps1"
```

First-install setup:

- Installs the Luna, Sol Medium, Terra, and Sol Reviewer profiles.
- Adds the unnumbered `Codex Quality Routing` section.
- Adds one-time English `Meta Rule - Conflict Resolution` and `Implementation` defaults at the top of `AGENTS.md`.

Later installs and the configuration guard do not restore or overwrite the two English defaults.

## Hooks and configuration guard

Review and trust these four Hooks in `/hooks`:

- `SessionStart`: supplies the current routing rule when it is missing.
- `UserPromptSubmit`: recognizes Chinese and English Super mode commands.
- `PreToolUse`: checks that CQO agent calls match their configuration.
- `SubagentStop`: handles one subagent capacity retry.

Review and trust Hooks again after an update changes their content. The plugin never bypasses trust.

If Cockpit Tools, CC Switch, or another tool may replace `config.toml`, enable the configuration guard:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "$HOME\.codex\.tmp\marketplaces\codex-quality-orchestrator\plugins\codex-quality-orchestrator\scripts\config-guard.ps1" -Mode Install
```

The guard restores only plugin registration and already approved Hooks. It preserves authentication, providers, endpoints, models, and unrelated settings.

## Verify

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "$HOME\.codex\.tmp\marketplaces\codex-quality-orchestrator\plugins\codex-quality-orchestrator\scripts\verify.ps1"
codex plugin list --json
```

Installation is complete only when the plugin is installed and enabled, each agent profile is unique, and all four Hooks are trusted. Start a new task after an upgrade so the new rules and profiles load.
