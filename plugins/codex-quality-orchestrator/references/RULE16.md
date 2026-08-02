## Rule 16 — 默认多模型质量团队

目标/验收明确、低风险、上下文少且可直接验证的短任务由当前主代理完成；高风险不算短任务。

非短任务由当前 `gpt-5.6-sol` 理解、规划和拆解。Sol 判断每个工作单元：确认 `luna_worker`（Luna Max）能可靠完成且结果可验证，就优先下派；不能胜任或判断不确定就不得试派。Sol 负责整合、复跑验证、最终审核和兜底。

通常使用 1 个 Worker；仅有 2–3 个互不冲突单元且并行收益更大时并行，最多 3 个。共享文件单写者。Worker 不得创建或下派子代理；Sol 不创建执行型 Sol 子代理。仅关键高风险变更需要独立复审时，单独下派 1 个 `sol_reviewer`（Sol XHigh）只读审核；当前 Sol 最终裁决。

Luna 不适用时由当前 Sol 处理；仅当前 Sol 不能可靠完成且深推理子问题可独立下派时使用 Terra Ultra。Terra XHigh/Max 可显式调用但不进入自动路由；主控能力不足则建议下一任务使用 Sol XHigh。架构、安全、公共接口、生产数据/契约、不可逆迁移和最终裁决留给 Sol。

Worker 结果须由 Sol 检查实际差异并复跑验证。仅明确、局部的问题可交原代理修正一次；能力或质量不合格立即交回 Sol，不得继续试错。

仅在能胜任的候选间比较 IQ/成本；IQ 差<3 视为同级，同级先保留热模型/原代理，再选低预计总成本。保持根档位；仅建议下一任务时用最低可靠链 `medium→xhigh→max→ultra`，Sol High 不进自动链，XHigh 胜任不得建议 Max。

`task_name` 使用 `<模型档位>__<单元>__w<波次>__s<槽位>of<波次大小>__a<尝试>`，前缀限 `luna_max|terra_xhigh|terra_max|terra_ultra|sol_reviewer_xhigh`。`message` 用 `[CQO_WORK_PACKET_V1]` 写明目标/范围/写路径/验收/验证/权限/备份及 `selected_agent|selected_effort|fallback`。单元唯一，每单元最多 2 次；Sol 自行验收语义。

遇到精确消息 `Selected model is at capacity. Please try a different model.` 时向原代理发送“继续”一次并保留进度；再次失败交回当前 Sol，不重做。能力/质量失败不得按容量错误续交。其他错误未触发 `SubagentStop` 时运行 `release-failed-dispatch.cjs <task_name>`；禁止静默降级。

调用 `luna_worker` 或 `sol_reviewer` 传 `agent_type,fork_turns`；调用 `terra_worker` 另传 `reasoning_effort=xhigh|max|ultra`；均不传 `model`。`fork_turns` 默认 `"none"`。
