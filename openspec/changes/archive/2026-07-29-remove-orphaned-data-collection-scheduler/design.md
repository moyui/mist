## Context

`DataCollectionScheduler` is a 246-line injectable with a 351-line isolated
unit suite. Current source search shows no import outside its own spec, no Nest
module provider registration, and no production caller. The active schedule
application instead injects `EastMoneyCollectionStrategy` and calls
`collectForAllSecurities()` directly before strategy scanning.

The scheduler predates the experimental TDX realtime slice and mixes two old
ownership ideas: period-to-strategy registration for polling and explicit
start/stop orchestration for streaming. Current polling strategies own batch
collection, while `TdxWebSocketService` owns its Nest lifecycle. Keeping the
orphan therefore provides no fallback but continues to advertise an inactive
architecture.

The earlier experimental HIL gate has been superseded by the accepted
realtime contract/naming baseline now present on `mist/master`. Cleanup starts
from commit `cc9ff8f7f49fc9674ce8ec70f0e3d4485874b431` and does not absorb any
worktree.

## Goals / Non-Goals

**Goals:**

- Remove the orphaned scheduler implementation, its isolated tests, and stale
  scheduler-specific references after proving the source is still unused.
- Preserve the active schedule controller, polling strategies, strategy scan
  ordering, and realtime lifecycle ownership.
- Leave a clean source graph with full backend regression evidence.

**Non-Goals:**

- Replacing the scheduler with another abstraction.
- Changing cron expressions, trading-day checks, collection behavior, scan
  behavior, APIs, database schemas, or realtime modes.
- Broadly simplifying `IDataCollectionStrategy`, its implementations, or
  `DataSourceSelectionService` beyond references made stale by the deletion.
- Modifying datasource, deployment, monitoring, or frontend repositories.

## Decisions

### Use the accepted master baseline

The cleanup is independent of historical experimental HIL branches. Its
baseline is the named `master` commit above, and its verification rechecks
active schedule and realtime ownership without importing worktree content.

### Prove orphan status again immediately before deletion

Implementation starts with repository-wide symbol, import, module metadata,
barrel, script, and current-document searches. Only self references, the
colocated spec, and explicitly stale documentation are acceptable. Any newly
discovered runtime consumer blocks deletion and requires redesign.

### Remove implementation and isolated tests together

The test suite validates only an object that production cannot construct or
call. Retaining those tests after deleting the implementation has no value;
moving their behavior to active strategies would duplicate existing strategy
tests. Active schedule-controller and strategy tests are the regression
authority after removal.

### Do not invent a replacement owner

The schedule app remains the polling trigger and active strategies retain
their current collection methods. Legacy TDX realtime lifecycle remains owned
by its mode-gated service/module. The cleanup must not register a new provider
or move responsibilities merely to preserve the deleted class shape.

### Keep adjacent interfaces unless independently proven removable

Scheduler-related comments are corrected, but optional strategy methods are
not removed merely because the scheduler was their former generic caller.
Concrete consumers, controllers, tests, and mode-specific lifecycle semantics
must be audited separately before any interface contraction.

## Risks / Trade-offs

- **Risk: hidden runtime construction outside static imports** → Search Nest
  metadata, dynamic loading patterns, scripts, tests, and current docs; stop if
  any production path is found.
- **Risk: active schedule behavior changes accidentally** → Do not edit the
  schedule controller or polling strategy logic; run their targeted tests and
  the complete backend suite.
- **Risk: cleanup drifts the accepted realtime baseline** → Record the master
  baseline and keep the cleanup independently revertible.
- **Trade-off: some optional strategy methods may remain apparently unused** →
  Prefer a narrow, reviewable scheduler deletion over an unapproved interface
  refactor.

## Migration Plan

1. Record the accepted `master` baseline and exclude all worktrees.
2. Re-run the orphan reference inventory against the then-current `master`.
3. Delete `data-collection.scheduler.ts` and its colocated spec.
4. Correct stale comments/exports found by the inventory without changing
   active runtime behavior.
5. Run targeted schedule/strategy tests, full Mist tests with coverage,
   typecheck, lint, CI contracts, and `git diff --check`.
6. Commit as an independently revertible cleanup. Rollback is a normal revert;
   no data migration or runtime configuration change is required.

## Open Questions

None. Discovery of a new runtime consumer is a blocker, not an implementation
choice to guess through.
