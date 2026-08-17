# Routing Matrix

## Core rule

The current `gpt-5.6-sol` is the sole controller for understanding, decomposition, delegation, integration, acceptance, and fallback. The plugin preserves the Sol reasoning effort selected when the task starts and does not switch the root effort during a running task.

Choose routes in this order:

1. Keep short or tightly coupled work on the current Sol.
2. Use Luna Max directly for low-judgment, mechanically verifiable units it can reliably complete. Do not upgrade an eligible Luna unit to a more expensive route.
3. When Luna does not fit, use Sol Medium for bounded, moderate-judgment, independently verifiable work when delegation has net value.
4. Keep coupled, sequential, or delegation-negative work on the current Sol.
5. Use Terra only for a clear task-specific advantage over capable Sol routes, at the lowest reliable effort.
6. Add one read-only Sol Reviewer when a critical high-risk change needs independent review.
7. The current Sol inspects actual changes, reruns necessary checks, and makes the final decision.

## Controller efforts

| Root effort | Intended use |
|---|---|
| `medium` | Routine planning, decomposition, integration, and bounded direct work |
| `high` | Careful checking without a complex-reasoning upgrade |
| `xhigh` | Complex planning, cross-module integration, and strict acceptance |
| `max` | Difficult, high-risk, architectural, or critical decisions |
| `ultra` | Systemic, exceptionally complex long tasks; not a daily default |

## Worker selection

| Agent | Model | Effort | Select when |
|---|---|---|---|
| `luna_worker` | `gpt-5.6-luna` | `max` | Frozen, low-judgment, mechanically verifiable, and reliably completable; first choice when eligible |
| `sol_medium_worker` | `gpt-5.6-sol` | `medium` | Bounded, moderate-judgment, independently verifiable work where delegation or parallelism has net value |
| `terra_worker` | `gpt-5.6-terra` | `xhigh` / `max` / `ultra` | A clear task-specific advantage for the exact unit; use the lowest reliable effort |
| `sol_reviewer` | `gpt-5.6-sol` | `xhigh` | One independent read-only review for a critical high-risk change |

Workers stay inside packet scope and make no unrelated changes. Workers do not delegate in normal mode. In Super mode, further delegation requires explicit packet authorization and a depth below `d4`. Every shared file has one writer.

## Quality and cost

- The quality bar first determines which routes are reliable. Price is compared only among qualified routes.
- When Luna qualifies, select it directly without reading external benchmark data.
- If several Sol or Terra routes remain genuinely capable and unresolved, read the local Radar summary at most once per root task. When the IQ gap is below 3, keep the warm/original agent before comparing estimated total cost.
- Freeze the selected route. Do not switch for a small price difference; reconsider only when the unit, boundary, availability, or result changes.
- Terra is not a fixed escalation tier, and deep reasoning alone does not select Terra.

## Parallelism and waiting

Normal mode starts with one Worker. Add concurrency only for independent, write-safe units when parallel benefit exceeds coordination cost. For homogeneous batches, verify one representative unit, then fill the host's real available capacity and replace completed Workers.

Super mode supports `d1-d4` and up to 25 child threads; `d4` cannot delegate. Twenty-five is the plugin ceiling, not a guarantee that the host exposes 25 simultaneous slots. While Workers run, use one long blocking wait that wakes early on results instead of short polling.

## Dispatch contract

```text
luna_worker: agent_type + task_name(luna_max__unit) + fork_turns
sol_medium_worker: agent_type + task_name(sol_medium__unit) + fork_turns
terra_worker: agent_type + reasoning_effort(xhigh|max|ultra) + task_name(terra_<effort>__unit) + fork_turns
sol_reviewer: agent_type + task_name(sol_reviewer_xhigh__unit) + fork_turns
```

Do not pass `model` to named agents. Default to `fork_turns:"none"`; use a positive integer string only when a small amount of inherited history is necessary. Every packet states the goal, scope and ownership, observable acceptance checks, and fallback to the current Sol while preserving completed work.

## Capacity recovery

On the exact selected-model-capacity message, continue the same subagent once in the same context. After a second Luna capacity failure, Sol sends the same frozen packet to `sol_medium_worker` when Sol Medium can reliably finish it; otherwise the current Sol takes over. Other second capacity failures return to Sol. Never restart the whole task, redo completed work, or treat capability and quality failures as capacity errors. The current Hook covers `SubagentStop` only and cannot resume a root-controller capacity notification.
