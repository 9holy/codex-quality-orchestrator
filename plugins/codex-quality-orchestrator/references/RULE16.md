## Rule 16 — 默认多模型质量团队

短任务由当前主代理直接完成：目标/验收明确、低风险、无需选方案或诊断、上下文少且可直接验证；高风险不算短任务。

其余任务由当前 `gpt-5.6-sol` 主控，负责理解、规划、拆解、路由预检、分派、整合、验收和兜底。插件不改已启动根档位；新任务用能可靠主控的最低档：`medium` 默认，`high` 仅用于多步骤逻辑和边界检查，`xhigh` 复杂规划与整合，`max` 最难/高风险裁决，`ultra` 可有效并行的系统性多波次任务。默认升级链为 `medium→xhigh→max→ultra`，不得按任务长度自动升级。

按完整工作单元最高要求判定，能力边界先于数据：`luna_worker / gpt-5.6-luna / max` 能可靠完成且可独立验收就必须下派，绝不上调；仅在 Luna 不适用后的语义合格候选内参考新鲜的 IQ/成本证据选择预计总算力成本最低者，过期或样本不足则忽略。Luna 执行已冻结的实现、修复、测试、扫描和批量工作；需消歧、诊断、跨上下文推断、疑难调试或独立复核交 `terra_worker / gpt-5.6-terra / xhigh|max|ultra`：`xhigh` 常规，`max` 高难度，`ultra` 最深推理。架构、安全、公共接口、生产数据、不可逆迁移、公共数据契约和最终裁决留给 Sol。

通常使用 1 个 Worker，存在 2–3 个互不冲突且并行收益大于额外算力和整合成本的单元时按需并行，最多 3 个。共享文件单写者，Worker 不得下派；无法安全拆分或 Worker 不能可靠胜任时当前 Sol 接管，不创建 Sol 子代理。

Worker 的 `task_name` 使用明文路由键 `<模型档位>__<单元>__w<波次>__s<槽位>of<波次大小>__a<尝试>`；前缀限 `luna_max|terra_xhigh|terra_max|terra_ultra` 并匹配调用。`message` 用 `[CQO_WORK_PACKET_V1]` 写明目标、范围、写路径、验收、验证、权限、备份及 `selected_agent|selected_effort|fallback`。Hook 只校验明文路由键、唯一单元、波次槽位、最多 3 个并发、每单元最多 2 次和每根任务最多 8 次调用；语义由 Sol 验收。

仅精确消息 `Selected model is at capacity. Please try a different model.` 触发原代理续交“继续”一次，保留上下文和进度，不重做、重拆或重启整项任务；再次失败才按预声明 `Luna→Terra→当前 Sol` 上调。其他终止错误若未触发 `SubagentStop`，先运行插件 `release-failed-dispatch.cjs <原 task_name>` 释放账本，再公开上调或停止；禁止静默降级。

调用：`luna_worker` 传 `agent_type,fork_turns`；`terra_worker` 另传 `reasoning_effort=xhigh|max|ultra`；均不传 `model`。`fork_turns` 仅 `"none"` 或正整数数字字符串。Sol 检查差异、复跑验证并按风险决定是否另派 Terra 独立复核。
