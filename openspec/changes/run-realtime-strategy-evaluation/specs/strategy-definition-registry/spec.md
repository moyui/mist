## ADDED Requirements

### Requirement: Signal Runtime Registry Shall Refresh After Strategy Commits
After an owning strategy enable/disable transaction commits, `apps/mist` SHALL request an explicit versioned
refresh of the Signal runtime's immutable registry without placing RPC inside the database transaction. Strategy
definition content SHALL remain creation-only.

#### Scenario: Signal starts with persisted strategies
- **WHEN** Signal performs its startup registry load
- **THEN** it MUST read all enabled definitions and current versions once
- **AND** every accepted current version MUST compile its single rule with its required signal kind into one
  immutable execution plan
- **AND** it MUST publish the complete valid snapshot as process-local registry generation `1`
- **AND** it MUST NOT periodically poll or reload the full registry for each trigger

#### Scenario: A strategy mutation is committed for live consumption
- **WHEN** enable or disable commits
- **THEN** the persisted definition/version transaction MUST remain authoritative
- **AND** `apps/mist` MUST request `signal.registry.refresh.v1` with only `strategyDefinitionId`
- **AND** Signal MUST read that aggregate from MySQL rather than accepting a duplicated rule snapshot in the
  command
- **AND** the RPC wait MUST NOT execute inside the database transaction

#### Scenario: A strategy remains enabled after refresh
- **WHEN** the refreshed aggregate is enabled and valid
- **THEN** the next immutable registry generation MUST copy-on-write upsert that definition and current version
- **AND** it MUST preserve the version's required signal kind without runtime override
- **AND** a later operation MUST use the new snapshot

#### Scenario: A strategy leaves the enabled lifecycle state
- **WHEN** a committed refresh reads a missing, draft, disabled or archived definition
- **THEN** the next registry generation MUST remove that definition
- **AND** an in-flight operation MAY finish using the immutable snapshot it captured before cutover
- **AND** a later operation MUST NOT use the removed definition

#### Scenario: Runtime refresh is not confirmed
- **WHEN** the database mutation committed but refresh query, validation, connection, handler, timeout or
  cutover fails
- **THEN** Signal MUST preserve the prior immutable runtime registry and generation
- **AND** the public mutation MUST expose committed-but-unknown runtime state using the approved typed technical
  error
- **AND** it MUST NOT claim that the database transaction rolled back
- **AND** no polling, outbox, automatic retry or database generation column MAY be added in V1
- **AND** the next Signal startup full load MUST remain the only automatic convergence mechanism
