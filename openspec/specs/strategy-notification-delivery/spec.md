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
Delivery SHALL fan out to configured channels (QQ and WeChat) and SHALL record each channel's outcome in a
dedicated delivery records store, separate from AlertEvent status and operator acknowledgement. AlertEvent
status SHALL reflect the aggregate delivery outcome; a partial channel failure SHALL NOT imply operator
acknowledgement.

#### Scenario: Delivery fans out to multiple channels
- **WHEN** a delivery job targets QQ and WeChat
- **THEN** each channel outcome MUST be recorded independently
- **AND** one channel failing MUST NOT mask another channel's success

#### Scenario: A channel reports success
- **WHEN** per-channel delivery status is recorded
- **THEN** operator acknowledgement MUST NOT be implied

### Requirement: Channel Adapters Shall Call Provider Protocols Directly
Channel adapters SHALL deliver to QQ and WeChat by calling provider protocols or SDKs directly from the
notification worker. Adapters SHALL NOT route delivery through AstrBot or the mist-skills runtime. Each
adapter SHALL return a bounded delivery result (sent / failed / transient-failure) and SHALL redact channel
credentials and sensitive payload from logs and evidence.

#### Scenario: A channel adapter sends a message
- **WHEN** the worker invokes a QQ or WeChat adapter
- **THEN** it MUST call the provider protocol directly
- **AND** it MUST return a bounded delivery result
- **AND** logs and evidence MUST NOT contain channel credentials

