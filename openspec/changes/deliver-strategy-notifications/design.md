## Context

Mist 已持久化 PENDING AlertEvent（生产 `REALTIME_STRATEGY_MODE=on`，2026-08-12 实证盘中持续产出），并允许
外部调用 delivered/failed/ack API 回写状态，但生产没有主动策略通知 worker，16 条 PENDING 积压即现状。
本 change 的通知层是 Signal/AlertEvent 之后的独立故障域。

## Delivery Order

本 change 已于 2026-08-07 解除延期（on-HIL 通过、真实 PENDING AlertEvent 产出、owner 恢复三条件满足），
并于 2026-08-12 完成现状审计与逐项评审，所有可靠性决策已由 owner 拍板（见 Decisions）。审计确认：

- AlertEvent entity/table/producer 均在，stable；生产盘中持续产出真实 PENDING 事件（非 fixture）。
- 代码层 `apps/schedule` 已是 market-data collector，不碰 strategy scan/Signal/AlertEvent，且未部署。
- stable capability `strategy-scheduler-alert-delivery` 的 Purpose 与 requirement body 已被 `8554702`
  改写，"schedule 承载 scan" 的表述已不存在——因此本 change 不再需要 REMOVED delta，改为仅 ADDED
  proactive-delivery 归属 requirement。

## Goals / Non-Goals

**Goals:**

- 让 Mist-owned PENDING AlertEvent 被独立 BullMQ worker 受控消费。
- 使用 channel-neutral envelope 与直接对接 QQ/微信 SDK 的 channel adapters。
- per-channel 记录投递结果，acknowledgement 独立。
- at-least-once + 幂等 + 有界重试 + dead-letter + 人工重放。

**Non-Goals:**

- 不执行策略、不读 datasource、不计算指标或 K。
- 不启用 `apps/schedule`。
- 不承诺 exactly-once。
- 不经 AstrBot / mist-skills 投递。
- 不在本 change 修改 AlertEvent 主状态枚举（聚合结果复用现有 PENDING/DELIVERED/FAILED/ACKED）。

## Decisions

### 1. PENDING AlertEvent 是唯一输入

notifier 不监听 raw market trigger，不重新运行 strategy。消息内容从不可变 Signal/context evidence
与受控模板构建。

### 2. BullMQ sibling queue，不借用 schedule，不强求 outbox

worker 是独立 app `apps/notification`，消费专用 queue `strategy-alert-delivery`（复用现有 Redis）。
producer（`apps/signal` 的 `LiveStrategyPersistenceService`）在 AlertEvent commit 后入队。BullMQ 原生
承载 retry/backoff/dead-letter。Mist 规模（个人 A 股、每日信号有限）下 producer 同进程入队的
dual-write 窗口可接受；transactional outbox 作为后续可选强化，不在首批引入。

### 3. at-least-once + 幂等，不追求 exactly-once

业界共识（Svix/Novu/Stripe/outbox）：跨网络边界 exactly-once 不可行。幂等靠 BullMQ `jobId=alertEventId`
+ AlertEvent 既有 `dedupeKey`；channel adapter 对同 AlertEvent 重复发送容忍。

### 4. 有界重试 + dead-letter + 人工重放

重试参数面向交易告警价值衰减定制（不像 Svix 的 24h/8 次面向不可控 webhook）：单次 SDK 超时 ~10s，
5 次指数退避（~5s→30s→2m→10m→30m），耗尽入 dead-letter；提供 replay 不重跑策略。具体数值在实施计划
最终敲定。

### 5. 拆表：独立 delivery 记录，per-channel fan-out

新增 migration 018 + delivery 记录表（如 `strategy_alert_deliveries`：alertEventId、channel、status、
attempt_count、last_error、provider_message_id、sent_at 等）。QQ/微信各自一行；AlertEvent 主状态表达
聚合结果（全渠道成功→DELIVERED；任一渠道 dead-letter→FAILED），不新增枚举值。

### 6. Channel adapter 直接对接 QQ/微信 SDK

不经 AstrBot / mist-skills。adapter 发送规范 envelope，返回 bounded result（sent/failed/transient），
凭据只经部署 secret/env 注入，日志/evidence 脱敏。

### 7. 独立故障域

notifier 与 evaluation 独立 health/mode；delivery 失败不回滚 Signal/AlertEvent，不阻塞 candle/transport。

## Risks / Trade-offs

- [dual-write 窗口丢 1 条] → Mist 规模可接受；后续可叠 outbox。
- [渠道成功但状态写回失败] → at-least-once + 幂等 + per-channel 记录；不宣称 exactly-once。
- [凭据泄漏] → secrets 只经部署边界注入；日志脱敏。
- [渠道不可用阻塞策略] → notifier 独立 health/mode，失败不回滚。
- [QQ/微信协议稳定性] → 个人微信无官方 bot API，需灰协议；具体协议/库选择（企业微信 vs 个人微信、
  NapCat vs 官方 QQ bot）在实施计划阶段确认，可能影响可用性与维护成本。

## Migration Plan

1. 实施 `apps/notification` worker + BullMQ producer 入队 + delivery 记录表（migration 018）+ QQ/微信
   adapter。
2. dry-run / shadow：受控接收端验证 fan-out、幂等、result writeback。
3. 真实渠道 HIL：凭据脱敏条件下 success/failure/restart 验证。
4. 失败时关闭 notifier，不回滚策略事件。
5. 归档同步：检索 living spec 确认无 schedule-scan-owner 残留语义；stable Purpose 已由 `8554702`
   对齐，无需重写。

## Implementation Planning Items（留到实施计划阶段确认，不阻塞 spec）

- QQ/微信具体协议与库选择（个人微信 vs 企业微信；NapCat vs 官方 QQ bot API）。
- delivery 记录 worker 写入路径（直连 MySQL vs 回调 backend API）。
- message template contract（字段、格式、脱敏）。
- AlertEvent 聚合状态更新时机（同步于最后渠道 vs 异步）。
- 重试/超时最终数值。
