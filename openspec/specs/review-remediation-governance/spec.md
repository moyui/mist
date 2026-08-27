# review-remediation-governance Specification

## Purpose
Define the review remediation governance: inventory-driven scope, bounded batches, item-to-evidence traceability and retention of production and user-work boundaries.
## Requirements
### Requirement: Review inventory governs remediation scope

The remediation process SHALL use `REVIEW_ITEM_INVENTORY.md` as the source
ledger for review item IDs, titles, decisions, priorities, and handling notes.
Implementation work MUST select explicit review item IDs before editing code.

#### Scenario: Selecting remediation scope

- **WHEN** a remediation child change or implementation batch is started
- **THEN** it MUST list the selected review item IDs and their source documents
- **AND** it MUST state whether each selected item is `必修`, `修-改方案`, or
  `合并修`

#### Scenario: Skipping non-selected items

- **WHEN** a child change does not select a review item
- **THEN** that item MUST remain open in the inventory
- **AND** the child change MUST NOT claim that the unselected item is complete

### Requirement: Remediation is implemented in bounded batches

The remediation process SHALL split work into focused batches rather than one
large patch covering all findings. The first implementation wave MUST prioritize
P0 and P1 items unless the user explicitly chooses a different item.

#### Scenario: First wave planning

- **WHEN** the first remediation implementation wave is planned
- **THEN** it MUST include P0/P1 stabilization work before broad P2/P3 cleanup
- **AND** it MUST keep style-only P3 items out of the critical path

#### Scenario: Child change creation

- **WHEN** a selected batch crosses a major risk boundary
- **THEN** it SHOULD be represented as a child change or separate implementation
  branch with a bounded item list
- **AND** it MUST avoid unrelated refactors outside the selected item IDs

### Requirement: Every completed item has test or verification evidence

Every completed remediation item MUST have a unit test, integration test,
contract test, or explicit substitute verification that proves the risk was
addressed. Substitute verification is allowed for CI, Docker, deployment, and
script-only changes when a normal unit test would not prove behavior.

#### Scenario: Code behavior fix

- **WHEN** a remediation item changes TypeScript, Python, Go, or frontend
  runtime behavior
- **THEN** the implementation MUST add or update a targeted test that fails
  before the fix or directly covers the reviewed risk
- **AND** the completion note MUST list the test file and command

#### Scenario: Infrastructure-only fix

- **WHEN** a remediation item changes a workflow, Dockerfile, Compose file,
  PowerShell script, bash script, or deployment configuration
- **THEN** the implementation MUST include substitute verification such as a
  workflow config test, script self-test, compose config check, image build
  smoke, schema test, or runner smoke
- **AND** the completion note MUST explain why that verification is the right
  proof for the item

#### Scenario: Shared tests cover multiple items

- **WHEN** one test or verification covers multiple `合并修` items
- **THEN** the completion note MUST list every covered review item ID
- **AND** it MUST describe the shared risk that the test proves

### Requirement: Completion evidence is traceable

Completed remediation work MUST include a traceable mapping from review item ID
to changed files and verification commands. A remediation item MUST NOT be
marked complete without that mapping.

#### Scenario: Completing a child change

- **WHEN** a child remediation change is ready for review
- **THEN** its summary MUST include `review-id -> changed files ->
  test/verification command`
- **AND** it MUST mention any selected item that remains incomplete

#### Scenario: Verification cannot run locally

- **WHEN** a required verification needs Windows runner access, production
  network access, or another unavailable external state
- **THEN** the local completion note MUST state the blocker
- **AND** the item MUST remain incomplete until substitute evidence is collected
  or the user explicitly accepts the residual risk

### Requirement: Active production boundaries are preserved

Remediation work MUST preserve the current Mist production topology unless a
separate approved change explicitly modifies it. Backend, Chan API, frontend,
gateway, and MySQL are Docker-stack concerns; the TDX datasource remains a
host-side WinSW service; TDX terminal recovery remains separate from ordinary
datasource code/service updates.

#### Scenario: Deployment remediation touches datasource assumptions

- **WHEN** a deployment remediation item references datasource operation
- **THEN** it MUST distinguish normal `mist-tdx-datasource` service
  update/restart from TDX terminal recovery
- **AND** it MUST NOT introduce a datasource container or NSSM-based active path

#### Scenario: Docker mirror policy is changed

- **WHEN** a remediation item changes Docker image source or mirror behavior
- **THEN** it MUST distinguish Docker Hub image pull failures from GitHub
  Actions archive download failures
- **AND** it MUST preserve or replace the Windows runner mirror workaround with
  documented evidence

### Requirement: Follow-up remediation waves remain traceable

Follow-up remediation waves SHALL preserve the same evidence standard as the
first wave: selected review IDs, changed files, and verification commands must
be recorded before the wave is archived.

#### Scenario: Second wave evidence

- **WHEN** a follow-up remediation wave completes
- **THEN** its evidence MUST map every selected review ID to changed files and
  test or substitute verification commands
- **AND** any selected review ID without passing verification MUST remain
  incomplete

### Requirement: P2 tooling remediation remains evidence-backed

P2 tooling remediation waves SHALL keep the same evidence format as prior
waves, including selected review IDs, changed files, and verification commands.

#### Scenario: Tooling wave completion

- **WHEN** a P2 tooling remediation wave completes
- **THEN** its evidence MUST map each selected review ID to changed files and
  verification commands
- **AND** any selected item without passing verification MUST remain incomplete

