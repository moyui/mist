## 1. Lifecycle prerequisite and fresh inventory

- [x] 1.1 Record accepted `mist/master`
      `cc9ff8f7f49fc9674ce8ec70f0e3d4485874b431` as the cleanup baseline and
      confirm no worktree content is included.
- [x] 1.2 Search all active source,
      Nest metadata/providers, barrels, scripts, tests, and current docs for
      `DataCollectionScheduler` and its lifecycle methods.
- [x] 1.3 Record an orphan proof showing no production construction,
      injection, dynamic load, or call site; stop and revise the design if a
      runtime consumer is found.

## 2. Narrow scheduler removal

- [x] 2.1 Delete `data-collection.scheduler.ts` and
      `data-collection.scheduler.spec.ts` together.
- [x] 2.2 Remove or correct scheduler-specific comments and exports identified
      by the inventory, including the stale `DataSourceSelectionService`
      ownership comment.
- [x] 2.3 Audit scheduler-adjacent `IDataCollectionStrategy` methods and record
      why each is retained or separately deferred; do not change active
      schedule-controller, polling-strategy, scan, or realtime behavior.
- [x] 2.4 Add a focused static regression assertion that prevents the orphaned
      scheduler symbol or provider registration from returning to active
      backend source.

## 3. Verification and handoff

- [x] 3.1 Run focused schedule-controller, polling-strategy, mode-matrix, and
      relevant repository-hygiene tests.
- [x] 3.2 Run full Mist tests with coverage, typecheck, lint, CI release
      contracts, `openspec validate remove-orphaned-data-collection-scheduler
      --strict`, and `git diff --check`.
- [x] 3.3 Re-run the repository-wide scheduler reference search, attach the
      before/after evidence, confirm public/runtime behavior is unchanged, and
      keep the cleanup independently revertible in the working tree.
