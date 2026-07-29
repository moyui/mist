## ADDED Requirements

### Requirement: Alert dedupe metadata matches immutable migration history
`StrategyAlertEvent` entity metadata SHALL declare the same named unique
`dedupe_key` index already created by migration `006`. Applied migration `006`
MUST remain byte-identical.

#### Scenario: Schema metadata is audited
- **WHEN** repository guards inspect migration SQL and TypeORM metadata
- **THEN** both declare `uq_strategy_alert_events_dedupe_key` as unique for the
  same logical field
- **AND** no new migration is introduced by this change

#### Scenario: Production index is not proven
- **WHEN** read-only production schema inventory cannot confirm the named
  unique index
- **THEN** release remains blocked
- **AND** migration `006` MUST NOT be edited to compensate
