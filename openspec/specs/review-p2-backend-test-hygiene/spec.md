# review-p2-backend-test-hygiene Specification

## Purpose
Track the P2 backend test hygiene remediation: coverage exclusions for non-application files, archived Chan diagnostics handling and explicit closure criteria for the selected findings.
## Requirements
### Requirement: Selected backend test hygiene findings are explicit

This remediation batch SHALL select INFRA_REVIEW T10, INFRA_REVIEW T11, and
CODE_REVIEW M4 for implementation. It SHALL also update the cross-repo
`mist-skills` CI contract to match the already-completed P2 skills hygiene
workflow.

#### Scenario: Batch evidence is audited

- **WHEN** the change is ready for archive
- **THEN** its evidence MUST map every selected review ID to changed files and
  verification commands
- **AND** it MUST identify the skills CI contract update as a follow-up to the
  completed skills P2 tooling work

### Requirement: Backend coverage excludes non-application files

The backend Jest coverage configuration SHALL exclude spec files, application
entrypoints, and config files from collected coverage.

#### Scenario: Coverage contract is checked

- **WHEN** `node tools/test-ci-contracts.mjs` runs
- **THEN** it MUST fail if `collectCoverageFrom` lacks exclusions for
  `*.spec.ts`, `main.ts`, or config files

### Requirement: Archived Chan diagnostics are outside the normal Jest suite

One-off Chan diagnostic specs SHALL be preserved under an archive directory that
normal Jest test runs ignore.

#### Scenario: Diagnostic specs are archived

- **WHEN** repository hygiene contracts run
- **THEN** they MUST fail if July diagnostic spec files remain directly under
  `apps/mist/src/chan/test`
- **AND** they MUST fail if Jest does not ignore the Chan test archive directory

### Requirement: Skills CI contract matches uv quality gates

The cross-repo skills CI contract SHALL expect the current uv-based quality
gates for `mist-skills`.

#### Scenario: Skills workflow is checked

- **WHEN** `node tools/test-ci-contracts.mjs` runs with `mist-skills` available
- **THEN** it MUST require `uv sync --frozen --extra dev`
- **AND** it MUST require Ruff, Pyright, Black check, and pytest commands

