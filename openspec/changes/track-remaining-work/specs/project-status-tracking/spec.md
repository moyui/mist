# project-status-tracking Specification

## ADDED Requirements

### Requirement: Unified tracking of remaining work items

The project SHALL maintain a single tracking view that aggregates all unfinished work items across active OpenSpec changes, code quality remediation items, frontend migration tasks, and environment-blocked verification items.

#### Scenario: Project status is reviewed

- **WHEN** the project负责人 requests a status review
- **THEN** the tracking change SHALL provide a categorized list of all unfinished items
- **AND** each item SHALL include: source (which change or audit), priority (P0-P3), status (coding/env-blocked/deploy-blocked/decision-blocked/deferred/废弃), and blocking conditions
- **AND** the list SHALL distinguish between items that can proceed immediately vs items blocked on environment/decision

#### Scenario: An owning change completes its tasks

- **WHEN** an owning change marks a task as `[x]` in its own tasks.md
- **THEN** the corresponding tracking item SHALL be updated to `已解决` with evidence
- **AND** the tracking change SHALL NOT modify the owning change's tasks.md

#### Scenario: A deprecated item is identified

- **WHEN** an item is determined to be no longer pursued (e.g., abandoned branch, deferred indefinitely)
- **THEN** the tracking item SHALL be marked as `废弃` with reason and date
- **AND** the废弃 status SHALL be recorded in the relevant memory file

### Requirement: Cross-reference accuracy

The tracking change SHALL maintain accurate cross-references to owning change tasks.

#### Scenario: Cross-references are validated

- **WHEN** the tracking change is about to be archived
- **THEN** every cross-reference SHALL be verified against the current state of the owning change's tasks.md
- **AND** any discrepancy SHALL be resolved before archive

### Requirement: Archive readiness

The tracking change SHALL only be archived when all tracked items are resolved or explicitly废弃.

#### Scenario: Archive conditions are checked

- **WHEN** all tracking items are in `已解决` or `废弃` status
- **THEN** the tracking change MAY be archived
- **AND** the archive SHALL include the final status snapshot as evidence
