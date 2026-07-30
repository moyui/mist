## ADDED Requirements

### Requirement: Realtime signal health is layered and bounded
Monitoring SHALL expose separate low-cardinality health/metrics for candle foundation, handoff/queue,
replay/window/period/Chan, episode/evaluation and Signal/AlertEvent persistence without conflating transport or
future notification health.

#### Scenario: Candle foundation degrades
- **WHEN** grace, due, finalizer, Redis, open-state capacity, discard or replay thresholds fail
- **THEN** candle product health MUST degrade with source/market/reason labels
- **AND** transport connection/readiness MUST retain its own status

#### Scenario: Strategy evaluation degrades
- **WHEN** queue age/retry, reconciler lag, window capacity, incomplete period, episode capacity, decimal
  rejection or transaction failure exceeds its bound
- **THEN** strategy health MUST degrade and block promotion
- **AND** candle sealing and notification status MUST not be relabelled

#### Scenario: Diagnostics contain sensitive or high-cardinality data
- **WHEN** metrics or structured logs are emitted
- **THEN** security/job identity MUST be bounded or hashed
- **AND** complete native payloads, rules, Redis values, credentials and unbounded decimal text MUST be omitted
