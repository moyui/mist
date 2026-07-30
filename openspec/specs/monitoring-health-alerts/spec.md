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

Monitoring SHALL report each TDX and QMT source mode, control readiness,
subscription convergence, snapshot freshness and error state independently. An
explicit source `off` mode MUST be represented as operator-controlled rollback
rather than ordinary healthy readiness or transport failure. Provider silence
outside trading hours MUST NOT be treated as proof of failed control or
successful unsubscribe. Bridge owner/control readiness MUST be consumed
directly from datasource root/scoped HTTP health; backend connection and
`transportReady` MUST remain a separate compatibility signal.

#### Scenario: Production realtime is builtin

- **WHEN** the verified production configuration enables TDX or QMT realtime
- **THEN** monitoring MUST probe that source's mode, owner/control readiness,
  subscription convergence, snapshot age and error state through source-labelled
  formal metrics
- **AND** it MUST NOT use backend-cached bridge owner/build fields as the
  bridge-readiness authority

#### Scenario: Source is intentionally off

- **WHEN** an operator sets TDX or QMT to `off`
- **THEN** monitoring MUST report that source's intentional rollback mode
- **AND** it MUST NOT emit control-unavailable or freshness alerts for that
  source solely because its owner, subscription or snapshot is absent
- **AND** monitoring and metrics for the other enabled source MUST remain active

#### Scenario: QMT realtime mode is disabled

- **WHEN** QMT is configured as `off`
- **THEN** monitoring MUST emit no QMT control-unavailable or freshness alert
- **AND** TDX bridge health and source-labelled metrics MUST remain present

#### Scenario: Enabled source is within startup or session grace

- **WHEN** an enabled source has not yet acquired ready owner/control, converged
  subscription or a fresh snapshot but its applicable startup/session grace has
  not elapsed
- **THEN** monitoring MUST expose the current control and freshness states
  without firing the corresponding unavailable or stale alert

#### Scenario: Provider control is ready without a fresh snapshot

- **WHEN** owner/control health is ready but no supported-session observation is expected
- **THEN** monitoring MUST show control readiness separately from freshness
- **AND** it MUST not page solely because the market is closed

#### Scenario: Supported session has stale data

- **WHEN** the configured symbol set is active during a supported Beijing trading session and datasource-observed snapshot age exceeds its threshold
- **THEN** monitoring MUST report a realtime freshness failure for that source

#### Scenario: Enabled source has no fresh owner or snapshot

- **WHEN** an enabled source remains without a ready owner/control, converged
  subscription or fresh snapshot beyond its applicable startup/session grace
- **THEN** monitoring MUST emit a source-labelled formal realtime alert with
  stable health evidence
- **AND** the alert MUST distinguish control, subscription and freshness failure

#### Scenario: QMT polling path reappears

- **WHEN** maintained runtime, health or frames identify periodic `get_full_tick` realtime acquisition
- **THEN** monitoring MUST report a contract/configuration failure
- **AND** the callback release MUST not be considered healthy

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

### Requirement: TDX and QMT control results use one metric shape

Datasource SHALL export:

```text
mist_realtime_subscription_control_total{
  source,
  operation,
  result,
  reason
}
```

`source` SHALL be `tdx|qmt`, `operation` SHALL be
`sync_subscriptions|subscribe|unsubscribe|get_subscriptions`, and `result`
SHALL be only `success|failure`. `reason` SHALL be exactly `"none"` when
`result=success`; when `result=failure`, `reason` SHALL be one documented,
bounded stable code and MUST NOT be empty or free-form.

#### Scenario: Subscription control succeeds

- **WHEN** any supported TDX or QMT subscription-control operation completes
  successfully
- **THEN** datasource MUST increment the common counter with the matching
  `source` and `operation`, `result=success` and `reason="none"`
- **AND** the success sample MUST contain all four labels

#### Scenario: QMT unsubscribe returns an unexpected value

- **WHEN** datasource rejects the native return as unsuccessful
- **THEN** it MUST increment the common counter with `source=qmt`, `operation=unsubscribe`, `result=failure` and `reason=QMT_UNSUBSCRIBE_UNCONFIRMED`
- **AND** it MUST retain the original ID in datasource state and journal

#### Scenario: TDX cancellation does not converge

- **WHEN** the valid fresh terminal-native list still contains the cancelled symbol
- **THEN** it MUST increment the same metric shape with `source=tdx`, `operation=unsubscribe`, `result=failure` and `reason=TDX_UNSUBSCRIBE_NOT_CONVERGED`

#### Scenario: TDX cancellation cannot be verified

- **WHEN** the post-cancellation native list probe fails, times out, is fenced or cannot be normalized
- **THEN** it MUST increment the same metric shape with `source=tdx`, `operation=unsubscribe`, `result=failure` and `reason=TDX_UNSUBSCRIBE_VERIFY_FAILED`

