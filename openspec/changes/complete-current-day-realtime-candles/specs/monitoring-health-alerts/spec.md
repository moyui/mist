## ADDED Requirements

### Requirement: Candle Foundation Health Shall Be Observable Separately
Monitoring SHALL expose bounded market Redis, open candle, due, finalizer, discard, lateness, grace, capacity
and recovery outcomes without changing transport readiness semantics.

#### Scenario: Candle finalization degrades
- **WHEN** Redis, due scanning or evidence validation fails
- **THEN** candle health MUST expose a low-cardinality degraded reason
- **AND** transport connectivity and bridge readiness MUST remain separately reported

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
