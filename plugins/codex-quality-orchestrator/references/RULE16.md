## Rule 16 — 默认多模型质量团队

主线：目标/验收明确、低风险、上下文少且可直接验证才算短任务，当前主代理直接完成；高风险不算短任务。其余由当前 `gpt-5.6-sol` 规划，拆成 `luna_worker / gpt-5.6-luna / max` 能可靠执行且可独立验收的工作单，分派、整合、复跑验证、最终审核和兜底。能拆给 Luna 就必须下派，Sol 不得代做。

通常 1 个 Worker；仅 2–3 个互不冲突且并行收益更大时并行，最多 3 个。共享文件单写者；Worker 不得创建或下派子代理；Sol 不创建执行型 Sol 子代理。仅关键高风险变更需要独立复审时，下派 `sol_reviewer / gpt-5.6-sol / xhigh` 只读审核，与生产 Worker 分开且一次一个；当前 Sol 最终裁决。

仅主线不适用时补充：无法安全拆成 Luna 工作单，或需要消歧、根因诊断、跨上下文推断，或 Luna 修正/容量重试仍失败。当前 Sol 能可靠完成时由 Sol 接管；当前 Sol 能力不足且深推理子问题可独立下派时用 Terra Ultra，任务级主控能力不足则建议下一任务使用 Sol XHigh。Terra XHigh/Max 不自动调用，也不默认另派 Terra 复核。架构、安全、公共接口、生产数据、不可逆迁移、公共数据契约和最终裁决始终留给 Sol。

同一工作单元保持当前模型和原代理，局部问题最多续交一次定向修正。新鲜 IQ/成本只比较能力和风险合格的候选；IQ 差小于 3 视为同级，同级先保留热模型/原代理，再选低预计总成本。

保持当前根档位。仅在需要建议下一任务档位时使用最低可靠链 `medium→xhigh→max→ultra`；Sol High 不进入自动链，XHigh 能胜任不得建议 Max。

Worker 的 `task_name` 使用 `<模型档位>__<单元>__w<波次>__s<槽位>of<波次大小>__a<尝试>`，前缀限 `luna_max|terra_ultra|sol_reviewer_xhigh`。`message` 用 `[CQO_WORK_PACKET_V1]` 写明目标、范围、写路径、验收、验证、权限、备份和 `selected_agent|selected_effort|fallback`。路由键和单元须唯一，每单元最多 2 次；Sol 必须自行验收语义。

遇到精确消息 `Selected model is at capacity. Please try a different model.` 时向原代理发送“继续”一次并保留进度；再次失败交回当前 Sol，不重做。仅当前 Sol 能力不足时改派 Terra Ultra。其他终止错误未触发 `SubagentStop` 时运行 `release-failed-dispatch.cjs <task_name>`；禁止静默降级。

调用 `luna_worker` 或 `sol_reviewer` 传 `agent_type,fork_turns`；调用 `terra_worker` 另传 `reasoning_effort=ultra`；均不传 `model`。`fork_turns` 默认 `"none"`，仅需少量历史时传正整数字符串。
