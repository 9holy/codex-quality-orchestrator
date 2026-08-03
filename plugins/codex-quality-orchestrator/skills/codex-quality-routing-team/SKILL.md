---
name: codex-quality-routing-team
description: 为普通非短任务执行质量优先的 Sol、Luna、Terra 路由。用于多步骤实现、跨文件修改、已定位问题的修复、测试、扫描、批处理、调研、独立验证或边界明确且可验收的较大单元；简单问答、状态查询和明确小改不触发。模糊需求、未完成诊断、架构、安全、公共接口、生产数据或不可逆操作也使用本 Skill 判断保留 Sol。
---

# Codex 质量路由团队

1. 执行当前上下文中的 Rule 16；已加载时不再读取。缺失时读取 `../../references/RULE16.md`。根代理不是 `gpt-5.6-sol` 时不启动团队，也不声称 Sol 正在主控。
2. 先列出可独立验收的工作单元，再按 Rule 16 判断是否下派。首次分派前读取一次 `../../routing-policy.json`。通常派一个 Worker；只有二至三个独立且写入不冲突的单元才并行。
3. 调用 `spawn_agent` 时显式传 `agent_type`、`task_name` 和 `fork_turns`；默认 `fork_turns:"none"`，只有确需继承上下文时传正整数字符串。`terra_worker` 另传 `reasoning_effort`，任何具名代理都不传 `model`。
4. `task_name` 使用 `<route>__<unit>`，例如 `luna_max__update_tests`。`message` 使用以下最小工作包，每项必须非空，范围中写明允许读取和修改的路径：

```text
[CQO_WORK_PACKET_V1]
route: <model> / <effort>
目标: <结果>
范围: <边界和路径>
验收: <可执行或可观察标准>
```

5. Luna 适用或只有一个能胜任候选时不读取 Radar。仅 Luna 不适用且存在多个能胜任候选时运行一次 `node ../../scripts/radar-routing-evidence.cjs`，只在这些候选间使用新鲜 `[CQO_RADAR]`。
6. 等待 Worker 完成后检查实际差异并复跑必要验证；失败由当前 Sol 按 Rule 16 接管，不创建执行型 Sol 子代理。
