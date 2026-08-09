# Specification: backend-candle-pipeline-observability

## ADDED Requirements

### Requirement: Snapshot aggregation is traced

Each accepted snapshot SHALL be traced with a root span `candle.snapshot.process`
covering the full aggregation chain (WS client validation, ingress, queue,
aggregator, due registration). Every skip/invalidate judgment point SHALL be
recorded as a span event with a bounded reason; the span SHALL be marked
errored when the snapshot is fully rejected or invalidated.

#### Scenario: Snapshot aggregates successfully

- **WHEN** a frame passes all client validation and the aggregator opens,
  updates, or rolls over a candle
- **THEN** a `candle.snapshot.process` span MUST exist covering the chain
- **AND** the span MUST complete with status OK
- **AND** an `aggregated{outcome}` event MUST record the outcome
- **AND** an info log `candle aggregated` MUST be emitted with the outcome

#### Scenario: Snapshot is skipped at a judgment point

- **WHEN** the aggregator skips a snapshot for any of the six reasons
  (no_event_time, out_of_session, late_after_grace, not_aggregation_eligible,
  duplicate_or_late, candidate_capacity_exceeded)
- **THEN** a `skipped{reason}` span event MUST be recorded
- **AND** a warn log MUST be emitted with the reason
- **AND** every skip reason MUST be counted (previously only two were)

#### Scenario: Snapshot is invalidated

- **WHEN** the aggregator invalidates a candle (invalid_price, counter_reset,
  queue_overflow, redis_due_registration_failed)
- **THEN** an `invalidated{reason}` span event MUST be recorded
- **AND** the span MUST be marked errored

#### Scenario: Client rejects a frame

- **WHEN** the WS client rejects a frame (transport not ready, decode error,
  symbol invalid, not authorized, converter error)
- **THEN** a `rejected{reason}` span event MUST be recorded
- **AND** the span MUST be marked errored
- **AND** a warn log MUST be emitted

### Requirement: Silent data-loss points are observable

Backend judgment points that currently drop data with no counter or log SHALL
record a span event and a warn log: ingress product-sink throw swallow,
registerDueIfFirst too-late, startup-boundary skip, early ingest gate,
no-Redis-client returns, malformed due member, and isAlreadySealed read
failure.

#### Scenario: Product sink throws

- **WHEN** `product.handleSnapshot` throws inside the ingress try/catch
- **THEN** a `product_sink_failed` span event MUST be recorded
- **AND** a warn log MUST be emitted (previously silent)

#### Scenario: Due registration is too late

- **WHEN** a snapshot arrives after the bucket grace window for registration
- **THEN** a `due_registration_too_late` span event MUST be recorded
- **AND** a warn log MUST be emitted

#### Scenario: Malformed due member

- **WHEN** the due scanner decodes a malformed member
- **THEN** a span event MUST be recorded
- **AND** a warn log MUST be emitted

### Requirement: Due finalization is traced

Each due member processed by the scanner SHALL be traced with a root span
`candle.due.finalize`. Sealed and discarded outcomes SHALL be recorded as span
events; finalization failures SHALL mark the span errored.

#### Scenario: Candle is sealed

- **WHEN** a due member finalizes a valid candle
- **THEN** a `candle.due.finalize` span MUST exist
- **AND** a `sealed` event MUST be recorded
- **AND** the span MUST complete with status OK
- **AND** an info log `candle finalize` MUST record result=sealed

#### Scenario: Candle is discarded

- **WHEN** a due member finalizes with no valid candidate (no_snapshot,
  backend_restart_open_state_lost) or an invalidated candidate
- **THEN** a `discarded{reason}` span event MUST be recorded
- **AND** the span MUST be marked errored
- **AND** a warn log MUST record the discard reason

#### Scenario: Hard horizon is exceeded

- **WHEN** a due member passes its finalization hard horizon
- **THEN** a `finalization_horizon_exceeded` span event MUST be recorded
- **AND** the span MUST be marked errored

### Requirement: Candle health metrics are exported

The backend SHALL export its candle counters as OTel metrics via observable
gauges reading the existing process-local counters.

#### Scenario: Sealed count is scraped

- **WHEN** the metric reader collects
- **THEN** `mist_candle_sealed_total` MUST report the current process-local
  sealed candle count
- **AND** `mist_candle_discard_total{reason}` MUST report per-reason discard
  totals with bounded reasons

### Requirement: Metric labels are low cardinality

All metrics SHALL use bounded enumeration labels. Skip, invalidate, and
discard reasons SHALL be drawn from documented allowlists. Symbols and
security IDs MUST NOT appear as metric labels (span attributes only).

#### Scenario: Reason is bounded

- **WHEN** a skip or discard is recorded
- **THEN** the `reason` label MUST be from the documented allowlist
- **AND** the raw error text MUST NOT be a label value
