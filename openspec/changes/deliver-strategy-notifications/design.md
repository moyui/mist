## Context

Mist 已持久化 PENDING AlertEvent，并允许外部调用 delivered/failed/ack API，但生产没有主动策略通知
worker。旧 stable spec 把 schedule scan 与外部 skill polling 混在同一 capability；新架构要求通知
成为 Signal/AlertEvent 之后的独立故障域。

旧 stable requirement `Schedule Shall Not Own Public Strategy APIs` 的标题仍符合边界，但正文却要求
`apps/schedule` 承载 strategy scan jobs。若只追加“独立 worker”要求，归档后会让冲突契约并存。

## Delivery Order

本 change 当前**明确延期实施**。这不是因为 Signal/AlertEvent 字段尚未定义，而是因为 candle、生产
订阅生命周期、realtime evaluation、backtest/runtime 和相应部署验收仍有未完成工作；现在同时展开
notification 会增加并行故障域和未决设计数量。

延期期间仅保留本 change 的 proposal/design/delta specs/tasks 作为后续边界，不启动代码、worktree、
schema migration、渠道 adapter、Compose/monitoring 或生产 secrets 工作。恢复条件固定为：

1. `run-realtime-strategy-evaluation` 已通过其 shadow/on 集成门禁，并真实产生可读取的 PENDING
   AlertEvent；不得只用 seeded fixture 或旧 manual scan 证明该条件。
2. Signal/context evidence 的实际持久化 shape 已由 realtime HIL 固定，notification 不再猜测消息字段。
3. 项目负责人根据当时剩余工作重新确认优先级，并明确恢复本 change。

满足恢复条件后，现有 AlertEvent/Signal 字段和测试 fixture 可以作为实现输入；恢复前不得借“字段已经
存在”提前决定 claim、retry、channel 或 migration。

## Goals / Non-Goals

**Goals:**

- 让 Mist-owned PENDING AlertEvent 被独立 worker 受控消费。
- 使用 channel-neutral envelope 和 channel adapters。
- 记录投递结果，同时保持 acknowledgement 独立。
- 对凭据、超时、并发和真实渠道提供可审计门禁。

**Non-Goals:**

- 不执行策略、不读取 datasource、不计算指标或 K。
- 不启用 `apps/schedule`。
- 不在未评审前新增 attempt/retry/dead-letter schema。
- 不预设首批渠道或主动 QQ/微信能力。

## Decisions

### 1. PENDING AlertEvent 是唯一输入

notifier 不监听 raw market trigger，也不重新运行 strategy。消息内容从不可变 Signal/context evidence
和受控模板构建。

### 2. 独立 worker，不借用 schedule

worker 使用独立 app/runtime boundary。具体部署是否与 strategy queue 共用基础设施必须在实施前
评审，不能从当前 Compose 推断。

遗留 requirement `Schedule Shall Not Own Public Strategy APIs` 必须显式删除，不能只用新增要求覆盖。
归档同步时，stable capability 的 Purpose 也必须重写，不再描述“completed K-line collection 后运行
scheduled scans”。其余 delivery result、Skills consumer 和 operator acknowledgement 契约继续保留。

### 3. Channel adapter 不拥有业务状态

adapter 只发送规范 envelope 并返回受控 result。delivery status 由 Mist 持久化；operator ack 不由
channel success 自动替代。

### 4. 可靠性语义暂停到逐项评审

claim/lease、并发、重试、backoff、dead-letter、provider idempotency、模板、secrets 和渠道顺序
尚未授权。必须先核实现有 schema 与真实渠道能力，再更新本 design/spec。

## Risks / Trade-offs

- [无 claim 语义导致重复发送] → 在选择消费模型前不实现并发 notifier。
- [渠道成功但状态写回失败] → 评审 provider idempotency 与 reconciliation，不宣称 exactly-once。
- [凭据泄漏] → secrets 只经部署 secret/env 边界注入，日志和 evidence 脱敏。
- [渠道不可用阻塞策略] → notifier 与 evaluation 独立 health/mode，失败不回滚 Signal。

## Migration Plan

1. 等待 Delivery Order 的三项恢复条件满足；延期期间不启动 notification 实施。
2. 恢复后重新审计 AlertEvent schema、现有 API、stable Purpose/requirements、真实 producer evidence
   和渠道条件，
   不直接沿用可能过期的当前代码假设。
3. 与用户确认首批渠道及消费/失败语义。
4. 更新 design/spec，以 REMOVED delta 删除 schedule scan owner 遗留 requirement 后再实现 worker 与 adapter。
5. 归档同步时重写 stable Purpose，并检索 living spec 中不得残留 schedule scan owner 语义。
6. 先 dry-run/shadow，再以测试接收端验证。
7. 最后执行真实渠道 HIL；失败时关闭 notifier，不回滚策略事件。

## Open Questions

- 首批渠道是 WeCom、AstrBot、微信还是受控 HTTP receiver。
- worker 通过数据库 claim、queue 还是组合 outbox 消费。
- 是否允许自动 retry、次数/backoff、dead-letter 和人工重放。
- 当前 AlertEvent schema 是否足够，是否需要新的 forward-only migration。
- 单渠道成功、多渠道部分失败的状态表达。
