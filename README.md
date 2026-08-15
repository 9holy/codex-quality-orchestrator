# Codex Quality Orchestrator

[中文](#中文) | [English](#english)

## 中文

这是一个给 `gpt-5.6-sol` 使用的多模型协作插件。Sol 负责理解任务、拆分工作和最终验收；适合的执行工作交给 Luna Max、Sol Medium 或 Terra。常规独立判断工作优先 Sol Medium，深推理本身不选择 Terra。目标是先保证质量，再减少不必要的模型开销。

当前版本：[`v0.7.1`](https://github.com/9holy/codex-quality-orchestrator/releases/tag/v0.7.1)

### 模型分工

| 角色 | 用途 |
|---|---|
| 当前 Sol | 规划、拆分、整合、验收和兜底 |
| Luna Max | 规则明确、判断少、容易验证的工作 |
| Sol Medium | 边界清楚、需要正常判断的独立工作 |
| Terra XHigh / Max / Ultra | 只在具体任务上确实比 Sol 更合适时使用 |
| Sol Reviewer XHigh | 关键高风险改动的一次只读复审 |

### 两种模式

- 普通模式：短任务由当前 Sol 直接完成；通常只使用一个 Worker。
- Super mode：用于大量互不冲突的工作，最多同时使用 25 个子线程。Sol 仍会检查全部结果，质量标准不会降低。

开启或关闭当前会话的 Super mode：

```text
开启爆种模式
关闭爆种模式
enable super mode
disable super mode
```

### 安装

本插件尚未进入 OpenAI 公共插件商城。新用户先添加这个 Git Marketplace，再安装插件：

```powershell
codex plugin marketplace add 9holy/codex-quality-orchestrator --ref main
codex plugin add codex-quality-orchestrator@codex-quality-orchestrator
```

首次安装后运行初始化脚本：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "$HOME\.codex\.tmp\marketplaces\codex-quality-orchestrator\plugins\codex-quality-orchestrator\scripts\install.ps1"
```

初始化会安装四个代理配置，并写入无编号的 `Codex Quality Routing`。它还会在 `AGENTS.md` 顶部加入一次性的英文 `Meta Rule - Conflict Resolution` 和 `Implementation`；以后不会自动恢复或覆盖这两条。

在 `/hooks` 中检查并信任四个 Hook，然后新建任务。插件升级后如果 Hook 内容改变，需要重新信任。

如果 Cockpit Tools、CC Switch 等工具会覆盖 `config.toml`，再启用配置守护：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "$HOME\.codex\.tmp\marketplaces\codex-quality-orchestrator\plugins\codex-quality-orchestrator\scripts\config-guard.ps1" -Mode Install
```

### 升级

```powershell
codex plugin marketplace upgrade codex-quality-orchestrator
codex plugin add codex-quality-orchestrator@codex-quality-orchestrator
powershell -NoProfile -ExecutionPolicy Bypass -File "$HOME\.codex\.tmp\marketplaces\codex-quality-orchestrator\plugins\codex-quality-orchestrator\scripts\install.ps1"
```

详细说明：[操作指南](docs/OPERATING_GUIDE.md) · [路由矩阵](docs/ROUTING_MATRIX.md) · [需求基线](docs/REQUIREMENTS.md)

## English

This plugin gives a `gpt-5.6-sol` root a small model team. Sol understands the task, splits the work, checks every result, and handles anything that should not be delegated. Luna Max, Sol Medium, and Terra receive only work they can reliably complete. Quality comes first; cost savings come from avoiding unnecessarily expensive routes.

Current release: [`v0.7.1`](https://github.com/9holy/codex-quality-orchestrator/releases/tag/v0.7.1)

### Model roles

| Role | Purpose |
|---|---|
| Current Sol | Plan, split, integrate, verify, and fall back |
| Luna Max | Clear, low-judgment work with straightforward checks |
| Sol Medium | Bounded independent work that needs normal judgment |
| Terra XHigh / Max / Ultra | Use only when the specific task clearly favors Terra |
| Sol Reviewer XHigh | One read-only review for a critical high-risk change |

### Modes

- Normal mode: the current Sol handles short work directly and normally uses one Worker.
- Super mode: runs independent, write-safe work in parallel with up to 25 child threads. Sol still checks every result and keeps the same quality bar.

Toggle Super mode for the current session with an exact command:

```text
enable super mode
disable super mode
开启爆种模式
关闭爆种模式
```

### Install

The plugin is not yet listed in OpenAI's public plugin marketplace. Add its Git Marketplace once, then install it:

```powershell
codex plugin marketplace add 9holy/codex-quality-orchestrator --ref main
codex plugin add codex-quality-orchestrator@codex-quality-orchestrator
```

Run the first-install setup:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "$HOME\.codex\.tmp\marketplaces\codex-quality-orchestrator\plugins\codex-quality-orchestrator\scripts\install.ps1"
```

Setup installs four agent profiles and the unnumbered `Codex Quality Routing` section. It also adds one-time English `Meta Rule - Conflict Resolution` and `Implementation` defaults at the top of `AGENTS.md`; later installs do not restore or overwrite them.

Review and trust all four Hooks in `/hooks`, then start a new task. Review them again after an update changes Hook content.

Use `config-guard.ps1 -Mode Install` only when another tool may replace `config.toml`.

Detailed documentation: [Operating Guide](docs/OPERATING_GUIDE.en.md) · [Routing Matrix](docs/ROUTING_MATRIX.en.md) · [Requirements](docs/REQUIREMENTS.en.md)

## License

[MIT](LICENSE)
