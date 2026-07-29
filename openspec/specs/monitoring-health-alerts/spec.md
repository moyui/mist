# monitoring-health-alerts Specification

## Purpose
Define stable datasource, bridge, probe, metric, and alert-delivery
observability across the Windows exporter and Mac watchdog.
## Requirements
### Requirement: Mac watchdog parses datasource health bodies
The Mac watchdog SHALL parse successful datasource `/health` response bodies
into datasource health state and metrics.

#### Scenario: Datasource health reports TDX native HTTP unreachable
- **WHEN** the Mac watchdog probes a datasource health endpoint returning a
  successful HTTP status with `tdxHttpReachable=false`
- **THEN** the collected observation MUST include datasource health details
- **AND** watchdog classification MUST activate `tdx_http_unreachable`
- **AND** collected metrics MUST include `mist_datasource_tdx_http_reachable 0`

#### Scenario: Windows metrics report TDX bridge unavailable
- **WHEN** the Windows exporter reports that the TDX builtin bridge has no fresh
  owner or has divergent desired and applied revisions
- **THEN** watchdog classification MUST activate the corresponding
  `tdx_bridge_unavailable` or `tdx_bridge_subscription_drift` condition
- **AND** it MUST NOT infer bridge readiness from removed `tqInitialized` or
  event-queue fields

### Requirement: Probe and notifier failures are observable
Monitoring collectors SHALL expose probe and alert-delivery failures without
silently collapsing them into generic component-down states.

#### Scenario: Windows local probe returns an error
- **WHEN** a Windows service, process, TCP, Docker, or datasource probe returns
  an error
- **THEN** the Windows exporter MUST emit an error metric with a stable probe
  target label
- **AND** it MUST keep the existing running/up metric compatible with current
  dashboards

#### Scenario: Mac HTTP endpoint probe returns an error
- **WHEN** a Mac watchdog endpoint probe returns an error class
- **THEN** the Mac watchdog MUST emit a probe error metric with stable target
  and error class labels
- **AND** it MUST keep the existing `mist_probe_success` metric

#### Scenario: Alert notification fails
- **WHEN** a notifier returns an error while sending an active or resolved alert
- **THEN** the Mac watchdog MUST expose the notifier failure through a metric or
  other testable sample
- **AND** it MUST continue rendering alert state metrics

### Requirement: HTTP probes and webhooks are bounded and cancellable
Monitoring HTTP calls SHALL honor caller context and finite timeout defaults.

#### Scenario: Shared HTTP probe context is cancelled
- **WHEN** the caller cancels the probe context before the HTTP response
- **THEN** the shared HTTP probe MUST return promptly with a timeout or network
  error class

#### Scenario: Shared HTTP probe has an injected client
- **WHEN** a caller constructs a shared HTTP probe with an injected HTTP client
- **THEN** the probe MUST use that client rather than constructing a new client
  per request

#### Scenario: Webhook notifier has no injected client
- **WHEN** webhook notification is configured without an injected client
- **THEN** the notifier MUST use a finite default timeout
- **AND** it MUST still attach caller context to the request

### Requirement: Metrics render Prometheus metadata
Monitoring metric rendering SHALL include deterministic Prometheus metadata
comments for every rendered metric family.

#### Scenario: Samples are rendered
- **WHEN** `RenderSamples` renders one or more samples
- **THEN** each metric family MUST be preceded by one `# HELP` line
- **AND** each metric family MUST be preceded by one `# TYPE` line
- **AND** sample lines MUST remain deterministic and label-escaped

#### Scenario: Invalid metric names are rendered
- **WHEN** a sample contains an invalid metric name
- **THEN** rendering MUST return an error before emitting partial output

### Requirement: Monitoring names match contract intent
Monitoring SHALL avoid misleading metric or check names for selected watchdog
health checks.

#### Scenario: Health aliases remain as smoke checks
- **WHEN** the existing `snapshot` or `kline` check only probes a health
  endpoint alias
- **THEN** the code MUST rename or document the check as endpoint validation
  rather than a product-level business smoke

