## ADDED Requirements

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
