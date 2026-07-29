> **延期状态**：本 delta 只保存未来评审候选，不授权当前实现。只有项目负责人重新明确授权并
> 复核当时基线后，以下 requirement 才能进入实施。

## ADDED Requirements

### Requirement: Post-close synchronization exposes item-level health

Monitoring SHALL expose per-cycle sync owner/lock, inventory guard, bounded concurrency/in-flight count, provider timeout, cycle deadline, last attempt, success, pending, retry count, provider validation failure, MySQL round-trip failure, cleanup result, and oldest retained Redis age by market/source/security.

#### Scenario: Item approaches retry deadline

- **WHEN** a pending item exceeds configured lag or approaches the next-day cutoff
- **THEN** monitoring MUST alert with trading day, market, source, security, and failure stage

#### Scenario: Dispatch capacity guard is exceeded

- **WHEN** eligible inventory exceeds the configured maximum or a cycle reaches its execution deadline
- **THEN** monitoring MUST alert without reporting omitted items as successful
- **AND** source in-flight count and provider timeout outcomes MUST remain observable

#### Scenario: Hidden Redis partition approaches expiry

- **WHEN** an unsynchronized partition approaches its 72-hour expiry
- **THEN** monitoring MUST raise a recovery-data-at-risk alert before TTL deletion

#### Scenario: Sync feature is intentionally disabled

- **WHEN** `HISTORICAL_SYNC_ENABLED=false`
- **THEN** monitoring MUST report the disabled desired state
- **AND** it MUST not report missing automatic jobs as an unexpected owner failure
