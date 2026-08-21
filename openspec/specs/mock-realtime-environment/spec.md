# mock-realtime-environment Specification

## Purpose
Define mock-env candle assertions backed by OpenObserve evidence instead of retired diagnostic endpoints: two-level assertion structure, absent diagnostic references, explicit OTEL_SERVICE_NAME, module-owned gauge registration and documented mock env vars.
## Requirements
### Requirement: Mock-env candle assertions SHALL use OpenObserve as evidence source

The mock-env verification tool (`mock-verify.sh`) SHALL verify candle sealing behavior
through OpenObserve search API queries (traces, logs, and/or metrics), and SHALL NOT
depend on HTTP diagnostic endpoints (`/internal/realtime/*`) that have been retired.

#### Scenario: Sealed candle count is verifiable via OpenObserve

- **WHEN** the mock-env injects frames into a payable bucket with
  `REALTIME_PRODUCTIZATION_MODE=shadow` and `MIST_REALTIME_REDIS_URL` set
- **THEN** `mock-verify.sh` SHALL confirm that sealed candles exist by querying
  `mist_candle_sealed_total` gauge (or equivalent OO log evidence)
- **AND** the assertion SHALL NOT call `/internal/realtime/candles/status` or any
  retired diagnostic endpoint

#### Scenario: Sealed candle growth is verifiable over time

- **WHEN** the mock-env has frames flowing and the clock offset makes a bucket payable
- **THEN** `mock-verify.sh` SHALL query sealed candle count at two points in time
- **AND** SHALL report growth as a pass, or print a deferred notice (not a failure)
  when the bucket is not yet payable

#### Scenario: End-to-end real-time flow is evidenced by sealed growth

- **WHEN** frames are flowing into a payable bucket in the mock environment
- **THEN** sealed candle count growth over the observation window SHALL serve as
  the end-to-end real-time flow evidence (frames arrived, aggregated, and sealed)
- **AND** verification SHALL NOT require a separate span-recency freshness check —
  span age measures the user-controlled injector, not the pipeline

### Requirement: Mock-env SHALL preserve two-level assertion structure

The mock-env verification SHALL distinguish always-verifiable assertions (frame
ingestion, sealed existence) from time-gated assertions (sealed growth requiring a
payable bucket), matching the original design before the diagnostic endpoint removal.

#### Scenario: Always-verifiable assertions pass outside trading hours

- **WHEN** `mock-drive.py` rewrites eventTime into a target trading session and injects
  frames outside real trading hours
- **THEN** frame arrival and candle processing assertions SHALL pass (24/7 verifiable)
- **AND** sealed growth assertions SHALL print a deferred notice rather than failing

#### Scenario: Time-gated assertions pass when clock offset makes bucket payable

- **WHEN** `MIST_MOCK_CLOCK_OFFSET_MS` advances the clock past a bucket's wall-clock end
- **THEN** sealed growth assertions SHALL confirm `mist_candle_sealed_total` increases
- **AND** the deferred notice SHALL NOT appear

### Requirement: Removed diagnostic endpoint references SHALL be absent from active code

The mock-env verification tool SHALL NOT contain active (non-commented) references to
retired `/internal/realtime/*` diagnostic endpoints. Historical comments explaining
what was removed are permitted.

#### Scenario: No active diagnostic endpoint calls

- **WHEN** `mock-verify.sh` is inspected for active code paths
- **THEN** no uncommented reference to `/internal/realtime/` SHALL exist
- **AND** commented historical references SHALL be limited to explanatory notes

### Requirement: Mock-env backend service name SHALL be explicitly set

The mock-env configuration SHALL explicitly set `OTEL_SERVICE_NAME` for the backend
process to prevent telemetry service-name bleed (the preload default fallback).

#### Scenario: Backend telemetry is attributed to mist-backend in mock-env

- **WHEN** the mock-env backend process starts
- **THEN** `.env.mock` SHALL set `OTEL_SERVICE_NAME=mist-backend`
- **AND** all backend traces, logs, and metrics in the mock OpenObserve SHALL be
  attributed to `mist-backend` (not the preload fallback default)

### Requirement: Backend mock mode SHALL boot without main.ts provider special-casing

When `MIST_MOCK_MODE=true`, the backend SHALL boot without requiring providers from
modules excluded in mock mode. Observability (gauge) registration SHALL follow module
lifecycle: each module SHALL register its own gauges in `OnModuleInit`, and the
bootstrap entry (`main.ts`) SHALL NOT resolve business/observability providers for
registration purposes.

#### Scenario: Mock mode boots while lifecycle module is excluded

- **WHEN** `MIST_MOCK_MODE=true` and `RealtimeSubscriptionModule` is excluded by the
  single AppModule expansion
- **THEN** the backend SHALL boot and listen on its port (no DI resolution failure)
- **AND** lifecycle gauges SHALL NOT be registered (their owning module is absent)
- **AND** candle and compensation gauges SHALL still be registered (their owning
  module is loaded)

#### Scenario: Gauge registration lives in owning modules

- **WHEN** `main.ts` and the realtime modules are inspected
- **THEN** `main.ts` SHALL NOT call `app.get` for gauge registration providers
- **AND** `RealtimeIngressModule` SHALL register candle and compensation gauges in
  `OnModuleInit`
- **AND** `RealtimeSubscriptionModule` SHALL register lifecycle gauges in
  `OnModuleInit`

### Requirement: Mock environment variables SHALL be documented

The mist backend SHALL document mock-mode environment variables in `.env.example` so
that maintainers can discover the mock mode configuration without reading source code.

#### Scenario: Mock env vars are discoverable

- **WHEN** a maintainer reads `.env.example`
- **THEN** `MIST_MOCK_MODE` and `MIST_MOCK_CLOCK_OFFSET_MS` SHALL be listed with
  comments explaining their purpose and that they are local-verification-only
- **AND** both SHALL be commented out (opt-in, never production defaults)
