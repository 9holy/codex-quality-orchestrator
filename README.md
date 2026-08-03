# Codex Quality Orchestrator

让 Sol 负责理解、拆解、整合和验收，让 Luna Max 优先完成它能可靠胜任的执行工作；Luna 不适用时先比较当前 Sol 与合格 Terra，只有 Terra 确有优势才下派。目标是在质量不降级的前提下减少高成本模型调用和上下文切换。

## 路由方式

| 角色 | 模型与档位 | 职责 |
|---|---|---|
| 当前主控 | `gpt-5.6-sol`，保持任务已选档位 | 理解、拆解、分派、整合、验收和兜底 |
| `luna_worker` | `gpt-5.6-luna / max` | 清晰、边界明确、可验证的执行单元，可靠胜任时第一优先 |
| `terra_worker` | `gpt-5.6-terra / xhigh|max|ultra` | Luna 不适用且相比当前 Sol 确有优势的独立单元 |
| `sol_reviewer` | `gpt-5.6-sol / xhigh` | 关键高风险变更的一次只读复审 |

短任务由当前主控直接完成。非短任务由 Sol 在当前上下文中列出工作单元、路径所有权、依赖、验收和集成顺序，再决定是否下派。通常先派一个 Worker；独立、写入不冲突且并行确有收益的单元才并行。大量同质批处理先验收一个代表性单元，再填满宿主可用容量，完成一个就补充一个；不设置任务级累计上限。Worker 运行期间使用最长一小时的原生阻塞等待，结果会提前唤醒 Sol，不主动轮询状态。

Luna Max 能可靠完成时直接选择，不读取 Radar。只有 Luna 不适用且当前 Sol 与多个 Terra 路由都能胜任时，Sol 才在一个根任务内读取一次本地缓存的 Radar 摘要。IQ 差小于 3 时优先保留热模型或原代理，再比较预计总成本。路由确定后冻结，只有单元、边界、可用性或结果变化时才重判，而且不重复读取 Radar。

模糊需求、根因决策、架构、安全、公共接口、生产数据、不可逆操作和最终裁决由 Sol 保留；边界与验收明确后，其中安全的证据收集或执行单元仍可下派。Luna 不被用作试错、草稿或先做后修模型。

## 实际运行机制

Sol 为每个 Worker 发送一个简短工作包：

```text
[CQO_WORK_PACKET_V1]
route: gpt-5.6-luna / max
目标: 完成什么
范围: 可以读取和修改什么，由谁拥有
验收: 如何确认完成
接管: 失败时回到当前 Sol，保留已完成工作
```

桌面端会加密发送给 Worker 的 `message`，所以 Hook 不伪装成能检查工作包语义。实际模型路由通过可见 `task_name`、具名代理 TOML、调用档位和 Hook 交叉校验，例如：

```text
luna_max__update_tests
terra_ultra__diagnose_parser
sol_reviewer_xhigh__review_migration
```

插件只有三个 Hook：

- `SessionStart`：Rule 16 缺失或过期时注入；一致时保持静默。
- `PreToolUse`：只约束三个 CQO 具名代理，不干涉其他插件或代理。
- `SubagentStop`：精确遇到容量错误时让原代理在原上下文中“继续”一次。

插件没有 Ledger、波次、固定累计调用上限或自动 fallback。Worker 失败后直接返回当前 Sol 判断，避免陈旧状态和无效升级链。轻量计划只保存在当前任务上下文，不额外创建 Planner 或持久协调文件。

## 安装

Windows PowerShell：

```powershell
$marketplace = codex plugin marketplace add 9holy/codex-quality-orchestrator --ref main --json | ConvertFrom-Json
$plugin = codex plugin add "codex-quality-orchestrator@$($marketplace.marketplaceName)" --json | ConvertFrom-Json
powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $plugin.installedPath 'scripts\install.ps1')
```

然后在 `/hooks` 审核并信任三个 Hook，并新建任务。安装脚本会安装三个代理配置并同步 Rule 16；已有冲突配置不会被静默覆盖，只有明确使用 `-Force` 时才会在备份后替换。

## 验证

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $plugin.installedPath 'scripts\runtime-smoke.ps1')
codex plugin list --json
```

烟雾测试证明插件和 SessionStart Hook 在真实宿主会话中运行。PreToolUse、实际模型调用和容量续交仍分别依靠契约测试及 Codex 使用记录核对，不能用任务名或代理自述代替。

## 配置切换

Cockpit Tools、CC Switch 或其他程序会整体替换 `config.toml` 时启用守护器：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $plugin.installedPath 'scripts\config-guard.ps1') -Mode Install
```

守护器只恢复插件注册和三个已经批准的精确 Hook 哈希，保留切换器写入的认证、Provider、端点、模型和其他配置。Hook 内容变化时不会沿用旧批准。

## 边界

- 插件不能修改已经启动任务的根模型或推理档位。
- 是否胜任是 Sol 的语义判断；代码只校验确定的调用参数。
- Luna 不适用不会自动触发 Terra；当前 Sol 与 Terra 只在都能胜任时比较。
- Worker 的结果必须由 Sol 检查实际差异并复跑必要验证。
- 任务名和工作包用于可见性，不是实际后台调用的唯一证据。
- `codex-auto-review / low` 是 Codex 权限审核，不是本插件路由的工作模型。

开发验证和操作细节见 [操作指南](docs/OPERATING_GUIDE.md)，完整角色边界见 [路由矩阵](docs/ROUTING_MATRIX.md)。

## 开发

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\plugins\codex-quality-orchestrator\scripts\verify.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\plugins\codex-quality-orchestrator\scripts\package.ps1
```

## 许可证

[MIT](LICENSE)
