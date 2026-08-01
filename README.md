# Codex Quality Orchestrator

面向 Codex 团队开发的质量优先路由插件。Sol 负责规划、拆解、整合、最终验收和必要兜底；Luna Max 优先并行消化清晰执行量，Terra 处理判断型工作和关键只读复核，Hook 负责机械契约、会话账本与一次容量续交。

## 路由原则

```mermaid
flowchart LR
    A[用户任务] --> B{短任务?}
    B -->|是| C[当前主代理直接完成]
    B -->|否| D[Sol high 默认主控]
    D --> E{高风险或关键裁决?}
    E -->|是| F[Sol max]
    E -->|否| G{工作包清晰且 Luna 可胜任?}
    G -->|是| H[Luna Max 并行执行]
    G -->|否| M{Terra 可胜任?}
    M -->|是| N[Terra xhigh 或 max 执行]
    M -->|否| O[当前 Sol 直接兜底]
    H --> I[Sol 检查差异并复跑验证]
    N --> I
    O --> I
    I --> J{关键变更?}
    J -->|是| K[Terra Max 只读复核]
    J -->|否| L[Sol 最终验收]
    K --> L
```

质量、胜任能力和风险边界是硬约束；满足后按预计总算力成本选择最低者，计入重试、返工和复核。Sol 先做语义判断并冻结工作单；Hook 不猜任务难度，只校验明文路由键、调用参数、账本和确定性的容量续交。

短任务必须同时无歧义、低风险、无需方案选择或诊断、上下文很少且可直接验证；规模只能辅助判断。对非短任务，Sol 按完整工作单元最高要求匹配：边界冻结、可独立验收且可靠胜任的清晰工作优先交给 Luna Max，包括中大型实现、多文件修改、常规调试、测试、扫描和批量工作；需要消歧、根因诊断、跨上下文推断或疑难调试时使用 Terra；架构、安全、生产数据、全局集成和最终裁决保留给 Sol。无法安全下派时由当前 Sol 直接接管，不创建 Sol 子代理。

`Sol / high` 是常规团队开发的建议根档位，`xhigh` 用于复杂规划与整合，`max` 用于高风险裁决，`ultra` 只用于极少数系统性多波次任务。根任务模型和档位在插件运行前确定，Hook 不能改写已启动任务。

完整矩阵见 [docs/ROUTING_MATRIX.md](docs/ROUTING_MATRIX.md)。

## 包含内容

- `SessionStart` Hook：加载精简 Rule 16，并检测全局规则冲突。
- `PreToolUse` Hook：校验冻结工作单、具名代理、波次、尝试次数、模型覆盖、推理档位和 `fork_turns`。
- `SubagentStart` Hook：登记原生 Worker 生命周期，维护并发槽位。
- `SubagentStop` Hook：容量提示首次出现时自动向原子代理提交一次“继续”。
- 两个代理模板：`terra_worker`、`luna_worker`。
- 显式安装、卸载、验证和打包脚本。
- 静态路由矩阵测试不产生模型调用费用；运行时烟雾验证会启动一次临时只读宿主会话。

## 安装

从 GitHub 安装，不依赖当前工作目录或 CC Switch：

```powershell
$install = codex plugin marketplace add 9holy/codex-quality-orchestrator --ref main --json | ConvertFrom-Json
$plugin = codex plugin add "codex-quality-orchestrator@$($install.marketplaceName)" --json | ConvertFrom-Json
powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $plugin.installedPath 'scripts\install.ps1')
codex plugin list --json
```

安装脚本只安装具名代理配置。已有配置满足关键契约时保持不动；存在冲突时默认停止且不修改任何文件。只有明确确认后才使用 `-Force`，脚本会先建立同目录时间戳备份再替换。

安装插件后，在 Codex CLI 中使用 `/hooks` 审核并信任插件 Hook，然后新建任务。现有任务不会热加载新的 Rule 16 或代理配置。

`codex plugin list --json` 必须显示插件已经安装且启用；仅有 `~/.codex/plugins/cache` 目录不能证明插件或 Hook 正在生效。

