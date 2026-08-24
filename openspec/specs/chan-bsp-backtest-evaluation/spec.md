# chan-bsp-backtest-evaluation Specification

## ADDED Requirements

### Requirement: Backtest SHALL Dispatch Evaluation By Run Kind

Backtest SHALL evaluate a strategy version by the kind snapshot stored on the
backtest run (captured from the definition when the run was created), not by
the definition's current value. A `rule_dsl` run SHALL keep the existing
compiled-rule evaluator path unchanged; a `chan_bsp` run SHALL compile through
the shared `compileChanBspConfig` (same function as the realtime registry) and
evaluate through the shared `ChanBspDetector` against the same imputed
projection window used by DSL evaluation.

#### Scenario: A chan_bsp run is replayed

- **WHEN** backtest claims a run whose kind is `chan_bsp`
- **THEN** it MUST compile the version rule through `compileChanBspConfig`
- **AND** it MUST evaluate by `ChanBspDetector` over the imputed window
- **AND** it MUST NOT invoke the DSL rule evaluator on a chan_bsp rule

#### Scenario: A rule_dsl run is replayed

- **WHEN** backtest claims a run whose kind is `rule_dsl`
- **THEN** the existing `compileStoredStrategyRule` + `evaluateStrategyPlan`
  path MUST remain unchanged

### Requirement: Chan Bsp Replay SHALL Evaluate Over The Correction Layer

Chan bsp replay SHALL evaluate structure only over the correction layer
output — the `StrategySeriesImputer` projected view (`ProjectedStrategyBar[]`
with OHLC/quantity imputation, zero-anomaly handling and per-field
`resolution`), never over raw historical bars directly. The correction layer
SHALL be the same implementation and semantics as the realtime window view
(`SharedStrategyWindowStore`), including the no-look-ahead rule: evaluation of
any bar SHALL depend only on data visible at that evaluation moment, with the
initial hydrated segment bidirectionally imputed (all anchors precede the
evaluation start) and later bars appended forward-only.

#### Scenario: A detector input bypasses the correction layer

- **WHEN** a chan_bsp detector consumes raw historical bars instead of the
  imputed projection
- **THEN** this MUST NOT happen: the replay SHALL feed only
  `imputer.read()` results to the detector

#### Scenario: The initial segment is bidirectionally imputed

- **WHEN** the hydrated initial segment contains missing or zero-anomaly
  values
- **THEN** it SHALL be right- and left-imputed from anchors within the segment
  (all preceding the evaluation start, no look-ahead)

#### Scenario: Later bars are appended forward-only

- **WHEN** a bar at or after the evaluation start is missing or zero-anomaly
- **THEN** its effective values SHALL depend only on earlier anchors
- **AND** it MUST NOT be revised later when future anchors arrive

### Requirement: Chan Bsp Replay SHALL Emit The Complete Signal Flow

Chan Bsp replay SHALL emit the complete signal flow like realtime evaluation:
the first bar at or after the run start date emits **all** confirmed points
inside the current window (including points confirmed in the hydrated segment
before the run start date, each with its real confirmation time as signal time
— matching realtime's subscribe-time backfill semantics). Later bars MUST emit
only newly confirmed points; a point MUST be emitted exactly once, and once
persisted MUST NOT be deleted when structure evolution later invalidates it
(backtest exists to expose mistaken signals, not to hide them).

#### Scenario: A point confirms before the run start date

- **WHEN** the hydrated initial segment already confirms a point before
  `run.startDate`
- **THEN** the point MUST appear in results with its real confirmation time
- **AND** it MUST be emitted only once, on the first post-start evaluation

#### Scenario: A point confirms after the run start date

- **WHEN** a point confirms on a bar at or after `run.startDate`
- **THEN** backtest MUST persist one result row for the event
- **AND** subsequent re-evaluations of the same window MUST NOT re-emit it

#### Scenario: Structure evolution invalidates an emitted point

- **WHEN** a previously emitted point disappears from detector output after
  structure evolution
- **THEN** the persisted result row MUST remain (no deletion)

### Requirement: Chan Bsp Backtest Signal Results SHALL Carry Structural Context

Every chan_bsp backtest result SHALL persist the same structural context as
realtime candidates: point type (`first`/`second`/`third` buy or sell),
unit level, period, central-zone index and upper/lower zone bounds. One bar
confirming multiple points SHALL persist one row per point, each with its own
signal time. Aggregate stats SHALL follow existing semantics: signal count
counts result rows, matched security count de-duplicates securities.

#### Scenario: A chan_bsp result row is persisted

- **WHEN** a chan_bsp event is emitted during replay
- **THEN** its `context_snapshot` MUST include `chanBsp` with type, units,
  level, `zhongshuIndex`, `zg` and `zd`
- **AND** the context SHALL be built by the shared
  `serializeChanBspContextSnapshot` (same function as realtime candidates)
- **AND** the result MUST NOT duplicate run-owned columns (period/source/
  definition/version)

#### Scenario: One bar confirms multiple points

- **WHEN** the same bar confirms both a first and a second buy point
- **THEN** backtest MUST persist two result rows with their respective
  confirmed signal times
- **AND** a point's signal time is its confirming unit's end time, so distinct
  points never share a signal time and never collide on the
  `(backtest_run_id, security_code, signal_time)` idempotency key

### Requirement: Chan Bsp Replay SHALL Restrict Periods

A chan_bsp version SHALL only be replayed with a period in
`{1, 5, 15, 30, 60}` (single value). An unsupported period SHALL fail fast at
**run creation** with an HTTP 4xx (no run row persisted) and SHALL also be
defended at execution time with a bounded error code that marks the run failed
with an error message. Daily (1440) replay is out of scope.

#### Scenario: A chan_bsp run is created with an unsupported period

- **WHEN** a client creates a chan_bsp run with a period outside
  `{1, 5, 15, 30, 60}`
- **THEN** the create request MUST fail fast with HTTP 400 and error code
  `CHAN_BSP_PERIOD_UNSUPPORTED`
- **AND** no run row MUST be persisted

#### Scenario: A chan_bsp run reaches execution with an unsupported period

- **WHEN** a chan_bsp run (including legacy runs created before kind snapshot,
  or bypassing create) has a period outside `{1, 5, 15, 30, 60}`
- **THEN** execution MUST fail fast with `BacktestRunFailure`
  `BACKTEST_CHAN_BSP_PERIOD_UNSUPPORTED`
- **AND** it MUST mark the run failed and record the error message

#### Scenario: A chan_bsp run uses a supported period

- **WHEN** a chan_bsp run has a period in `{1, 5, 15, 30, 60}`
- **THEN** replay MUST proceed with that period as the structure level

### Requirement: Chan Bsp Replay SHALL Skip Quantity Profile Gating

Chan Bsp replay SHALL NOT be gated on historical quantity (volume/amount)
availability, because chan_bsp rules consume only OHLC and force values. The
existing DSL quantity profile gate MUST remain unchanged for `rule_dsl`
versions, at both run creation and execution.

#### Scenario: A chan_bsp run is created despite missing historical quantity

- **WHEN** a client creates a run for a chan_bsp version whose historical
  quantity profile is not yet proven
- **THEN** the create request MUST succeed through the chan_bsp compile path
- **AND** the existing DSL quantity gate MUST NOT reject it

#### Scenario: Historical bars lack volume or amount

- **WHEN** chan_bsp replay encounters bars with missing quantity
- **THEN** it MUST still evaluate the structure from OHLC and force values