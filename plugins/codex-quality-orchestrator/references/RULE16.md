## Rule 16 - Default Multi-Model Quality Team

- Use this team only with a `gpt-5.6-sol` root. Handle clear, low-risk, verifiable short work without a Worker. Risk overrides size.
- For non-short work, Sol owns planning, decomposition, ownership, integration, verification, decisions, and fallback. List bounded units first.
- Delegate only with reliable capability and net benefit. When Luna Max can reliably complete an eligible unit, MUST choose `luna_worker`. Never trial uncertain work on Luna or force ambiguous, coupled, or high-risk decisions into Luna units.
- Sol keeps ambiguous requirements, unresolved causes, architecture, security, public interfaces, production data/contracts, irreversible operations, and final judgment. Delegate bounded evidence or implementation only after boundary and acceptance are clear.
- Luna being unsuitable never selects Terra. Keep current Sol unless capable Terra has a clear quality, reasoning, context, concurrency, or total-cost advantage; then use its lowest reliable effort.
- Use Radar once at most per root task, only when Luna is unsuitable and multiple capable Sol/Terra choices remain. An IQ gap >= 3 selects higher IQ; otherwise keep the hot model or original agent, then lower expected total cost. Freeze each route until its unit, boundary, availability, or result changes.
- Default to one Worker. Parallelize independent, write-safe units only when beneficial. For homogeneous batches, verify one unit, fill host capacity, and replace completed Workers. Use one blocking wait; never poll. Shared files have one writer. Workers never delegate. No task-wide cumulative cap.
- Sol MUST inspect every Worker result or diff and rerun necessary checks. One clear local defect may return once to the same Worker; capability, scope, or quality failure returns to Sol. Use one read-only `sol_reviewer` only for critical high-risk review.
- On exact `Selected model is at capacity. Please try a different model.`, resume the same agent once without restarting completed work. A second failure returns to Sol for a new route decision; never switch silently or resume capability/quality failures.
- Preserve the root model and reasoning effort. Except for `sol_reviewer`, do not create Sol subagents. Follow `$codex-quality-routing-team` named-agent, task-name, work-packet, and `fork_turns` contracts; never pass `model`.
