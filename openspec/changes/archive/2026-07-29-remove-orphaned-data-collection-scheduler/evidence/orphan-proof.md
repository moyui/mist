# Orphan proof

- Baseline: `mist/master`
  `cc9ff8f7f49fc9674ce8ec70f0e3d4485874b431`.
- Worktrees were enumerated and excluded.
- The fresh source inventory found the retired class only in its implementation,
  isolated test, and stale documentation; no module provider, controller,
  constructor injection, barrel export, script, or dynamic loader referenced it.
- Active schedule ownership remains
  `apps/schedule/src/data-collection.controller.ts`, which calls the injected
  polling strategy's `collectForAllSecurities()` and then `runScan()`.
- `collectScheduledCandle` and `collectForAllSecurities` remain in
  `IDataCollectionStrategy` because active TDX/QMT/EastMoney strategies and
  schedule flow use them.
- Optional `start` and `stop` remain deferred: removing interface members is an
  independent contract change and is outside this narrow cleanup.
- No API, database schema, migration, cron expression, polling implementation,
  strategy-scan ordering, or realtime provider registration changed.

## Verification

- Focused schedule/module/strategy/orphan-guard suites: 24 tests passed.
- Full Mist suite: 454 tests passed; one isolated-MySQL environment gate
  skipped. The same suite passed with coverage enabled.
- ESLint, TypeScript, CI release contracts, three Docker build targets,
  all-change strict OpenSpec validation, and `git diff --check` passed.
- Final active-source search found no retired class symbol. Only the static
  guard retains the two deleted file paths as negative assertions.
