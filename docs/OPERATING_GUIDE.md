# 操作指南

## 插件如何工作

当前 Sol 始终是主控。它理解任务、拆分工作、选择合适的 Worker，并检查最终结果。插件不会改变已经启动任务的根模型或推理档位。

简单任务由当前 Sol 直接完成。较大的任务只有在边界清楚、结果容易检查且下派确实有收益时才交给 Worker：

- Luna Max：规则明确、判断少、容易验证。
- Sol Medium：边界明确，需要正常判断。
- Terra：只在具体任务上确实比 Sol 更合适时使用。
- Sol Reviewer：关键高风险改动的一次只读复审。

边界明确、需要正常判断且适合独立下派的单元优先使用 Sol Medium；深推理本身不选择 Terra。为避免重复判断和模型切换，路由选择在当前根任务内冻结，只有任务边界、可用性或结果变化时才重新选择。

架构、安全、生产数据、不可逆操作、模糊需求和未查清原因的问题留给当前 Sol 决定。

## Super mode

Super mode 适合大量互不依赖、不会修改同一文件的工作。它最多使用 25 个子线程，支持四层任务拆分。最深一层不能继续下派。

开启或关闭当前会话：

```text
开启爆种模式
关闭爆种模式
enable super mode
disable super mode
```

Super mode 只提高并行度，不降低质量标准。Sol 仍会检查每个结果、复跑必要验证并负责最终整合。

## 失败如何处理

子代理精确返回下面的容量提示时，插件会在原上下文自动继续一次，不会重做整个任务：

```text
Selected model is at capacity. Please try a different model.
```

第二次仍失败就交回 Sol。能力不足、越界或质量问题不会伪装成容量问题。当前 Codex Hook 无法替主控自动续交，因此插件不会宣称支持主控自动恢复。

## 安装

插件目前通过独立 Git Marketplace 分发，尚未进入 OpenAI 公共插件商城。

```powershell
codex plugin marketplace add 9holy/codex-quality-orchestrator --ref main
codex plugin add codex-quality-orchestrator@codex-quality-orchestrator
powershell -NoProfile -ExecutionPolicy Bypass -File "$HOME\.codex\.tmp\marketplaces\codex-quality-orchestrator\plugins\codex-quality-orchestrator\scripts\install.ps1"
```

首次初始化会：

- 安装 Luna、Sol Medium、Terra 和 Sol Reviewer 四个代理配置。
- 写入无编号的 `Codex Quality Routing`。
- 在 `AGENTS.md` 顶部加入一次性的英文 `Meta Rule - Conflict Resolution` 和 `Implementation`。

最后两条英文默认规则以后不会被安装器或配置守护恢复、覆盖。

## Hook 与配置守护

在 `/hooks` 中检查并信任以下四个 Hook：

- `SessionStart`：缺少当前路由规则时补充上下文。
- `UserPromptSubmit`：识别中文和英文 Super mode 命令。
- `PreToolUse`：检查 CQO 代理调用是否符合配置。
- `SubagentStop`：处理一次子代理容量重试。

Hook 内容升级后必须重新检查并信任。插件不会绕过信任。

如果 Cockpit Tools、CC Switch 等工具会覆盖 `config.toml`，启用配置守护：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "$HOME\.codex\.tmp\marketplaces\codex-quality-orchestrator\plugins\codex-quality-orchestrator\scripts\config-guard.ps1" -Mode Install
```

配置守护只恢复插件注册和已经批准的 Hook，不改认证、Provider、端点、模型或其他工具设置。

## 验证

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "$HOME\.codex\.tmp\marketplaces\codex-quality-orchestrator\plugins\codex-quality-orchestrator\scripts\verify.ps1"
codex plugin list --json
```

看到插件已安装并启用、四个代理配置唯一、四个 Hook 已信任，才算安装完成。升级后请新建任务，让新的规则和代理配置生效。