#### Scenario: Unsubscribe state is displayed

- **WHEN** a backend-facing failure carries
  `subscriptionState=subscribed|unknown`
- **THEN** dashboards or operator views MAY render that response field
- **AND** monitoring MUST NOT add `subscriptionState` as a metric label
- **AND** the common counter schema MUST remain identical for TDX and QMT

#### Scenario: Multi-call reset partially fails

- **WHEN** one or more native steps fail
- **THEN** the final `sync_subscriptions` observation MUST use `result=failure`
- **AND** individual native-call diagnostics MAY be emitted as bounded structured logs
- **AND** the metric `result` enum MUST remain exactly `success|failure`

### Requirement: QMT datasource exposes observable subscription state

QMT health and metrics SHALL expose only low-cardinality datasource-known
state: whether a whole handle is present, single-handle count, desired-symbol
count, private retained-recovery count, `reconciliationRequired`, current
owner/generation readiness, control busy state, journal health and last
datasource-observed snapshot time.

#### Scenario: QMT subscriptions are active

- **WHEN** datasource has a non-null `whole` bucket with an exact integer
  `whole.subId`, including `0`, and zero or more single entries
- **THEN** health MUST report whole-present and aggregate single count
- **AND** presence MUST be determined by bucket/key existence rather than ID truthiness or sign
- **AND** metrics MUST not label the individual IDs or symbols

#### Scenario: Subscription ID remains after unsubscribe failure

- **WHEN** datasource retains an ID because unsubscribe was not confirmed
- **THEN** the common control failure counter and structured diagnostic MUST make that fact visible
- **AND** the backend-facing result MUST report `subscriptionState=unknown`
- **AND** health MUST continue to count the retained ID as current datasource-known state

#### Scenario: Confirmed unsubscribe cannot be made durable

- **WHEN** datasource retains an ID as `retained-recovery` after native unsubscribe success because result or registry-transition durability failed
- **THEN** the common control counter MUST use `reason=QMT_JOURNAL_DURABILITY_FAILED`, `result=failure` and the active control operation
- **AND** health MUST set `reconciliationRequired=true` and increment only an aggregate retained-recovery count
- **AND** health and diagnostics MUST distinguish that conservative retained record from proof of a physical live handle
- **AND** no metric label may contain the ID, symbol or retention marker

#### Scenario: Datasource restarted without proven state

- **WHEN** the in-memory registry was lost while physical QMT subscriptions may survive
- **THEN** health MUST report operator reconciliation required
- **AND** it MUST not infer current handle count from silence

### Requirement: Journal health is monitored

Datasource SHALL monitor journal creation, append, flush, `fsync`, rotation,
compaction, hash verification and archive-cap failures. Health SHALL expose
bounded active/archive byte counts, configured thresholds, last successful
rotation/compaction time, configured resolved-detail retention, sealed
checkpoint generation, `reconciliationRequired` and whether unresolved evidence
is pinned. It SHALL expose the configured path only in protected local
diagnostics, not as a metric label.

#### Scenario: Journal mutation succeeds

- **WHEN** a subscription lifecycle record becomes durable
- **THEN** datasource MUST update journal success time and failure state

#### Scenario: Journal mutation fails

- **WHEN** create, append, flush or `fsync` fails
- **THEN** monitoring MUST report a QMT journal failure
- **AND** subscription control MUST not report the affected mutation as successful

#### Scenario: Journal rotation or compaction succeeds

- **WHEN** datasource durably publishes a rotation manifest, `rotation_anchor`, per-ID `compaction_checkpoint` or rolling sealed-range checkpoint
- **THEN** health MUST update the corresponding last-success time and bounded byte state
- **AND** it MUST not emit archive name, path, digest, symbol or subId as a metric label

#### Scenario: Journal maintenance cannot preserve evidence within its cap

- **WHEN** rotation, compaction or hash verification fails, or unresolved pinned evidence reaches the configured archive limit
- **THEN** journal health MUST become failed before another native mutation is exposed
- **AND** monitoring MUST distinguish `rotation`, `compaction`, `hash` and `pinned_capacity` through a fixed low-cardinality reason
- **AND** control readiness MUST remain false until the deterministic recovery procedure succeeds

### Requirement: Datasource-observed snapshots have bounded metrics

Monitoring SHALL measure only callback snapshots that reach datasource: accepted/rejected submissions, native code count, last accepted time and rejection reason. It SHALL not add bridge telemetry to the subscription wire.

#### Scenario: Multi-code QMT snapshot is accepted

- **WHEN** datasource accepts a callback map
- **THEN** it MUST increment one submission counter and add the bounded number of code entries to a symbol-count observation
- **AND** it MUST not use provider symbol as a metric label

#### Scenario: One native entry is rejected

- **WHEN** datasource rejects one malformed or non-member code while accepting others
- **THEN** it MUST record the rejected entry with a stable low-cardinality reason
- **AND** valid entries MUST remain countable as accepted

