# Codex Quality Orchestrator

让 Codex 用一支小型模型团队完成任务：Sol 负责想清楚、分配和验收，Luna 与 Terra 负责各自能胜任的执行工作。在保证质量的前提下，尽量减少不必要的高成本模型调用。

## 它怎么工作

你只需要正常描述任务。插件提供独立的日常路由 Skill；普通多步骤任务匹配后，主控 Sol 会根据任务内容决定是否需要下派：

| 角色 | 主要工作 |
|---|---|
| Sol | 理解需求、制定方案、拆分任务、分配工作、整合结果和最终验收 |
| Luna Max | 第一优先承担目标清楚、边界明确、可以单独验证的实现、修复、测试、扫描和批量工作 |
| Terra XHigh/Max/Ultra | 承担 Luna 不适用且适合独立下派的工作；Sol 选择能胜任的最低档位 |
| Sol XHigh reviewer | 仅对关键高风险变更做一次独立只读复审；不执行生产工作，不作最终裁决 |

简单问题由当前主控直接处理。其余任务由 Sol 理解并拆分；一个有足够执行量、交接有净收益且 Luna Max 能可靠完成并验证的单元就应下派，不要求必须凑成并行团队。通常只使用 1 个 Worker；存在 2–3 个互不冲突且确有并行收益的工作单元时才并发，最多 3 个。架构、安全、公共接口、生产数据、不可逆操作以及最终裁决仍由 Sol 负责。

路由判断由 Sol 根据完整上下文完成。插件的 Hook 负责检查实际调用是否符合规则，限制并发和重试，记录 Worker 状态，并阻止错误模型、错误档位或越界调用。它不会用死板的关键词替代模型理解任务。

Luna Max 在 Sol 判断能胜任的候选中优先，雷达分数不能替代这个判断。插件每天最多刷新一次 Codex Radar，完整数据只留在本地缓存；Sol 在任务开始时用一次简短摘要确定已知工作单元的执行者，后续按方案派发，仅在新增单元、边界变化、失败或模型不可用时重判。缓存最长可用 72 小时，过期或样本不足时自动忽略。

Luna 不适用时，由当前 Sol 处理，或把适合独立下派的工作交给 Terra，并选择能胜任的最低档位。若不足的是整项任务的规划和统筹能力，则下一任务改用 Sol XHigh。普通任务由当前 Sol 审核；仅关键高风险变更增加一次 Sol XHigh 只读独立复审，最终裁决仍由当前 Sol 完成。

## 自动分配示例

- “把已经确定的三个页面按设计稿实现并分别测试”：Sol 可以拆分后交给 Luna Max 并行执行，最后统一验收。
- “按已冻结接口完成一个较大的解析器并运行现有测试”：即使只有一个工作单元，只要交接有净收益，也优先交给一个 Luna Max。
- “查出偶发数据错乱的根因并修复”：由 Sol 判断自己处理，或把独立诊断单元交给能胜任的 Terra 档位。
- “修改生产数据库迁移方案”：由 Sol 负责，不会为了节省算力强行下派。
- “解释这一行代码”：属于短任务，当前主控直接回答，不创建 Worker。

如果 Worker 返回 `Selected model is at capacity. Please try a different model.`，插件只让原 Worker 在原上下文中继续尝试一次，不会把整个任务重新开始。再次失败后交回当前 Sol，由 Sol 重新判断执行者。

## 安装

在 Windows PowerShell 中运行下面的命令。可以从任意目录执行，不需要把插件复制到当前项目：

```powershell
$marketplace = codex plugin marketplace add 9holy/codex-quality-orchestrator --ref main --json | ConvertFrom-Json
$plugin = codex plugin add "codex-quality-orchestrator@$($marketplace.marketplaceName)" --json | ConvertFrom-Json
powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $plugin.installedPath 'scripts\install.ps1')
codex plugin list --json
```

然后完成两件事：

