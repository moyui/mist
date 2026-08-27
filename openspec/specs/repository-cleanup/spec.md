# repository-cleanup Specification

## Purpose
Define the repository cleanup contract: tracked inventory, safe-deletion criteria and user-work protection with auditable evidence for every change.
## Requirements
### Requirement: Repository inventory
The cleanup process SHALL inventory each child repository independently and SHALL classify root-level workspace artifacts separately from repository files.

#### Scenario: Child repository inventory
- **WHEN** cleanup starts for `mist`, `mist-fe`, `mist-datasource`, `mist-skills`, or `mist-deploy`
- **THEN** the process records tracked files, untracked files, ignored artifacts, current branch/worktree state, and dirty status for that repository before making changes

#### Scenario: Root artifact inventory
- **WHEN** cleanup evaluates files directly under `/Users/moyui/sean/mist`
- **THEN** the process treats them as local workspace artifacts unless they are inside a child git repository

### Requirement: Safe deletion criteria
The cleanup process SHALL delete a file or directory only when it is classified as local/generated or when tracked removal has evidence that the project no longer uses it.

#### Scenario: Generated artifact deletion
- **WHEN** a candidate is ignored by git, reproducible from install/build/test commands, and not referenced by current scripts
- **THEN** the process may delete it as a local artifact without changing business behavior

#### Scenario: Tracked removal
- **WHEN** a tracked source, test, documentation, fixture, or deployment file appears obsolete
- **THEN** the process MUST verify lack of imports/references and run targeted validation before removing it

#### Scenario: Uncertain candidate
- **WHEN** the current workflow dependency of a candidate is unclear
- **THEN** the process MUST keep it and record the uncertainty instead of deleting it

### Requirement: User work protection
The cleanup process SHALL preserve pre-existing modified and untracked user work unless the user explicitly approves changing that work.

#### Scenario: Dirty repository
- **WHEN** a child repository has modified or untracked files before cleanup begins
- **THEN** the process records those files and avoids overwriting, reverting, or deleting them unless they are part of the approved cleanup scope

### Requirement: Recurrence prevention
The cleanup process SHALL update ignore rules or generating scripts when safe so removed artifacts do not repeatedly reappear as commit candidates.

#### Scenario: Recreated local artifact
- **WHEN** a normal test/build/deploy command creates a local artifact that should not be committed
- **THEN** the relevant `.gitignore`, test cleanup, or documentation is updated so future git status remains clean

### Requirement: Verification
The cleanup process SHALL run repository-appropriate verification after tracked cleanup changes.

#### Scenario: Backend verification
- **WHEN** cleanup changes tracked files in `mist`
- **THEN** the process runs an appropriate subset of `pnpm run test`, `pnpm run lint`, or `pnpm run build` based on the changed surface

#### Scenario: Frontend verification
- **WHEN** cleanup changes tracked files in `mist-fe`
- **THEN** the process runs an appropriate subset of `pnpm test`, `pnpm lint`, or `pnpm build` based on the changed surface

#### Scenario: Datasource verification
- **WHEN** cleanup changes tracked files in `mist-datasource`
- **THEN** the process runs an appropriate subset of `uv run pytest -m "not live"` and `uv run ruff check .` based on the changed surface

#### Scenario: Skill and deploy verification
- **WHEN** cleanup changes tracked files in `mist-skills` or `mist-deploy`
- **THEN** the process runs the repository's available tests or script syntax checks for affected files

### Requirement: Obsolete Saya artifacts shall be removed safely

The cleanup process SHALL remove Saya source, tests, run scripts, project
registration, Saya-only shared config, Saya-only prompt templates, and
Saya-only dependencies after verifying they are not imported by supported
applications.

#### Scenario: Saya app is removed

- **WHEN** the cleanup removes tracked application code
- **THEN** `apps/saya` SHALL be absent from current source, test, and Nest project
  registration
- **AND** current package scripts SHALL NOT include Saya run targets

#### Scenario: Shared Saya-only artifacts are removed

- **WHEN** shared config, prompt templates, or dependencies are candidates for
  removal
- **THEN** the cleanup SHALL verify no supported app imports them before removal
- **AND** package metadata and lockfiles SHALL remain consistent after dependency
  changes

#### Scenario: Current documentation is scanned

- **WHEN** the cleanup updates current docs
- **THEN** current README and roadmap content SHALL NOT describe Saya as an
  active runtime path
- **AND** archived OpenSpec records MAY retain historical Saya mentions

### Requirement: Orphaned scheduler removal is baseline-gated
The cleanup SHALL start from the recorded accepted `mist/master` realtime
contract/naming baseline and SHALL NOT absorb worktree content.

#### Scenario: Cleanup baseline is selected
- **WHEN** implementation begins
- **THEN** the exact `mist/master` commit is recorded
- **AND** active runtime ownership is rechecked on that baseline

#### Scenario: A worktree contains adjacent experimental work
- **WHEN** repository worktrees are enumerated
- **THEN** their content MUST NOT be imported into this cleanup

### Requirement: Scheduler orphan status is proven before removal
The cleanup SHALL re-establish that `DataCollectionScheduler` has no active
runtime consumer immediately before deleting it.

#### Scenario: Reference inventory confirms the scheduler is orphaned
- **WHEN** source imports, Nest module metadata, providers, controllers,
  barrels, scripts, tests, and current documentation are searched
- **THEN** no production construction or call site may exist
- **AND** only the implementation, its isolated spec, and stale descriptive
  references may remain

#### Scenario: A runtime consumer is discovered
- **WHEN** the inventory finds a production construction, injection, or call
  site
- **THEN** deletion MUST stop
- **AND** the change MUST be redesigned rather than silently migrating that
  consumer

### Requirement: Active collection ownership is preserved
Removing the orphaned scheduler SHALL NOT change active polling, scanning, or
realtime lifecycle behavior.

#### Scenario: Scheduled polling runs after cleanup
- **WHEN** a schedule cron handler executes
- **THEN** it MUST continue to call the current polling strategy directly
- **AND** strategy scanning MUST retain its existing post-collection ordering
  and error isolation

#### Scenario: Realtime mode runs after cleanup
- **WHEN** a legacy or experimental realtime mode is selected
- **THEN** its existing mode-gated module and service MUST retain lifecycle
  ownership
- **AND** no replacement generic scheduler provider may be introduced

### Requirement: Scheduler artifacts and stale references are removed as one unit
The cleanup SHALL remove the orphaned implementation, its isolated tests, and
references made false by that removal while keeping adjacent abstractions
outside the approved scope.

#### Scenario: Tracked scheduler artifacts are removed
- **WHEN** orphan evidence is accepted
- **THEN** `data-collection.scheduler.ts` and its colocated spec MUST both be
  absent
- **AND** current comments and exports MUST NOT describe the scheduler as an
  active consumer

#### Scenario: Adjacent strategy interfaces are inspected
- **WHEN** scheduler-only calls disappear
- **THEN** optional strategy methods MUST be retained unless a separate
  consumer audit and test-backed requirement authorizes their removal
- **AND** this cleanup MUST NOT broaden into collection-strategy redesign

### Requirement: Scheduler cleanup is regression-verified
The completed cleanup SHALL carry focused and full backend verification
evidence.

#### Scenario: Cleanup verification runs
- **WHEN** tracked scheduler artifacts have been removed
- **THEN** schedule-controller and affected strategy tests MUST pass
- **AND** full Mist tests with coverage, typecheck, lint, CI release contracts,
  OpenSpec strict validation, and `git diff --check` MUST pass
- **AND** the final reference search MUST find no scheduler symbol in active
  source or current documentation