如果任何提供商切换器、同步工具或脚本会整体替换 `config.toml`，可在人工信任四项 Hook 后启用通用配置守护器：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $plugin.installedPath 'scripts\config-guard.ps1') -Mode Install
```

守护器不依赖具体切换工具，也不调用模型。它只在 `config.toml` 变化后检查状态，缺失时通过原生 `codex plugin` 命令恢复 marketplace 和插件启用项，并恢复用户已经批准的精确 Hook 哈希；Hook 定义变化或哈希冲突时会停止恢复并要求重新审核。无需切换配置的用户不必启用它。

自动随登录启动的 `Install` 模式目前仅支持 Windows；`Repair` 单次修复模式可在装有 PowerShell 的其他平台使用。

安装并信任 Hook 后，运行真实宿主烟雾验证。该命令启动一次临时只读 `codex exec`，由 SessionStart Hook 将随机 nonce 写入受限于系统临时目录的证明文件；脚本只校验证明文件，不让模型自报 Hook 状态。成功时返回 `SessionStartHookTrust=PASS` 和 `SessionStart=PASS`，发现全局 Rule 16 冲突或缺少具名代理配置时会失败：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\plugins\codex-quality-orchestrator\scripts\runtime-smoke.ps1
```

烟雾脚本不会使用 `--dangerously-bypass-hook-trust`。当前 SessionStart 定义尚未通过 `/hooks` 持久信任、定义已变化或 Hook 未加载时，验证必须失败。该结果不证明 PreToolUse、SubagentStart 或 SubagentStop 已信任；必须在 `/hooks` 审核四项定义，并分别确认非法代理调用被拒绝、生命周期被登记和容量消息只自动续交一次。

插件系统目前不会从插件包原生注册自定义代理，因此显式运行安装脚本是必要步骤；Hook 不会静默写入 `~/.codex`。

## 验证

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\plugins\codex-quality-orchestrator\scripts\verify.ps1
```

Worker 的 `task_name` 使用 `<单元>__w<波次>__s<槽位>of<波次大小>__a<尝试>` 明文路由键；宿主会在 Hook 前加密 `message`，因此消息里的工作单供 Worker 阅读和 Sol 验收，Hook 不宣称能解析其中的 JSON。静态验证包括 JSON、Node 与 PowerShell 语法、manifest、TOML 代理契约、Rule 16、会话路由账本、生命周期、并发与尝试上限、SessionStart、Worker 路由、一次容量续交和安装迁移。在源码仓库中还会校验 marketplace；静态验证不等于宿主已加载 Hook，安装后仍须完成真实宿主验收。

## 打包

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\plugins\codex-quality-orchestrator\scripts\package.ps1
```

产物写入 `dist/codex-quality-orchestrator-<version>.zip`，打包脚本会强制使用可移植的 `/` 条目路径，拒绝反斜杠条目，解压成品并复跑独立验证，然后输出 SHA-256。

## 卸载

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $HOME '.codex\.codex-quality-orchestrator-guard\config-guard.ps1') -Mode Uninstall
codex plugin remove codex-quality-orchestrator@codex-quality-orchestrator --json
powershell -NoProfile -ExecutionPolicy Bypass -File .\plugins\codex-quality-orchestrator\scripts\uninstall.ps1
codex plugin marketplace remove codex-quality-orchestrator --json
```

未启用配置守护器时跳过第一条命令。代理卸载脚本依据安装状态只处理插件真正创建或替换的配置。插件创建且未修改的文件会删除；`-Force` 替换且未再修改的文件会恢复安装前版本；用户原有或安装后修改过的配置会保留。

## 安全边界

- 运行时 Hook 不联网、不上传数据、不收集遥测；只读取插件策略、本地代理配置和全局 `AGENTS.md` 中的 Rule 16 片段。
- 安装脚本会写入具名代理配置；只有用户显式启用的配置守护器会额外写入自身状态、Windows 启动项和带备份的 `config.toml` 注册项。
- 守护器本身不调用模型；恢复本地 marketplace 不联网，恢复 Git marketplace 时会由原生 `codex plugin marketplace add` 访问已记录的 Git 来源。
- `codex-auto-review / low` 是 Codex 系统权限审查，不属于本插件的工作模型矩阵。

## 许可证

[MIT](LICENSE)

## 完整操作说明

模型矩阵、调用契约、Hook 边界、安装所有权、卸载恢复、验证和发布流程见 [docs/OPERATING_GUIDE.md](docs/OPERATING_GUIDE.md)。
