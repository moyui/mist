# Specification: otel-openobserve-observability

## ADDED Requirements

### Requirement: All application services export OpenTelemetry telemetry

Every application service (backend, signal, backtest, chan-api, schedule,
tdx-datasource, qmt-datasource) SHALL initialize the OpenTelemetry SDK before
application logic loads, and SHALL export traces and metrics via OTLP to the
OpenObserve backend.

#### Scenario: NestJS backend starts with OpenTelemetry

- **WHEN** the mist-backend process starts
- **THEN** the OpenTelemetry SDK MUST be initialized before `NestFactory.create`
- **AND** auto-instrumentation MUST capture HTTP, ioredis, and net spans
- **AND** traces and metrics MUST be exported via OTLP HTTP to OpenObserve
- **AND** the service name MUST be `mist-backend`

#### Scenario: Python datasource starts with OpenTelemetry

- **WHEN** the tdx-datasource or qmt-datasource process starts
- **THEN** `opentelemetry-instrument` MUST wrap the uvicorn process
- **AND** FastAPI auto-instrumentation MUST capture HTTP request spans
- **AND** traces and metrics MUST be exported via OTLP to OpenObserve

#### Scenario: OpenObserve endpoint is configurable

- **WHEN** `OTEL_EXPORTER_OTLP_ENDPOINT` environment variable is set
- **THEN** all services MUST send OTLP data to that endpoint
- **AND** authentication headers MUST be sent when configured

### Requirement: OpenObserve replaces Prometheus, Grafana, and monitoring exporter

The Docker Compose stack SHALL include an OpenObserve service as the sole
observability backend. The `monitoring` (exporter), `prometheus`, and `grafana`
services SHALL be removed entirely, along with their volumes, configuration
directories, deploy scripts, and workflows.

#### Scenario: Compose stack has OpenObserve

- **WHEN** the compose stack is deployed
- **THEN** an `openobserve` service MUST be present
- **AND** it MUST persist data to a bind-mounted volume
- **AND** it MUST be on the `mist-network` bridge network

#### Scenario: Deleted services are absent

- **WHEN** the compose stack is inspected
- **THEN** `monitoring`, `prometheus`, and `grafana` services MUST NOT be present
- **AND** `prometheus-data` and `grafana-data` volumes MUST NOT be present
- **AND** the nginx gateway MUST NOT proxy `/grafana/`

#### Scenario: Web gateway starts without grafana dependency

- **WHEN** the `web-gateway` service starts
- **THEN** it MUST NOT depend on a `grafana` service
- **AND** nginx MUST start successfully without grafana upstream resolution

### Requirement: Observability backend health is verified post-deployment

The deployment health check SHALL verify OpenObserve reachability after stack
startup, replacing the deleted monitoring exporter metrics assertion.

#### Scenario: OpenObserve is healthy after deployment

- **WHEN** the deployment health check runs
- **THEN** it MUST verify OpenObserve responds at its health endpoint
- **AND** it MUST NOT check for deleted `mist_monitoring_up` or
  `mist_component_up` metrics

### Requirement: Orphaned diagnostic services are removed

Services that were only consumed by deleted diagnostic controllers and have
zero production callers SHALL be removed, along with their type definitions,
spec files, module registrations, and write-side callsites that become
meaningless without the read side.

#### Scenario: Candle health service is removed

- **WHEN** the backend source tree is inspected after this change
- **THEN** `RealtimeCandleHealthService` MUST NOT be present
- **AND** its type definitions and spec files MUST NOT be present
- **AND** the module registration MUST NOT reference it

#### Scenario: Quantity rejection observability is removed

- **WHEN** the backend source tree is inspected after this change
- **THEN** `RealtimeMarketObservabilityService` MUST NOT be present
- **AND** `recordQuantityRejection` calls in realtime clients MUST NOT be present
- **AND** the converter error path MUST still reject with `converterError` without the quantity sub-recording

### Requirement: Mock environment uses OpenObserve not monitoring exporter

The datasource mock-env tooling SHALL start OpenObserve and verify OTLP
ingestion instead of starting the deleted mist-monitoring exporter and curling
its `/metrics` endpoint.

#### Scenario: Mock stack starts without exporter

- **WHEN** the mock stack is started
- **THEN** it MUST NOT attempt to build or run the mist-monitoring exporter
- **AND** it MUST start an OpenObserve instance instead

#### Scenario: Mock verification checks OpenObserve

- **WHEN** mock verification runs
- **THEN** it MUST verify OpenObserve received telemetry via its API
- **AND** it MUST NOT curl port 9109
