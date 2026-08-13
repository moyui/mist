## Purpose

Strategy alert delivery hardens the production strategy loop by persisting
strategy alert events and letting external consumers record delivery outcomes
through Mist backend APIs. Scheduled scan execution in the schedule app is
retired (2026-08): realtime evaluation in the signal runtime owns scan
execution, and the schedule app is not part of the production stack.
## Requirements
### Requirement: Schedule Shall Not Own Public Strategy APIs

The schedule app SHALL NOT expose public strategy REST APIs. Scan execution is
owned by the realtime signal runtime, not by the schedule app.

#### Scenario: Schedule module is inspected

- **WHEN** schedule module wiring is inspected
- **THEN** it MUST NOT mount `/v1/strategies`, `/v1/strategy-signals`,
  `/v1/strategy-alert-events`, or `/v1/strategy-backtests` controllers

### Requirement: Alert Delivery State Shall Be Recorded

Mist backend SHALL allow external consumers to record alert delivery outcomes
on persisted strategy alert events.

#### Scenario: Alert is delivered

- **WHEN** a consumer marks a strategy alert event delivered
- **THEN** the backend MUST set the event status to delivered
- **AND** it MUST store delivery result metadata when supplied

#### Scenario: Alert delivery fails

- **WHEN** a consumer marks a strategy alert event failed
- **THEN** the backend MUST set the event status to failed
- **AND** it MUST store failure metadata when supplied

### Requirement: Skills Shall Consume Backend Alert Events

`mist-skills` SHALL consume strategy alerts through Mist backend APIs rather
than executing strategy rules.

#### Scenario: Pending strategy alerts are requested

- **WHEN** a strategy alert skill or helper requests pending alerts
- **THEN** it MUST call Mist backend alert event APIs
- **AND** it MUST NOT call datasource services, raw provider APIs, or local
  strategy rule evaluators

#### Scenario: Skill records delivery result

- **WHEN** a skill or bot delivery attempt succeeds or fails
- **THEN** it MUST mark the delivery result through the Mist backend alert
  delivery API

### Requirement: Operator Acknowledgement Shall Remain Separate

Delivery status and operator acknowledgement SHALL remain separate alert event
state transitions.

#### Scenario: Delivered alert is acknowledged

- **WHEN** an operator acknowledges a delivered alert event
- **THEN** the backend MUST mark it acknowledged with an acknowledgement
  timestamp
- **AND** the acknowledgement MUST NOT require the skill or bot to re-deliver
  the alert

### Requirement: Proactive Delivery Shall Not Be Owned By Schedule
The independent notification worker SHALL own proactive strategy alert delivery; `apps/schedule` SHALL remain
disabled and SHALL NOT poll or send strategy alerts. Proactive delivery SHALL consume persisted alert events
from the strategy-alert-delivery BullMQ queue, not from a schedule-driven scan.

#### Scenario: Notification delivery is enabled
- **WHEN** the approved worker starts
- **THEN** it MUST consume persisted alert events from the strategy-alert-delivery queue
- **AND** no schedule cron MUST be required

#### Scenario: Notification ownership wiring is inspected
- **WHEN** current or target notification wiring is inspected
- **THEN** `apps/schedule` MUST NOT register strategy scan providers, polling cron, channel adapters, or
  public strategy controllers
- **AND** operator-requested execution MUST remain in Backtest
- **AND** live Signal and PENDING AlertEvent creation MUST remain in `apps/signal`

