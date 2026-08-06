# candle-degraded-event-recovery

## ADDED Requirements

### Requirement: Candle Degraded SHALL Reflect Current Production Health, Not Lifetime History
Candle health SHALL drive every non-deterministic failure counter through a single, uniform
recovery window (`counter > 0 && now - lastFailureAtMs < REALTIME_CANDLE_DEGRADED_RECOVERY_WINDOW_MS`),
so that the `degraded` verdict reports whether the candle production pipeline is currently failing —
not whether it ever failed during the process lifetime. Cumulative totals SHALL be retained
unchanged for monitoring and audit, but SHALL NOT by themselves hold the verdict at `degraded`.

#### Scenario: A transient failure degrades health only within the recovery window
- **WHEN** a non-deterministic failure counter (e.g. `due_scan_failed` after a Redis AOF restart)
  increments once at time T and no further failure of that counter occurs
- **THEN** the corresponding degraded reason MUST be present while `now - T < REALTIME_CANDLE_DEGRADED_RECOVERY_WINDOW_MS`
- **AND** once the window passes with no new failure, the reason MUST clear and health MUST recover to OK
- **AND** the cumulative counter MUST retain its count for monitoring

#### Scenario: A repeated failure refreshes the window
- **WHEN** the same counter increments again inside the recovery window
- **THEN** the failure timestamp MUST refresh to the latest occurrence
- **AND** degraded status MUST persist while failures keep recurring within the window
- **AND** the count MUST keep accumulating without masking recurrence

#### Scenario: A sustained failure stays degraded via timestamp refresh
- **WHEN** a counter increments on every bucket (e.g. sustained queue overflow or a provider
  contract change causing repeated quantity rejections)
- **THEN** the timestamp MUST refresh on each increment
- **AND** health MUST stay degraded for as long as the failures recur, without any special "persistent" category

#### Scenario: Deterministic rejections never degrade health
- **WHEN** a sealed record is rejected because its trading day already expired, or a record exceeds
  the byte limit, or any other deterministic lifecycle transition is recorded as a counter increment
- **THEN** that increment MUST NOT produce a degraded reason
- **AND** the counter MUST still count the occurrence for monitoring/audit
- **AND** only non-deterministic runtime failures SHALL drive the windowed degraded decision

#### Scenario: Single-bucket data loss recovers within the window
- **WHEN** `finalization_horizon_exceeded` or `recovery_gap` records that one minute's candle was lost
- **THEN** health MUST recover to OK once the window passes with no further loss
- **AND** the loss MUST remain recorded in the cumulative counter for audit
- **RATIONALE**: the candle pipeline is an upstream producer; it does not guarantee data
  completeness, and whether a sealed record is consumable is a downstream concern. A single lost
  minute does not mean production is currently broken if subsequent minutes seal normally.

#### Scenario: Queue overflow is driven by two counters sharing one reason
- **WHEN** either `snapshotOverflowTotal` or `dueAdmissionOverflowTotal` increments
- **THEN** the shared `queue_overflow` reason MUST be driven by the more recent of the two
  per-counter failure timestamps
- **AND** each counter MUST retain its own cumulative total and its own `lastFailureAtMs`
- **AND** a fresh failure on either counter MUST refresh the shared degraded window

### Requirement: Last-Failure Timestamps SHALL Be Observed Without High-Cardinality Labels
The runtime observation SHALL expose a `lastFailureAtMs` for every non-deterministic failure
counter, so monitoring can compute failure age, without any free-text or identity labels.

#### Scenario: Observations expose last failure age with bounded labels
- **WHEN** monitoring observes candle health after a transient failure
- **THEN** a `lastFailureAtMs` MUST be exposed for each non-deterministic counter
- **AND** the value MUST be `null` when that counter has never incremented
- **AND** no metric label MAY carry security id, source symbol, run, path, owner or free-text values

### Requirement: The Recovery Window SHALL Be Configured and Bounded
The recovery window SHALL be a validated deployment configuration.

#### Scenario: The recovery window is configured and bounded
- **WHEN** the deployment sets `REALTIME_CANDLE_DEGRADED_RECOVERY_WINDOW_MS`
- **THEN** it MUST be validated to lie within 60000..900000 and default to 300000
- **AND** invalid values MUST fail configuration validation rather than degrade silently

### Requirement: The HIL SHALL Verify Recovery After a Transient Failure
The candle HIL SHALL assert that health recovers within the window after an induced transient
failure, and remove the temporary process-local degraded tolerance.

#### Scenario: HIL verifies recovery after Redis AOF restart
- **WHEN** the candle HIL restarts `mist-realtime-redis` causing a transient due scan failure
- **THEN** the HIL MUST assert health returns OK within the recovery window
- **AND** sealed/discard data and Redis keys MUST be preserved before and after the restart
- **AND** the HIL MUST no longer apply a blanket tolerance for process-local degraded reasons
