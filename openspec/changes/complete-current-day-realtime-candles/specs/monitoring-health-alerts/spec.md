## ADDED Requirements

### Requirement: Candle Foundation Health Shall Be Observable Separately
Monitoring SHALL expose bounded market Redis, open candle, due, finalizer, discard, lateness, grace, capacity
and recovery outcomes without changing transport readiness semantics.

#### Scenario: Candle finalization degrades
- **WHEN** Redis, due scanning or evidence validation fails
- **THEN** candle health MUST expose a low-cardinality degraded reason
- **AND** transport connectivity and bridge readiness MUST remain separately reported

#### Scenario: Finalization exceeds its hard horizon
- **WHEN** an exact frozen candle candidate cannot commit by `bucketEndMs + 60000ms`
- **THEN** candle health MUST expose `finalization_horizon_exceeded` separately from market-evidence discard
- **AND** bounded diagnostics MAY retain the candle identity while metric labels MUST NOT contain security
  identifiers

#### Scenario: Startup cannot recover a theoretical bucket
- **WHEN** an elapsed bucket has neither recoverable due nor terminal evidence after restart
- **THEN** monitoring MUST expose a bounded recovery-gap outcome without synthesizing a market discard
- **AND** `backend_restart_open_state_lost` MUST remain distinguishable from an unregistered recovery gap

#### Scenario: Current-day Redis retention is observed
- **WHEN** monitoring inspects market-owned candle state
- **THEN** it MUST distinguish current-day keys from expired prior-day state
- **AND** it MUST NOT report BullMQ result retention as candle retention
- **AND** prior-day market keys remaining past their Shanghai D+1 00:00 expiry MUST be reported as candle
  retention degradation

#### Scenario: Quantity profile validation is observed
- **WHEN** a provider value is rejected or candle promotion is blocked by an unproved quantity profile
- **THEN** monitoring MUST expose a low-cardinality source, field and reason outcome
- **AND** raw security identifiers or observed quantity values MUST remain in bounded diagnostics rather than
  metric labels
- **AND** transport readiness MUST remain distinct from quantity-profile readiness

#### Scenario: Candle capacity is observed in shadow mode
- **WHEN** candle productization is running in shadow
- **THEN** monitoring MUST expose low-cardinality global pending, maximum per-series pending, snapshot overflow,
  due/finalizer admission overflow, due lag, candidate count and maximum observed record bytes
- **AND** Redis observation MUST include used memory, AOF size and current-day market key growth separately from
  queue job-state observations
- **AND** any queue overflow, record-limit breach, hard-horizon breach or sustained unbounded growth MUST block
  promotion to `on`
