---
name: codex-quality-routing-team
description: 为普通非短任务执行质量优先的 Sol、Luna、Terra 路由。用于多步骤实现、跨文件修改、已定位问题的修复、测试、扫描、批处理、调研或独立验证；单个较大且边界明确、可验收、Luna Max 能可靠完成的执行单元也应触发。模糊需求、未完成诊断、架构、安全、公共接口、生产数据或不可逆操作也用本 Skill 判断保留 Sol；简单问答、状态查询和明确小改不触发。
---

# Codex 质量路由团队

1. 以当前上下文中的 Rule 16 为唯一语义规则；已加载时不得再次读取或复述。仅缺失时读取 `../../references/RULE16.md`。根代理不是 `gpt-5.6-sol` 时不启动团队。
2. 按 Rule 16 列出工作单元并确定 Luna 是否适用。首次实际分派前读取 `../../routing-policy.json`，严格执行 `namedAgents`、`workPacket`、`forkTurns` 和容量恢复契约。`message` 必须含 `[CQO_WORK_PACKET_V1]` 以及目标、范围、写路径、验收、验证、权限、备份、`selected_agent`、`selected_effort` 和 `fallback`；不要传 `model`。
3. Luna 适用或只有一个能胜任候选时不读取 Radar。仅 Luna 不适用且同时存在多个能胜任候选时，从当前 Skill 路径解析并运行一次 `node ../../hooks/radar-routing-evidence.cjs`；只在这些候选间使用返回的 `[CQO_RADAR]`，没有新鲜数据就由 Sol 判断。
4. 分派、并行、重试、验收和兜底完全执行 Rule 16，不增加第二套路由规则。
