# Codex Quality Orchestrator 操作指南

这份文档说明插件如何做质量编排、哪些决策由 Sol 负责、Hook 会拦截什么，以及如何安全安装、验证和卸载。

## 1. 核心原则

插件不是自动替模型做语义判断的决策树。任务含义、风险、目标模型是否能可靠胜任，由 Sol 根据完整上下文判断；代码只校验 Sol 已冻结的工作单和调用契约。

Sol 先理解并拆分任务。判断 Luna Max 能可靠完成且结果可验证，就优先下派；不能胜任或判断不确定就不派。质量和胜任能力优先，满足后再考虑热缓存和预计总成本。

Luna Max 在 Sol 判断能胜任的候选中第一优先，雷达数据不能替代 Sol 的判断。SessionStart 只向 Sol 提供由本地完整快照计算出的稳定优先关系，不注入时间、状态、分数或整张表。IQ 差距小于稳定区间时先保留热模型和原代理，再比较预计总成本；无新鲜证据时完全按静态能力矩阵执行。

短任务必须同时满足目标与验收无歧义、低风险、无需方案选择或诊断、上下文很少且可直接验证；改动大小、文件数量或验证步骤数量只能作为辅助信号。架构、安全、公共接口、生产数据、不可逆操作等高风险事项无论大小都不是短任务。

对每个非短任务，Sol 判断每个工作单元由谁执行。Luna Max 能胜任就优先下派；不适用时由当前 Sol 处理，或把适合独立下派的单元交给能胜任的 Terra 最低档位。最终审核、架构、高风险、生产数据、跨代理最终集成与最终裁决保留给 Sol。

Worker 结果由 Sol 检查实际差异并复跑验证。明确、局部的问题可让原 Worker 修正一次；能力或质量不合格立即交回 Sol，不按容量错误续交。关键高风险变更需要独立性时才使用一次只读 Sol XHigh reviewer。

容量错误是唯一同级续交例外：子代理最后消息包含精确文本 `Selected model is at capacity. Please try a different model.` 时，`SubagentStop` 首次自动向原子代理提交“继续”，保留原上下文与进度；`stop_hook_active` 防止第二次续交。未创建成功时才以原参数重试同一工作包一次。第二次仍失败就交回当前 Sol 重新判断；不重做已完成工作、不重新拆分或重启整项任务。

## 2. 默认工作流

```mermaid
flowchart TD
    A[用户任务] --> B{短任务?}
    B -->|是| C[当前主代理直接完成]
    B -->|否| D[Sol medium 默认主控]
    D --> E{高风险或关键裁决?}
    E -->|是| F[Sol xhigh 或 max]
    E -->|否| I{存在可独立验收的工作单元?}
    F --> I
    I -->|否| H[当前 Sol 兜底]
    I -->|是| G{清晰且 Luna Max 可胜任?}
    G -->|是| J[1–3 个 Luna Worker 分波执行]
    G -->|否| O{当前 Sol 可胜任?}
    O -->|是| H
    O -->|否| P{深推理单元可独立下派?}
    P -->|是| Q[Terra 最低可靠档执行]
    P -->|否| R[建议下一任务使用 Sol XHigh]
    Q --> K
    J --> K[Sol 检查实际差异并复跑验证]
    K --> S{关键高风险变更?}
    S -->|是| T[Sol XHigh reviewer 只读复审]
    S -->|否| N[Sol 最终验收]
    T --> N
    H --> N
```

通常每波只使用 1 个 Worker。只有至少两个工作单元可以安全并行，且收益高于额外算力和协调成本时才使用 2–3 个，最多 3 个；Luna 可以在三个互不冲突的清晰执行单元上占满并发。每次调用的 `task_name` 使用 `<模型档位>__<单元>__w<波次>__s<槽位>of<波次大小>__a<尝试>` 明文路由键，`message` 携带给 Worker 阅读的冻结 `CQO_WORK_PACKET_V1` JSON 工作单，由 Sol 负责共享文件单写者。Worker 不得创建或下派子代理。

