## ADDED Requirements

### Requirement: Notification Health Shall Be Channel-Aware And Separate
Monitoring SHALL expose notification consumption, claim, latency and channel results using bounded
low-cardinality labels and SHALL keep notification health separate from strategy evaluation health.

#### Scenario: A channel delivery fails
- **WHEN** the strategy event was committed successfully
- **THEN** notification health MUST report the channel failure
- **AND** strategy persistence health MUST remain successful
