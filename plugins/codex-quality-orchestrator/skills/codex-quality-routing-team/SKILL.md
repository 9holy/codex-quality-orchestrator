---
name: codex-quality-routing-team
description: 为普通非短任务执行质量优先的 Sol、Luna、Terra 路由。用于多步骤实现、跨文件修改、已定位问题的修复、测试、扫描、批处理、调研或独立验证；单个较大且边界明确、可验收、Luna Max 能可靠完成的执行单元也应触发。模糊需求、未完成诊断、架构、安全、公共接口、生产数据或不可逆操作也用本 Skill 判断保留 Sol；简单问答、状态查询和明确小改不触发。
---

# Codex 质量路由团队

1. 完整读取 `../../references/RULE16.md`。当前根代理不是 `gpt-5.6-sol` 时不要启动团队；说明下一任务应使用 Sol 主控。
2. Sol 只做冻结边界所需的调研，然后列出已知工作单元。短任务直接完成；一个有足够执行量、交接有净收益且 Luna Max 能可靠完成并客观验收的单元，直接派 1 个 `luna_worker`，不得为单个单元建立 TeamPlan。
3. 仅当 2–3 个单元互不依赖、写入不冲突且并行收益更大时建立 TeamPlan 并组队；明确每个单元的目标、所有权、交付物、验收和整合顺序。共享文件保持单写者。
4. 首次分派前读取 `../../routing-policy.json`，严格执行 `namedAgents`、`workPacket`、`forkTurns` 和容量恢复契约。`message` 必须含 `[CQO_WORK_PACKET_V1]` 以及目标、范围、写路径、验收、验证、权限、备份、`selected_agent`、`selected_effort` 和 `fallback`；不要传 `model`。
5. Luna 合格时固定优先；模糊需求、诊断未完成、架构、安全、公共接口、生产数据、不可逆操作或 Luna 能力不确定时，不得派生产 Worker，由当前 Sol 负责。仅关键高风险变更可使用只读 `sol_reviewer`；其他适合独立执行的单元才交给能胜任的 Terra 最低档位。
6. 每个单元只选模一次；仅新增单元、边界变化、执行失败或模型不可用时重判。不要为使用 Worker 切碎任务，也不要让 Worker 创建子代理。
7. Sol 检查实际差异并复跑必要验证后才能采纳结果。局部明确问题可交原 Worker 修正一次；能力不足、越界或质量不合格立即由 Sol 接管。最终裁决始终属于 Sol。
