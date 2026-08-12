## ADDED Requirements

### Requirement: Production readiness is governed by ordered gates

The Mist production roadmap SHALL organize cross-repository stabilization work
as ordered readiness gates instead of an undifferentiated priority backlog.

#### Scenario: A later gate is considered ready

- **WHEN** a later production-readiness gate is evaluated
- **THEN** every earlier gate SHALL have a final disposition
- **OR** the roadmap SHALL record the accepted deferral, its production impact,
  and the constraint that prevents the unresolved behavior from being treated as
  ready

#### Scenario: Product feature work has a separate roadmap

- **WHEN** a product capability is already governed by a focused feature roadmap
- **THEN** the production roadmap SHALL reference its disposition without
  duplicating its child tasks

### Requirement: Current state is reconciled before new overlapping work

The roadmap SHALL maintain an authoritative disposition ledger for relevant
active, completed, superseded, deferred, and dropped work.

#### Scenario: An old task is no longer executable backlog

- **WHEN** an old roadmap item was completed, replaced by a narrower change, or
  abandoned in favor of an accepted runtime contract
- **THEN** the roadmap SHALL assign it a final disposition
- **AND** it SHALL NOT leave the old unchecked tasks presented as active work

#### Scenario: A newly discovered active change affects readiness

- **WHEN** a valid active change affects a production gate
- **THEN** the roadmap SHALL register the change, its current status, its gate,
  and its exit condition
- **AND** the roadmap SHALL NOT overwrite that child change's own artifacts

### Requirement: Data and analysis correctness is the first executable gate

The roadmap SHALL require datasource evidence, realtime-contract clarity, and
analysis-output correctness before declaring the data and analysis path ready.

#### Scenario: A correctness regression remains active

- **WHEN** an active child change proves that backend analysis output or its
  frontend rendering can be incorrect
- **THEN** the child SHALL remain a data-and-analysis gate blocker until its
  regression tests, implementation, generated evidence, and review surface pass

#### Scenario: A datasource path depends on a live native runtime

- **WHEN** a datasource capability depends on Windows TDX, full-QMT, or another
  native runtime
- **THEN** the gate SHALL require live evidence against that runtime
- **AND** local mocks or fallback files SHALL NOT be treated as proof of the
  native production path

#### Scenario: Realtime behavior is not yet verified

- **WHEN** a realtime path lacks an accepted product contract or live smoke
- **THEN** it SHALL remain disabled, constrained, or explicitly marked
  unverified
- **AND** a focused child change SHALL own the decision and required evidence

### Requirement: Production operations reuse completed foundations

The operations-readiness gate SHALL build on existing deployment, monitoring,
guard, recovery, and bot-integration capabilities instead of recreating them.

#### Scenario: Operations readiness is proposed

- **WHEN** the operations child change is created
- **THEN** it SHALL inventory the completed foundations it reuses
- **AND** it SHALL scope new work to remaining status, diagnosis, notification,
  alert classification, and controlled-recovery gaps

#### Scenario: An operator action mutates production state

- **WHEN** an operator flow can restart, recover, deploy, or otherwise mutate a
  production component
- **THEN** the action SHALL be separated from read-only diagnosis
- **AND** it SHALL name its authentication, approval, rollback, cooldown, and
  manual-intervention behavior

### Requirement: Operator UX follows stable status contracts

The frontend operator-experience gate SHALL depend on stable backend and
operations status contracts.

#### Scenario: Operator console work begins

- **WHEN** the frontend operator-console child change is started
- **THEN** datasource health, freshness, empty-data reasons, and recoverable
  errors SHALL already have named upstream contracts
- **AND** the frontend SHALL continue to use same-origin backend or gateway paths
  rather than calling datasource services directly

#### Scenario: Strategy product UX already has an owner

- **WHEN** frontend work concerns strategy editing, signal history, alert state,
  or backtest results
- **THEN** it SHALL remain governed by the strategy-platform capability rather
  than this production-operations gate

### Requirement: Repeatability work is based on current reproductions

The engineering-repeatability gate SHALL re-audit historical tooling and build
observations before turning them into active tasks.

#### Scenario: A historical tooling issue no longer reproduces

- **WHEN** the documented failure does not reproduce against current repository
  refs with the correct command
- **THEN** the roadmap SHALL mark it completed or dropped with evidence
- **AND** it SHALL NOT create implementation work for the stale observation

#### Scenario: A repeatability issue still reproduces

- **WHEN** a tooling, test, dependency, or build failure reproduces
- **THEN** a child task or focused child change SHALL name the owning repository,
  exact command, expected result, and archive condition

### Requirement: Every child has explicit evidence and disposition

Every implementation or live-validation item SHALL be owned by a focused child
change with verifiable completion criteria.

#### Scenario: A child change is ready to start

- **WHEN** a roadmap item enters implementation or live validation
- **THEN** its child change SHALL name owners, runtime impact, entry dependency,
  exact validation commands, external dependencies, and archive criteria

#### Scenario: Required external access is unavailable

- **WHEN** Windows, TDX, QMT, Docker, monitoring, AstrBot, or network access
  required by a child is unavailable
- **THEN** the item SHALL remain blocked or receive an explicit deferred
  disposition
- **AND** local-only evidence SHALL be recorded as partial rather than complete

### Requirement: Roadmap archive requires final gate dispositions

The roadmap SHALL remain active until every gate item has a final disposition.

#### Scenario: The roadmap is ready to archive

- **WHEN** roadmap archive is proposed
- **THEN** every item SHALL be recorded as completed, superseded, deferred, or
  dropped
- **AND** every deferred or dropped item SHALL include its reason and reopening
  condition where applicable
- **AND** strict OpenSpec validation SHALL pass
