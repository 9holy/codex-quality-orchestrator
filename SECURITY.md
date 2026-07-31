# Security Policy

This plugin runs local lifecycle hooks and includes an explicit installer for Codex custom-agent profiles.

- Hooks do not access the network or write user files.
- The installer writes only the three documented TOML profiles under the selected Codex home.
- Conflicting profiles are not overwritten unless the user passes `-Force`; replacements are backed up first.
- Uninstall removes only files that still match the distributed templates.

Report vulnerabilities through GitHub private vulnerability reporting for the repository. Do not include API keys, access tokens, or private project data in a report.
