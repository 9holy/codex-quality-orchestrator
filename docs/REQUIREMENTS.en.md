# Requirements Baseline

This file supports maintenance and regression tracking; it is not injected into model context. `references/RULE16.md` is the only semantic routing rule. The routing skill applies it, while Hooks validate only observable mechanical fields.

## Quality And Routing

- Quality is the hard gate. Optimize total cost only among routes that can reliably complete the unit.
- The current Sol keeps its root model and effort and owns planning, decomposition, ownership, integration, verification, decisions, and fallback.
- Clear, low-risk short work stays with the root agent.
- Choose Luna Max first only for frozen, low-judgment, mechanically verifiable units it can reliably complete. Never use Luna as a trial route.
- Keep ambiguity, unresolved causes, architecture, security, public interfaces, production data, irreversible operations, and final judgment with Sol.
- When Luna is unsuitable, use Sol Medium for bounded, moderate-judgment, independently verifiable work when delegation or parallelism has net value.
- Terra is not an escalation ladder. Use its lowest reliable `xhigh`, `max`, or `ultra` effort only when it has a clear task-specific advantage over capable Sol Medium or the current Sol.
- Use Radar at most once per root task only when multiple capable Sol/Terra routes remain unresolved. An IQ gap of at least 3 selects the higher-IQ route; otherwise retain the warm/original agent, then compare total cost.

## Team Execution

- Define each non-short unit, goal, path ownership, dependencies, acceptance criteria, and integration order before delegation.
- Default to one Worker. Parallelize only independent, write-safe units with positive net benefit.
- For homogeneous batches, verify one representative unit, then fill available host capacity and replace completed Workers. There is no task-wide cumulative call cap.
- Keep one writer per shared file. Workers do not delegate in normal mode. In burst mode they may delegate only when explicitly authorized and below `d4`.
- Use one blocking wait instead of polling.
- Sol inspects every result or diff and reruns necessary checks. One clear local defect may return once; capability, scope, or quality failure returns to Sol.

## Mechanical Contract

- Luna uses Max; Sol Worker uses Medium; Terra explicitly uses `xhigh`, `max`, or `ultra`; the read-only Sol Reviewer uses XHigh.
- Named agents never receive a `model` override. `task_name` exposes the expected route and effort. `fork_turns` is `none` or a positive numeric string.
- The plugin has exactly four Hooks: `SessionStart`, `UserPromptSubmit`, `PreToolUse`, and `SubagentStop`. Ordinary prompts are silent.
- On the exact selected-model-capacity message, the same subagent continues once without restarting work. A second failure returns to Sol. Current Hooks cannot resume the root controller request, and the plugin must not claim otherwise.
- Burst mode is session-scoped and off by default. Exact Chinese commands toggle it. Sol is `d0`; children may use `d1-d4`; `d4` cannot delegate; the host limit is 20 child threads; all normal quality gates remain.
- The configuration guard restores only plugin registration and trusted current Hook hashes while preserving authentication, provider, endpoint, model, and unrelated tool settings.

## Explicit Exclusions

- Do not change the root model or effort of a running task.
- Do not replace Sol's capability and risk judgment with keywords, file counts, or code heuristics.
- Do not route to GPT-5.5, `codex-auto-review`, or undeclared agents.
- Do not add fixed normal-mode concurrency, task-wide attempt caps, polling, a wave ledger, or an automatic fallback chain.
- A task name, packet, test, or agent claim is not proof of the backend model that actually ran.
