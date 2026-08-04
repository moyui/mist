## ADDED Requirements

### Requirement: Proactive Delivery Shall Not Be Owned By Schedule
The independent notification worker SHALL own proactive strategy alert delivery; `apps/schedule` SHALL remain
disabled and SHALL NOT poll or send strategy alerts.

#### Scenario: Notification delivery is enabled
- **WHEN** the approved worker starts
- **THEN** it MUST consume persisted alert events
- **AND** no schedule cron MUST be required

#### Scenario: Notification ownership wiring is inspected
- **WHEN** current or target notification wiring is inspected
- **THEN** `apps/schedule` MUST NOT register strategy scan providers, polling cron, channel adapters, or public
  strategy controllers
- **AND** operator-requested execution MUST remain in Backtest
- **AND** live Signal and PENDING AlertEvent creation MUST remain in `apps/signal`

## REMOVED Requirements

### Requirement: Schedule Shall Not Own Public Strategy APIs

**Reason**: Although the title remains directionally correct, the requirement body incorrectly assigns strategy
scan ownership to `apps/schedule`. Live evaluation belongs to `apps/signal`, operator-requested execution belongs
to Backtest, proactive delivery belongs to the independent notification worker, and `apps/schedule` remains
disabled.

**Migration**: Remove schedule scan provider, controller, and cron assumptions. Public strategy APIs remain in
`apps/mist`; live Signal and PENDING AlertEvent creation remain in `apps/signal`; proactive delivery consumes
persisted PENDING AlertEvents through the approved independent notification worker.
