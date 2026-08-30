# strategy-notification-delivery Specification

## Purpose
Define notification delivery for persisted strategy alert events: BullMQ-backed at-least-once delivery via an independent worker, channel-isolated retry and dead-letter handling without blocking committed alert events.
## Requirements
### Requirement: Notification Delivery Shall Consume Persisted Alert Events
Proactive notification delivery SHALL consume Mist-owned PENDING AlertEvent records and SHALL NOT evaluate
strategy rules, listen to raw market triggers, or read datasource services. Message content SHALL be built
from persisted Signal/AlertEvent evidence and approved templates only.

#### Scenario: A pending alert becomes eligible for delivery
- **WHEN** the notification worker claims a persisted PENDING AlertEvent
- **THEN** message construction MUST use persisted Signal/AlertEvent evidence
- **AND** market or strategy computation MUST NOT be invoked

### Requirement: Notification Delivery Shall Use An Independent BullMQ Worker
Proactive delivery SHALL run in an independent notification worker app outside `apps/schedule`, public
strategy controllers, and realtime strategy evaluation. The worker SHALL consume a dedicated BullMQ queue
(`strategy-alert-delivery`) backed by the existing Redis, enqueued by the AlertEvent producer after the
AlertEvent commit.

#### Scenario: A committed alert event is enqueued
- **WHEN** a PENDING AlertEvent is committed by the signal runtime
- **THEN** a delivery job MUST be enqueued on the strategy-alert-delivery queue
- **AND** no schedule cron MUST be required to drive delivery

#### Scenario: A notification channel is unavailable
- **WHEN** a delivery attempt fails
- **THEN** the failure MUST NOT roll back or block an already committed Signal/AlertEvent
- **AND** realtime strategy evaluation health MUST remain unaffected

### Requirement: Notification Delivery Shall Be At-Least-Once And Idempotent
Delivery SHALL provide at-least-once semantics; exactly-once SHALL NOT be claimed. Duplicate delivery SHALL
be controlled by setting the BullMQ job id to the AlertEvent identity and by relying on the existing
AlertEvent dedupeKey; channel adapters SHALL tolerate repeat sends for the same AlertEvent.

#### Scenario: A delivery job is duplicated or redelivered
- **WHEN** the same AlertEvent is enqueued or redelivered more than once
- **THEN** job-id deduplication MUST collapse duplicate queue entries
- **AND** channel adapters MUST treat repeat sends as idempotent using the AlertEvent identity

### Requirement: Notification Delivery Shall Bound Retries With Dead-Letter And Replay
Failed deliveries SHALL be retried with a bounded exponential backoff; after the configured attempt budget is
exhausted the delivery SHALL move to a dead-letter state. An operator SHALL be able to replay a dead-lettered
or failed delivery without re-running strategy evaluation.

#### Scenario: A channel delivery exhausts retries
- **WHEN** a delivery fails for the configured number of attempts
- **THEN** it MUST move to a dead-letter state
- **AND** it MUST NOT block other deliveries or strategy persistence

#### Scenario: An operator replays a failed delivery
- **WHEN** an operator requests replay of a dead-lettered or failed delivery
- **THEN** the worker MUST re-enqueue delivery without re-evaluating strategy
- **AND** the replay MUST be recorded

### Requirement: Notification Delivery Shall Record Per-Channel Results

Delivery SHALL fan out to configured channels (QQ, WeChat, and Feishu) and SHALL record each channel's outcome in a dedicated delivery records store, separate from AlertEvent status and operator acknowledgement. AlertEvent status SHALL reflect the aggregate delivery outcome; a partial channel failure SHALL NOT imply operator acknowledgement.

#### Scenario: Delivery fans out to multiple channels

- **WHEN** a delivery job targets QQ, WeChat, and Feishu (per `NOTIFICATION_CHANNELS`)
- **THEN** each channel outcome MUST be recorded independently
- **AND** one channel failing MUST NOT mask another channel's success

#### Scenario: A channel reports success

- **WHEN** per-channel delivery status is recorded
- **THEN** operator acknowledgement MUST NOT be implied

