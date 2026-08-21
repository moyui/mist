# review-p2-deploy-runtime-config-live-regression Specification

## Purpose
Define the selected deploy-runtime and live-regression P2 findings (INFRA_REVIEW M6.1/S6/T9, CODE_REVIEW L14) as explicit remediation requirements: centralized deploy runtime defaults, immutable overridable gateway image, behavior-oriented deploy tests and CI-safe datasource live replay without TDX.
## Requirements

### Requirement: Selected deploy and live-regression P2 findings are explicit

This remediation batch SHALL select `INFRA_REVIEW M6.1`, `INFRA_REVIEW S6`,
`CODE_REVIEW L14`, and `INFRA_REVIEW T9` for implementation and evidence.

#### Scenario: Batch evidence is audited

- **WHEN** the change is ready for archive
- **THEN** its evidence MUST map each selected review ID to changed files and
  verification commands
- **AND** the implementation MUST NOT claim unrelated P2 findings are complete

### Requirement: Deploy runtime defaults are centralized

The deploy runtime configuration SHALL provide paths, LAN hostnames, service
URLs, and exposed ports through env examples, workflow env handoff, or script
parameters instead of scattering them through PowerShell bodies.

#### Scenario: Runtime defaults are rendered

- **WHEN** deploy configuration tests create a temporary `.env` from defaults
- **THEN** the rendered configuration MUST contain the selected Docker root,
  datasource root, datasource URL, web gateway port, and public host name
- **AND** tests MUST prove those values can be overridden without editing
  PowerShell source

### Requirement: Gateway image default is immutable and overridable

The default nginx gateway image SHALL use an immutable digest reference while
remaining configurable through `WEB_GATEWAY_IMAGE`.

#### Scenario: Gateway image default is inspected

- **WHEN** compose/config tests inspect the gateway image default
- **THEN** the default MUST include a digest reference
- **AND** docs and env examples MUST describe how operators override it for a
  private or runner-specific mirror

### Requirement: Deploy script tests include behavior checks

`mist-deploy` PowerShell validation SHALL include behavior-oriented tests for
rendered runtime configuration in addition to source-string guard checks.

#### Scenario: Temporary runtime config is validated

- **WHEN** the deploy test suite runs without touching production paths
- **THEN** it MUST create or parse temporary configuration and assert the
  resulting env/compose values
- **AND** failures MUST point to the rendered behavior rather than only a
  missing source string

### Requirement: Datasource live regression is replayable without TDX

`mist-datasource` SHALL provide a CI-safe live replay test that validates a
captured live-shaped TDX payload through the normalized contract path without
requiring a logged-in TDX runtime.

#### Scenario: Captured live payload is replayed

- **WHEN** non-live datasource tests run in CI
- **THEN** the captured fixture replay MUST validate normalized symbol,
  timestamp, and numeric fields
- **AND** real `pytest -m live` tests MUST remain opt-in and discoverable