工作单至少固定 `work_unit_id`、目标、范围、写入路径、验收、验证、任务意图、写权限、所选代理、档位、预声明 fallback、当前 attempt、波次、槽位和备份要求。宿主会在 Hook 前加密 `message`，所以 Sol 负责工作单内容的语义正确性；Hook 只检查明文路由键、调用参数和预声明兜底。会话账本记录唯一工作单元、波次槽位、生命周期、并发和单元尝试次数，但不设置根任务累计调用上限，也不检查实际文件写入，不能替代 Sol 的整合验收。

### 1.1 与参考项目的取舍

`codex-model-routing-team` 由 Lead 冻结 RoutePlan、候选链、Provider/Surface/模型能力，并用 preflight 和 team ledger 验证线程实体化、唯一任务、并发、重试和关闭状态；它默认 App Thread，以弥补原生接口的模型限制。当前环境稳定暴露原生具名 Worker，因此本插件采用 Sol 语义路由 + `CQO_WORK_PACKET_V1` + 原生 Hook 会话账本：保留冻结工作单、任务意图/写权限、预声明 fallback、唯一任务、波次、并发上限、尝试预算、生命周期和一次容量续交，不复制本环境不需要的 App Thread、Provider/Surface、Fast 或第三方模型分支。

### 2.1 根任务档位边界

根任务模型和推理档位在插件 Hook 运行前由桌面模型选择器、外部配置管理器或 `config.toml` 决定。插件只能约束后续子代理调用，不能把已经启动的 `Sol / max` 或 `Sol / ultra` 根任务自动改成 `xhigh`。

因此，新根任务使用能可靠主控的最低档，自动升级链为 `medium → xhigh → max → ultra`。`high` 保留支持但不作为自动升级节点；`xhigh` 能胜任时不得用 `max`。即使根任务档位较高，仍应把可靠胜任的执行工作包派给 Luna Max。

### 2.2 选择依据

OpenAI 的 Codex 模型指南把 `gpt-5.6-sol / medium` 作为默认 Power 设置，并建议使用能够可靠产出所需结果的最低推理强度；更高强度通常增加耗时和 Token，Max/Ultra 不适合多数任务。Codex Radar 的 DeepSWE 滚动众测用于校准实际质量与成本，但单次快照不是永久能力排序，因此插件只固化“最低可靠档位”和风险升级原则，不固化榜单分数。

- 官方模型指南：<https://learn.chatgpt.com/docs/models.md>
- Codex Radar：<https://codexradar.com/>
- 分布式雷达评分口径：<https://deng.codexradar.com/>

完整快照只保留允许模型的数值字段，默认缓存 24 小时、最长使用 72 小时；请求有超时和大小限制，写入采用原子替换。Sol 上下文只接收稳定的优先关系，不接收采集时间、缓存状态、精确分数、成本表、外部任务标题或推荐文案。

## 3. 模型矩阵

| 角色 | 模型 | 推理档位 | 适用任务 |
|---|---|---|---|
| Sol 默认主控 | `gpt-5.6-sol` | `medium` | 常规团队规划、拆解、整合、验收和边界清晰的直接分析 |
| Sol 细致检查 | `gpt-5.6-sol` | `high` | 多步骤逻辑、假设和边界检查；不作为默认升级节点 |
| Sol 复杂主控 | `gpt-5.6-sol` | `xhigh` | 复杂规划、跨模块整合和严格验收 |
| Sol 高风险 | `gpt-5.6-sol` | `max` | 架构、安全、公共接口、生产数据、不可逆迁移、公共数据契约、疑难问题和最终裁决 |
| Sol 系统性主控 | `gpt-5.6-sol` | `ultra` | 可有效并行的系统性多波次任务，不作为 Worker |
| Luna | `gpt-5.6-luna` | 固定 `max` | 边界冻结、清晰、可独立验收的实现、已定位问题的修复、测试、扫描和批量工作 |
| Terra | `gpt-5.6-terra` | `xhigh`、`max` 或 `ultra` | 承担适合独立下派的工作；Sol 选择能胜任的最低档位 |
| Sol reviewer | `gpt-5.6-sol` | 固定 `xhigh` | 关键高风险变更的一次独立只读复审 |

