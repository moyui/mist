## ADDED Requirements

### Requirement: Evaluation Quantity Projection Shall Use The Unified Series Imputer

The shared quantity projector consumed by evaluation-context construction SHALL be the unified
series imputer with the same-window bidirectional semantics: a leading or middle missing quantity
SHALL be back-filled from the nearest later anchor, a trailing missing quantity SHALL be
forward-filled from the nearest earlier anchor, and a quantity with no anchor SHALL remain
unavailable. Effective quantity values SHALL be monotonic once determined. The existing
same-trading-day rule SHALL remain: imputation MUST NOT carry quantity values across trading days.

#### Scenario: A leading missing quantity is back-filled
- **WHEN** the evaluation window begins with a missing quantity and a later anchor exists in the
  same trading day
- **THEN** the leading value MUST be back-filled from the nearest later anchor
- **AND** its resolution MUST be `backfilled`

#### Scenario: A trailing missing quantity is forward-filled
- **WHEN** the evaluation window ends with missing quantities
- **THEN** each trailing value MUST be forward-filled from the nearest earlier anchor in the same
  trading day
- **AND** its resolution MUST be `forwardFilled`

#### Scenario: A missing quantity does not cross trading days
- **WHEN** no same-trading-day anchor exists
- **THEN** the quantity MUST remain `unavailable`
- **AND** no value from a previous trading day MUST be carried forward

### Requirement: Indicator Fields Shall Calculate From Effective OHLC

The indicator fields (`indicator.kdj.*`, `indicator.macd.*`) consumed by evaluation-context
construction SHALL be calculated from the effective OHLC values of the projected bars rather
than the raw bar values. When effective OHLC equals raw OHLC (no imputation), indicator
results MUST be unchanged from raw-based calculation.

#### Scenario: An indicator uses imputed OHLC
- **WHEN** a projected bar's effective OHLC differs from its raw OHLC (imputed)
- **THEN** the indicator calculation MUST use the effective values
- **AND** the result MUST be finite

#### Scenario: An indicator is unchanged without imputation
- **WHEN** every bar in the calculation window has observed (non-imputed) OHLC
- **THEN** the indicator result MUST equal the raw-based calculation

### Requirement: Backtest Replay Shall Use Hydrate-Then-Append Imputation

The backtest replay engine SHALL consume the unified series imputer with a two-phase
structure: the initial window segment (the `requiredBarCount` bars preceding the first
evaluation point) SHALL be hydrated once with bidirectional imputation and frozen; each
subsequent bar SHALL be appended one at a time (forward-fill only) and evaluated. Only the
initial window segment SHALL be hydrated; remaining bars SHALL stream in pages. The initial
segment's anchors SHALL all precede or equal the first evaluation point (no look-ahead).
Evaluation timing SHALL remain unchanged: once per appended bar from `run.startDate` onward,
with an unfilled window reported as `insufficient_history`.

#### Scenario: The initial segment is hydrated bidirectionally
- **WHEN** the replay reaches its first evaluation point
- **THEN** the initial window segment SHALL be imputed bidirectionally and frozen
- **AND** a leading gap within the initial segment SHALL be back-filled from a later anchor
  in the same segment

#### Scenario: Later bars are appended only
- **WHEN** a bar after the initial segment arrives with a missing field
- **THEN** it SHALL be forward-filled from the last determined anchor
- **AND** previously frozen values MUST NOT be rewritten
