# post-close-market-data-sync Specification

## Purpose
Define the automated post-close market data synchronization contract so authoritative K-line data
(Day, 1-minute, 5-minute, 15-minute, 30-minute, 60-minute, Week, Month) across all active securities
are persisted to the database reliably, idempotently, with strict DataFreshnessStatus validation,
bounded concurrency, and comprehensive OpenObserve observability (structured logs, OTel metrics,
and WeChat alert dispatch) during late evening (22:30) and morning retry (06:30) windows.

## ADDED Requirements

### Requirement: Post-Close Sync SHALL Ingest Authoritative All-Period K-Lines For Active Securities

The backend `PostCloseSyncService` SHALL ingest complete authoritative historical K-line data for
all core periods (`DAY`, `ONE_MIN`, `FIVE_MIN`, `FIFTEEN_MIN`, `THIRTY_MIN`, `SIXTY_MIN`, `WEEK`, `MONTH`)
from configured data sources for active securities using internal `SyncPostCloseCriteria`.

#### Scenario: Post-close synchronization runs for a trading day
- **WHEN** post-close synchronization is triggered for a specified trading day
- **THEN** it MUST query active securities (or specified security codes)
- **AND** for each security and requested period, it MUST fetch K-line data within the trading day window from the security's configured or default data source
- **AND** it MUST validate data freshness (confirming that retrieved bars cover the target trading day and satisfy expected bar counts)
- **AND** if data freshness is satisfied (`DataFreshnessStatus.READY`), it MUST persist the retrieved K-lines into MySQL database idempotently (upsert on duplicate key)
- **AND** it MUST maintain exact decimal precision and keep null volume/amount without synthetic zero-fill
- **AND** it MUST export OTel metrics (`mist_post_close_sync_tasks_total`, `mist_post_close_sync_klines_saved_total`, `mist_post_close_sync_duration_seconds`) to OpenObserve
- **AND** it MUST output structured logs detailing task outcomes

#### Scenario: Unready or stale data source is intercepted
- **WHEN** a data source returns K-lines that do not reach the target trading day or have incomplete minute bars
- **THEN** the freshness validator MUST mark the status as `NOT_LATEST` or `INCOMPLETE_BARS`
- **AND** it MUST skip database insertion to prevent history data pollution
- **AND** the task MUST record metric `mist_post_close_sync_tasks_total{status="not_ready"}`

#### Scenario: Individual security collection failure is isolated
- **WHEN** fetching or saving K-lines encounters network or database errors for one security
- **THEN** the error MUST be captured, recorded in metrics `mist_post_close_sync_tasks_total{status="failed"}`
- **AND** synchronization for remaining securities and periods MUST continue without interruption under bounded concurrency

### Requirement: Post-Close Scheduler Fires At Dual Windows (Nightly 22:30 and Morning 06:30 Retry)

The `schedule` application SHALL schedule post-close synchronization jobs on A-share trading days
aligned with late evening timelines (22:30) and next-morning retry timelines (06:30).

#### Scenario: Primary nightly trigger at 22:30
- **WHEN** the system time reaches 22:30 on a weekday (Monday - Friday)
- **AND** `TimezoneService.isTradingDay()` confirms it is an A-share trading day
- **THEN** it MUST execute post-close synchronization for core periods (`DAY`, `1m`, `5m`, `15m`, `30m`, `60m`) for all active securities
- **AND** on Friday trading days, it MUST additionally sync `WEEK` period
- **AND** on the last trading day of the month, it MUST additionally sync `MONTH` period

#### Scenario: Next-morning fallback retry trigger at 06:30
- **WHEN** the system time reaches 06:30 on Tuesday through Saturday
- **THEN** it MUST resolve the previous A-share trading day (skipping weekends and holidays)
- **AND** it MUST execute a secondary retry sync for the previous trading day before the 09:15 pre-market lifecycle begins

#### Scenario: Non-trading day trigger is skipped
- **WHEN** a scheduled post-close cron triggers on a non-trading day (weekend or public holiday)
- **THEN** `TimezoneService.isTradingDay()` returns false
- **AND** no provider collection or database write is performed

### Requirement: OpenObserve Alerts Guard Post-Close Sync Reliability

OpenObserve scheduled SQL alert rules SHALL monitor post-close synchronization metrics and dispatch
alerts via the notification service to WeChat.

#### Scenario: Post-close sync failure fires A8 alert
- **WHEN** `mist_post_close_sync_tasks_total{status="failed"}` is greater than or equal to 1 in OpenObserve
- **THEN** the alert rule `A8_post_close_sync_failed` MUST fire with severity `P1`
- **AND** `apps/notification` MUST accept and route the alert to WeChat webhook

#### Scenario: Post-close sync unready surge fires A9 alert
- **WHEN** `mist_post_close_sync_tasks_total{status="not_ready"}` is greater than or equal to 5 in OpenObserve
- **THEN** the alert rule `A9_post_close_sync_unready_surge` MUST fire with severity `P2`
- **AND** `apps/notification` MUST accept and route the alert to WeChat webhook
