# datasource-bridge-ingest-observability Specification

## Requirements

### Requirement: Snapshot ingestion emits structured traces

Each accepted or rejected bridge snapshot SHALL be traced with a root span
covering the full ingestion chain. Every rejection decision point SHALL be
visible on the span as an event with a bounded reason, and the span SHALL be
marked errored on rejection.

#### Scenario: TDX snapshot is accepted

- **WHEN** a valid TDX bridge snapshot passes all validation and is broadcast
- **THEN** a root span `tdx.snapshot.ingest` MUST be created covering the full
  ingestion chain
- **AND** the span MUST complete with status OK
- **AND** the acceptance MUST increment `mist_datasource_snapshot_accepted_total{source="tdx"}`

#### Scenario: TDX snapshot is rejected at a judgment point

- **WHEN** a TDX snapshot fails any validation (loopback, ready, timestamp,
  native safety, native decode, owner-epoch, symbol convergence)
- **THEN** the root span MUST record a `rejected` event with the bounded reason
- **AND** the span MUST be marked errored
- **AND** `mist_datasource_snapshot_rejected_total{source="tdx",reason}` MUST be
  incremented with that bounded reason
- **AND** a warn log line MUST be emitted with the reason and symbol

#### Scenario: QMT per-symbol rejection

- **WHEN** a QMT snapshot has one or more symbols rejected in the
  per-symbol accept/reject loop
- **THEN** each rejected symbol MUST be recorded as a span event with its
  bounded reason
- **AND** `mist_datasource_snapshot_rejected_total{source="qmt",reason}` MUST be
  incremented per reason
- **AND** the span MUST be marked errored if no symbols were accepted,
  otherwise completed with the partial-accept outcome recorded

### Requirement: Snapshot lifecycle is logged

The ingestion SHALL emit structured info logs at three lifecycle points:
entry, frame build, and broadcast. Rejections SHALL emit warn logs with the
bounded reason.

#### Scenario: Lifecycle logs carry trace context

- **WHEN** a snapshot is ingested
- **THEN** entry, frame-build, and broadcast info logs MUST be emitted
- **AND** each log line MUST include the current trace_id when a span is active
- **AND** rejection warn logs MUST include the reason and symbol

### Requirement: Snapshot freshness is measurable

The datasource SHALL expose the age of the last accepted snapshot per source
as a gauge.

#### Scenario: Terminal stops pushing

- **WHEN** no snapshot is accepted for a period
- **THEN** `mist_datasource_snapshot_age_seconds{source}` MUST keep increasing
  from the last accepted snapshot time
- **AND** ingestion spans and lifecycle logs MUST stop appearing for that source

### Requirement: WebSocket broadcast failures are observable

Broadcast SHALL be traced as a child span with client count and send-failure
count. A per-client send failure SHALL be logged as a warn and recorded on the
span instead of being silently evicted.

#### Scenario: One client send fails

- **WHEN** a broadcast to a connected client times out or errors
- **THEN** a warn log MUST be emitted with the client identity and error
- **AND** the broadcast child span MUST record the send failure
- **AND** the failing client MUST still be evicted per existing behavior

### Requirement: Bridge readiness and control outcomes are measurable

The datasource SHALL expose bridge readiness, owner staleness, and
subscription-control totals as gauges/counters with bounded labels.

#### Scenario: Bridge is not ready

- **WHEN** the bridge has no owner or the owner is stale
- **THEN** `mist_datasource_bridge_ready{source}` MUST report 0
- **AND** `mist_datasource_owner_stale{source}` MUST report 1 when the owner
  exceeded the staleness window

#### Scenario: Control operation completes

- **WHEN** a subscription control operation succeeds or fails
- **THEN** `mist_datasource_control_total{source,operation,result,reason}` MUST
  be incremented with bounded labels

### Requirement: QMT startup failures are directly observable

QMT startup SHALL be traced with a `qmt.startup` span that covers app
creation, including the context-rebuild observation consumption. A startup
failure SHALL be visible as an errored span plus an error log, and a successful
startup SHALL set `mist_datasource_startup_ok{source="qmt"}=1`.

#### Scenario: Ambiguous context rebuild observation state

- **WHEN** QMT starts with a `context-rebuild-observation.json` coexisting with
  a `.processing` marker
- **THEN** the `qmt.startup` span MUST complete with status ERROR
- **AND** an error log MUST be emitted naming the observation path and the
  processing marker
- **AND** a flush MUST be attempted so the errored span reaches the backend
  before the process exits

#### Scenario: QMT starts cleanly

- **WHEN** QMT startup completes without error
- **THEN** the `qmt.startup` span MUST complete with status OK
- **AND** `mist_datasource_startup_ok{source="qmt"}` MUST be set to 1

### Requirement: Metric labels are low cardinality

All metrics SHALL use bounded enumeration labels. Rejection reasons SHALL be
drawn from the documented allowlist for each source. Symbols, owner IDs, lease
tokens, and free-form errors MUST NOT appear as label values.

#### Scenario: Rejection reason is bounded

- **WHEN** a snapshot is rejected
- **THEN** the `reason` label MUST be one of the documented TDX or QMT
  rejection reasons
- **AND** the raw error text MUST NOT be used as a label value
