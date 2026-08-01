# Changelog

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
- Make the maintenance skill reference canonical Rule 16 instead of duplicating its routing semantics.
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
