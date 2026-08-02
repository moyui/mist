## ADDED Requirements

### Requirement: Proactive Delivery Shall Not Be Owned By Schedule
The independent notification worker SHALL own proactive strategy alert delivery; `apps/schedule` SHALL remain
disabled and SHALL NOT poll or send strategy alerts.

#### Scenario: Notification delivery is enabled
- **WHEN** the approved worker starts
- **THEN** it MUST consume persisted alert events
- **AND** no schedule cron MUST be required
