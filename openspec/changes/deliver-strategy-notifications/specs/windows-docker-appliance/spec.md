## ADDED Requirements

### Requirement: Notification Worker Deployment Shall Follow Channel Review
The Windows appliance SHALL add notification runtime, secrets, health and rollback configuration only after
the first channel and consumption model are accepted.

#### Scenario: Notification design remains unapproved
- **WHEN** Compose configuration is generated
- **THEN** no notification worker or secret placeholder MUST be treated as production-ready
