# review-p2-backend-http-config-hygiene Specification

## Purpose
Track the P2 backend HTTP and configuration hygiene remediation: configuration-driven external URLs, shared datasource HTTP timeouts and explicit closure criteria for the selected findings.
## Requirements
### Requirement: Selected backend HTTP config findings are explicit

This remediation batch SHALL select CODE_REVIEW M2, CODE_SMELL_REVIEW T1.2,
and CODE_SMELL_REVIEW M1.3 for implementation in the `mist` backend.

#### Scenario: Batch evidence is audited

- **WHEN** the change is ready for archive
- **THEN** its evidence MUST map every selected review ID to changed files and
  verification commands
- **AND** the implementation MUST NOT claim unrelated P2 findings are complete

### Requirement: East Money AKTools URL remains configuration-driven

`EastMoneySource` SHALL create its Axios client with the configured
`AKTOOLS_BASE_URL` value, falling back to the local AKTools default only when
the configuration value is absent.

#### Scenario: Custom AKTools URL is provided

- **WHEN** `AKTOOLS_BASE_URL` is configured
- **THEN** `EastMoneySource` MUST pass that value as the Axios `baseURL`

#### Scenario: AKTools URL is absent

- **WHEN** `AKTOOLS_BASE_URL` is absent
- **THEN** `EastMoneySource` MUST keep using the local default
  `http://127.0.0.1:8080`

### Requirement: Backend datasource HTTP timeout is shared

EF and TDX backend source Axios clients SHALL use the same shared datasource
HTTP timeout constant instead of duplicating literal timeout values.

#### Scenario: Datasource clients are constructed

- **WHEN** `EastMoneySource` or `TdxSource` constructs its Axios client
- **THEN** the timeout passed to `createAxiosInstance` MUST be the shared
  datasource HTTP timeout value

#### Scenario: Timeout regression contract runs

- **WHEN** `node tools/test-ci-contracts.mjs` runs
- **THEN** it MUST fail if EF or TDX source Axios setup reintroduces a literal
  `30000` timeout

### Requirement: Shared Axios helper is strongly typed

`UtilsService.createAxiosInstance` SHALL return `AxiosInstance` rather than
`any`.

#### Scenario: Helper typing is checked

- **WHEN** `pnpm run typecheck` runs
- **THEN** callers MUST see an `AxiosInstance` return type from
  `createAxiosInstance`

#### Scenario: Helper type regression contract runs

- **WHEN** `node tools/test-ci-contracts.mjs` runs
- **THEN** it MUST fail if `createAxiosInstance` is declared with an `any`
  return type

