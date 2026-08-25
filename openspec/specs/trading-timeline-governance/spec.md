# trading-timeline-governance Specification

## Purpose
Centralize canonical pipeline schedule cron expressions, trading session minute offsets, and calendar predicate functions in the `@app/timezone` library as the authoritative single source of truth across all apps.

## Requirements

### Requirement: Canonical pipeline schedule cron expressions and trading windows are centralized in timezone library

The shared `timezone` library (`@app/timezone`) SHALL serve as the single source of truth for all pipeline scheduled cron expressions, trading window minute offsets, and session predicate functions. Business applications (`apps/schedule`, `apps/mist`) SHALL consume these exported constants rather than hardcode inline cron strings or local window helpers.

#### Scenario: Schedule controllers consume centralized cron constants
- **WHEN** `apps/schedule` registers nightly post-close sync, morning retry sync, or pre-market inspection cron jobs
- **THEN** it MUST reference `CRON_POST_CLOSE_SYNC_NIGHTLY_2230`, `CRON_POST_CLOSE_SYNC_MORNING_0630`, or `CRON_PRE_MARKET_INSPECTION_0905` exported by `@app/timezone`
- **AND** it MUST explicitly specify `timeZone: 'Asia/Shanghai'`

#### Scenario: Subscription coordinator consumes centralized cron and window utilities
- **WHEN** `RealtimeSubscriptionLifecycleCoordinator` schedules the `09:15` reset barrier or evaluates intraday activation allowance
- **THEN** it MUST use `CRON_SUBSCRIPTION_RESET_0915` and `isIntradayAddWindow` from `@app/timezone`
- **AND** it MUST NOT maintain local duplicate window implementations

#### Scenario: Cron expressions match exchange calendar rules
- **WHEN** cron expressions for trading days are evaluated
- **THEN** nightly sync, pre-market check, and subscription reset MUST use day-of-week `1-5` (Monday to Friday)
- **AND** morning retry sync for the previous trading day MUST use day-of-week `2-6` (Tuesday to Saturday)
