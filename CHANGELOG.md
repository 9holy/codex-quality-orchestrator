# Changelog

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
