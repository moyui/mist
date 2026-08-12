## ADDED Requirements

### Requirement: Notification Health Shall Be Channel-Aware And Separate
Monitoring SHALL expose notification queue depth, consumption, claim, latency, per-channel delivery results,
and dead-letter count using bounded low-cardinality labels, and SHALL keep notification health separate from
strategy evaluation, candle, and transport health.

#### Scenario: A channel delivery fails
- **WHEN** the strategy event was committed successfully but a channel delivery fails
- **THEN** notification health MUST report the channel failure and any dead-letter growth
- **AND** strategy persistence health MUST remain successful

#### Scenario: Notification backlog grows
- **WHEN** the strategy-alert-delivery queue depth or dead-letter count rises
- **THEN** notification health MUST reflect it independently of realtime strategy evaluation health
