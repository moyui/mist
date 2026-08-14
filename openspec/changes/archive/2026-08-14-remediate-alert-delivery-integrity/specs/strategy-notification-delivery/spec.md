## ADDED Requirements
### Requirement: Notification Delivery Shall Recover Pending Events After Enqueue Failure

If an AlertEvent is committed as PENDING but its delivery enqueue fails (producer Redis
unavailable), a periodic sweep in the notification worker SHALL detect the event and
re-enqueue delivery. An event SHALL be considered stranded only when it is PENDING, older
than the staleness threshold (5 minutes), and has no per-channel delivery rows at all —
in-flight events (rows exist) and fresh events (younger than the threshold) SHALL NOT be
touched. Re-enqueue SHALL reuse the deterministic fanout job id so duplicate sweeps collapse.

#### Scenario: A committed event was never enqueued
- **WHEN** an AlertEvent stays PENDING with no delivery rows for more than the staleness threshold
- **THEN** the sweep MUST re-enqueue its fanout job
- **AND** duplicate sweep passes MUST collapse onto the same job id

#### Scenario: An event is still being delivered
- **WHEN** an AlertEvent is PENDING but has per-channel delivery rows
- **THEN** the sweep MUST skip it

### Requirement: Notification Delivery Row Creation Failures Shall Fail Loudly

When the fanout service creates per-channel delivery rows, only the known unique-constraint
race (a concurrent fanout already created the row) SHALL be swallowed. Any other database
error SHALL be logged and propagated so the job fails and the event is not silently dropped
with no delivery rows and no alert.

#### Scenario: Delivery row creation hits a non-unique database error
- **WHEN** saving a delivery row fails for a reason other than the unique-constraint race
- **THEN** the fanout job MUST fail and the error MUST be logged
- **AND** no channel job SHALL be enqueued for a row that does not exist

### Requirement: Replay Shall Be An Internal Network Endpoint

The replay endpoint (re-push failed or dead-lettered deliveries) SHALL live under the
`/internal/` path convention used by other worker-internal endpoints (e.g.
`/internal/oo-alert-receiver`), SHALL NOT be exposed to the host or public networks, and
SHALL rely on the compose network boundary as its access control. Replay SHALL NOT
re-evaluate strategy (unchanged).

#### Scenario: Replay is reachable only inside the container network
- **WHEN** a request hits the replay endpoint
- **THEN** the endpoint MUST be under `/internal/` and unreachable from the host/public network

#### Scenario: Replay re-pushes a dead-lettered delivery
- **WHEN** an operator triggers replay from inside the compose network
- **THEN** replay SHALL proceed without re-evaluating strategy
