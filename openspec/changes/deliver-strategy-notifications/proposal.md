## Why

策略链路已能在生产持久化 PENDING AlertEvent（`REALTIME_STRATEGY_MODE=on`，2026-08-12 实证盘中持续产出，
16 条积压无人消费），但没有受控的主动投递 worker 把这些事件送达外部渠道。通知必须在 realtime
evaluation 之后以独立故障域、独立验收交付，不能耦合策略、candle 或 transport。

## What Changes

- 建立独立 notification worker app（`apps/notification`），从 Mist-owned PENDING AlertEvent 边界消费待投递事件。
- 消费模型采用 BullMQ sibling queue（`strategy-alert-delivery`），复用现有 Redis；AlertEvent 落库
  commit 后由 producer 入队，worker 消费，retry/backoff/DLQ 由 BullMQ 承载。
- 定义 channel-neutral envelope，并通过 per-channel adapter 直接对接 QQ 与微信的协议/SDK 发送，不经
  AstrBot 或 mist-skills runtime。
- 投递语义为 at-least-once（不承诺 exactly-once），幂等以 AlertEvent `dedupeKey` + BullMQ `jobId`
  保证；有界重试（指数退避）耗尽入 dead-letter，支持人工重放。
- 新增 forward-only migration（018）与独立 delivery 记录表，承载 per-channel fan-out 状态（QQ 成功 /
  微信失败可独立表达），与 AlertEvent 主状态、operator acknowledgement 分开。
- 策略规则与 Signal 生成归 Mist strategy runtime（`apps/signal`）所有；channel adapter 不执行策略。
- delivery status 与 operator acknowledgement 保持独立状态转换。
- 不复用 `apps/schedule`（保持 disabled）作为 notification owner。
- mist-skills / AstrBot 不在本 change 范围：push 由独立 worker 直接对接渠道 SDK 承担，AstrBot 继续其
  pull-only skill 消费不变。

## Capabilities

### New Capabilities

- `strategy-notification-delivery`: PENDING AlertEvent 经独立 BullMQ worker 到 QQ/微信的受控投递、
  per-channel 结果记录、at-least-once 可靠性与 dead-letter/replay 边界。

### Modified Capabilities

- `strategy-scheduler-alert-delivery`: 增加 proactive delivery 归属独立 worker 的 requirement
  （`apps/schedule` 保持 disabled，不 poll/send 策略告警，投递由 queue 驱动）。
- `monitoring-health-alerts`: 增加 notification 队列深度/consumption/per-channel 结果/dead-letter 观测，
  与策略 evaluation health 分离。
- `windows-docker-appliance`: 增加 notification worker 专用 service 的部署、secrets、health、rollback 边界。

## Impact

- **mist**: delivery 记录表（migration 018）+ producer 入队 + per-channel 结果持久化；AlertEvent 主状态
  表达聚合投递结果；现有 delivered/failed/ack API 保留供外部/人工使用。
- **mist-deploy**: `apps/notification` service（复用 image + command 切换）、queue env、per-channel
  secrets、healthcheck、startup/rollback。
- **mist-monitoring**: notification consumption/claim/latency/per-channel-result/dead-letter 低基数指标。
- **不包含**：策略规则、市场数据、K context、portfolio、`apps/schedule` 启用、mist-skills/AstrBot。
