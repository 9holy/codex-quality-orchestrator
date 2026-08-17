# Changelog

## Unreleased

## 0.8.4 - 2026-08-18

- Support the same plugin on macOS and Linux, including Linux Codex CLI servers, through a Node setup entry, portable paths, legacy backup-path normalization, and a `python3` verification fallback.
- Add macOS to CI and keep automatic configuration-guard startup explicitly Windows-only.
- Rename stale numbered-rule identifiers to the unnumbered `Codex Routing Matrix` terminology without changing routing behavior.
- After one in-context Luna capacity retry, let Sol reroute the same frozen packet to capable Sol Medium without restarting completed work.

## 0.8.3 - 2026-08-17

- Remove current-version labels from the README; version information remains in Releases and plugin metadata.

## 0.8.2 - 2026-08-17

- Remove redundant routing and migration details from the README.

## 0.8.1 - 2026-08-17

- Clarify that every named profile can run as a subagent while routing remains based on task fit, quality, and total cost.
- Keep Workers non-delegating in normal mode; allow only explicitly authorized `d1-d3` delegation in Super mode, with `d4` and the read-only reviewer always terminal.
- Add reversible global 1M context commands in Chinese and English without adding another Hook.
- Write numeric `model_context_window = 1000000` and `model_auto_compact_token_limit = 900000`, preserve prior values, and require restarting Codex before reopening the same task.
- Cover idempotent enable/disable, absent or existing settings, UTF-8 BOM preservation, Hook-bundle trust, and bilingual documentation.

## 0.8.0 - 2026-08-16

- Rename the public repository, Marketplace, and plugin ID to `codex-routing-matrix`.
- Keep the old `codex-quality-orchestrator` install state readable during migration.
- Stop the legacy configuration-guard launcher when the new guard is installed.
- Keep the Codex Routing Matrix rule and existing agent profiles compatible.

## 0.7.1 - 2026-08-16

- Insert CQO under the unnumbered `Codex Routing Matrix` heading and preserve all user-authored numbered rules.
- Set burst-mode and host concurrency defaults to 25 child threads.
- On first install only, prepend unnumbered English `Meta Rule - Conflict Resolution` and `Implementation` defaults; upgrades and the configuration guard do not restore or overwrite them.
- Clarify bilingual installation, upgrade, Hook-trust, and Marketplace visibility: the Git Marketplace must be added before installation and the plugin is not yet in OpenAI's public curated Marketplace.
- Add exact English Super mode commands: `enable super mode` and `disable super mode`, alongside the Chinese commands.

## 0.7.0 - 2026-08-11

- Add session-scoped burst mode with exact on/off commands, `d1-d4` delegation, a 20-child host limit, and unchanged Sol audit gates.
- Add `UserPromptSubmit` as the fourth Hook while keeping ordinary prompts silent.
- Resume the exact selected-model-capacity failure once inside the same subagent context; document that current Hooks cannot resume the root controller request.
- Publish current Chinese and English installation, routing, operation, and requirement documentation.

## 0.6.0

- Restrict Luna Max to frozen, low-judgment work with mechanical verification.
- Add a fixed Sol Medium Worker for bounded, independently verifiable work that needs moderate judgment and benefits from delegation or parallelism.
- Make Terra a task-specific advantage route rather than a deep-reasoning escalation step.

## 0.5.0 - 2026-08-04

- Restore the complete quality-first routing baseline after the 0.4 simplification: Sol owns decisions and integration, Luna Max remains the mandatory first capable Worker, and Luna unsuitability no longer selects Terra automatically.
- Add a lightweight in-context plan with unit ownership, dependencies, acceptance, integration order, one-time Radar evidence, and frozen per-unit routes without restoring a ledger or fixed task limits.
- Add requirement traceability and semantic regression checks for Luna trial dispatch, automatic Terra promotion, repeated Radar selection, and contradictory documentation.
- Keep the existing three minimal Hooks, host-capacity scaling, passive waits, one-shot capacity continuation, named-agent profiles, and configuration guard unchanged.

## 0.4.2 - 2026-08-03

- Use one long native agent wait that wakes early on Worker updates instead of polling agent status or repeating short waits.
- Refill host capacity after completed batch units without adding a queue, ledger, or new Hook.

## 0.4.1 - 2026-08-03