`gpt-5.5`、裸 Terra、裸 Luna 和未登记模型禁止下派。

### 3.1 禁止范围

Luna 不处理消歧、诊断、架构、安全、公共接口、生产数据或最终裁决。Terra 不处理生产数据、不可逆迁移、公共数据契约或最终质量裁决。Sol reviewer 不执行生产工作、不写文件、不创建子代理、不作最终裁决；其他 Sol 子代理禁止。

### 3.2 调用契约

具名代理的模型由 TOML 固定，调用时不能用 `model` 覆盖。Terra 允许 `xhigh/max/ultra`，Luna 固定 `max`，reviewer 固定 `xhigh`：

```text
terra_worker: agent_type + reasoning_effort(xhigh|max|ultra) + fork_turns
luna_worker: agent_type + fork_turns
sol_reviewer: agent_type + fork_turns
```

`fork_turns` 默认 `"none"`，仅确实需要少量历史时使用正整数数字字符串。Luna 和 reviewer 不得覆盖固定推理档位；Terra 必须显式传入 `xhigh`、`max` 或 `ultra`。

## 4. Hook 的职责

### SessionStart

- 加载插件内的 Rule 16。
- 检查全局 `AGENTS.md` 的 Rule 16 是否一致。
- 检查 Terra、Luna 和只读 Sol reviewer 配置是否缺失。
- 规则匹配且代理配置完整时只输出 `[CQO_ACTIVE]`；不重复注入 Rule 16，也不报告可能被任务选择器覆盖的根默认值。
- 发现冲突或缺失时公开报告，不静默修复或回退。

### PreToolUse

只匹配 `spawn_agent`、`Agent` 和 `collaborationspawn_agent`，并机械检查：

- 工具输入是否为 JSON 对象。
- `agent_type` 是否已登记。
- 模型是否被非法覆盖。
- 推理档位是否在允许范围内。
- `fork_turns` 是否有效。
- `task_name` 是否符合明文路由键格式并能表达波次、槽位和尝试。
- `task_name`、所选代理、档位、fallback、attempt、写权限和备份声明是否相互一致。
- 本机 TOML 是否存在并符合模型契约。
- 全局 Rule 16 是否与插件规则冲突。

非法调用直接拒绝并说明原因。Hook 不判断任务语义、不自动改派、不静默降级；Sol 必须修正工作单或公开接管。

### SubagentStart

匹配 `luna_worker`、`terra_worker` 和 `sol_reviewer`，把原生 `agent_id` 绑定到已通过 PreToolUse 的 pending 工作单并标为 active。会话账本按宿主 `session_id` 隔离，最多允许 3 个 pending/active 代理、每个工作单元 2 次尝试；不设置根任务累计调用上限。Reviewer 必须单独执行且只允许首次派发。同一波次槽位不可分配给不同工作单元，第二次尝试必须等待第一次结束并使用预声明 fallback。

### SubagentStop

匹配三个具名代理。首次检测到精确容量消息且 `stop_hook_active=false` 时返回 `decision=block` 与提示“继续”，由 Codex 自动在原子代理上下文创建一次续交；第二次不再拦截，交回主控升级。

启动或认证错误可能在宿主发出 `SubagentStop` 前终止。主控确认代理已终止后，运行插件根目录的 `hooks/release-failed-dispatch.cjs <原 task_name>`；脚本只在当前 `CODEX_THREAD_ID` 中把对应 pending/active 记录标为 failed，随后才允许预声明 fallback。它不缩短正常长任务 TTL，也不能用于仍在运行的 Worker。

`codex-auto-review / low` 是 Codex 系统权限审查，不属于本插件的工作模型矩阵。

## 5. 安装生命周期

从 GitHub 安装，命令与当前工作目录无关：

