# mist-observability Specification Delta

## ADDED Requirements

### Requirement: OpenTelemetry Metrics Lifecycle and Stream Naming Invariance

The standardization of the `observability/` directories SHALL preserve all existing `mist_*` metric stream names and label schemas exported over OTLP to OpenObserve, and SHALL register process-scoped meters in each application's `observability/metrics.ts`.

#### Scenario: OpenObserve queries existing metric streams
- **WHEN** OpenObserve or alert rules query streams (`mist_candle_*`, `mist_backtest_*`, `mist_delivery_*`, `mist_startup_compensation_total`, `mist_realtime_subscription_*`)
- **THEN** the metric stream names, meter data types, and low-cardinality label attributes MUST remain identical to existing baselines

#### Scenario: Missing metrics are added for Signal and Schedule
- **WHEN** Signal, Schedule, or Chan applications are bootstrapped
- **THEN** their respective `src/observability/metrics.ts` MUST register their baseline readiness and operational gauges under `mist_signal_*`, `mist_schedule_*`, and `mist_chan_*`
