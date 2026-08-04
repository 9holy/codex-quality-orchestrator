---
name: codex-quality-routing-team
description: Apply quality-first Sol, Luna, and Terra routing to non-short work such as multi-step implementation, cross-file changes, located fixes, tests, scans, batch work, research, independent verification, or a bounded larger unit. Do not trigger for simple questions, status checks, or clear tiny edits. Use it to keep ambiguous, undiagnosed, architectural, security, public-interface, production-data, or irreversible decisions with Sol while delegating only safe bounded units.
---

# Codex Quality Routing Team

1. Follow Rule 16 already present in context; read `../../references/RULE16.md` only if it is missing. Do not start a team or claim Sol control when the root is not `gpt-5.6-sol`.
2. For non-short work, compile a lightweight in-context plan before dispatch. Record each unit's goal, allowed paths and single-writer owner, dependencies, acceptance, and integration order. Do not create a separate planner or persistent plan by default. One substantial unit may be delegated when delegation has net benefit.
3. Apply Rule 16 to every unit. Use Luna only for frozen, low-judgment, mechanically verifiable execution. Otherwise prefer `sol_medium_worker` for independently verifiable moderate-judgment work when delegation or parallelism pays; keep current Sol for coupled or sequential work. Use Terra only for a clear task-specific advantage, never merely because reasoning is deep. Before the first dispatch, read `../../routing-policy.json` once.
4. At the first genuinely unresolved choice among multiple capable Sol/Terra routes, run `node ../../scripts/radar-routing-evidence.cjs` once. Keep that compact evidence in the current task and do not run it again. Freeze the selected route; reconsider only if the unit, boundary, availability, or result changes.
5. For `spawn_agent`, always pass `agent_type`, `task_name`, and `fork_turns`. Default to `fork_turns:"none"`; use a positive integer string only when inherited context is necessary. Pass `reasoning_effort` for `terra_worker`. Never pass `model` for a named agent.
6. Name tasks `<route>__<unit>`, for example `luna_max__update_tests`. Use this minimal nonempty work packet; put every allowed read/write path and ownership boundary in `scope`:

```text
[CQO_WORK_PACKET_V1]
route: <model> / <effort>
goal: <result>
scope: <boundaries, paths, and ownership>
acceptance: <executable or observable checks>
fallback: current Sol; preserve completed work
```

7. Default to one Worker. Parallelize independent, write-safe units only when beneficial. For homogeneous batches, verify one unit, then fill host capacity and replace completed Workers. Shared files have one writer; Workers never delegate.
8. When Workers run and Sol has no useful independent work, call `wait_agent` once with `timeout_ms:3600000`; it wakes early on updates. Never poll `list_agents` or repeat short waits. Wait again after a timeout only while Workers remain.
9. After completion, inspect the actual result or diff and rerun necessary checks in integration order. Return one clear local defect to the same Worker at most once. Capability, scope, or quality failure returns immediately to the current Sol; never route failures through a mechanical model ladder.
