# review-p2-backend-logging-hygiene Specification

## Purpose
Track the P2 backend logging hygiene remediation: structured NestJS Logger usage on production paths, datasource fallback warnings and explicit closure criteria for the selected findings.
## Requirements
### Requirement: Selected backend logging findings are explicit

This remediation batch SHALL select CODE_REVIEW H11 and CODE_SMELL U1.1 for
implementation in the `mist` backend.

#### Scenario: Batch evidence is audited

- **WHEN** the change is ready for archive
- **THEN** its evidence MUST map every selected review ID to changed files and
  verification commands

### Requirement: Collector production paths use NestJS Logger

`CollectorService` SHALL use NestJS `Logger` for production collection success,
warning, and failure messages instead of global `console.*`.

#### Scenario: Collector logging is verified

- **WHEN** focused collector unit tests run
- **THEN** they MUST prove success, empty data, and failure paths emit through
  `Logger`
- **AND** they MUST prove the service still rethrows collection failures

### Requirement: Datasource fallback warnings use NestJS Logger

`DataSourceService` SHALL use NestJS `Logger` when an invalid default datasource
configuration falls back to `EAST_MONEY`.

#### Scenario: Datasource fallback logging is verified

- **WHEN** datasource service unit tests instantiate with an invalid
  `DEFAULT_DATA_SOURCE`
- **THEN** they MUST prove the warning is emitted through `Logger`
- **AND** the configured default MUST fall back to `EAST_MONEY`

### Requirement: Production console regressions are blocked

The CI contract SHALL fail if selected backend production service files
reintroduce global `console.*` calls.

#### Scenario: Console contract is checked

- **WHEN** `node tools/test-ci-contracts.mjs` runs
- **THEN** it MUST fail if `CollectorService` or `DataSourceService` contains
  `console.log`, `console.warn`, `console.error`, `console.info`, or
  `console.debug`

