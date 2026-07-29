> **延期状态**：本 delta 只保存未来评审候选，不授权当前实现。只有项目负责人重新明确授权并
> 复核当时基线后，以下 requirement 才能进入实施。

## ADDED Requirements

### Requirement: Post-close sync changes no schema

Post-close provider history synchronization SHALL add or modify no MySQL migration. At the current deferred
baseline, applied migrations 001–013 SHALL remain byte-identical.

#### Scenario: Change is built and deployed

- **WHEN** the release is applied or rolled back
- **THEN** no migration up/down step may be required
- **AND** migrations 001–013 content and checksums MUST remain unchanged

### Requirement: Historical writes are restricted to the verified target

A sync item MUST restrict all historical writes to its target trading day, source, security, canonical `k` rows, and corresponding source extension rows.

#### Scenario: Protected digest is compared

- **WHEN** pre-sync and post-sync row counts and digests are compared
- **THEN** target canonical and matching source-extension changes MUST be explained by the normalized provider result
- **AND** all other protected tables and out-of-scope ranges MUST remain identical

#### Scenario: Isolated MySQL verification runs

- **WHEN** migration compatibility, upsert, revision, concurrency, and round-trip tests execute
- **THEN** they MUST use `MIST_TEST_MYSQL_URL`
- **AND** no production database may be modified before those tests and production shadow evidence pass
