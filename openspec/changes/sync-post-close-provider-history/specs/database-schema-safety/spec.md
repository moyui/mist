## ADDED Requirements

### Requirement: Post-close sync changes no schema

Post-close provider history synchronization SHALL add or modify no MySQL migration, including migration `006`.

#### Scenario: Change is built and deployed

- **WHEN** the release is applied or rolled back
- **THEN** no migration up/down step may be required
- **AND** migration `006` content and checksum MUST remain unchanged

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
