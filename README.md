# Codex Quality Orchestrator

[中文](#中文) | [English](#english)

## 中文

面向 `gpt-5.6-sol` 主控的质量优先多模型路由插件。Sol 负责理解、拆解、整合、验收和兜底；可靠的低判断执行单元优先交给 Luna Max；常规独立判断工作优先 Sol Medium；Terra 仅在具体任务上确有优势时使用，深推理本身不选择 Terra。

### 模型与职责

| 角色 | 模型 / 档位 | 用途 |
|---|---|---|
| 当前主控 | `gpt-5.6-sol` / 当前档位 | 规划、拆解、整合、验收、决策和兜底 |
| `luna_worker` | `gpt-5.6-luna / max` | 冻结、低判断、可机械验证的执行单元 |
| `sol_medium_worker` | `gpt-5.6-sol / medium` | 边界明确、需要适度判断、可独立验证的单元 |
| `terra_worker` | `gpt-5.6-terra / xhigh|max|ultra` | 相比 Sol 有明确任务优势的单元 |
| `sol_reviewer` | `gpt-5.6-sol / xhigh` | 关键高风险变更的一次只读复审 |

### 运行模式

- 普通模式：短任务由主控直接完成；通常只派一个 Worker，仅独立且写入不冲突的单元并行。
- 爆种模式：精确发送 `开启爆种模式` 开启当前会话，发送 `关闭爆种模式` 关闭。Sol 为 `d0`，允许 `d1-d4`，最多 20 个子线程；`d4` 不再下派。质量门槛不降低，所有结果仍由 Sol 审计。
- 容量恢复：`SubagentStop` 精确遇到 `Selected model is at capacity. Please try a different model.` 时，在原子代理上下文自动“继续”一次。主控容量通知不经过当前可续交 Hook，插件不伪装成已自动恢复。

插件使用四个 Hook：

- `SessionStart`：按需注入最新 Rule 16。
- `UserPromptSubmit`：只处理爆种模式精确开关，普通消息静默。
- `PreToolUse`：校验四个具名代理的确定性调用字段。
- `SubagentStop`：对子代理容量错误原地续交一次。

### 安装

```powershell
$marketplace = codex plugin marketplace add 9holy/codex-quality-orchestrator --ref main --json | ConvertFrom-Json
$plugin = codex plugin add "codex-quality-orchestrator@$($marketplace.marketplaceName)" --json | ConvertFrom-Json
powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $plugin.installedPath 'scripts\install.ps1')
```

在 `/hooks` 中信任四个 Hook 后新建任务。Cockpit Tools、CC Switch 等会覆盖 `config.toml` 时，可启用配置守护：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $plugin.installedPath 'scripts\config-guard.ps1') -Mode Install
```

### 验证

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $plugin.installedPath 'scripts\verify.ps1')
powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $plugin.installedPath 'scripts\runtime-smoke.ps1')
codex plugin list --json
```

详细说明：[操作指南](docs/OPERATING_GUIDE.md) · [路由矩阵](docs/ROUTING_MATRIX.md) · [需求基线](docs/REQUIREMENTS.md)

## English

Quality-first multi-model routing for a `gpt-5.6-sol` root. Sol owns understanding, decomposition, integration, verification, decisions, and fallback. Luna Max gets frozen low-judgment mechanical units; Sol Medium gets bounded moderate-judgment units; Terra is used only for a concrete task-specific advantage.

### Roles

| Role | Model / effort | Purpose |
|---|---|---|
| Current root | `gpt-5.6-sol` / selected effort | Plan, decompose, integrate, verify, decide, and fall back |
| `luna_worker` | `gpt-5.6-luna / max` | Frozen, low-judgment, mechanically verifiable work |
| `sol_medium_worker` | `gpt-5.6-sol / medium` | Bounded, moderate-judgment, independently verifiable work |
| `terra_worker` | `gpt-5.6-terra / xhigh|max|ultra` | Work with a clear advantage over capable Sol |
| `sol_reviewer` | `gpt-5.6-sol / xhigh` | One read-only review for critical changes |

### Modes

- Normal: the root handles short work directly; one Worker is the default, with parallelism only for independent write-safe units.
- Burst: send the exact command `开启爆种模式` to enable it for the session and `关闭爆种模式` to disable it. Sol is `d0`; children may use `d1-d4`; the host limit is 20 child threads; `d4` cannot delegate. Sol still audits every result.
- Capacity recovery: `SubagentStop` resumes the same subagent once after the exact selected-model-capacity message. Root capacity notifications are not exposed through the resumable Hook path, so the plugin does not claim automatic root recovery.

The plugin has four Hooks: `SessionStart`, `UserPromptSubmit`, `PreToolUse`, and `SubagentStop`. Ordinary prompts remain silent.

### Install and verify

Use the PowerShell commands in the Chinese installation section above, then trust all four Hooks in `/hooks` and start a new task. Use `config-guard.ps1 -Mode Install` when another tool may replace `config.toml`.

Detailed documentation: [Operating Guide](docs/OPERATING_GUIDE.en.md) · [Routing Matrix](docs/ROUTING_MATRIX.en.md) · [Requirements](docs/REQUIREMENTS.en.md)

## License

[MIT](LICENSE)
