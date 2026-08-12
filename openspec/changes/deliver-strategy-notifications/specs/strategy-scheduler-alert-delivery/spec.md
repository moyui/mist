## ADDED Requirements

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
