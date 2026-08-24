# post-close-market-data-sync Specification

## Purpose
Define the automated post-close market data synchronization contract so authoritative K-line data
(Day, 1-minute, and higher periods) across all active securities are persisted to the database
reliably, idempotently, and with proper fault isolation after market close in the late evening (post-22:00).

## ADDED Requirements

### Requirement: Post-Close Sync SHALL Ingest Authoritative K-Lines For Active Securities

The backend `PostCloseSyncService` SHALL ingest complete authoritative historical K-line data from
the configured data sources for all active securities after A-share trading session ends and provider
settlement is fully finished.

#### Scenario: Post-close synchronization runs for a trading day
- **WHEN** post-close synchronization is triggered for a specified trading day
- **THEN** it MUST query active securities
- **AND** for each security and requested period (e.g. Day, 1min), it MUST fetch K-line data within the trading day window from the security's configured or default data source
- **AND** it MUST verify data freshness (confirming that retrieved bars cover the target trading day)
- **AND** it MUST persist the retrieved K-lines into MySQL database idempotently (upsert on duplicate key)
- **AND** it MUST return a structured sync report summarizing total tasks, succeeded, failed, saved records, and duration

#### Scenario: Individual security collection failure is isolated
- **WHEN** fetching or saving K-lines fails for one security during batch sync
- **THEN** the error MUST be captured and recorded in the sync report
- **AND** synchronization for remaining securities and periods MUST continue without interruption

### Requirement: Post-Close Scheduler Fires At Late Evening Windows Post-22:00

The `schedule` application SHALL schedule post-close synchronization jobs on A-share trading days
aligned with late evening timelines (post-22:00) when QMT and provider settlements are complete.

#### Scenario: Nightly post-close trigger at 22:30
- **WHEN** the system time reaches 22:30 on a weekday
- **AND** `TimezoneService.isTradingDay()` confirms it is an A-share trading day
- **THEN** it MUST execute post-close synchronization for Day and 1-minute periods for all active securities
- **AND** on Friday trading days, it MUST additionally sync Week period
- **AND** on the last trading day of the month, it MUST additionally sync Month period

#### Scenario: Non-trading day trigger is skipped
- **WHEN** a scheduled post-close cron triggers on a weekend or public holiday
- **THEN** `TimezoneService.isTradingDay()` returns false
- **AND** no provider collection or database write is performed

### Requirement: REST Endpoint Allows Manual Trigger With Options

The collector controller SHALL expose a REST endpoint `POST /v1/collector/sync-post-close`
supporting manual triggers with custom target dates, period lists, and security filters (for ad-hoc or weekend TDX manual sync runs).

#### Scenario: Operator manually requests post-close sync
- **WHEN** an authenticated operator sends `POST /v1/collector/sync-post-close` with target date and parameters
- **THEN** the service MUST validate parameters and execute the post-close synchronization
- **AND** return HTTP 200 with the detailed execution report
