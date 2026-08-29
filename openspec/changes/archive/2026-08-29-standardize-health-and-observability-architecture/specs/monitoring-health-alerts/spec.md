# monitoring-health-alerts Specification Delta

## ADDED Requirements

### Requirement: Standardized Raw Health and Liveness Across All Microservices

Every application in the Mist backend stack (`mist`, `backtest`, `signal`, `notification`, `chan`, `schedule`) SHALL expose two distinct operational HTTP endpoints: a lightweight liveness ping at `GET /app/hello` returning plain text, and a structured runtime health snapshot at `GET /health` returning raw JSON conforming to `BaseHealthVo`.

#### Scenario: Health endpoint is queried
- **WHEN** any consumer queries `GET /health` on any Mist application
- **THEN** the response MUST return HTTP 200 with raw JSON (bypassing any API envelope)
- **AND** the payload MUST contain top-level fields `status`, `service`, `instance`, and `timestamp`
- **AND** the `service` and `instance` fields MUST accurately identify the responding service

#### Scenario: Liveness endpoint is queried
- **WHEN** any deployment probe or smoke test queries `GET /app/hello`
- **THEN** the response MUST return HTTP 200 with a simple greeting or liveness string
- **AND** it MUST NOT fail on downstream database or Redis unavailability

### Requirement: Symmetrical Health and Observability Directory Architecture

Every sub-application in `apps/` SHALL organize its health and telemetry implementations in dedicated, symmetrically named subdirectories: `src/health/` and `src/observability/`, with `src/app.controller.ts` at the root for liveness probes.

#### Scenario: Directory and file structure is verified
- **WHEN** inspecting any sub-application in `apps/`
- **THEN** structural health implementations MUST reside in `src/health/` (`health.controller.ts`, `health.vo.ts`, and optional `health-state.service.ts`)
- **AND** OpenTelemetry metrics and runtime observers MUST reside in `src/observability/` (`metrics.ts`, optional `runtime-observability.service.ts`)
- **AND** file names within these subdirectories MUST use semantic un-prefixed names
