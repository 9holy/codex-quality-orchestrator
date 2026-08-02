# 路由矩阵

## Sol 主控

Sol 是根任务主控和最终兜底，不创建执行型 Sol 子代理；关键高风险变更可创建一次只读 Sol XHigh reviewer。

| 档位 | 用途 | 限制 |
|---|---|---|
| `medium` | 常规团队主控和边界清晰的直接分析 | 默认起点；复杂度不足时升级 |
| `high` | 多步骤逻辑、假设和边界检查 | 保留使用，但不作为默认升级节点 |
| `xhigh` | 复杂规划、拆解、跨模块整合和严格验收 | 高风险裁决升级 `max` |
| `max` | 架构、安全、公共接口、生产数据、疑难问题和关键裁决 | 日常任务不默认使用 |
| `ultra` | 可有效并行的系统性多波次任务 | 极少使用，不作为 Worker |

根模型与档位在插件 Hook 运行前由任务创建界面、外部配置或 `config.toml` 决定，插件不能改写已启动根任务。工作无法安全拆分、Luna/Terra 不能可靠胜任、有限修正仍失败或全局集成必须由主控处理时，当前 Sol 直接接管实施。

## Worker

| 代理 | 模型与档位 | 首选工作 | 禁止事项 |
|---|---|---|---|
| `luna_worker` | `gpt-5.6-luna / max` | 边界冻结、清晰、可独立验收的实现、多文件修改、已定位问题的修复、测试、扫描和批量工作，可在冻结边界内做局部实现选择 | 需求重定义、消歧、根因诊断、跨上下文推断、架构、安全、公共接口、生产数据、不可逆迁移和最终裁决 |
| `terra_worker` | `gpt-5.6-terra / xhigh|max|ultra` | 当前自动路由只用 Ultra；XHigh/Max 保留显式调用能力 | 默认执行、默认复核、主控职责、架构与最终质量裁决 |
| `sol_reviewer` | `gpt-5.6-sol / xhigh` | 关键高风险变更的一次独立只读复审 | 生产执行、文件写入、并行 reviewer、子代理和最终裁决 |

Sol 必须先完整理解工作单元并判断能力、风险和验收强度。只有高置信度确认 Luna Max 能独立正确完成、写入受限、失败可回滚且验收能发现错误时才下派；不得为使用 Luna 强拆耦合任务或先试再修。在通过门槛的候选中，先保留当前热模型和原代理，再比较预计总算力成本。

Luna Max 只在通过能力和风险门槛的候选中优先。Codex Radar 只在合格候选间生成稳定优先关系；IQ 差距小于配置区间时先保持热模型/原代理，再选低预计总成本。过期或样本不足的数据不参与路由。

Worker 输出在 Sol 检查差异并复跑验证前均未接受。能力不足、理解偏差、越界或风险不可验证时立即停止，不按容量错误续交；只有明确、局部、低风险的问题才允许原 Worker 定向修正一次。

## 团队并行

- 只有至少两个互不冲突的完整工作单元，且并行收益高于协调成本时组队。
- 通常每波 1 个 Worker；只有并行收益大于额外算力和整合成本时才使用 2–3 个，最多 3 个。不设置根任务累计调用上限，也不为使用代理拆分短任务。
- 每个工作包固定目标、范围、文件所有权、输入输出、验收、验证命令和备份状态。
- 共享文件坚持单写者；Worker 不得创建或下派子代理。
- Sol 负责整合、复跑验证和最终审核；仅关键高风险变更增加一次 Sol reviewer，不默认另派 Terra 复核。

## 冻结工作单

每次 Worker 的 `task_name` 必须使用明文路由键，供宿主 Hook 读取：

```text
luna_max__unit_name__w1__s1of2__a1
```

`message` 仍必须包含且只包含一个给 Worker 阅读的工作单标记块：

```text
[CQO_WORK_PACKET_V1]
{"work_unit_id":"...","objective":"...","scope":["..."],"write_paths":[],"acceptance":["..."],"verification":["..."],"task_intent":"verify","mutation_authority":"none","backup_required":false,"selected_agent":"luna_worker","selected_effort":"max","fallback_agent":"sol_controller","worker_attempt":1,"wave_id":"wave_01","wave_size":2,"worker_slot":1}
[/CQO_WORK_PACKET_V1]
```

Sol 判断任务语义并生成工作单；由于宿主会在 Hook 前加密 `message`，Hook 只验证明文路由键、调用参数和账本，Sol 必须自己保证工作单内容、权限和备份声明正确。Luna 使用 `selected_effort=max`；Terra 使用 `selected_effort=ultra`，仅在当前 Sol 能力不足且深推理单元可独立下派时调用；兜底链在调用前声明。

会话账本以宿主 `session_id` 记录唯一工作单元、波次槽位和 pending/active/stopped 生命周期：同时 pending/active 最多 3 个，每单元最多 2 次，不设置根任务累计调用上限。`SubagentStart` 绑定原生 `agent_id`，`SubagentStop` 释放槽位；同一单元的第二次尝试必须等待第一次结束并使用预声明 fallback。账本不判断任务语义，也不检查真实文件写入。

## 容量恢复

当子代理最后消息包含精确文本 `Selected model is at capacity. Please try a different model.`：

1. 首次出现时，`SubagentStop` 自动向原子代理提交一次“继续”，保留原上下文和进度。
2. `stop_hook_active` 防止第二次自动续交，避免循环。
3. 若代理尚未创建成功，则使用原参数重试同一工作包一次。
4. 第二次仍失败就交回当前 Sol；只有当前 Sol 能力不足时才改派 Terra Ultra。
5. 不重做已完成工作，不重新拆分或重启整项任务，不静默降级。
6. 非容量终止错误若未触发 `SubagentStop`，主控运行 `release-failed-dispatch.cjs <原 task_name>` 释放当前会话账本后再上调或停止。

## 调用契约

```text
luna_worker: agent_type + fork_turns
terra_worker: agent_type + reasoning_effort(xhigh|max|ultra) + fork_turns
sol_reviewer: agent_type + fork_turns
```

具名代理模型由 TOML 固定，调用时不得传 `model`。`fork_turns` 默认 `"none"`，仅需少量历史时传正整数数字字符串。除只读 `sol_reviewer` 外禁止 Sol 子代理；裸 Terra/Luna、`gpt-5.5` 和未登记模型同样禁止。

具体任务的语义匹配由主控 Sol 根据完整上下文完成；代码和 Hook 只校验冻结工作单、确定性参数、容量续交次数、配置完整性与冲突。
