# Routing Matrix

## Controller

The current `gpt-5.6-sol` owns understanding, decomposition, delegation, integration, verification, and fallback. The plugin preserves the root effort selected when the task starts.

| Root effort | Intended use |
|---|---|
| `medium` | Routine planning, decomposition, integration, and bounded direct work |
| `high` | Work needing careful checks without a complex-reasoning upgrade |
| `xhigh` | Complex planning, cross-module integration, and strict acceptance |
| `max` | Difficult, high-risk, architectural, or critical decisions |
| `ultra` | Systemic, exceptionally complex long tasks; not a daily default |

## Workers

| Agent | Model | Effort | Select when |
|---|---|---|---|
| `luna_worker` | `gpt-5.6-luna` | `max` | Frozen, low-judgment, mechanically verifiable, and reliably completable; first choice when eligible |
| `sol_medium_worker` | `gpt-5.6-sol` | `medium` | Bounded, moderate-judgment, independently verifiable work where delegation or parallelism pays |
| `terra_worker` | `gpt-5.6-terra` | `xhigh/max/ultra` | A clear task-specific advantage over capable Sol Medium or the current Sol; use the lowest reliable effort |
| `sol_reviewer` | `gpt-5.6-sol` | `xhigh` | One read-only independent review for critical high-risk changes |

Workers stay inside the packet scope and make no unrelated changes. They do not delegate in normal mode. In burst mode, delegation requires explicit packet authorization and a depth below `d4`. Sol accepts or rejects every result.

## Selection Order

1. Keep clear short work on the current root agent.
2. Freeze the unit, ownership, dependencies, acceptance criteria, and integration order.
3. Use Luna Max when it can reliably complete the frozen low-judgment unit.
4. Otherwise use Sol Medium for eligible bounded work when delegation has net value; keep coupled or sequential work on the current Sol.
5. Use Terra only for a clear task-specific advantage; deep reasoning alone does not select Terra.
6. If multiple capable Sol/Terra routes remain unresolved, read Radar once. An IQ gap below 3 keeps the warm/original agent before total-cost comparison.
7. Freeze the route until relevant facts change.
8. Add one read-only Sol Reviewer only for critical independent review.
9. Sol inspects actual changes, reruns required checks, and makes the final decision.

## Parallelism And Capacity

Normal mode defaults to one Worker. Parallelize only independent write-safe units when the benefit exceeds coordination cost. For homogeneous batches, verify one representative unit, then fill available host capacity and replace completed Workers. Use one long blocking wait and one writer per shared file.

Burst mode is session-scoped, supports `d1-d4`, and uses at most 20 child threads; `d4` cannot delegate. It increases parallel execution without lowering any quality gate.

On the exact selected-model-capacity message, continue the same subagent once without restarting completed work. A second failure returns to Sol. This recovery covers `SubagentStop` only; current Hooks cannot resume a root controller capacity notification.
