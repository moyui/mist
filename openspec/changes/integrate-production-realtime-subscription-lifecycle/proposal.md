## Why

TDX/QMT realtime transport、subscription control 与 candle shadow HIL 已经可用，但正常 backend 在启动或重连后仍不建立生产订阅，Mist `Security.status`、provider active evidence 与 candle effective listener 没有统一 owner，QMT datasource 重启后也只能把非空 journal 一律交给人工恢复。这个断点会让生产 candle、实时策略和前端状态建立在“链路健康但没有权威订阅”的假象上，必须由独立 lifecycle change 闭环。

## What Changes

- 新增持久化 realtime subscription assignment：一只 Security 初始化后固定到一个 enabled TDX/QMT `SecuritySourceConfig`，source/providerSymbol 不再允许修改；assignment 只拥有 realtime routing，不复制 desired 状态。
- 以 `Security.status=ACTIVE` 的已分配 STOCK 集合作为唯一 authoritative desired；provider `get_subscriptions` 只提供 active evidence，不反向决定业务 desired。每 source 最多 5 个 ACTIVE assignments。
- 新增 version-first、共享 HTTP envelope 下的分页管理 API，支持完整初始化新 Security、绑定已有 source config，并返回 Security status、provider-specific active evidence 与 `converged|pending|drifted|blocked|unknown` 状态；激活/停用复用既有 `PUT /v1/securities/:code/{activate|deactivate}`，不新增 desired PATCH。
- 新增 `apps/mist` 内唯一 production lifecycle coordinator：datasource ready/reconnect 与上海时区工作日 09:15 执行 read-before-reset `get_subscriptions -> sync_subscriptions(exact ACTIVE set) -> get_subscriptions`；日内激活只以单条 `subscribe` 补入，停用不即时退订并等待下一个 destructive reset；不启用 `apps/schedule`。
- destructive unsubscribe/full replacement 只存在于 datasource 内部四方法 control implementation；Mist 公共 HTTP、frontend、CLI 和 diagnostic route 均不得暴露 raw unsubscribe/sync 或删除 assignment 的入口。
- 以 provider-specific evidence 维护 active/effective inventory：TDX 使用 fresh terminal-native list，QMT 使用 durable journal-backed registry；只有已证明 active 的 assignment 才能成为 candle effective listener，停用后在 reset 证明移除前仍按 provider 事实处理。
- **BREAKING**：`REALTIME_SUBSCRIPTION_LIFECYCLE_MODE=on` 时，ACTIVE assignments 成为唯一 desired authority，旧 `TDX_REALTIME_ALLOWLIST` / `QMT_REALTIME_ALLOWLIST` 必须为空，正常 backend 将不再保持“ready 后绝不发送 control”的旧行为。
- 扩展 QMT journal startup reconciliation：在发送 realtime ready 前重放完整 durable lifecycle；对可恢复 exact `subId` 做一次有持久证据的 best-effort unsubscribe；单项 `false`/timeout/exception 不阻止其余 cleanup 或 datasource transport 启动，但未确认取消必须阻止 replacement 并进入 monitoring/operator recovery。
- 增加低基数 lifecycle metrics、Windows mode/env/health/rollback/HIL 门禁；不因 reconciliation failure 自动重启 terminal、datasource 或整栈。
- 冻结供独立 `add-realtime-subscription-operator-ux` change 消费的 backend OpenAPI、fixtures、error codes 与 nullability；本 change 不实现 `mist-fe`。

## Capabilities

### New Capabilities

- `production-realtime-subscription-lifecycle`: 定义 immutable routing assignment、ACTIVE desired authority、管理 API、trigger-specific add/reset、active/effective 收敛、QMT startup recovery、容量和发布边界。

### Modified Capabilities

- `backend-datasource-integration`: 由 production lifecycle coordinator 在 ready/reconnect 后调用既有四方法 control interface，并按 source-specific readback 收敛。
- `qmt-native-subscription-transport`: 将完整 durable registry 改为可启动重放，并增加有 exact `subId` 的一次性 startup cancellation；歧义仍由 operator recovery 收口。
- `realtime-market-data-ingress`: snapshot authorization 与 candle listener 从静态 env allowlist 迁移到 immutable assignment + provider-confirmed effective inventory，并定义移除后的 latest cleanup。
- `realtime-source-layout`: 允许 `apps/mist` 内独立 lifecycle owner 成为唯一 production subscription mutation caller，同时继续禁止 legacy/experimental transport 与通用 scheduler。
- `mist-production-baseline`: 将“生产订阅尚未集成”替换为 mode-gated assignment、startup/reconnect、09:15、日内 add-only 与 QMT recovery 验收。
- `monitoring-health-alerts`: 增加 desired/active/convergence、deferred removal、attempt age 与 QMT startup recovery 的低基数观测。
- `windows-docker-appliance`: 增加 lifecycle mode、migration/startup 顺序、旧 allowlist 冲突门禁、source-scoped rollback 和 HIL 发布步骤。

## Impact

- `mist`：新 entity/forward-only migration/audit、HTTP DTO/VO/controller、既有 Security activate/deactivate integration、source-local coordinator、client readiness integration、effective listener 与 diagnostics/metrics。
- `mist-datasource`：QMT journal replay/recovery state machine、health/metrics、negative tests；TDX/QMT destructive reset 继续只由 datasource control implementation 所有。
- `mist-deploy`：env/defaults/Compose contract、migration/readback、health/smoke/recovery/09:15 HIL 与 rollback runbook，PowerShell 使用 `pwsh-preview`。
- `mist-monitoring`：新增低基数 metric parsing/export/alerts，不使用 providerSymbol、subId、ownerId、path 或自由文本 label。
- `mist-fe` 由独立 `add-realtime-subscription-operator-ux` change 消费本 change 冻结的 contract，不属于本 change 的实现或完成条件。
- 本 change 的原子发布集合是 backend、datasource、monitoring、deploy 和 terminal evidence；不修改 MySQL `k`、Redis candle schema、策略/通知语义、历史 provider sync 或 `apps/schedule` 职责。
