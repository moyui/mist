## Context

Mist 已持久化 PENDING AlertEvent，并允许外部调用 delivered/failed/ack API，但生产没有主动策略通知
worker。旧 stable spec 把 schedule scan 与外部 skill polling 混在同一 capability；新架构要求通知
成为 Signal/AlertEvent 之后的独立故障域。

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

1. 审计 AlertEvent schema、现有 API、notification worktree 和真实渠道条件。
2. 与用户确认首批渠道及消费/失败语义。
3. 更新 design/spec 后再实现 worker 与 adapter。
4. 先 dry-run/shadow，再以测试接收端验证。
5. 最后执行真实渠道 HIL；失败时关闭 notifier，不回滚策略事件。

## Open Questions

- 首批渠道是 WeCom、AstrBot、微信还是受控 HTTP receiver。
- worker 通过数据库 claim、queue 还是组合 outbox 消费。
- 是否允许自动 retry、次数/backoff、dead-letter 和人工重放。
- 当前 AlertEvent schema 是否足够，是否需要新的 forward-only migration。
- 单渠道成功、多渠道部分失败的状态表达。
