# review-p1-cleanup Specification

## Purpose
Track the remaining P1 hygiene remediation scope: Python runtime/dev dependency separation, backend package-script hygiene and explicit closure criteria for P1 findings.
## Requirements
### Requirement: Remaining P1 review scope is explicit

The P1 cleanup change SHALL select only the remaining P1 review findings that
were not completed by the first remediation wave: CODE_REVIEW L5,
INFRA_REVIEW D10, INFRA_REVIEW D11, INFRA_REVIEW S9, INFRA_REVIEW 共性2,
CODE_SMELL_REVIEW M1.5, and CODE_SMELL_REVIEW O1.1.

#### Scenario: Scope is recorded before implementation

- **WHEN** the P1 cleanup implementation starts
- **THEN** the tasks and evidence MUST list each selected review item ID
- **AND** the implementation MUST NOT claim unrelated P2/P3 findings are
  complete

### Requirement: Python dependency metadata separates runtime and development tooling

The datasource package SHALL keep test, lint, and type-check tools out of
runtime dependencies. The skills package SHALL keep a deterministic dependency
lock file that can be checked without changing the repository.

#### Scenario: Datasource runtime dependencies are inspected

- **WHEN** dependency metadata is tested
- **THEN** packages such as `pytest`, `pytest-asyncio`, `httpx`, and `ruff`
  MUST NOT appear in `project.dependencies`
- **AND** those packages MUST remain available through an optional development
  dependency group or equivalent dev-only metadata

#### Scenario: Skills dependencies are locked

- **WHEN** dependency locking is verified for `mist-skills`
- **THEN** the repository MUST contain a lock file generated from
  `pyproject.toml`
- **AND** the lock check MUST fail if dependency metadata and the lock diverge

### Requirement: Backend package scripts do not point to missing e2e config

The backend package SHALL NOT expose a `test:e2e` script that references a
missing Jest configuration file.

#### Scenario: Package script contract is checked

- **WHEN** package script contracts are tested
- **THEN** `test:e2e` MUST either be absent or point to an existing
  configuration file
- **AND** ordinary unit/CI test scripts MUST remain available

### Requirement: East Money source uses configured AKTools base URL

The backend EF data source SHALL create its Axios client with the configured
`AKTOOLS_BASE_URL` value, falling back to the existing default only when the
configuration value is absent.

#### Scenario: Custom AKTools URL is provided

- **WHEN** `AKTOOLS_BASE_URL` is configured
- **THEN** `EastMoneySource` MUST pass that value as the Axios `baseURL`

#### Scenario: AKTools URL is absent

- **WHEN** `AKTOOLS_BASE_URL` is absent
- **THEN** `EastMoneySource` MUST keep using the local default
  `http://127.0.0.1:8080`

### Requirement: Chan Bi removal deletes one item

The Chan Bi helper SHALL remove only the item at the requested index and leave
later items intact.

#### Scenario: Removing a middle Bi

- **WHEN** a Bi array contains multiple items and the middle index is removed
- **THEN** only that one item MUST be removed
- **AND** items after the removed index MUST remain in the array