- Replace the fixed three-Worker ceiling with host-capacity-aware concurrency for verified homogeneous batches.
- Keep one Worker as the default, require independent write-safe units for parallel work, and remove task-wide Worker, batch, and attempt caps without weakening per-unit failure controls.

## 0.4.0 - 2026-08-03

- Rebuild routing around three small Hooks: conditional routing-matrix loading, CQO-only visible call validation, and one exact in-place capacity continuation.
- Remove the session ledger, SubagentStart Hook, wave/slot/attempt names, manual release command, fixed attempt budgets, and dead fallback chain.
- Let unrelated agents and Skills pass through PreToolUse while continuing to validate CQO profiles, Terra effort, fork context, and visible route names.
- Keep worker packets short and model-facing; acknowledge that the host encrypts packet messages before PreToolUse, so Hooks validate only observable mechanical fields.
- Replace long agent instructions with bounded, verifiable worker contracts based on the native Luna template.
- Keep SessionStart silent when the installed routing matrix already matches, preventing repeated CQO activation context.
- Move Radar from the Hook directory to an optional script and retain its cached, candidate-only use.
- Preserve Cockpit and CC Switch configuration by restoring only the plugin registration and three approved Hook hashes.

## 0.3.19 - 2026-08-03

- Add an implicitly invokable daily routing skill so ordinary multi-step work can enter the Sol-led routing workflow instead of exposing only the maintenance skill.
- Route one substantial, bounded, verifiable Luna Max unit when delegation has net benefit; require multiple units only for parallel TeamPlan execution.
- Keep the existing four-Hook surface and add a compact SessionStart routing reminder without per-prompt token overhead.
- Stop injecting Radar into every task; Luna-capable work skips Radar, while other routes load one cached summary only when multiple capable candidates remain.
- Remove duplicated semantic routing instructions from the daily Skill and keep the routing matrix as the single source of truth.
- Keep ambiguous and root-cause diagnosis work with Sol even when the work is read-only.
- Require explicit `agent_type` and `fork_turns` tool arguments before dispatch so the Hook does not reject an otherwise valid work packet.
- Put the full model and reasoning effort on the second line of every work packet so the desktop agent-created message shows the actual route instead of only a random nickname and generic role.

## 0.3.18 - 2026-08-02

- Preserve Cockpit Tools provider configuration while atomically restoring only this plugin's registration and approved Hook trust records.
- Recover marketplace `ref_name` from install metadata and safely replace stale trust hashes only when the approved Hook bundle is unchanged.

## 0.3.17 - 2026-08-02

- Freeze the routing plan once per task and re-evaluate only for new units, scope changes, failures, or model unavailability.

## 0.3.16 - 2026-08-02

- Remove the obsolete explicit-only Terra wording and let Sol choose the lowest Terra effort that can handle an independently delegated unit.

## 0.3.15 - 2026-08-02

- Simplify Luna routing to one Sol judgment: delegate when Luna can reliably complete verifiable work; otherwise do not trial-dispatch.

## 0.3.14 - 2026-08-02

- Require Sol to pass a high-confidence capability, risk, rollback, and verification gate before delegating to Luna Max.
- Treat Luna output as unaccepted until Sol verifies it, and separate capability failure from the one in-place capacity continuation.

## 0.3.13 - 2026-08-02

- Keep Terra XHigh, Max, and Ultra mechanically callable while leaving current automatic model preference in the routing matrix and radar evidence instead of hard-coded Hook denials.

## 0.3.12 - 2026-08-02

- Replace the ambiguous `Worker must not dispatch` wording with an explicit ban on Workers creating or delegating to subagents.
- Allow one isolated read-only Sol XHigh reviewer only for critical high-risk changes while continuing to ban Sol execution subagents.

## 0.3.11 - 2026-08-02

- Make Sol planning, Luna Max execution, and Sol final audit the primary route; return Luna failures to the current Sol before any Terra call.
- Remove Terra XHigh and Terra Max from automatic routing; reserve Terra Ultra for independently delegable deep reasoning that exceeds the current Sol.
- Remove the cumulative Worker-call ceiling while retaining the three-active-Worker and two-attempt-per-unit safety constraints.
- Restore the explicit short-task boundary, high-risk exclusion, prohibition on Sol subagents, and Sol-only final review.

## 0.3.10 - 2026-08-02

- Make the primary workflow explicit and first: Sol plans and splits work into independently verifiable Luna Max units, Luna executes them, and Sol integrates, re-runs verification, audits, and falls back only when needed.
- Raise the per-root Worker safety budget from 8 to 64 so long-running tasks do not fall back to Sol after a few completed units; keep the 3-concurrent and 2-attempt-per-unit limits.

