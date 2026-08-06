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
