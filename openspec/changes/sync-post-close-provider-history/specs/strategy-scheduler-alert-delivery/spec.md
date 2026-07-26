## MODIFIED Requirements

### Requirement: Schedule Shall Trigger Strategy Scans After K-Line Collection

Mist schedule app SHALL no longer run strategy scans after periodic K-line collection; it SHALL own only post-close provider-history synchronization and SHALL NOT imply that realtime strategy evaluation is part of this change.

#### Scenario: Post-close history synchronization succeeds

- **WHEN** a schedule sync item successfully validates and persists provider history
- **THEN** the schedule app MUST verify the source-specific MySQL round-trip and MAY clean that item's Redis partition
- **AND** it MUST NOT call `StrategyScanService.runScan()`

#### Scenario: Provider synchronization succeeds with no bars

- **WHEN** the provider request succeeds with an empty collection
- **THEN** the schedule app MUST complete the item without a MySQL write
- **AND** it MAY clean that item's Redis partition
- **AND** it MUST NOT call `StrategyScanService.runScan()`

#### Scenario: Post-close history synchronization fails

- **WHEN** a schedule sync item fails fetch, validation, persistence, or round-trip verification
- **THEN** the schedule app MUST NOT trigger a strategy scan or delete that item's Redis keys
- **AND** it MUST record the item failure for retry and monitoring

### Requirement: Schedule Shall Not Own Public Strategy APIs

The schedule app SHALL host post-close provider-history jobs only and SHALL NOT expose public strategy REST APIs.

#### Scenario: Schedule module is inspected

- **WHEN** schedule module wiring is inspected
- **THEN** it MUST import reusable historical synchronization providers without mounting
  `/v1/strategies`, `/v1/strategy-signals`,
  `/v1/strategy-alert-events`, or `/v1/strategy-backtests` controllers
- **AND** it MUST NOT register EastMoney collection or periodic strategy scan cron jobs

## REMOVED Requirements

### Requirement: Scheduled Scans Shall Reuse Live Scan Semantics

**Reason**: Provider-history synchronization must not replay business signals, and realtime strategy integration remains a later focused change.

**Migration**: Retain manual scan behavior outside schedule until a later realtime-strategy change defines rule/context/state semantics.