#### Scenario: Metric contract is inspected
- **WHEN** tests inspect monitoring metric names
- **THEN** shared Mac and Windows probe metrics MUST be listed in
  `mist-monitoring/docs/metrics.md`
- **AND** names used in collectors MUST match the contract entries

### Requirement: Realtime monitoring follows source lifecycle
Monitoring SHALL probe and classify both TDX and QMT formal realtime readiness in the production `builtin` desired state, and SHALL represent an explicit source `off` mode as operator-controlled rollback rather than ordinary healthy readiness.

#### Scenario: Production realtime is builtin
- **WHEN** the verified production configuration is active
- **THEN** monitoring probes TDX and QMT owner, subscription, snapshot age and error state using source-labelled formal metrics

#### Scenario: Source is intentionally off
- **WHEN** an operator rolls QMT or another supported source to `off`
- **THEN** monitoring reports the intentional mode without emitting a misleading transport-down alert

#### Scenario: QMT realtime mode is disabled
- **WHEN** QMT is configured as `off`
- **THEN** monitoring emits no QMT realtime-unavailable alert while continuing to report TDX bridge health

#### Scenario: Enabled source has no fresh owner or snapshot
- **WHEN** an enabled source remains without a ready owner, converged subscription, or fresh snapshot beyond its startup/session grace
- **THEN** monitoring emits a source-labelled formal realtime alert with stable health evidence

### Requirement: Loopback realtime health is proxied by Windows metrics
The Windows exporter SHALL read source-specific loopback formal realtime health and the Mac watchdog SHALL consume `mist_realtime_*` metrics rather than calling those routes remotely.

#### Scenario: Mac watchdog evaluates realtime health
- **WHEN** the watchdog runs on the Mac host
- **THEN** it derives source readiness from Windows exporter metrics and makes no direct datasource loopback request

#### Scenario: Operator changes a source mode or allowlist
- **WHEN** the Windows workflow applies or rolls back configuration
- **THEN** exporter configuration is regenerated with the effective source mode before the switch is reported converged

### Requirement: Experimental realtime metrics are retired atomically
The formal monitoring release SHALL emit only documented `mist_realtime_*` metric and alert families and SHALL remove experimental config/type/metric names from active exporter and watchdog code.

#### Scenario: Monitoring contract tests run
- **WHEN** exporter and watchdog render realtime metrics
- **THEN** formal names match `mist-monitoring/docs/metrics.md` and old experimental names are absent

### Requirement: Readiness consumers use the normalized component contract
Monitoring, deployment health checks, and automated recovery SHALL consume datasource bridge readiness from the normalized component path and SHALL keep service, transport, bridge-owner, subscription, and freshness evidence distinct.

#### Scenario: Root datasource health is evaluated
- **WHEN** monitoring or deployment reads TDX or QMT root health
- **THEN** it reads bridge-owner readiness from `bridge.ready`
- **AND** does not read `tdxRealtimeBridgeReady` or `collectorReady`

#### Scenario: Bridge-scoped health is evaluated
- **WHEN** a guard reads a source bridge health endpoint
- **THEN** it reads top-level `ready` for both TDX and QMT

#### Scenario: Automated recovery evaluates readiness
- **WHEN** a service is healthy and the transport is connected but the bridge owner is unavailable
- **THEN** recovery classifies the bridge layer explicitly
- **AND** does not treat an absent retired field as evidence that the datasource process is down

### Requirement: QMT historical command capacity is observable
Datasource health and monitoring SHALL expose QMT historical command counts,
limits, retained bytes, oldest ages, and rejection totals using fixed
low-cardinality fields and labels.

#### Scenario: Monitoring scrapes QMT health
- **WHEN** QMT realtime mode is enabled and the strict bridge health contract is
  valid
- **THEN** monitoring emits pending, in-flight, retained-result, byte, limit,
  oldest-age, and rejection metrics
- **AND** rejection reasons are restricted to a fixed allowlist

#### Scenario: Capacity field is malformed
- **WHEN** a required QMT capacity field is missing, negative, non-finite, or
  has the wrong type
- **THEN** monitoring reports a health-contract violation
- **AND** it MUST NOT emit misleading capacity samples