1. 在 Codex 中打开 `/hooks`，审核并信任插件提供的四项 Hook。
2. 新建一个任务。已经打开的旧任务不会自动加载新规则和代理配置。

安装脚本会同步全局 Rule 16，并安装 `luna_worker`、`terra_worker` 和只读 `sol_reviewer`；插件同时提供维护 Skill 与日常路由 Skill，新任务会按 Skill 描述匹配。修改已有全局规则前会先备份完整 `AGENTS.md`。已有兼容代理配置会保留；发现冲突时会停止，不会静默覆盖。只有你明确决定替换冲突代理配置时才使用 `-Force`，脚本会先备份原文件。

## 验证是否生效

安装完成后，继续使用上面的 `$plugin` 变量运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $plugin.installedPath 'scripts\runtime-smoke.ps1')
```

看到 `SessionStartHookTrust=PASS` 和 `SessionStart=PASS`，说明新的 Codex 会话确实执行了 SessionStart Hook。`codex plugin list --json` 还应显示插件已经安装并启用。

不要在自己的项目目录里直接运行 `./plugins/codex-quality-orchestrator/...`，除非你确实克隆了本仓库。普通安装用户应始终使用 `$plugin.installedPath`，这样无论当前位于哪个目录都能找到脚本。

烟雾测试只证明 SessionStart Hook 已运行。其余三项 Hook 仍应在 `/hooks` 中分别确认已启用和受信任。

## 经常切换配置

如果 Cockpit Tools、CC Switch、同步工具或其他程序会整体替换 `config.toml`，可以启用配置守护器：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $plugin.installedPath 'scripts\config-guard.ps1') -Mode Install
```

它只合并插件注册和四项已批准 Hook 信任，保留切换器写入的模型、Provider、端点和其他配置。切换器恢复旧信任哈希时，只要本地 Hook bundle 仍与已批准摘要完全一致，守护器会恢复已批准哈希；Hook 文件真的发生变化时则停止并要求重新审核。Marketplace 分支从安装元数据保留，不会因切换后丢失 `main`。自动随 Windows 登录启动目前只支持 Windows。

## 需要知道的边界

- 插件不能改变已经启动的根任务模型或推理档位。新任务使用最低可靠档，自动升级链为 Sol Medium → XHigh → Max → Ultra；High 保留支持但不作为自动节点，XHigh 能胜任时不用 Max。
- Codex Radar 是外部滚动实测，只作为语义合格候选之间的数值校准；接口不可用、数据过期或样本不足时按 Rule 16 继续，不阻断任务。
- 自动分配是“Sol 理解并发起调用，Hook 校验调用”，不是脚本自行理解自然语言。
- Hook 必须已启用并受信任，否则规则可以被读到，但机械校验、状态记录和容量续交不会运行。
- `codex-auto-review / low` 是 Codex 自身的权限审核，不是本插件分配的工作模型。
- 插件运行时不上传遥测，也不会把任务内容发送到额外服务。

## 开发与检查

从仓库根目录运行完整静态验证：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\plugins\codex-quality-orchestrator\scripts\verify.ps1
```

生成发布包：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\plugins\codex-quality-orchestrator\scripts\package.ps1
```

更详细的路由规则见 [路由矩阵](docs/ROUTING_MATRIX.md)，安装、Hook 和故障处理细节见 [操作指南](docs/OPERATING_GUIDE.md)。

## 卸载

如果启用了配置守护器，先关闭它：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $HOME '.codex\.codex-quality-orchestrator-guard\config-guard.ps1') -Mode Uninstall
```

然后卸载插件和代理配置：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $plugin.installedPath 'scripts\uninstall.ps1')
codex plugin remove codex-quality-orchestrator@codex-quality-orchestrator --json
codex plugin marketplace remove codex-quality-orchestrator --json
```

卸载脚本会保留用户原有或安装后自行修改过的配置。

## 许可证

[MIT](LICENSE)
