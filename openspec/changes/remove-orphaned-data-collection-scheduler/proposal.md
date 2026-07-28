## Why

`DataCollectionScheduler` is not registered by any Nest module and has no
production caller, but its implementation and isolated unit suite still imply
that it owns collection and streaming lifecycles. Removing this orphan after
the current TDX HIL lifecycle is resolved will reduce misleading maintenance
surface without changing active collection behavior.

## What Changes

- Start implementation from the accepted realtime contract/naming baseline on
  `mist/master`; earlier experimental HIL gating has been superseded by the
  recorded master baseline.
- Delete the orphaned `DataCollectionScheduler` implementation and its tests
  after re-confirming that no runtime module, controller, provider, or script
  references it.
- Remove or correct scheduler-specific comments and exports that become stale,
  including the shared data-source selection documentation.
- Audit scheduler-adjacent strategy lifecycle methods and retain any method
  that still has a production consumer; this change does not authorize broad
  collection-strategy refactoring.
- Preserve the active schedule application flow, which invokes its current
  polling strategy directly, and preserve all public API behavior.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `repository-cleanup`: Add evidence and verification requirements for safely
  removing the orphaned backend scheduler without changing active collection
  ownership or runtime behavior.

## Impact

- **Repository:** `mist` only.
- **Expected files:** `apps/mist/src/collector/data-collection.scheduler.ts`,
  its colocated spec, stale comments/exports discovered by reference search,
  and cleanup evidence.
- **Unaffected:** datasource bridge code, database schema/data, HTTP contracts,
  schedule routes, active polling strategies, realtime mode wiring, deploy and
  monitoring repositories.
