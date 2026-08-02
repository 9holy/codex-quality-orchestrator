## Rule 16 — 默认多模型质量团队

仅目标/验收明确、低风险、上下文少且可直接验证者为短任务，由当前主代理完成；高风险不算短任务。

非短任务由当前 `gpt-5.6-sol` 理解、判险、规划和拆解。主动拆出独立可验收工作单；仅高置信度确认 `luna_worker`（Luna Max）能独立正确完成，且边界清晰、写入受限、失败可回滚、验收足以发现错误时才下派。能力/风险门槛通过后优先 Luna Max；禁止为使用 Luna 强拆耦合任务，禁止把 Luna 当试错、草稿或先做后修模型。Sol 负责整合、复跑验证、最终审核和兜底。

通常 1 个 Worker；仅 2–3 个互不冲突单元且并行净收益更大时并行，最多 3 个。共享文件单写者。Worker 不得创建或下派子代理；Sol 不创建执行型 Sol 子代理。仅关键高风险变更需独立复审时，单独下派 1 个 `sol_reviewer`（Sol XHigh）只读审核；当前 Sol 最终裁决。

不得向 Luna 下派能力不确定、无法安全拆分、需要消歧、根因诊断或跨上下文推断的单元。Luna 不合格时，当前 Sol 能可靠完成则接管；仅当前 Sol 能力不足且深推理子问题可独立下派时用 Terra Ultra，主控能力不足则建议下一任务用 Sol XHigh。Terra XHigh/Max 可显式调用但不进入自动路由。Sol 保留架构、安全、公共接口、生产数据/契约、不可逆迁移及最终裁决。

Worker 结果经 Sol 检查差异并复跑验证后才可接受。出现能力不足、理解偏差、越界或风险不可验证即停；按备份和差异处理未接受改动，再按上段门槛接管或升级。仅明确、局部、低风险的问题可向原代理定向修正一次。

仅在能力/风险合格候选间比较 IQ/成本；IQ 差<3 视为同级，同级先保留热模型/原代理，再选低预计总成本。保持根档位；仅建议下一任务时用最低可靠链 `medium→xhigh→max→ultra`，Sol High 不进自动链，XHigh 胜任不得建议 Max。

`task_name` 使用 `<模型档位>__<单元>__w<波次>__s<槽位>of<波次大小>__a<尝试>`，前缀限 `luna_max|terra_xhigh|terra_max|terra_ultra|sol_reviewer_xhigh`。`message` 用 `[CQO_WORK_PACKET_V1]` 写明目标/范围/写路径/验收/验证/权限/备份及 `selected_agent|selected_effort|fallback`。单元唯一，每单元最多 2 次；Sol 自行验收语义。

遇到精确消息 `Selected model is at capacity. Please try a different model.` 时向原代理发送“继续”一次并保留进度；再次失败交回当前 Sol，不重做。能力/质量失败不得按容量错误续交。其他错误未触发 `SubagentStop` 时运行 `release-failed-dispatch.cjs <task_name>`；禁止静默降级。

调用 `luna_worker` 或 `sol_reviewer` 传 `agent_type,fork_turns`；调用 `terra_worker` 另传 `reasoning_effort=xhigh|max|ultra`；均不传 `model`。`fork_turns` 默认 `"none"`。
