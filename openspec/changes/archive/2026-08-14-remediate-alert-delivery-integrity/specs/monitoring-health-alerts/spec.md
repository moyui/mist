## ADDED Requirements
### Requirement: OO Health Alert Delivery Shall Have Dedicated Metrics

Infrastructure-alert (OpenObserve health alert) delivery SHALL be counted separately from
strategy alert delivery: a dedicated `mist_oo_alert_total` gauge with low-cardinality
`status` (sent/failed) and `channel` labels. Strategy `mist_notification_*` gauges SHALL
keep their strategy-only semantics and SHALL NOT accumulate infra-alert outcomes.

#### Scenario: An OO health alert is sent
- **WHEN** the OO alert worker successfully sends to a channel
- **THEN** `mist_oo_alert_total{status="sent",channel=...}` MUST increment
- **AND** `mist_notification_delivered_total` MUST NOT change

### Requirement: Alert Receiver Shall Reject Incomplete Payloads

The OO alert webhook receiver SHALL reject payloads that miss required fields
(`alertName`, `ts`) with `accepted: false` and a warning log; missing timestamps SHALL
NOT be substituted with the current time. Alert-name-to-severity mapping SHALL be covered
by tests for every rule prefix, and the deploy-side rules file SHALL be validated against
the same mapping before apply.

#### Scenario: A webhook payload lacks ts
- **WHEN** the receiver gets a payload with `alertName` but no `ts`
- **THEN** it MUST reject the payload without enqueueing
- **AND** it MUST NOT fabricate a timestamp

#### Scenario: Rules severity mapping drifts
- **WHEN** the OO rules file names a rule whose prefix maps to a different severity
- **THEN** the sync script MUST fail before applying any rule

### Requirement: Notification Queue Depth Shall Cover Both Queues

`mist_notification_queue_depth` SHALL report waiting/active/delayed depth for both the
strategy delivery queue and the OO health-alert delivery queue, distinguished by a
`queue` label (`strategy` / `oo_alert`).

#### Scenario: Both queues are sampled
- **WHEN** the depth metric is scraped
- **THEN** it MUST expose depth for the strategy queue labeled `queue="strategy"`
- **AND** for the OO alert queue labeled `queue="oo_alert"`
