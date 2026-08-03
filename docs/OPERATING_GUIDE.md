# 操作指南

## 1. 决策流程

1. 短任务由当前主代理直接完成。
2. 非短任务由当前 Sol 理解并列出可独立验收的工作单元。
3. Luna Max 能可靠完成且下派有净收益时优先使用 Luna。
4. Luna 不适用时，由当前 Sol 处理，或把独立深推理单元交给能胜任的 Terra 最低档位。
5. 通常使用一个 Worker；仅互不依赖、写入不冲突且确有收益的单元并行。大量同质批处理先验收一个代表性单元，再填满宿主可用容量，完成一个就补充一个；不设置任务级累计上限。
6. Worker 运行且 Sol 没有可独立推进的工作时，使用一次最长一小时的原生阻塞等待；结果、失败或求助会提前唤醒，禁止主动轮询和重复短等待。
7. Sol 检查实际差异、复跑必要验证并作最终裁决。

架构、安全、公共接口、生产数据、不可逆操作、模糊需求和根因未定的诊断不为了节省成本强行下派。关键高风险变更需要独立复审时，才使用一次只读 `sol_reviewer`。

## 2. 工作包

```text
[CQO_WORK_PACKET_V1]
route: <model> / <effort>
目标: <明确结果>
范围: <边界以及允许读取和修改的路径>
验收: <可执行或可观察标准>
```

默认 `fork_turns:"none"`；只有 Worker 确实需要少量历史上下文时才传正整数字符串。调用具名代理时不传 `model`。Terra 必须显式传 `xhigh`、`max` 或 `ultra`；Luna 和 Reviewer 的档位由 TOML 固定。

宿主会加密工作包正文后再交给 PreToolUse，因此 Hook 不解析 `message` 内容。Sol 负责工作包语义；Hook 通过下面的明文任务名校验实际代理和档位：

```text
luna_max__unit_name
terra_xhigh__unit_name
terra_max__unit_name
terra_ultra__unit_name
sol_reviewer_xhigh__unit_name
```

## 3. 三个 Hook

### SessionStart

全局 Rule 16 一致且代理配置完整时不输出内容。规则缺失或过期时注入插件当前版本；代理配置缺失时明确报告。它不读取或修改当前根模型和档位。

### PreToolUse

只在调用 `luna_worker`、`terra_worker` 或 `sol_reviewer` 时检查：

- 代理配置是否存在并固定正确模型
- Terra 档位是否为 `xhigh/max/ultra`
- Luna 和 Reviewer 是否被非法覆盖档位
- 是否传入 `model`
- `fork_turns` 是否有效
- 可见任务名是否与代理和实际档位一致

其他代理调用直接放行，避免与别的插件或 Skill 冲突。

### SubagentStop

仅当最后消息去除首尾空白后精确等于：

```text
Selected model is at capacity. Please try a different model.
```

且 `stop_hook_active=false` 时返回“继续”。续交发生在原代理上下文；第二次不再拦截，交回当前 Sol。

## 4. Radar

Luna 适用或候选唯一时不运行 Radar。仅 Luna 不适用且存在多个能胜任候选时运行：

```powershell
node <plugin-root>\scripts\radar-routing-evidence.cjs
```

数据默认缓存 24 小时，离线时最多使用 72 小时内的缓存。只输出允许模型的聚合数字和简短排序，不把外部任务标题或推荐文案放入模型上下文。Radar 只是候选间的辅助证据，不能覆盖可靠胜任要求。

## 5. 安装与升级

运行 `scripts/install.ps1` 安装三个代理配置和 Rule 16。安装器先获取锁，再检查所有目标；冲突时默认停止，`-Force` 才会在备份后替换。代理备份使用 `.toml.bak`，不会被 Codex 当成第二个角色加载。

升级后必须重新审核三个 Hook，因为可信哈希随实现变化。旧任务不会自动加载新 Skill 和代理定义，应新建任务验证。

## 6. 配置守护

`config-guard.ps1` 只管理：

- 插件注册
- 三个已批准 Hook 的精确可信哈希
- 插件 Marketplace 的已知来源

它采用合并写入并保留其他 TOML 内容，不替换认证、Provider、端点、模型或其他工具的设置。Hook bundle 与批准摘要不一致时停止恢复，要求重新审核。

## 7. 验收标准

发布前必须满足：

- 完整 `verify.ps1` 通过
- 临时 `CODEX_HOME` 中安装、重复安装和冲突恢复通过
- Cockpit 风格配置整体替换后，非插件配置保持不变且三个 Hook 恢复
- 当前安装只有三个唯一角色和三个可信 Hook
- 真实 SessionStart 宿主烟雾测试通过
- 至少一次 Luna Max 主线路由在 Codex 使用记录中可核对

单元测试、任务名或代理自述都不能单独证明实际后台模型。