```powershell
$marketplace = codex plugin marketplace add 9holy/codex-quality-orchestrator --ref main --json | ConvertFrom-Json
$plugin = codex plugin add "codex-quality-orchestrator@$($marketplace.marketplaceName)" --json | ConvertFrom-Json
powershell -NoProfile -ExecutionPolicy Bypass `
  -File (Join-Path $plugin.installedPath 'scripts\install.ps1')
codex plugin list --json
```

安装器只管理 `%CODEX_HOME%\agents` 中的 Luna/Terra Worker 和只读 Sol reviewer，并把旧状态引用的 `.toml` 备份迁移为不可加载的 `.toml.bak`：

- 缺少文件时创建，并记录为插件所有。
- 内容与模板相同的外部文件默认保留，不声明所有权；插件自有文件的模板内容变化会先备份再刷新。
- 内容不同但契约兼容的外部文件默认保留；其他冲突默认停止，不修改任何文件。
- 使用 `-Force` 时先建立带时间戳和 `SHA256SUMS` 的备份，再替换或接管兼容外部文件。

安装状态保存在：

```text
%CODEX_HOME%\.codex-quality-orchestrator.install-state.json
```

安装锁在读取状态和计算动作之前获取：

```text
%CODEX_HOME%\.codex-quality-orchestrator.install.lock
```

这样可以避免并发安装依据陈旧状态覆盖备份记录。

安装插件后，在 Codex 中使用 `/hooks` 审核并信任 Hook，再新建任务。已有任务不会热加载新的规则或配置。

运行时验收必须以 `codex plugin list --json` 中的已安装、已启用记录为准。缓存目录可能只是旧安装残留，不能证明插件或 Hook 正在生效。

如果外部提供商切换器、同步工具或脚本会整体替换 `config.toml`，先在 `/hooks` 人工批准当前四项 Hook，再启用通用配置守护器：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass `
  -File (Join-Path $plugin.installedPath 'scripts\config-guard.ps1') `
  -Mode Install
```

守护器与具体配置工具无关，不修改其数据库，也不调用模型。它每秒只比较一次配置文件的时间和大小，只有发生变化才检查插件状态；缺失时使用 `codex plugin marketplace add` 和 `codex plugin add` 恢复原生注册，然后写回用户已经批准的精确 Hook 信任记录。每次写入前都会创建同目录时间戳备份。已存在但不同的 Hook 哈希不会被覆盖，定义变化后必须重新审核。未使用配置切换工具的用户不需要安装守护器。

`Install` 自动登录启动模式目前仅支持 Windows；其他平台可以显式运行 `-Mode Repair` 做单次修复。守护器把信任记录绑定到安装时的 marketplace 来源、插件版本和 Hook 文件摘要，任一身份变化都会停止自动恢复并要求重新审核。

随后运行真实宿主烟雾验证：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass `
  -File .\plugins\codex-quality-orchestrator\scripts\runtime-smoke.ps1
```

该脚本启动一次临时只读 `codex exec` 宿主会话，并设置随机 nonce 与系统临时目录中的证明路径。SessionStart Hook 只在该环境变量存在时写入包含 nonce 的证明文件；脚本校验证明文件、Hook 事件名和 nonce，不让模型自报 Hook 状态。成功输出中的 `SessionStartHookTrust` 和 `SessionStart` 必须为 `PASS`；若模型请求因用量或认证失败但证明文件已写入，`ModelProbe` 会明确为 `UNAVAILABLE`，不能把它解释为模型调用成功。全局 Rule 16 不存在时允许插件注入 canonical 规则，规则冲突或缺少具名代理配置时失败。它不同于直接执行 Hook 脚本的单元测试。

脚本禁止使用 `--dangerously-bypass-hook-trust`，也不让模型自报 Hook 是否存在。未通过 `/hooks` 信任当前精确 SessionStart 定义时必须失败；一次性旁路只证明 Hook 在绕过信任检查后可执行，不能作为安装验收证据。

