---
name: codex-quality-orchestrator
description: 维护、安装、验证或排查 Sol、Terra、Luna 的质量优先路由插件。
---

# Codex Quality Orchestrator

仅在用户要求维护、安装、验证或排查本插件时使用。

1. `../../references/RULE16.md` 是唯一语义路由规范；读取并执行，不要在 Skill 中复述。
2. `../../routing-policy.json` 是代理名称、模型、档位和 `fork_turns` 的机械契约；只读取当前任务需要的代理模板。
3. 运行时状态以 `codex plugin list --json` 的已安装且已启用记录为准，缓存目录不是生效证据。
4. Hook 拒绝是显式配置或调用契约失败，不得静默降级。
5. 修改现有文件前按项目规则备份；修改插件后运行 `../../scripts/verify.ps1`，不能把子代理声明当作完成证据。
6. 安装并信任 Hook 后运行 `../../scripts/runtime-smoke.ps1`；它只证明 SessionStart，PreToolUse、SubagentStart 与 SubagentStop 必须分别验收。
7. 外部程序会替换 `config.toml` 时使用 `../../scripts/config-guard.ps1`；它只恢复原生插件注册和用户已批准的精确 Hook 哈希，定义变化时必须重新审核。
8. 自定义代理不能由插件原生注册；用 `../../scripts/install.ps1` 显式安装 Luna/Terra Worker 和只读 Sol reviewer，规则、代理或 Hook 变化后重新信任并新建任务。
9. 子代理已终止但未触发 SubagentStop 时，用当前 Skill 路径解析 `../../hooks/release-failed-dispatch.cjs`，传原 `task_name` 释放当前 `CODEX_THREAD_ID` 的账本记录。
