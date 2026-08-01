# Changelog

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