SessionStart、PreToolUse、SubagentStart 与 SubagentStop 是四项独立 Hook 定义。烟雾脚本只证明 SessionStart；必须在 `/hooks` 审核四项定义，在新任务中确认 PreToolUse 拒绝非法调用、SubagentStart 登记生命周期，并用定向宿主探针确认容量消息只续交一次。

安装器遇到已存在且符合契约的代理配置时会将其视为外部文件，不声明所有权。这种情况下安装状态文件可以不存在，不能仅据此判定安装失败；插件注册、Hook 加载和代理配置应分别核验。

## 6. 卸载生命周期

```powershell
powershell -NoProfile -ExecutionPolicy Bypass `
  -File (Join-Path $HOME '.codex\.codex-quality-orchestrator-guard\config-guard.ps1') `
  -Mode Uninstall
codex plugin remove codex-quality-orchestrator@codex-quality-orchestrator --json
powershell -NoProfile -ExecutionPolicy Bypass `
  -File .\plugins\codex-quality-orchestrator\scripts\uninstall.ps1
codex plugin marketplace remove codex-quality-orchestrator --json
```

未启用配置守护器时跳过第一条命令。

卸载器依据安装状态处理文件：

| 文件状态 | 卸载行为 |
|---|---|
| 插件创建且未修改 | 删除 |
| `-Force` 替换且未再修改 | 恢复安装前版本 |
| 用户原本已有 | 保留 |
| 安装后被用户修改 | 保留并移除 ownership 状态，后续普通安装仍按外部文件保留 |
| 所有权状态缺失 | 默认保留 |

恢复路径必须位于 `agents` 目录内，不能通过状态文件跳出目录。

## 7. 验证和打包

源码验证：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass `
  -File .\plugins\codex-quality-orchestrator\scripts\verify.ps1
```

静态验证包含 JSON、Node 与 PowerShell 语法、TOML 契约、Rule 16、会话账本、唯一工作单元、波次槽位、并发与尝试预算、SessionStart、冻结工作单路由矩阵、双 BOM 输入、一次容量续交、退役配置迁移、安装所有权、Force 恢复和锁顺序。它不代替宿主 Hook 信任验收。

打包：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass `
  -File .\plugins\codex-quality-orchestrator\scripts\package.ps1
```

打包脚本会：

1. 先验证源码。
2. 使用临时 staging 目录复制文件，并保留隐藏的 `.codex-plugin` manifest。
3. 生成单一插件根目录的 ZIP，并强制条目路径使用 `/`。
4. 解压 ZIP 后直接运行独立验证，确保成品不依赖仓库级 marketplace。
5. 拒绝反斜杠或根目录异常的 ZIP 条目并输出 SHA-256。

## 8. 发布核验

- 仓库：[9holy/codex-quality-orchestrator](https://github.com/9holy/codex-quality-orchestrator)
- 目标版本：`v0.3.2`
- Release 资产与 SHA-256 必须以该版本的 GitHub Release 页面为准。
- 发布完成只以当前提交的 Windows、Ubuntu Actions 均通过为准，不能沿用旧提交结果。
- CI 必须把 Windows 生成的发布 ZIP 交给 Ubuntu 解压并复跑独立验证，不能只验证各平台自行生成的产物。

## 9. 明确边界

- 插件不能替 Sol 判断任务语义。
- 工作单能约束 Sol 已声明的决定，但不能证明该语义决定本身正确；最终质量由 Sol 检查实际差异、复跑验证和最终审核保证。
- 会话账本使用原生 Hook 字段，不读取不稳定的 transcript；同模型并发启动时按 pending 顺序绑定 `agent_id`，用于并发释放而不判断任务内容。
- 插件不能改写已经选定的根任务模型或推理档位。
- Hook 必须被 Codex 信任并启用，否则不会执行机械拦截。
- Terra 只读复核的写入限制同时依赖工作包和宿主权限，不能把提示词当作绝对安全边界。
- 异常终止后若遗留安装锁，脚本会 fail-closed；确认没有活动安装进程后再清理锁。
