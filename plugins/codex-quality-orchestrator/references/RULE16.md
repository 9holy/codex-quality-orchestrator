## Rule 16 — 默认多模型质量团队

短任务由当前主代理直接完成：目标和验收无歧义、低风险、无需方案选择或诊断、上下文少且可直接验证；规模只作参考，高风险事项不是短任务。

其余任务由当前 `gpt-5.6-sol` 主控，自动理解、规划、拆解、路由预检、分派、整合和最终验收。Sol 档位：`medium` 直接分析，`high` 默认主控，`xhigh` 复杂规划与整合，`max` 架构/高风险/关键裁决，`ultra` 极少数系统性多波次任务；插件不改已启动根档位。

按完整工作单元最高要求选能可靠胜任的最低成本层级，质量、能力和风险优先于价格，并计入重试、返工和复核：边界冻结、无需判断、可独立验收的清晰执行交 `luna_worker / gpt-5.6-luna / max`；需要实现判断、诊断、跨上下文推断、疑难调试或关键只读复核交 `terra_worker / gpt-5.6-terra / xhigh|max`；消歧、架构、安全、公共接口、生产数据、不可逆迁移、公共数据契约和最终裁决留给 Sol。

可靠胜任且可独立验收的工作单元必须自动下派；至少两个互不冲突且并行收益大于协调成本时自动并行，每波默认 2、最多 3 个 Worker，不为调用而拆分。共享文件只允许一个写者，Worker 不得下派。

每次调用的 `message` 必须含一次 `[CQO_WORK_PACKET_V1]` JSON 块，字段固定为：`work_unit_id`（等于 `task_name`）、`objective`、`scope[]`、`write_paths[]`、`acceptance[]`、`verification[]`、`task_intent`（`mutate|inspect|verify`）、`mutation_authority`（`none|declared_paths`）、`backup_required`、`selected_agent`、`selected_effort`、`fallback_agent`、`worker_attempt`。只读不得声明写路径；写入必须声明路径并备份；Terra 的 `selected_effort` 必须等于调用档位。下派前确认模型、提供商和认证。

Sol 检查实际差异并复跑验证；关键变更另派 Terra Max 只读复核。无法安全拆分、Worker 不能可靠胜任、有限修正仍失败或必须全局集成时，当前 Sol 直接接管，不创建 Sol 子代理。

仅出现精确消息 `Selected model is at capacity. Please try a different model.` 时向原代理自动续交“继续”一次，保留上下文和进度；不得重做、重拆或重启整项任务。再次失败才按预声明 `Luna→Terra→当前 Sol` 上调，其他错误公开后上调或停止，禁止静默降级。

调用契约：`luna_worker` 传 `agent_type,fork_turns`；`terra_worker` 另传 `reasoning_effort=xhigh|max`；均不传 `model`。`fork_turns` 仅为 `"none"` 或正整数数字字符串。禁止 Sol 子代理、裸 Terra/Luna、`gpt-5.5` 和未登记模型。Hook 只机械校验，不代替 Sol 判断。
