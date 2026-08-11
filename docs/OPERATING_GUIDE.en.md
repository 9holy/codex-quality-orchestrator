# Operating Guide

## Decision Flow

1. Handle clear short work directly on the current root agent.
2. For non-short work, Sol defines bounded units, ownership, dependencies, acceptance criteria, and integration order.
3. Use Luna Max first only when the unit is frozen, low-judgment, mechanically verifiable, and reliably within Luna's capability.
4. Otherwise prefer Sol Medium for bounded, moderate-judgment, independently verifiable units when delegation pays. Keep coupled or sequential work on the current Sol.
5. Use Terra only for a clear task-specific quality, context, concurrency, or total-cost advantage, at its lowest reliable effort.
6. Freeze each route until its unit, boundary, availability, or result changes.
7. Default to one Worker. Parallelize only independent, write-safe units. For homogeneous batches, verify one unit before filling available host capacity.
8. Wait once with a long blocking wait; do not poll.
9. Sol inspects actual diffs, reruns necessary checks, integrates in order, and makes the final decision.

## Work Packet

```text
[CQO_WORK_PACKET_V1]
route: <model> / <effort>
goal: <explicit result>
scope: <boundaries and allowed paths>
acceptance: <executable or observable criteria>
handoff: return failures to the current Sol and preserve completed work
```

Use `fork_turns:"none"` by default. Use a positive numeric string only when a Worker needs limited history. Never pass `model` to a named agent. Visible task names are:

```text
luna_max__unit_name
sol_medium__unit_name
terra_xhigh__unit_name
terra_max__unit_name
terra_ultra__unit_name
sol_reviewer_xhigh__unit_name
```

## Four Hooks

- `SessionStart`: stays silent when the global Rule 16 and agent profiles are current; otherwise injects the installed rule or reports missing profiles. It never changes the root model or effort.
- `UserPromptSubmit`: recognizes only the exact Chinese burst on/off commands. All other prompts are silent.
- `PreToolUse`: validates CQO agent profiles, allowed effort, absent model overrides, valid `fork_turns`, and visible route names. Unrelated agent calls pass through.
- `SubagentStop`: when the trimmed final message exactly equals `Selected model is at capacity. Please try a different model.`, continues once in the same subagent context. A second occurrence returns to Sol. Root controller capacity notifications are outside the resumable Hook path.

## Burst Mode

Burst mode is off by default. Send exactly `开启爆种模式` to enable it for the current session and `关闭爆种模式` to disable it. Sol is `d0`; task names contain `__d1_` through `__d4_`; packets include `burst_depth=dN` and `burst_delegate=yes`. Use at most 20 child threads, delegate only independent write-safe frozen units, and never delegate from `d4`. Sol still audits every result and required verification.

## Radar

Do not run Radar when Luna is suitable, only one candidate exists, or Sol can decide directly. If multiple capable Sol/Terra routes remain unresolved, run once per root task:

```powershell
node <plugin-root>\scripts\radar-routing-evidence.cjs
```

The cache is fresh for 24 hours and usable offline for up to 72 hours. Radar is supporting evidence between capable routes, never a replacement for capability or risk judgment.

## Installation And Verification

Run `scripts/install.ps1` to install Rule 16 and the four agent profiles. After an upgrade, trust all four current Hooks again and start a new task so the new skill and agent definitions load.

When another tool may replace `config.toml`, run `scripts/config-guard.ps1`. It merges only plugin registration, the known marketplace source, and the four trusted Hook hashes. It preserves authentication, providers, endpoints, models, and unrelated settings.

Before release, `scripts/verify.ps1` must pass. Runtime acceptance also requires one unique profile per named agent, four trusted Hooks, healthy configuration-guard state, and an enabled installed plugin record from `codex plugin list --json`.
