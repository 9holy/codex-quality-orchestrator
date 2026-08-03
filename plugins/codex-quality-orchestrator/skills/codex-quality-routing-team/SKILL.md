---
name: codex-quality-routing-team
description: Apply quality-first Sol, Luna, and Terra routing to non-short work such as multi-step implementation, cross-file changes, located fixes, tests, scans, batch work, research, independent verification, or a bounded larger unit. Do not trigger for simple questions, status checks, or clear tiny edits. Also use this skill to keep ambiguous, undiagnosed, architectural, security, public-interface, production-data, or irreversible work with Sol.
---

# Codex Quality Routing Team

1. Follow Rule 16 already present in context. If it is missing, read `../../references/RULE16.md`. Do not start a team or claim Sol control when the root agent is not `gpt-5.6-sol`.
2. List bounded, independently verifiable work units, then apply Rule 16 to each. Before the first dispatch, read `../../routing-policy.json` once. Normally use one Worker. Parallelize only independent, write-safe units with real benefit. For a large homogeneous batch, verify one representative unit before scaling to host-available concurrency and continue with more units as needed.
3. For `spawn_agent`, always pass `agent_type`, `task_name`, and `fork_turns`. Default to `fork_turns:"none"`; use a positive integer string only when inherited context is necessary. Also pass `reasoning_effort` for `terra_worker`. Never pass `model` for a named agent.
4. Name tasks `<route>__<unit>`, for example `luna_max__update_tests`. Use this minimal nonempty message and state every allowed read/write path in `scope`:

```text
[CQO_WORK_PACKET_V1]
route: <model> / <effort>
goal: <result>
scope: <boundaries and paths>
acceptance: <executable or observable checks>
```

5. Do not read Radar when Luna is suitable or only one capable candidate exists. Only when Luna is unsuitable and multiple capable candidates remain, run `node ../../scripts/radar-routing-evidence.cjs` once and use fresh `[CQO_RADAR]` evidence only among those candidates.
6. After a Worker completes, inspect the actual result or diff and rerun necessary checks. On failure, the current Sol root follows Rule 16 and takes over; do not create an execution Sol subagent.
