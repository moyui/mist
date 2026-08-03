## ADDED Requirements

### Requirement: Notification Delivery Shall Consume Persisted Alert Events
Proactive notification delivery SHALL consume Mist-owned PENDING AlertEvent records and SHALL NOT evaluate
strategy rules or listen to raw market triggers.

#### Scenario: A pending alert is eligible for delivery
- **WHEN** the approved notification worker claims it
- **THEN** message construction MUST use persisted Signal/AlertEvent evidence
- **AND** market or strategy computation MUST NOT be invoked

### Requirement: Notification Delivery Shall Use An Independent Worker
Notification orchestration SHALL run outside `apps/schedule`, public strategy controllers and realtime strategy
evaluation.

#### Scenario: A notification channel is unavailable
- **WHEN** delivery fails
- **THEN** the failure MUST NOT roll back or block an already committed Signal/AlertEvent

### Requirement: Delivery And Acknowledgement Shall Remain Separate
Channel delivery result and operator acknowledgement SHALL remain independent state transitions.

#### Scenario: A channel reports success
- **WHEN** delivery status is recorded
- **THEN** operator acknowledgement MUST NOT be implied

### Requirement: Notification Reliability Details Shall Require Approval
Channels, claim model, concurrency, timeouts, idempotency, retry, dead-letter, partial success, credentials and
HIL SHALL be approved and recorded before notifier implementation.

#### Scenario: A notification implementation task begins
- **WHEN** any applicable reliability decision remains open
- **THEN** implementation MUST pause
- **AND** no schema or compatibility change MUST be inferred
