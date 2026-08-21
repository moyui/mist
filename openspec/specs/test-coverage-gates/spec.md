# test-coverage-gates Specification

## Purpose
Define CI coverage ratchet gates for mist and mist-datasource: measurement on every CI run, single hard non-regression gate anchored to measured baseline, enforcement through the existing contract runner, exclusion of non-application code and archived coverage reports.
## Requirements
### Requirement: Coverage is measured on every CI run

The `mist` and `mist-datasource` repositories SHALL run coverage measurement on
every CI run that executes the test suite, producing a machine-readable report
(lcov for `mist`, a coverage data file for `mist-datasource`) and a human-readable
text summary. Measurement is a visibility layer and SHALL NOT by itself fail the
build.

#### Scenario: Backend CI measures coverage

- **WHEN** the `mist` `docker.yml` validate job runs
- **THEN** it MUST run a coverage step that emits `coverage/lcov.info` and a
  text summary after the existing Test step
- **AND** the coverage step MUST NOT replace or remove the `test:ci` baseline
  step

#### Scenario: Datasource CI measures coverage

- **WHEN** the `mist-datasource` `ci.yml` test job runs
- **THEN** pytest MUST be invoked with coverage flags (`--cov`, `--cov-branch`)
- **AND** it MUST produce a coverage data artifact

### Requirement: Coverage never regresses below the ratchet baseline

A single hard non-regression gate SHALL enforce that overall line coverage is
greater than or equal to a committed baseline, with zero tolerance. This is the
only coverage gate; it blocks regressions and SHALL NOT enforce arbitrary
numeric targets.

#### Scenario: Backend ratchet gate is enforced

- **WHEN** the `mist` coverage step runs
- **THEN** the Jest `coverageThreshold.global.lines` value MUST be greater than
  or equal to the committed baseline
- **AND** the run MUST fail if measured line coverage falls below the baseline

#### Scenario: Datasource ratchet gate is enforced

- **WHEN** the `mist-datasource` pytest run completes
- **THEN** `--cov-fail-under` MUST be set to the committed baseline
- **AND** the run MUST fail if measured line coverage falls below the baseline

#### Scenario: The ratchet never forces arbitrary targets

- **WHEN** new code with incomplete coverage is added
- **THEN** the gate MUST fail only if the overall measured coverage drops below
  the committed baseline
- **AND** it MUST NOT fail solely because some arbitrary higher target is not met

### Requirement: Ratchet baseline is anchored to measured coverage

The committed baseline SHALL be derived from actual measured coverage, not from
an aspirational target. The baseline tool SHALL write back the larger of the
existing committed baseline and the freshly measured overall line coverage, so
the floor only ever rises. The initial baselines anchor to the post-
`clean-up-test-hygiene` measurements: mist 82.72% lines, datasource 85.75% lines
(gate threshold 85, integer-below-measured to avoid coverage.py round ambiguity).

#### Scenario: Baseline is set from actual coverage

- **WHEN** the baseline tool runs (`tools/coverage-baseline.mjs` for `mist`,
  `scripts/coverage-baseline.sh` for `mist-datasource`)
- **THEN** it MUST read the measured overall line coverage from the coverage
  summary
- **AND** it MUST write a threshold greater than or equal to both the old
  committed value and the measured value
- **AND** it MUST NOT lower the committed baseline

#### Scenario: Baseline tool runs locally, not in CI

- **WHEN** CI executes
- **THEN** CI MUST only read the committed baseline to enforce the gate
- **AND** CI MUST NOT mutate the committed threshold

### Requirement: Coverage enforcement reuses the existing contract runner

Both repositories' coverage configuration SHALL be asserted by the cross-repo
contract runner `tools/test-ci-contracts.mjs`, reusing the existing enforcement
mechanism rather than introducing a parallel one. The runner MUST preserve the
existing `collectCoverageFrom` exclusion contract unchanged.

#### Scenario: Coverage config contract is checked

- **WHEN** `node tools/test-ci-contracts.mjs` runs
- **THEN** it MUST assert that the `mist` Jest config declares a
  `coverageThreshold`
- **AND** it MUST assert that the `mist-datasource` pytest `addopts` includes a
  `--cov-fail-under` baseline

#### Scenario: Existing collectCoverageFrom exclusions are preserved

- **WHEN** `node tools/test-ci-contracts.mjs` runs
- **THEN** it MUST continue to assert that `mist` `collectCoverageFrom` excludes
  `*.spec.ts`, `main.ts`, and config files
- **AND** it MUST NOT weaken any assertion present before this change

### Requirement: Coverage measurement excludes non-application code

Coverage measurement SHALL exclude application entrypoints, non-importable
bridge scripts, configuration, and spec files from the measured source set, so
the baseline reflects application logic rather than scaffolding. The type/DTO/
module exclusions established by `clean-up-test-hygiene` SHALL be preserved.

#### Scenario: Datasource omits builtin bridges and entrypoints

- **WHEN** the `mist-datasource` `[tool.coverage.run]` configuration is read
- **THEN** `builtin_bridge/*` and `*/main.py` MUST be listed in `omit`
- **AND** the configuration MUST document that builtin bridges are covered by
  dedicated exec-harness tests rather than source coverage

#### Scenario: Backend exclusions are preserved

- **WHEN** the `mist` `collectCoverageFrom` configuration is read
- **THEN** it MUST continue to exclude `*.spec.ts`, `main.ts`, config files,
  and the type/DTO/module files added by `clean-up-test-hygiene`
- **AND** coverage MUST NOT include application entrypoints

### Requirement: Coverage reports are archived for audit

Every CI run SHALL upload the coverage report as a workflow artifact, even on
failure, to provide an audit trail. External reporting services (e.g. codecov)
MAY be added as a non-gating layer.

#### Scenario: Coverage artifact is uploaded

- **WHEN** a CI run completes (success or failure)
- **THEN** the workflow MUST upload the coverage report as an artifact
- **AND** the upload step MUST run even if earlier steps failed

#### Scenario: External reporting is non-gating

- **WHEN** an external reporting service (e.g. codecov) is configured
- **THEN** it MUST only read and report coverage
- **AND** it MUST NOT introduce an additional coverage gate
