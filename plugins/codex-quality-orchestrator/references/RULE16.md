## Rule 16 — 默认多模型质量团队

短任务由当前主代理直接完成：目标和验收明确、低风险、上下文少且可直接验证；高风险不算短任务。

其余任务由当前 `gpt-5.6-sol` 主控拆解、分派、整合、验收和兜底；保持当前根档位。仅在需要建议下一任务档位时使用最低可靠链 `medium→xhigh→max→ultra`；Sol `high` 和 Terra `xhigh` 不自动选择，`xhigh` 能胜任不得建议 `max`。

先过能力和风险门槛，再考虑热缓存与总成本。边界和验收已冻结、失败可检测/回滚，且执行量足以摊薄新上下文时，必须优先交 `luna_worker / gpt-5.6-luna / max`。同一工作单元保持当前模型和原代理；局部问题最多续交一次定向修正。仅能力不足、修正仍失败、容量再次失败或有独立/并行硬需求时切换。Luna 不适用后，当前 Sol 能可靠完成且无需独立/并行就直接处理；Terra Max 只做普通独立复核或必须并行的复杂单元，Terra Ultra 做最深独立推理。架构、安全、公共接口、生产数据、不可逆迁移、公共数据契约和最终裁决留给 Sol。新鲜 IQ/成本只比较合格候选；IQ 差小于 3 视为同级，同级先保留热模型/原代理，再选低预计总成本。

通常 1 个 Worker；仅 2–3 个互不冲突且并行收益更大时并行，最多 3 个。共享文件单写者，Worker 不得下派；无法安全拆分时当前 Sol 接管，不创建 Sol 子代理。

Worker 的 `task_name` 使用 `<模型档位>__<单元>__w<波次>__s<槽位>of<波次大小>__a<尝试>`；前缀限 `luna_max|terra_xhigh|terra_max|terra_ultra`。`message` 用 `[CQO_WORK_PACKET_V1]` 写明目标、范围、写路径、验收、验证、权限、备份和 `selected_agent|selected_effort|fallback`。调用须保证路由键和单元唯一、最多 3 并发、每单元 2 次、每根任务 8 次；Sol 必须自行验收语义。

仅精确消息 `Selected model is at capacity. Please try a different model.` 触发原代理“继续”一次并保留进度；再次失败按 `Luna→Terra→当前 Sol` 上调。其他终止错误未触发 `SubagentStop` 时运行 `release-failed-dispatch.cjs <task_name>`；禁止静默降级。

调用 `luna_worker` 传 `agent_type,fork_turns`；`terra_worker` 另传 `reasoning_effort=xhigh|max|ultra`；均不传 `model`。`fork_turns` 默认 `"none"`，仅需少量历史时传正整数字符串。Sol 检查差异、复跑验证，按风险决定独立复核。
