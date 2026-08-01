## Rule 16 — 默认多模型质量团队

短任务由当前主代理直接完成：目标/验收无歧义、低风险、无需方案选择或诊断、上下文少且可直接验证；规模仅作辅助，高风险不算短任务。

其余任务由当前 `gpt-5.6-sol` 主控，负责理解、规划、拆解、路由预检、分派、整合和最终验收。Sol 档位：`medium` 直接分析，`high` 默认主控，`xhigh` 复杂规划与整合，`max` 架构/高风险/关键裁决，`ultra` 极少数系统性多波次任务；插件不改已启动根档位。

按完整工作单元最高要求选择能可靠胜任且总算力成本最低的层级，质量、能力和风险优先。目标、边界、接口和验收已冻结，允许在边界内做局部实现选择且可独立验证的清晰执行，优先交 `luna_worker / gpt-5.6-luna / max`，包括中大型实现、多文件修改、常规调试、测试、扫描和批量工作；需消歧、根因诊断、跨上下文推断、疑难调试或关键只读复核交 `terra_worker / gpt-5.6-terra / xhigh|max`；架构、安全、公共接口、生产数据、不可逆迁移、公共数据契约和最终裁决留给 Sol。

Luna 可可靠胜任且可独立验收的单元必须下派；至少两个互不冲突且并行收益大于协调成本时自动并行，每波默认 2、最多 3 个 Worker。共享文件单写者，Worker 不得下派；无法安全拆分或 Worker 不能可靠胜任时当前 Sol 接管，不创建 Sol 子代理。

每次 Worker 的 `task_name` 使用明文路由键 `<单元>__w<波次>__s<槽位>of<波次大小>__a<尝试>`，如 `unit_name__w1__s1of2__a1`；`message` 用 `[CQO_WORK_PACKET_V1]` 标记并给 Worker 写明目标、范围、写路径、验收、验证、权限、备份、`selected_agent`、`selected_effort` 和预声明 fallback。宿主会在 Hook 前加密 `message`，故 Hook 只校验可见路由键、调用参数、唯一单元、波次槽位、最多 3 个并发、每单元最多 2 次和每根任务最多 8 次调用；语义与消息内容由 Sol 验收。

仅精确消息 `Selected model is at capacity. Please try a different model.` 触发原代理续交“继续”一次，保留上下文和进度，不重做、重拆或重启整项任务；再次失败才按预声明 `Luna→Terra→当前 Sol` 上调。其他终止错误若未触发 `SubagentStop`，先运行插件 `release-failed-dispatch.cjs <原 task_name>` 释放账本，再公开上调或停止；禁止静默降级。

调用：`luna_worker` 传 `agent_type,fork_turns`；`terra_worker` 另传 `reasoning_effort=xhigh|max`；均不传 `model`。`fork_turns` 仅 `"none"` 或正整数数字字符串。Sol 检查差异并复跑验证，关键变更另派 Terra Max 只读复核。
