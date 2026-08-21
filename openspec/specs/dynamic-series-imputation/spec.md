# dynamic-series-imputation Specification

## Purpose
TBD - created by archiving change add-dynamic-series-imputation. Update Purpose after archive.
## Requirements
### Requirement: Series Imputation Shall Apply One Unified Bidirectional Rule To OHLC And Quantity Fields

The shared series imputer SHALL apply one unified rule to OHLC (open/high/low/close as a
four-tuple) and to quantity fields (volume/amount independently). A missing value inside the
sequence with a later valid anchor SHALL be back-filled from the nearest later anchor
(`backfilled`); a missing value at the end of the sequence SHALL be forward-filled from the
nearest earlier anchor (`forwardFilled`); a missing value with no anchor anywhere in the
sequence SHALL remain unavailable. An OHLC anchor SHALL require all four of open/high/low/close
to be present and finite; a quantity anchor SHALL require the field to be a valid canonical
decimal string. No interpolation, averaging or invented values SHALL be introduced.

#### Scenario: A leading missing value is imputed
- **WHEN** the sequence starts with a missing value and a later valid anchor exists
- **THEN** the leading value MUST be back-filled from the nearest later anchor
- **AND** its resolution MUST be `backfilled`

#### Scenario: A middle missing value is imputed
- **WHEN** a missing value sits between two anchors
- **THEN** it MUST be back-filled from the nearest later anchor (not the earlier one)
- **AND** its resolution MUST be `backfilled`

#### Scenario: A trailing missing value is imputed
- **WHEN** one or more trailing values are missing and an earlier anchor exists
- **THEN** each trailing value MUST be forward-filled from the nearest earlier anchor
- **AND** its resolution MUST be `forwardFilled`

#### Scenario: A sequence with no anchor remains unavailable
- **WHEN** no valid anchor exists anywhere in the sequence
- **THEN** every value MUST remain `unavailable`
- **AND** no empty or zero value MUST be invented

#### Scenario: An incomplete OHLC anchor is not an anchor
- **WHEN** only a subset of open/high/low/close is present and finite for a bar
- **THEN** that bar MUST NOT count as an OHLC anchor
- **AND** it MUST itself be imputed from the nearest complete anchor

### Requirement: Imputed Effective Values Shall Be Monotonic And Immutable Once Determined

The projection view SHALL guarantee that once a bar's effective value is determined it never
changes: a hydrated segment (history page, current-day sealed bars, backtest page) SHALL be
imputed deterministically in one pass and frozen; an incrementally appended bar SHALL be
forward-filled only from the last determined anchor and then frozen; a capacity trim SHALL drop
the oldest bars without recomputing the rest. The imputer SHALL NOT recompute the whole window
on each append, so a previously trailing missing value MUST NOT be rewritten when later bars
arrive. Trading-day boundaries SHALL reset the imputation group state, consistent with the
existing quantity projection.

#### Scenario: A hydrated segment is frozen
- **WHEN** a segment is hydrated and imputed
- **THEN** every bar's effective value MUST be final
- **AND** later appends MUST NOT rewrite any of those values

#### Scenario: An appended bar is forward-filled and frozen
- **WHEN** a new bar with a missing field is appended
- **THEN** it MUST be forward-filled from the last determined anchor
- **AND** its value MUST be final
- **AND** a bar that was trailing-missing at hydration MUST NOT be rewritten by the append

#### Scenario: A capacity trim keeps remaining values
- **WHEN** the window trims its oldest bars
- **THEN** the remaining bars MUST keep their previously determined effective values
- **AND** no recomputation of remaining bars MUST occur

### Requirement: Imputation Shall Operate On The Current Evaluation Window Without Look-Ahead

The imputer SHALL treat its input as the current evaluation window whose last bar is the current
evaluation point. Back-filling within the window MAY use only anchors not later than the current
point. Realtime and backtest consumption SHALL therefore observe the same imputation semantics
with no future information.

#### Scenario: Backtest consumes the same imputation semantics
- **WHEN** a backtest evaluates a point t over its current window
- **THEN** the imputation of that window MUST use only anchors at or before t
- **AND** the result MUST equal what the realtime path would produce at the same window