## 0.3.9 - 2026-08-02

- Replace the remaining Hook implementation narration in the routing matrix with direct Sol obligations, and align Terra's model instructions with the current non-automatic XHigh, independent/parallel Max, and deepest-reasoning Ultra routes.

## 0.3.8 - 2026-08-02

- Rewrite the root-effort sentence as direct instructions to Sol: keep the current root effort, and use the minimum reliable ladder only when asked to recommend the next task's effort.

## 0.3.7 - 2026-08-02

- Keep short work on the current Sol and keep each work unit on its warm model/agent unless capability, correction, capacity, independence, or parallelism requires a switch.
- Prefer Luna Max for substantial bounded execution; use Terra Max for ordinary independent or parallel complex work and Terra Ultra for the deepest independent reasoning.
- Refresh full radar data every 24 hours, allow cache use for 72 hours, and inject only compact stable route relationships instead of timestamps, status, scores, or the full table.
- Default Worker context to `fork_turns="none"`; keep Sol High and Terra XHigh supported without making them automatic routing nodes.

## 0.3.6 - 2026-08-02

- Keep Luna Max as an absolute first choice whenever it can reliably complete an independently verifiable work unit; radar evidence cannot promote such work.
- Add a sanitized Codex Radar IQ, cost, duration, sample-count, and freshness snapshot for comparing only the remaining semantically eligible Terra/Sol routes.
- Cache radar evidence for six hours, reject it after twenty-four hours or insufficient samples, and fall back to the static routing policy without blocking work.

## 0.3.5 - 2026-08-02

- Use one Worker normally and expand to two or three only when independent parallel work saves more than it costs; keep three as the mechanical concurrency cap.
- Treat Terra XHigh, Max, and Ultra as a normal increasing reasoning ladder instead of reserving Ultra for a special task category.
- Synchronize the canonical global routing matrix during installation, with a full `AGENTS.md` backup before replacement.

## 0.3.4 - 2026-08-02

- Make Sol Medium the recommended default coordinator and keep High as an optional careful-checking tier instead of the default escalation step.
- Prefer the Sol escalation path Medium to XHigh to Max to Ultra, while preserving the user's already selected root effort.
- Keep Luna Max first for frozen, independently verifiable execution, but require diagnosis to be complete before routing fixes to Luna.
- Reserve Terra Ultra for the hardest frozen execution or critical read-only review rather than routine work.

## 0.3.3 - 2026-08-02

- Prefix every Worker task name with its actual route, such as `Terra Max` or `Luna Max`, so the task list shows which model tier is running.
- Reject task names whose visible route disagrees with the selected agent or reasoning effort.

## 0.3.2 - 2026-08-02

- Allow `gpt-5.6-terra` to run at `ultra` for frozen work units that need near-Sol-XHigh reasoning without transferring lead responsibilities.
- Use Terra Ultra for the highest-tier independent read-only review while keeping architecture, integration, and final quality decisions with Sol.

## 0.3.1 - 2026-08-01

- Add an explicit session-bound ledger release command for startup and authentication failures that terminate before the host emits `SubagentStop`.
- Keep normal long-running Worker TTL unchanged; cleanup requires the lead to have observed a terminal error and the original route task name.

## 0.3.0 - 2026-08-01

- Prefer Luna Max for any frozen, independently verifiable work unit it can reliably complete, including medium and large implementation, multi-file edits, routine debugging, tests, scans, and batch work.
- Add a session-scoped native routing ledger that enforces unique work units, frozen wave slots, at most three pending or active workers, two attempts per work unit, and eight worker calls per root task.
- Track native worker lifecycle through `SubagentStart` and `SubagentStop`, preventing a fallback attempt from starting before the first attempt has ended.
- Extend the config guard to preserve the separately approved `SubagentStart` trust record and bind recovery to the new ledger Hook files.
- Keep Sol as the semantic router and final quality owner; the Hook validates frozen decisions and deterministic runtime limits without keyword-based task classification.

## 0.2.1 - 2026-08-01