#### Scenario: Bridge queue overflows before datasource sees an item

- **WHEN** a callback is dropped only inside QMT bridge
- **THEN** the bridge MAY emit a bounded local log
- **AND** datasource monitoring MUST not claim it observed that callback or expose fabricated queue metrics

#### Scenario: TDX producer chain is removed

- **WHEN** post-change TDX health, metrics and rejection reasons are inspected
- **THEN** they MUST NOT expose producer-sequence state, duplicate counters,
  out-of-order producer counters or `producerSequence`
- **AND** datasource MAY expose accepted/rejected schema-v2 snapshot counts
- **AND** it MUST NOT expose datasource-owned formal sequence health

#### Scenario: TDX snapshot POST fails

- **WHEN** TDX bridge cannot deliver one snapshot in its single attempt
- **THEN** bridge MAY emit one bounded local diagnostic
- **AND** datasource MUST NOT claim it observed, rejected or deduplicated that snapshot

### Requirement: Metric labels remain low cardinality

Realtime subscription and snapshot metrics MUST NOT use provider symbols, QMT
IDs, QMT `callSequence`, owner identity, lease secrets, journal paths or
free-form exception text as labels.

#### Scenario: Symbol-specific diagnosis is required

- **WHEN** an operator needs to identify a failed symbol or retained ID
- **THEN** datasource MUST use redacted, bounded and rate-limited structured logs
- **AND** dashboard metrics MUST retain only the common low-cardinality dimensions

#### Scenario: Lease information is rendered

- **WHEN** health, logs or metrics are generated
- **THEN** the opaque lease token MUST never be included

### Requirement: Unified formal frame version is visible

Monitoring SHALL identify schema v2 as the only accepted TDX/QMT formal
contract. Source health SHALL remain independent, while source/version
divergence SHALL be a contract failure. Backend SHALL distinguish formal-frame
decode results from per-entry canonical conversion results.

#### Scenario: QMT schema-v2 frame is accepted

- **WHEN** backend accepts a QMT native map frame
- **THEN** source health MUST update QMT accepted-frame time
- **AND** monitoring MUST record the bounded number of accepted and rejected
  native entries independently

#### Scenario: TDX schema-v2 frame is accepted

- **WHEN** backend accepts a TDX schema-v2 one-entry native map through the new TDX converter
- **THEN** source health MUST update TDX accepted-frame time
- **AND** monitoring MUST record one accepted canonical entry

#### Scenario: Legacy or wrong version reaches a decoder

- **WHEN** either source sends schema v1, an unknown version or removed formal metadata
- **THEN** monitoring MUST record a stable contract rejection reason
- **AND** it MUST not mark that frame fresh

#### Scenario: One QMT entry fails conversion

- **WHEN** one QMT native-map entry fails provider-symbol, allowlist or native
  conversion while another entry succeeds
- **THEN** monitoring MUST count one rejected and one accepted entry
- **AND** source freshness MAY advance from the accepted entry
- **AND** provider symbol MUST remain outside metric labels

#### Scenario: Every entry fails

- **WHEN** one valid formal envelope produces zero canonical snapshots
- **THEN** monitoring MUST retain the decoded-frame observation and record zero
  accepted entries plus bounded rejection reasons
- **AND** it MUST not advance canonical accepted freshness

### Requirement: Canonical ingress health contains no transport ordering state

Backend health and diagnostics SHALL describe latest canonical state by
`securityId` plus provider runtime readiness/freshness. They SHALL NOT expose
formal epoch/sequence state or ordering rejection counters.

#### Scenario: Source runtime health is rendered

- **WHEN** a TDX or QMT runtime status is requested
- **THEN** it MAY include connection/readiness, owner generation, build IDs,
  last accepted/captured times, stale state, last error and bounded contract
  rejection counts
- **AND** it MUST NOT include `currentStreamEpoch`, `lastSequence`,
  `epochMismatch`, `duplicate` or `outOfOrder`

#### Scenario: Latest snapshot is rendered

- **WHEN** an internal diagnostic resolves a provider symbol
- **THEN** it MUST display the canonical `securityId`, `providerSymbol`,
  provider `eventTime`, `capturedAt` and backend freshness metadata
- **AND** it MUST NOT display a formal sequence or snapshot epoch

#### Scenario: Equal native state is accepted again

- **WHEN** common ingress accepts provider state equal to the current latest
- **THEN** accepted-entry/freshness monitoring MAY advance
- **AND** no duplicate or out-of-order rejection metric may be incremented

#### Scenario: Backend source business allowlist rejects an identity

- **WHEN** a provider-symbol entry cannot resolve through its connection source
  business allowlist
- **THEN** backend monitoring MUST use a stable low-cardinality allowlist rejection
  reason
- **AND** it MUST not use `securityId` or `providerSymbol` as a metric label
