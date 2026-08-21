# test-hygiene Specification

## Purpose
Define test hygiene gates: tests assert real behavior (no vacuous tests), coverage excludes non-logic declaration files, mock state does not leak between tests, test config/fixtures carry no dead entries and fixtures release resources in teardown.
## Requirements
### Requirement: Tests assert real behavior

A test function SHALL make at least one observable assertion. Tests that only
execute code without asserting an outcome (vacuous tests) SHALL NOT be permitted,
because they report false-green and inflate confidence.

#### Scenario: A scheduled-collection test asserts the resolved call

- **WHEN** the east-money scheduled-collection test runs without an explicit
  trigger time
- **THEN** it MUST pin the resolved "current" time to a deterministic
  trading-session moment
- **AND** it MUST assert the collector service was called with the resolved
  boundary arguments

### Requirement: Coverage excludes non-logic declaration files

Coverage measurement SHALL exclude pure declaration files that contain no
executable logic, so the denominator reflects application behavior rather than
type scaffolding. This augments (does not weaken) the existing exclusion of spec
files, entrypoints, and config files.

#### Scenario: Type and re-export files are excluded

- **WHEN** the backend `collectCoverageFrom` configuration is read
- **THEN** it MUST exclude `*.module.ts`, `*.dto.ts`, `*.interface.ts`,
  `*.types.ts`, `*.enum.ts`, `*.constants.ts`, and `dto/index.ts`
- **AND** it MUST continue to exclude `*.spec.ts`, `main.ts`, and config files

### Requirement: Mock state does not leak between tests

The Jest configuration SHALL reset mock call records and implementations between
every test by default, so a test's assertions are not contaminated by prior
tests' mock interactions.

#### Scenario: ClearMocks is enabled

- **WHEN** the Jest configuration is read
- **THEN** it MUST set `clearMocks: true` globally

### Requirement: Test configuration and fixtures carry no dead entries

Declared pytest markers, fixtures, and teardown branches SHALL correspond to
actual usages. Dead markers, unreferenced fixtures, and ghost-state
save/restore logic SHALL be removed to avoid misleading future contributors.

#### Scenario: Datasource has no dead marker or fixture

- **WHEN** the `mist-datasource` test configuration and `conftest.py` are read
- **THEN** no declared pytest marker MAY have zero usages
- **AND** no fixture MAY have zero references
- **AND** no teardown branch MAY restore an attribute that is never set

### Requirement: Fixture teardown releases resources

Fixtures that allocate resources (event loops, file handles, connections) SHALL
release them in teardown. A fixture that creates an event loop SHALL close it
after the consuming test completes.

#### Scenario: The async_loop fixture closes its loop

- **WHEN** the `async_loop` fixture in `test_tdx_realtime_gateway.py` runs
- **THEN** it MUST `yield` the created loop and call `loop.close()` in teardown
- **AND** the test suite MUST run without `ResourceWarning: unclosed event loop`