- Require a compact `CQO_WORK_PACKET_V1` for every Worker dispatch so the Hook can validate frozen scope, permissions, acceptance, verification, selected agent, fallback, attempts, and backup requirements without trying to infer task semantics.
- Predeclare and mechanically enforce the Luna-to-Terra-to-lead-Sol escalation chain while preserving Sol as the semantic router and final quality owner.
- Freeze Terra's selected reasoning effort in the work packet so a work unit cannot silently change from XHigh to Max during dispatch.
- Accept repeated UTF-8 BOM prefixes from Windows PowerShell in both stdin-driven Hooks and cover the real pipeline shape in regression tests.

## 0.2.0 - 2026-08-01

- Make Sol the root lead and final direct-execution fallback; reject Sol subagent creation.
- Prefer parallel Luna Max workers for clear, frozen, independently verifiable medium and large work packages; reserve Terra XHigh/Max for judgment, diagnosis, difficult debugging, and critical read-only review.
- Add governed team waves with two workers by default, three at most, explicit work packets, no recursive delegation, and one writer for shared files.
- Add a `SubagentStop` hook that automatically submits one in-place `继续` after the exact selected-model-capacity message, then returns control for Luna to Terra to lead-Sol escalation.
- Bind config-guard recovery to all three Hook trust records and the full Hook bundle, accept official Codex cachebuster build metadata, and reject loadable backup copies that would duplicate the plugin Skill.
- Retire the managed `sol_reviewer` profile safely and migrate state-owned agent backups from loadable `.toml` files to `.toml.bak`.

## 0.1.6 - 2026-08-01

- Retry only the failed unchanged work-unit call once when it reports the exact selected-model-capacity message; preserve completed work and counters, never restart the whole task, and escalate only after a second matching failure.

## 0.1.5 - 2026-08-01

- Refresh plugin-owned agent profiles when template instructions change.
- Preserve compatible external profiles by default; `-Force` backs them up and adopts them for managed updates.
- Remove ownership state when uninstall preserves a user-modified profile, preventing a later install from overwriting it.

## 0.1.4 - 2026-08-01

- Reduce healthy SessionStart model context to `[CQO_ACTIVE]` and remove the stale-prone root-default advisory.
- Make the maintenance skill reference the canonical routing matrix instead of duplicating its routing semantics.
- Add prompt-size and conditional-injection contracts to prevent future model-context growth.
- Align Terra and Luna agent instructions with their canonical capability boundaries.

## 0.1.3 - 2026-08-01

- Require an auditable routing preflight before non-short production work.
- Make delegation mandatory for bounded work that Terra or Luna can reliably complete.
- Require provider, authentication, and model failures to be reported instead of silently falling back.
- Stabilize each work-unit route by its highest capability requirement; wording, edit size, and simpler later steps cannot trigger model churn.
- Minimize compute cost among routes that satisfy quality, capability, and risk constraints, and require bounded reliable delegation.
- Add a provider-agnostic config guard that restores native plugin registration after external `config.toml` replacement without making model calls.
- Preserve only previously approved exact Hook hashes and require renewed review when a Hook definition changes.

## 0.1.2 - 2026-07-31

- Replace model self-reporting with a real `codex exec` host probe and a nonce-bound temporary SessionStart proof file.
- Keep PreToolUse trust as a separate verification requirement instead of reporting blanket Hook trust.
- Remove the Hook-trust bypass and add static release guards against reintroducing either bypassed or model-reported checks.
- Build ZIP archives with portable `/` entry paths, reject non-portable entries, and verify the Windows artifact on Ubuntu CI.

## 0.1.1 - 2026-07-31

- Require Sol to evaluate bounded delegation opportunities on every non-short task without creating an agent-call quota.
- Clarify that the root model and reasoning effort are selected before plugin hooks run and cannot be rewritten by the plugin.
- Report the configured root default at SessionStart and test the advisory behavior.
- Require installed and enabled plugin state as runtime evidence; cache presence alone is insufficient.
- Fix Windows plugin hooks to resolve `PLUGIN_ROOT` through PowerShell and add an installed-host runtime smoke test.
- Read model defaults only from the root of `config.toml`, never from nested profile tables.
- Document safe migration from legacy global routing hooks and compatible external agent profiles.

## 0.1.0 - 2026-07-31

- Add quality-first Sol, Terra, and Luna routing policy.
- Add SessionStart policy injection and PreToolUse mechanical enforcement.
- Add guarded custom-agent installation and removal.
- Add manifest, marketplace, profile, and routing-matrix verification.
- Track profile ownership so uninstall preserves external files and restores Force-replaced files.
- Verify release archives from an isolated extracted plugin directory.
