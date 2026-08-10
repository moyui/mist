# realtime-market-data-ingress Specification Delta

> Delta from change `fix-tdx-realtime-vwap-window-consistency`.

## ADDED Requirements

### Requirement: Bucket quantity windows always span the same frames

A 1m candle's `volume`/`amount` deltas SHALL be derived from one shared set of
snapshot frames. When a snapshot carries a price but its cumulative quantity
fields are partially or fully absent, the aggregation layer SHALL treat it as
a price-only frame: neither quantity window advances, and both resume on the
next frame that carries both cumulative volume and cumulative amount.

#### Scenario: A frame lacks one quantity field
- **WHEN** a canonical snapshot has a valid price but only one of
  `cumulativeVolume` / `cumulativeAmount` (the other is null)
- **THEN** the candle's volume and amount windows MUST both remain unchanged
- **AND** the bucket's `v`/`a` deltas MUST span exactly the same time window

#### Scenario: A frame lacks both quantity fields
- **WHEN** a canonical snapshot has a valid price but both cumulative quantity
  fields are null
- **THEN** the frame MUST update only price state (`o/h/l/c`)
- **AND** quantity windows MUST resume from the next dual-field frame

#### Scenario: Missing quantity frames are observable
- **WHEN** any snapshot is treated as price-only for missing quantities
- **THEN** the aggregation layer MUST increment an observable counter
- **AND** MUST emit a warning log line carrying the trace id

### Requirement: vwap consistency check classifies sampling noise

The operator vwap consistency check (implied average price within a bucket's
`[low, high]`) SHALL classify out-of-range buckets instead of reporting a bare
count. A bucket whose deviation is within the sampling tolerance
(`max(0.6% × close, 5 × (low-high-width))`) SHALL be classified
`sampling_noise`; a bucket violating any true-anomaly criterion (null quantity
with prices present, deviation beyond tolerance, three or more consecutive
same-direction outliers, closing-cumulative monotonicity break) SHALL be
classified `quantity_anomaly`.

#### Scenario: A bucket deviates within sampling tolerance
- **WHEN** `|vwap - nearestBandEdge| ≤ tolerance`
- **THEN** the check MUST classify it `sampling_noise`
- **AND** it MUST NOT be counted as a quantity anomaly

#### Scenario: A bucket violates a true-anomaly criterion
- **WHEN** any true-anomaly criterion holds
- **THEN** the check MUST classify it `quantity_anomaly`
- **AND** the classification vocabulary MUST stay aligned with the
  `capture-realtime-provider-anomalies` quantity deviation boundaries
