---
name: datasource-bridge-ingest-observability
version: 0.2.0
---

# datasource-bridge-ingest-observability Specification

## MODIFIED Requirements

### Requirement: Snapshot lifecycle is logged

The ingestion SHALL emit structured info logs at three lifecycle points:
entry, frame build, and broadcast. Rejections SHALL emit warn logs with the
bounded reason. Lifecycle logs SHALL be delivered to both stdout (docker logs
fallback) and OpenObserve via OTLP logs (single delivery per log line in
OpenObserve), so that the ingestion lifecycle is queryable by trace_id without
relying on container log tails.

#### Scenario: Lifecycle logs carry trace context

- **WHEN** a snapshot is ingested
- **THEN** entry, frame-build, and broadcast info logs MUST be emitted
- **AND** each log line MUST include the current trace_id when a span is active
- **AND** rejection warn logs MUST include the reason and symbol

#### Scenario: Lifecycle logs are queryable in OpenObserve

- **WHEN** a snapshot is ingested and a rejection occurs
- **THEN** the lifecycle info logs and the rejection warn log MUST be queryable
  in OpenObserve by service_name and trace_id
- **AND** each log line MUST appear exactly once in OpenObserve (no duplicate
  delivery)
- **AND** the log record trace_id MUST match the ingestion span trace_id
