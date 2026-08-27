# review-p2-tooling-hygiene Specification

## Purpose
Track the P2 tooling hygiene remediation: backend script and TypeScript-path contracts, datasource repository hygiene and test-backed closure criteria.
## Requirements
### Requirement: Tooling hygiene scope is explicit

The P2 tooling hygiene change SHALL select only INFRA_REVIEW T3,
INFRA_REVIEW D13, INFRA_REVIEW D14, INFRA_REVIEW T8, and CODE_REVIEW L10.

#### Scenario: Scope is recorded before implementation

- **WHEN** the tooling hygiene implementation starts
- **THEN** its tasks and evidence MUST list every selected review item ID
- **AND** it MUST NOT claim unrelated P2/P3 review items are complete

### Requirement: Backend tooling contracts cover scripts and TypeScript paths

The backend package SHALL lint `.mjs` tool scripts through lint-staged, and its
TypeScript configuration SHALL NOT contain stale prompt aliases, duplicate path
targets, or disabled file-name casing checks.

#### Scenario: CI contract checks backend tooling

- **WHEN** `node tools/test-ci-contracts.mjs` runs
- **THEN** it MUST fail if `.mjs` files are not covered by lint-staged
- **AND** it MUST fail if `tsconfig.json` contains `@app/prompts` aliases,
  duplicate path arrays, or `forceConsistentCasingInFileNames: false`

### Requirement: Datasource repository hygiene is test-backed

The datasource repository SHALL ignore local `uv` and Ruff cache directories and
SHALL NOT define a deprecated custom pytest `event_loop` fixture.

#### Scenario: Datasource hygiene metadata is checked

- **WHEN** datasource repository hygiene tests run
- **THEN** `.gitignore` MUST include `.uv-cache/` and `.ruff_cache/`
- **AND** `tests/conftest.py` MUST NOT define a custom `event_loop` fixture

### Requirement: Skills index lookup strips exchange suffix

The `get_index_info` skill SHALL strip exchange suffixes before calling the
backend security endpoint.

#### Scenario: Index code contains an exchange suffix

- **WHEN** `get_index_info.main(code="000001.SH")` runs
- **THEN** it MUST call `MistClient.get("/v1/securities/000001")`
- **AND** it MUST return the backend response unchanged