### Requirement: Channel Adapters Shall Call Provider Protocols Directly

Channel adapters SHALL deliver to QQ, WeChat, and Feishu by calling provider protocols or SDKs directly from the notification worker. Adapters SHALL NOT route delivery through AstrBot or the mist-skills runtime. Each adapter SHALL return a bounded delivery result (sent / failed / transient-failure) and SHALL redact channel credentials and sensitive payload from logs and evidence.

#### Scenario: A channel adapter sends a message

- **WHEN** the worker invokes a QQ, WeChat, or Feishu adapter
- **THEN** it MUST call the provider protocol directly
- **AND** it MUST return a bounded delivery result
- **AND** logs and evidence MUST NOT contain channel credentials

### Requirement: Notification Delivery Shall Support Feishu Webhook As A First-Class Channel

Notification delivery SHALL support Feishu (group custom-bot webhook `https://open.feishu.cn/open-apis/bot/v2/hook/{token}`) as a first-class `NotificationChannel` (`feishu`) alongside `qq` and `wechat`, with parity in per-channel fanout, per-channel result recording, at-least-once retry/dead-letter isolation, and direct provider-protocol invocation (no AstrBot/mist-skills hop). Strategy/OO notifications use `msg_type:'text'` parity with WeCom; the inspection report uses Feishu rich-text `post` and optional `timestamp`/`sign` (HMAC-SHA256 over `timestamp\nsecret`) when a secret is configured MUST be used; credentials MUST be redacted from logs.

#### Scenario: Strategy delivery fans out to Feishu when enabled

- **WHEN** `NOTIFICATION_CHANNELS` includes `feishu` and a strategy `AlertEvent` is fanned out
- **THEN** one `strategy_alert_deliveries` row with `channel='feishu'` MUST be created (unique on `alert_event × channel`)
- **AND** one `deliver.channel` job for `feishu` MUST be enqueued
- **AND** that row's `sent`/`failed`/`dead_lettered` outcome MUST be recorded independently of `qq`/`wechat`

#### Scenario: Feishu adapter maps provider errors to a bounded result

- **WHEN** the Feishu adapter posts to the webhook and the provider responds (or the transport fails)
- **THEN** `StatusCode===0` or `code===0` MUST map to `sent`
- **AND** invalid-token/timestamp/signature style codes MUST map to `permanent_failure` (dead-letter without retry)
- **AND** rate-limit / other retryable codes and network/timeout failures MUST map to `transient_failure` (BullMQ retry budget)

### Requirement: OO Health-Alert Delivery Shall Support Feishu In Parallel

OO health-alert delivery SHALL support Feishu as an additional outbound channel alongside the dedicated WeCom bot (and optional QQ), with failure isolation: a `transient_failure` on one channel MUST retry that channel only, and a `permanent_failure` MUST be counted without blocking other channels.

#### Scenario: OO alert fans out to WeCom, QQ, and Feishu with isolated outcomes

- **WHEN** an OO alert job is processed and multiple channels are configured
- **THEN** each channel MUST be sent independently
- **AND** a failure on one channel MUST NOT prevent success delivery on the others
- **AND** each channel outcome MUST be counted with low-cardinality channel labels

### Requirement: Pre-Market Inspection Shall Deliver The Report To WeCom And Feishu

The 09:05 pre-market inspection report SHALL be delivered to the WeCom webhook when configured (as WeCom `markdown` message) and independently to the Feishu webhook when configured (as Feishu rich-text `post` built from the structured report — Feishu has no markdown message type); the two destinations MUST be attempted separately so absence or failure of one does not suppress the other.

#### Scenario: Inspection report delivery is attempted for each configured webhook

- **WHEN** `runInspection()` builds the report
- **THEN** delivery to the WeCom webhook (`OO_ALERT_WECHAT_WEBHOOK` / `NOTIFICATION_WECHAT_WEBHOOK`) MUST be attempted when that env is present
- **AND** delivery to the Feishu webhook (`OO_ALERT_FEISHU_WEBHOOK` / `NOTIFICATION_FEISHU_WEBHOOK`) MUST be attempted when that env is present

