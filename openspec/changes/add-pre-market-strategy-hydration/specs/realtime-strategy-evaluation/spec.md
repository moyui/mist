## ADDED Requirements

### Requirement: Signal Runtime Shall Support Pre-Market Strategy Window Hydration

The Signal runtime (`apps/signal`) SHALL support proactive pre-market strategy window hydration for active strategy targets before continuous trading begins, eliminating cold-start database I/O latency when the first real-time candle of the day arrives.

#### Scenario: Pre-market strategy hydration triggers at 09:20 on exchange trading days
- **WHEN** the `09:20` pre-market warmup schedule (`CRON_PRE_MARKET_STRATEGY_WARMUP_0920`) fires on an A-share trading day
- **THEN** `apps/signal` MUST identify all active `(securityId, source, period)` target groups across the current strategy registry
- **AND** it MUST load the required historical K-line windows up to each target's maximum `requiredBarCount` using yesterday's close as the anchor
- **AND** it MUST populate the in-memory `SharedStrategyWindowStore`

#### Scenario: Strategy hydration triggers on startup and registry reconciliation
- **WHEN** `SignalRealtimeStartupService` bootstraps or reconciles its strategy registry
- **THEN** it MUST trigger proactive window hydration for newly registered or expanded targets
- **AND** target groups already hydrated with sufficient capacity MUST be skipped idempotently

#### Scenario: First real-time candle arrives with zero database I/O
- **WHEN** the first `candle_finalized` trigger of a trading day arrives for a pre-hydrated target
- **THEN** `SharedStrategyWindowStore.prepare` MUST find the in-memory window already initialized
- **AND** it MUST append the new bar directly in memory without executing historical K-line database queries

#### Scenario: Single security hydration failure is isolated
- **WHEN** historical K-line loading fails for a specific target during pre-market hydration
- **THEN** `apps/signal` MUST record a bounded warning log with target details
- **AND** the failure MUST NOT interrupt hydration for other targets
- **AND** the failure MUST NOT cause the Signal service to crash or become unready
- **AND** subsequent real-time triggers for that target MUST fall back to on-demand hydration
