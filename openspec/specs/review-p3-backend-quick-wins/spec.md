# review-p3-backend-quick-wins Specification

## Purpose
Track the P3 backend quick-win remediation: targeted dead-code removal and utility cleanup with auditable per-item evidence and explicit closure criteria.
## Requirements
### Requirement: Selected P3 backend quick-win findings are explicit

This remediation batch SHALL select exactly these 30 P3 review IDs:
CODE_REVIEW H1, M1, M3, M4, L1, L2; INFRA_REVIEW I9, T5, T10, T11; and
CODE_SMELL_REVIEW D1.1, D1.2, D1.3, D1.4, D1.6, R1.1, R1.2, R1.3, R1.4,
R1.5, R1.6, R1.8, P1.1, P1.2, P1.3, P1.5, T1.4, T1.5, M1.2, and M1.4.

#### Scenario: Batch evidence is audited
- **WHEN** the change is ready for archive
- **THEN** its evidence MUST map every selected review ID to changed files and
  verification commands
- **AND** each selected ID MUST be classified as implemented, already closed by
  prior evidence, or deferred with a reason
- **AND** the implementation MUST NOT claim unselected P3 IDs are complete

### Requirement: Backend dead code is removed or guarded

Backend P3 dead-code cleanup SHALL remove selected unused classes, constants,
debug comments, and redundant private return fields when current code has no
active consumer for them.

#### Scenario: Dead-code regression contract runs
- **WHEN** `node tools/test-ci-contracts.mjs` runs
- **THEN** it MUST fail if `JudgeTrendVo` is present in active backend source
- **AND** it MUST fail if `ERROR_MESSAGES.BI_INVALID_DIRECTION` is present
- **AND** it MUST fail if selected active backend source files contain stale
  DEBUG comment blocks
- **AND** it MUST fail if `ChannelService.getChannel` returns the unused
  `offsetIndex` field

#### Scenario: Backend typecheck runs
- **WHEN** `pnpm run typecheck` runs
- **THEN** no active backend code may import deleted dead-code symbols

### Requirement: Utility cleanup removes unused helpers

`UtilsService` SHALL retain only helpers that have active production consumers
or focused tests supporting a current contract.

#### Scenario: Unused utility helpers stay removed
- **WHEN** `node tools/test-ci-contracts.mjs` runs
- **THEN** it MUST fail if the removed unused `UtilsService` helpers return
- **AND** `UtilsService.createAxiosInstance` MUST remain covered by focused
  unit tests

### Requirement: Deferred and already-closed P3 findings are documented

P3 findings SHALL be documented in this change when they are already addressed
by prior P2 changes or intentionally deferred.

#### Scenario: Prior evidence is reused
- **WHEN** this batch records evidence for CODE_REVIEW M4 and INFRA_REVIEW
  T10/T11
- **THEN** it MUST point to the archived backend test-hygiene evidence rather
  than duplicate that implementation

#### Scenario: Deferred architecture items are listed
- **WHEN** this batch records evidence for CODE_REVIEW H1, M3, L2,
  CODE_SMELL_REVIEW D1.4, P1.1, and T1.5
- **THEN** it MUST state why each item remains deferred or belongs in a later
  architecture/refactor batch
