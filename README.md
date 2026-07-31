# Codex Quality Orchestrator

面向 Codex 子代理的质量优先路由插件。它让 Sol 负责语义判断与最终验收，使用 Hook 机械限制模型、推理档位和 `fork_turns`，并为关键变更提供独立只读审核。

## 路由原则

```mermaid
flowchart LR
    A[用户任务] --> B{短任务?}
    B -->|是| C[当前主代理直接完成]
    B -->|否| D[Sol xhigh 默认统筹]
    D --> E{高风险或关键裁决?}
    E -->|是| F[Sol max]
    E -->|否| G{目标模型能可靠胜任?}
    G -->|否| D
    G -->|是| H[Terra 或 Luna 执行]
    H --> I[Sol 检查差异并复跑验证]
    I --> J{关键变更?}
    J -->|是| K[sol_reviewer 只读审核]
    J -->|否| L[Sol 最终验收]
    K --> L
```

质量与胜任能力优先于速度和成本。Hook 不判断任务语义，也不会自动选择模型；它只拒绝违反已确认边界的调用。

完整矩阵见 [docs/ROUTING_MATRIX.md](docs/ROUTING_MATRIX.md)。

## 包含内容

- `SessionStart` Hook：加载精简 Rule 16，并检测全局规则冲突。
- `PreToolUse` Hook：校验具名代理、模型覆盖、推理档位和 `fork_turns`。
- 三个代理模板：`terra_worker`、`luna_worker`、`sol_reviewer`。
- 显式安装、卸载、验证和打包脚本。
- 无模型路由矩阵测试，不产生模型调用费用。

## 本地安装

在仓库根目录执行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\plugins\codex-quality-orchestrator\scripts\install.ps1
codex plugin marketplace add .
codex plugin add codex-quality-orchestrator@codex-quality-orchestrator --json
```

安装脚本只安装具名代理配置。已有配置满足关键契约时保持不动；存在冲突时默认停止且不修改任何文件。只有明确确认后才使用 `-Force`，脚本会先建立同目录时间戳备份再替换。

安装插件后，在 Codex CLI 中使用 `/hooks` 审核并信任插件 Hook，然后新建任务。现有任务不会热加载新的 Rule 16 或代理配置。

插件系统目前不会从插件包原生注册自定义代理，因此显式运行安装脚本是必要步骤；Hook 不会静默写入 `~/.codex`。

## 验证

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\plugins\codex-quality-orchestrator\scripts\verify.ps1
```

验证内容包括 JSON、Node 语法、manifest、TOML 代理契约、Rule 16 一致性，以及完整允许/拒绝路由矩阵。在源码仓库中还会校验 marketplace；在独立插件目录中不依赖仓库外文件。

## 打包

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\plugins\codex-quality-orchestrator\scripts\package.ps1
```

产物写入 `dist/codex-quality-orchestrator-<version>.zip`，打包脚本会解压成品并复跑独立验证，然后输出 SHA-256。

## 卸载

```powershell
codex plugin remove codex-quality-orchestrator@codex-quality-orchestrator --json
powershell -NoProfile -ExecutionPolicy Bypass -File .\plugins\codex-quality-orchestrator\scripts\uninstall.ps1
codex plugin marketplace remove codex-quality-orchestrator --json
```

卸载脚本依据安装状态只处理插件真正创建或替换的配置。插件创建且未修改的文件会删除；`-Force` 替换且未再修改的文件会恢复安装前版本；用户原有或安装后修改过的配置会保留。

## 安全边界

- 不联网、不上传数据、不收集遥测。
- Hook 只读取插件策略、本地代理配置和全局 `AGENTS.md` 中的 Rule 16 片段，用于一致性检查；不会上传数据。
- 安装脚本是唯一写入用户 Codex 配置的组件，必须由用户显式运行。
- `codex-auto-review / low` 是 Codex 系统权限审查，不属于本插件的工作模型矩阵。

## 许可证

[MIT](LICENSE)

## 完整操作说明

模型矩阵、调用契约、Hook 边界、安装所有权、卸载恢复、验证和发布流程见 [docs/OPERATING_GUIDE.md](docs/OPERATING_GUIDE.md)。
