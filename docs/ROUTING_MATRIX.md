# 路由矩阵

## Sol

| 档位 | 用途 | 限制 |
|---|---|---|
| `medium` | 边界清晰的直接分析 | 不负责多模型统筹或关键验收 |
| `high` | 常规多步骤任务、小范围调试和集成 | 不负责高风险最终裁决 |
| `xhigh` | 普通非短任务的默认统筹、胜任判断、整合和常规验收 | 高风险任务升级到 `max` |
| `max` | 架构、安全、公共接口、数据修改、疑难任务和关键裁决 | 日常简单任务不默认使用 |
| `ultra` | 极少数超大上下文或超复杂长任务 | 不作为日常默认 |

## 具名代理

| 代理 | 模型与档位 | 用途 | 禁止事项 |
|---|---|---|---|
| `terra_worker` | `gpt-5.6-terra / xhigh` | 常规中等生产任务、测试、文档分析 | 最终质量裁决 |
| `terra_worker` | `gpt-5.6-terra / max` | 复杂多文件实现、疑难调试、重要代码审查 | 最终质量裁决 |
| `luna_worker` | `gpt-5.6-luna / max` | 规则确定、低风险、可机械验证的简单子任务 | 模糊、架构、安全、公共接口、数据修改和最终裁决 |
| `sol_reviewer` | `gpt-5.6-sol / xhigh / read-only` | 关键变更的独立审核 | 写入文件和最终裁决 |

## 调用参数

```text
terra_worker: agent_type + reasoning_effort(xhigh|max) + fork_turns
luna_worker: agent_type + fork_turns
sol_reviewer: agent_type + fork_turns
Sol 升级: model(gpt-5.6-sol) + reasoning_effort + fork_turns
```

具名代理的模型由 TOML 固定，调用时不得覆盖。Luna 和 reviewer 的推理档位也由 TOML 固定。`fork_turns` 只能是 `"none"` 或正整数字符串。

## 决策顺序

1. 目标模型是否能够可靠胜任。
2. 风险是否在代理允许边界内。
3. 成功标准与验证方式是否明确。
4. 只有前三项均满足时，才考虑速度和成本。

代码和 Hook 只负责可确定的参数、配置完整性与冲突检查。具体任务交给哪个模型，始终由统筹 Sol 根据上下文进行语义判断。
