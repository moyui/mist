# candle-degraded-event-recovery

## ADDED Requirements

### Requirement: Event-Based Candle Degradation SHALL Recover Within a Window
Candle health SHALL treat event-based failures as degraded only while a recent failure timestamp
falls within a bounded recovery window, while persistent conditions (recovery gap, quantity profile
rejection) SHALL remain degraded on cumulative counter basis.

#### Scenario: A transient due scan failure degrades health only within the window
- **WHEN** the due scanner fails once (e.g. Redis AOF restart) at time T and no further failure occurs
- **THEN** `due_scan_failed` MUST be present in `degradedReasons` while `now - T < REALTIME_CANDLE_DEGRADED_RECOVERY_WINDOW_MS`
- **AND** once the window passes with no new failure, health MUST recover to OK without manual action
- **AND** `due.scanFailureTotal` MUST retain the cumulative count for monitoring

#### Scenario: A repeated event failure refreshes the window
- **WHEN** an event-based failure recurs inside the recovery window
- **THEN** the failure timestamp MUST be refreshed to the latest occurrence
- **AND** degraded status MUST persist while failures continue within any window
- **AND** the count MUST keep accumulating without masking recurrence

#### Scenario: Persistent conditions are not windowed
- **WHEN** `recovery_gap` or `quantity_profile_rejected` is observed
- **THEN** degraded status MUST remain active regardless of elapsed time
- **AND** recovery SHALL require the underlying condition to clear, not merely time to pass

#### Scenario: The recovery window is configured and bounded
- **WHEN** the deployment sets `REALTIME_CANDLE_DEGRADED_RECOVERY_WINDOW_MS`
- **THEN** it MUST be validated to lie within 60000..900000 and default to 300000
- **AND** invalid values MUST fail configuration validation rather than degrade silently

#### Scenario: Observations expose last failure age without high-cardinality labels
- **WHEN** monitoring observes candle health after a transient failure
- **THEN** last-failure timestamps/age MUST be exposed with a bounded label set
- **AND** the age MUST be 0/absent when no failure occurred
- **AND** no metric label MAY carry security, run, path, owner or free-text values

#### Scenario: HIL verifies recovery after Redis AOF restart
- **WHEN** the candle HIL restarts `mist-realtime-redis` causing a transient due scan failure
- **THEN** the HIL MUST assert health returns OK within the recovery window
- **AND** sealed/discard data and Redis keys MUST be preserved before and after the restart

#### Scenario: A deterministic rejection does not degrade health
- **WHEN** a sealed record is rejected because its trading day is already expired, or any other
  deterministic, expected lifecycle transition is recorded as a finalization/registration counter
  increment
- **THEN** that increment MUST NOT by itself produce a degraded reason
- **AND** the cumulative counter MUST still count the occurrence for monitoring/audit
- **AND** only failures representing unexpected runtime errors SHALL drive the windowed degraded decision

#### Scenario: Queue overflow has two independent counters with one degraded reason
- **WHEN** either `snapshotOverflowTotal` or `dueAdmissionOverflowTotal` increments
- **THEN** the shared `queue_overflow` degraded reason MUST be driven by the most recent of the two
  per-counter failure timestamps
- **AND** each counter MUST retain its own cumulative total and its own `lastFailureAtMs`
- **AND** a fresh failure on either counter MUST refresh the shared degraded window

### Requirement: Health-Check State and Cumulative State SHALL Be Distinct
The runtime observation SHALL expose cumulative totals (monitoring/audit) and degraded-state inputs
(health check) as separate, independently readable fields, so that historical failure counts never
change the current health verdict by themselves.

#### Scenario: Counters accumulate while health verdict recovers
- **WHEN** an event-based failure occurred longer than the window ago and no new failure happened
- **THEN** the degraded verdict MUST be OK
- **AND** every cumulative total MUST still be exposed unchanged for the monitoring panel
- **AND** the last-failure timestamps MUST expose the age of the most recent failure

#### Scenario: Recovery gap stays degraded across process restarts
- **WHEN** a process start detected a mid-session gap and recorded `recoveryGapTotal`
- **THEN** `recovery_gap` MUST remain degraded for the remainder of the process lifetime
- **AND** the verdict MUST NOT be cleared by a time window
