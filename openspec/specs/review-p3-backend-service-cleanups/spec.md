# review-p3-backend-service-cleanups Specification

## Purpose
Track the P3 backend service-cleanup batch: minimal-shape service cleanups and behavior-adjacent Chan maintenance with explicit closure criteria and regression guards.
## Requirements
### Requirement: Batch 2 backend service P3 findings are explicit

This remediation batch SHALL select exactly these 30 P3 review IDs:
CODE_REVIEW H2 and L3; and CODE_SMELL_REVIEW D1.4, R1.4, R1.5, R1.6, R1.8,
P1.1, P1.2, P1.3, P1.5, T1.5, M1.2, M1.4, M1.6, B1.2, B1.4, B1.6, N1.1,
N1.2, N1.4, N1.5, C1.1, C1.2, C1.3, C1.4, U1.3, O1.2, O1.4, and O1.5.

#### Scenario: Batch evidence is audited
- **WHEN** the change is ready for archive
- **THEN** its evidence MUST map every selected review ID to changed files and
  verification commands
- **AND** each selected ID MUST be classified as implemented, already closed by
  prior evidence, or deferred with a reason
- **AND** the implementation MUST NOT claim unselected P3 IDs are complete

### Requirement: Backend service shape cleanups are guarded

Selected backend service P3 cleanups SHALL be guarded by static contracts when
the finding is about source shape rather than product behavior.

#### Scenario: Shape contracts run
- **WHEN** `node tools/test-ci-contracts.mjs` runs
- **THEN** it MUST fail if selected Batch 2 redundant helpers, stale comments,
  or duplicated literal helpers return to active backend source

### Requirement: Behavior-adjacent Chan cleanup remains stable

Behavior-adjacent Chan cleanup SHALL preserve focused tests and typecheck.

#### Scenario: Focused backend verification runs
- **WHEN** focused Chan/backend Jest tests run
- **THEN** touched behavior MUST remain covered
- **AND** `pnpm run typecheck` MUST pass without deleted-symbol imports

### Requirement: Deferred backend P3 findings are documented

P3 findings SHALL be documented instead of forced when they require schema,
architecture, cross-app source moves, or DI lifecycle changes.

#### Scenario: Deferrals are explained
- **WHEN** this batch records evidence for deferred selected IDs
- **THEN** each deferred row MUST state the reason and later ownership
