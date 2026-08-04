# 路由矩阵

## 主控

当前 `gpt-5.6-sol` 负责理解、拆解、分派、整合、验收和兜底。插件保持任务创建时已经选择的根档位，不自动把 Medium、High、XHigh、Max 或 Ultra 相互切换。

| 根档位 | 合理用途 |
|---|---|
| `medium` | 常规规划、拆解、整合和边界明确的直接工作 |
| `high` | 需要更细致检查但不需要复杂推理升级的工作 |
| `xhigh` | 复杂规划、跨模块整合和严格验收 |
| `max` | 疑难、高风险、架构和关键裁决 |
| `ultra` | 系统性、超复杂的长任务，不作为日常默认 |

## Worker

| 代理 | 固定模型 | 档位 | 使用条件 |
|---|---|---|---|
| `luna_worker` | `gpt-5.6-luna` | `max` | 决策冻结、判断负荷低、可机械验证且能可靠完成；满足时第一优先 |
| `sol_medium_worker` | `gpt-5.6-sol` | `medium` | 边界明确、需要适度判断、可独立验证，且下派或并行有净收益 |
| `terra_worker` | `gpt-5.6-terra` | `xhigh/max/ultra` | 相比合格 Sol Medium 或当前 Sol 有明确的任务特定优势；选择最低可靠档 |
| `sol_reviewer` | `gpt-5.6-sol` | `xhigh` | 关键高风险变更的一次只读复审 |

Worker 不得越过工作包范围、做无关修改或创建子代理。目标或验收不清楚时停止猜测并交还 Sol。所有 Worker 结果都由当前 Sol 验收。

## 选择顺序

1. 短任务由当前主代理完成。
2. 非短任务先形成轻量计划，固定单元、路径所有权、依赖、验收和集成顺序。
3. 逐单元先判断它是否属于冻结、低判断、可机械验证的 Luna 工作。
4. Luna 可靠胜任就直接使用，不读取 Radar。
5. Luna 不适用时，需要适度判断且适合独立下派的单元优先 Sol Medium；耦合、顺序或无并行收益的工作留给当前 Sol。
6. Terra 不是升级层；只有存在明确的质量、上下文、并发或总成本优势时才选。深推理本身不是理由。
7. 多个合格 Sol/Terra 路由仍难以选择时，一个根任务只读取一次 Radar；IQ 差小于 3 时先保留热模型或原代理，再比较预计总成本。
8. 路由确定后冻结；只有单元、边界、可用性或结果变化时重判，不重复读取 Radar。
9. 关键高风险变更需要独立性时增加一次只读 Reviewer。
10. Sol 检查实际差异、复跑验证并作最终裁决。

## 并行

通常只派一个 Worker。仅工作单元互不依赖、写入不冲突且并行收益高于协调成本时并行。大量同质批处理先验收一个代表性单元，再填满宿主可用容量，完成一个就补充一个。Worker 运行期间调用一次最长一小时的原生阻塞等待，由代理结果提前唤醒；不轮询状态或重复短等待。任务级累计数量不设硬上限；共享文件始终只有一个写入者。

## 调用契约

```text
luna_worker: agent_type + task_name(luna_max__unit) + fork_turns
sol_medium_worker: agent_type + task_name(sol_medium__unit) + fork_turns
terra_worker: agent_type + reasoning_effort(xhigh|max|ultra) + task_name(terra_<effort>__unit) + fork_turns
sol_reviewer: agent_type + task_name(sol_reviewer_xhigh__unit) + fork_turns
```

具名代理不传 `model`。默认 `fork_turns:"none"`，确需少量历史时使用正整数字符串。Hook 只校验宿主可见的确定性调用字段，不判断任务语义，也不阻止其他插件使用自己的代理。

## 容量恢复

精确容量错误首次出现时在原代理上下文中“继续”一次；第二次失败交回当前 Sol。不重新启动整项任务，不重做已经完成的工作，能力或质量失败不得按容量错误处理。
