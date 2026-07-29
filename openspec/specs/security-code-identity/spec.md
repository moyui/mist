# security-code-identity Specification

## Purpose
Define the backend boundary between provider-neutral `Security.code` identity and provider-specific source transport codes so security lookup, source configuration, streaming subscription tracking, and K-line persistence use stable internal identities.
## Requirements
### Requirement: Canonical Security Code Identity
The system SHALL store and look up `Security.code` as a provider-neutral canonical code. Canonical codes MUST remove common provider market decorations from supported stock symbols, including dotted suffix form such as `600519.SH` and market-prefix form such as `SH600519`.

#### Scenario: Initialize security with provider-formatted code
- **WHEN** a caller initializes a security with code `600519.SH`
- **THEN** the persisted `Security.code` is `600519`
- **AND** future lookups by `600519`, `600519.SH`, or `SH600519` resolve to the same security row

#### Scenario: Lookup security with provider-formatted code
- **WHEN** a caller requests security `SH600519`
- **THEN** the backend queries `securities.code` using canonical code `600519`

### Requirement: Provider Format Code Boundary

The system SHALL use `SecuritySourceConfig.formatCode` only as the provider-specific transport code for external data-source calls. Every enabled source config MUST contain a non-empty `formatCode`; enabled TDX and QMT configs MUST use an exact six-digit market-qualified symbol ending in `.SH`, `.SZ`, or `.BJ`. Provider calls MUST fail closed when the enabled source config or its `formatCode` is missing and MUST NOT substitute canonical `Security.code`. Internal aggregation, persistence, lookup, and subscription tracking MUST use canonical `Security.code` or `Security.id`.

#### Scenario: TDX streaming uses separate identity and transport codes

- **WHEN** a security has `code=600519` and enabled TDX `formatCode=600519.SH`
- **THEN** the backend tracks the subscription internally by `600519`
- **AND** sends `600519.SH` to the TDX datasource for subscribe/unsubscribe calls

#### Scenario: Enabled source omits provider transport code

- **WHEN** a caller creates or updates an enabled source config without a non-empty `formatCode`
- **THEN** the backend rejects the write
- **AND** it does not persist an enabled config that would require canonical-code fallback

#### Scenario: Enabled TDX or QMT source uses malformed symbol

- **WHEN** a caller enables TDX or QMT with a `formatCode` outside `dddddd.SH`, `dddddd.SZ`, or `dddddd.BJ`
- **THEN** the backend rejects the write with the accepted provider-symbol grammar

#### Scenario: Collection cannot resolve provider symbol

- **WHEN** collection requests a source for which no enabled, non-empty `formatCode` exists
- **THEN** collection fails before issuing the provider request
- **AND** it does not use canonical `Security.code` as the provider symbol

#### Scenario: Streaming snapshot model uses code and formatCode

- **WHEN** the backend parses a TDX snapshot for provider symbol `600519.SH`
- **THEN** the resulting snapshot uses `code=600519`
- **AND** uses `formatCode=600519.SH`
- **AND** does not expose `stockCode`

#### Scenario: Completed K-line persistence uses security identity

- **WHEN** a completed TDX streaming candle is emitted for provider symbol `600519.SH`
- **THEN** the backend resolves canonical code `600519`
- **AND** persists the K-line using the matched `Security.id`
- **AND** does not persist a third `fullCode` identity

### Requirement: Idempotent Source Configuration
The system SHALL make source configuration writes idempotent for a given security and source. Repeated add/update operations for the same `(security_id, source)` MUST update the existing row instead of creating duplicates.

#### Scenario: Repeated TDX source setup
- **WHEN** the same TDX source config is submitted repeatedly for security `600519`
- **THEN** the `security_source_configs` table contains one TDX row for that security
- **AND** the row reflects the latest `formatCode`, `priority`, and `enabled` values

#### Scenario: Duplicate source config cleanup
- **WHEN** existing exact duplicate rows are found for the same `(security_id, source, formatCode, priority, enabled)`
- **THEN** cleanup keeps one row and removes the redundant duplicates
- **AND** non-identical duplicates are reported for manual resolution instead of being deleted automatically

### Requirement: K extensions do not duplicate provider identity

K extension interfaces, entities, and tables SHALL NOT expose or persist `fullCode`. Provider routing SHALL use the source config `formatCode`, while completed K ownership SHALL use `securityId`.

#### Scenario: Provider K extension is persisted

- **WHEN** TDX, QMT, or EastMoney extension data is saved
- **THEN** the extension payload contains only provider-specific numeric or metadata fields still defined by that extension contract
- **AND** it does not contain `fullCode`
