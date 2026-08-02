## Rule 16 — 默认多模型质量团队

- 目标明确、低风险且可直接验证的短任务由当前主代理完成；高风险任务不算短任务。
- 非短任务由当前 `gpt-5.6-sol` 理解和拆解。任务开始时列出已知工作单元；Luna Max 能可靠完成且结果可验证，就优先派 `luna_worker`，不能胜任或不确定就不派。Sol 整合结果、复跑验证、最终审核和兜底。
- 任务开始时只在能胜任候选间使用一次新鲜 `[CQO_RADAR]` 数据确定执行者。Luna Max 能胜任时固定优先；否则 IQ 差≥3 选高 IQ，差<3 视为同级；同级先保留热模型/原代理，再选预计总成本更低者。没有新鲜数据就由 Sol 判断。确定后按方案派发，不重复选模；仅新增单元、边界变化、执行失败或模型不可用时重判。
- Luna 不适用时，由当前 Sol 完成，或将适合独立执行的单元派给能胜任的 Terra 最低档位；主控能力不足则建议下一任务使用 Sol XHigh。架构、安全、公共接口、生产数据/契约、不可逆迁移和最终裁决留给 Sol。
- 通常使用 1 个 Worker；仅有互不冲突且并行收益更大时使用 2–3 个，最多 3 个。共享文件单写者。Worker 不得创建子代理；Sol 不创建执行型 Sol 子代理。仅关键高风险变更可另派 1 个 `sol_reviewer`（Sol XHigh）只读复审。
- Worker 结果必须由 Sol 验收。仅明确、局部的问题可交原代理修正一次；能力或质量不合格立即交回 Sol，不得继续试错。
- 保持根档位；仅建议下一任务时用 `medium→xhigh→max→ultra`，Sol High 不进自动链，XHigh 胜任不得建议 Max。
- `task_name` 格式为 `<模型档位>__<单元>__w<波次>__s<槽位>of<波次大小>__a<尝试>`，前缀限 `luna_max|terra_xhigh|terra_max|terra_ultra|sol_reviewer_xhigh`。`message` 必须含 `[CQO_WORK_PACKET_V1]` 及目标/范围/写路径/验收/验证/权限/备份/`selected_agent|selected_effort|fallback`。单元唯一，每单元最多 2 次。
- 遇到精确消息 `Selected model is at capacity. Please try a different model.`，向原代理发送“继续”一次并保留进度；再次失败交回 Sol。能力/质量失败不得这样续交。其他错误未触发 `SubagentStop` 时运行 `release-failed-dispatch.cjs <task_name>`。
- 调用 `luna_worker` 或 `sol_reviewer` 传 `agent_type,fork_turns`；调用 `terra_worker` 再传 `reasoning_effort=xhigh|max|ultra`；均不传 `model`，`fork_turns` 默认 `"none"`。
