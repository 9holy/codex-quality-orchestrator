# 操作指南

## 一次任务怎样运行

当前 `gpt-5.6-sol` 始终是主控。插件不会替换已经启动任务的根模型或推理档位，而是给 Sol 一套简洁的分工规则和四个具名代理。

1. Sol 先判断任务是否值得拆分。短任务、强耦合工作和顺序执行更合适的工作由 Sol 直接完成。
2. 拆分前，Sol 写清每个单元的目标、范围、唯一文件写入者、依赖、验收标准和集成顺序。
3. 决策已经冻结、判断负荷低、结果可机械验证且 Luna 能可靠完成的单元，优先交给 Luna Max。
4. Luna 不适合时，边界清楚、需要正常判断、适合独立下派的单元优先使用 Sol Medium。
5. Terra 只有在具体任务上对质量、上下文处理、并行收益或总成本有明确优势时才使用。深推理本身不是选择 Terra 的理由。
6. 架构、安全、公共接口、生产数据、不可逆操作、模糊需求和原因尚未查清的问题留给当前 Sol 决定。
7. 所有 Worker 结果最终都回到 Sol。Sol 检查实际差异、按集成顺序重跑必要验证，然后接受、退回一次局部修正，或自己接管。

这套流程把质量裁决留在 Sol，同时把真正适合独立执行的工作交给成本更合适的模型。路由选择在当前根任务内冻结，只有工作单元、边界、可用性或结果发生变化时才重新判断。

## 普通模式

普通模式适合日常任务：

- 简单工作不创建子代理。
- 非短任务只有在下派或并行确实有净收益时才创建 Worker，默认从一个开始。
- 互不依赖、不会同时写同一文件的单元才并行。
- 大量同类工作先验收一个代表性单元，再按宿主实际容量逐步补充 Worker。
- Worker 运行时使用一次长等待，由完成事件提前唤醒，不做短间隔轮询。

## Super mode

Super mode 是大并行模式，不是降低质量标准的模式。它适合大量互不依赖、写入不冲突的工作，支持 `d1-d4` 四层拆分和最多 25 个子线程；`d4` 不能继续下派。实际同时运行数量仍由当前 Codex 宿主的可用槽位决定。

开启或关闭当前会话：

```text
开启爆种模式
关闭爆种模式
enable super mode
disable super mode
```

无论并行多少，Sol 仍负责文件所有权、依赖顺序、实际差异检查、必要验证和最终验收。

## 1M 上下文

1M 上下文是全局、可逆、默认关闭的配置开关：

```text
开启1M上下文
关闭1M上下文
enable 1M context
disable 1M context
```

开启时，插件把下面两项数字配置写入全局 `~/.codex/config.toml`；关闭时恢复开启前的原值：

```toml
model_context_window = 1000000
model_auto_compact_token_limit = 900000
```

配置不会热切换正在运行的线程。执行命令后重启 Codex，再重新打开同一个任务即可继续原历史并使用新配置。普通任务不应开启该模式。

## 失败怎样处理

子代理精确返回下面的容量提示时，插件会在原上下文自动继续一次，不重启整个任务，也不重做已经完成的工作：

```text
Selected model is at capacity. Please try a different model.
```

Luna 第二次仍因容量失败时，如果 Sol Medium 能可靠完成同一工作包，Sol 会把原工作包转给 `sol_medium_worker`，不重做已经完成的工作；否则由当前 Sol 接管。其他子代理第二次容量失败也交回 Sol。能力不足、越界或质量问题不会伪装成容量问题，也不会沿机械模型梯子逐级尝试。当前 Codex Hook 不能恢复主控自身的容量通知，因此插件只承诺子代理续交。

## 安装与升级

插件通过独立 Git Marketplace 分发，尚未进入 OpenAI 公共插件商城：

```powershell
codex plugin marketplace add 9holy/codex-routing-matrix --ref main
codex plugin add codex-routing-matrix@codex-routing-matrix
```

首次安装或升级后运行初始化：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "$HOME\.codex\.tmp\marketplaces\codex-routing-matrix\plugins\codex-routing-matrix\scripts\install.ps1"
```

macOS、Linux 桌面或 Linux 服务器上的 Codex CLI 直接运行：

```bash
node "$HOME/.codex/.tmp/marketplaces/codex-routing-matrix/plugins/codex-routing-matrix/scripts/portable-setup.cjs" install
```

初始化会安装 Luna、Sol Medium、Terra 和 Sol Reviewer 四个具名代理，维护无编号的 `Codex Routing Matrix`，并在首次安装时把英文 `Meta Rule - Conflict Resolution` 和 `Implementation` 放到 `AGENTS.md` 顶部。后两条不是守护内容，以后不会被安装器自动恢复或覆盖。

升级命令：

```powershell
codex plugin marketplace upgrade codex-routing-matrix
codex plugin add codex-routing-matrix@codex-routing-matrix
powershell -NoProfile -ExecutionPolicy Bypass -File "$HOME\.codex\.tmp\marketplaces\codex-routing-matrix\plugins\codex-routing-matrix\scripts\install.ps1"
```

macOS 或 Linux 升级时，前两条 `codex` 命令不变，最后运行上面的 Node 初始化命令。

从旧版 `codex-quality-orchestrator` 迁移时，先执行新的 Marketplace 安装命令并运行初始化脚本。确认新插件和四个新 Hook 正常后，再执行：

```powershell
codex plugin remove codex-quality-orchestrator@codex-quality-orchestrator
```

新安装器会读取旧版 `.codex-quality-orchestrator.install-state.json`，迁移代理安装状态，不会重复覆盖代理配置。

## Hook 与配置守护

在 `/hooks` 中检查并信任四个 Hook：

| Hook | 作用 |
|---|---|
| `SessionStart` | 当前上下文缺少路由规则时补充规则 |
| `UserPromptSubmit` | 识别中英文 Super mode 和 1M 上下文精确命令 |
| `PreToolUse` | 检查 CQO 具名代理调用是否符合机械配置 |
| `SubagentStop` | 处理一次子代理容量续交 |

Hook 内容升级后必须重新检查并信任，插件不会绕过信任机制。

如果 Cockpit Tools、CC Switch 等工具会替换 `config.toml`，启用配置守护：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "$HOME\.codex\.tmp\marketplaces\codex-routing-matrix\plugins\codex-routing-matrix\scripts\config-guard.ps1" -Mode Install
```

配置守护只恢复插件注册和已经批准的当前 Hook，不修改认证、Provider、端点、模型或其他工具设置。

配置守护目前只支持 Windows。macOS 或 Linux 不运行 `config-guard.ps1 -Mode Install`；核心路由和四个 Worker profile 仍可正常使用。

## 验证

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "$HOME\.codex\.tmp\marketplaces\codex-routing-matrix\plugins\codex-routing-matrix\scripts\verify.ps1"
codex plugin list --json
```

macOS 或 Linux 使用跨平台状态检查：

```bash
node "$HOME/.codex/.tmp/marketplaces/codex-routing-matrix/plugins/codex-routing-matrix/scripts/portable-setup.cjs" status
codex plugin list --json
```

macOS 或 Linux 卸载插件管理的代理配置：

```bash
node "$HOME/.codex/.tmp/marketplaces/codex-routing-matrix/plugins/codex-routing-matrix/scripts/portable-setup.cjs" uninstall
```

只有插件已安装并启用、四个代理配置各自唯一、四个 Hook 都已信任，才算安装完成。升级后新建任务，让新规则和代理配置进入上下文。
