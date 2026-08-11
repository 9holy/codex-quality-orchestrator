# 需求基线

本文件用于维护和回归追踪，不注入模型上下文。`references/RULE16.md` 是唯一语义路由规则，Routing Skill 只实现该规则，Hook 只校验机械字段。

## 目标与路由

| 编号 | 不可丢失的要求 | 落点 |
|---|---|---|
| Q01 | 质量门槛优先；只在能可靠胜任的候选中优化总成本 | Rule 16、Routing Skill |
| Q02 | 当前 Sol 保持根模型和档位，负责规划、拆解、所有权、整合、验收、裁决和兜底 | Rule 16 |
| Q03 | 清晰、低风险、可直接验证的短任务由当前主代理处理 | Rule 16 |
| Q04 | 冻结、低判断、可机械验证的单元若 Luna Max 能可靠完成且下派有净收益，必须第一优先 | Rule 16、Policy |
| Q05 | 不把 Luna 用作试错、草稿或先做后修模型，不为调用 Luna 强拆模糊、耦合或高风险决策 | Rule 16 |
| Q06 | 高风险决策留给 Sol；边界和验收冻结后，其中安全的证据或执行单元仍可下派 | Rule 16 |
| Q07 | Luna 不适用后，适合独立下派的常规判断单元优先 Sol Medium；Terra 仅在相对合格 Sol Medium 或当前 Sol 有明确任务优势时使用最低可靠档 | Rule 16、Routing Skill |
| Q08 | Terra 支持 XHigh、Max、Ultra；Sol Reviewer 固定 XHigh 只读且仅用于关键高风险独立复审 | Policy、代理模板 |
| Q09 | 保持当前 Sol 根档位；Medium、High、XHigh、Max、Ultra 的用途只作选择任务档位或下一任务建议，不在运行中改写根档位 | 路由矩阵 |
| Q10 | IQ 差至少 3 才因质量换高 IQ；同级先保留热模型或原代理，再比较预计总成本 | Rule 16、Radar |
| Q11 | 每个根任务最多读取一次 Radar；Luna 合格、候选唯一或判断明确时不读取；路由冻结至边界、可用性或结果变化 | Rule 16、Routing Skill |

## 团队执行

| 编号 | 不可丢失的要求 | 落点 |
|---|---|---|
| T01 | 非短任务先形成轻量内存计划：单元、目标、路径所有权、依赖、验收和集成顺序 | Routing Skill |
| T02 | 单个足够大的单元也可下派；通常一个 Worker，只有独立、写入不冲突且净收益为正时并行 | Routing Skill |
| T03 | 同质批量先验收一个代表单元，再填满宿主可用容量；无任务累计上限 | Rule 16、Routing Skill |
| T04 | 共享文件单写者；普通模式 Worker 不下派；爆种模式仅在工作包明确授权且深度小于 d4 时下派 | Rule 16、代理模板 |
| T05 | Worker 运行时使用一次长阻塞等待，由结果被动唤醒；禁止轮询 | Rule 16、Routing Skill |
| T06 | Sol 检查实际结果或差异并复跑必要验证，按计划顺序整合 | Rule 16、Routing Skill |
| T07 | 明确局部缺陷最多续交原 Worker 一次；能力、越界或质量失败立即交回 Sol | Rule 16 |

## 调用、失败与环境

| 编号 | 不可丢失的要求 | 落点 |
|---|---|---|
| M01 | Luna 固定 Max；Sol Worker 固定 Medium；Terra 调用时选 XHigh/Max/Ultra；具名代理不传 `model` | Policy、Hook |
| M02 | `task_name` 明文显示预期代理和档位，`fork_turns` 显式为 `none` 或正整数字符串 | Policy、Hook |
| M03 | 工作包冻结目标、范围、路径所有权、验收和回到当前 Sol 的接管方式 | Routing Skill |
| M04 | 精确容量消息只让同一代理在原上下文继续一次，不重启或重做；第二次交回 Sol 重新路由 | Rule 16、SubagentStop Hook |
| M05 | 禁止静默降级；任务名、工作包和代理自述不能单独证明实际后台模型 | 维护 Skill、README |
| M06 | 只保留 SessionStart、UserPromptSubmit、PreToolUse、SubagentStop 四个 Hook；普通提示保持静默 | Hook、Policy |
| M07 | 配置守护只恢复插件注册和已批准 Hook 哈希，保留 Cockpit、CC Switch 写入的认证、Provider、端点和模型配置 | Config Guard |
| M08 | 只允许执行型 `sol_medium_worker` 和关键高风险只读 `sol_reviewer` 两种 Sol 子代理 | Rule 16、Policy |
| M09 | 爆种模式按会话精确开关，保留 d1-d4、最多 20 个子线程和 d4 禁止下派；质量门槛与 Sol 最终审计不变 | Rule 16、Hook、Policy |
| M10 | 主控容量通知不进入当前可续交 Hook；插件不得宣称主控已自动恢复 | README、操作指南 |

## 明确排除

- 不自动修改已经启动任务的根模型或推理档位。
- 不使用关键词、文件数量或代码规则替代 Sol 的能力和风险判断。
- 不自动路由到 GPT-5.5、`codex-auto-review` 或未声明代理。
- 不恢复普通模式固定并发、八次调用、每任务累计上限、波次 Ledger 或自动 fallback 链。
- 不把预期任务名当作实际模型调用证据。
