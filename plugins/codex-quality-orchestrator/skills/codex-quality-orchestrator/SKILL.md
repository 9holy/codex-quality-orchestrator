---
name: codex-quality-orchestrator
description: 维护、安装、验证或排查 Sol、Terra、Luna 的质量优先路由插件。
---

# Codex Quality Orchestrator

1. 以 `../../references/RULE16.md` 为唯一语义路由规范，以 `../../routing-policy.json` 为机械契约。
2. 生效状态只以 `codex plugin list --json` 的已安装且已启用记录、当前三个可信 Hook 和 `~/.codex/agents` 中唯一代理配置为准。
3. 修改前按项目规则备份；修改后运行 `../../scripts/verify.ps1`，安装后运行 `../../scripts/runtime-smoke.ps1`。
4. 用 `../../scripts/install.ps1` 安装代理配置和 Rule 16；外部程序会替换 `config.toml` 时使用 `../../scripts/config-guard.ps1`，它只能合并插件自己的注册和可信 Hook。
5. 不得把任务名、工作包文字、单元测试或子代理声明单独当作实际模型调用证据。
