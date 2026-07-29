## Why

The corrected realtime/history audit still contains four confirmed runtime defects: incomplete TDX bar rows can become valid-looking zero-price records, WebSocket broadcast can mutate and block across awaits, backend frames are parsed before their size is bounded and snapshots are parsed twice, and matched strategy signals can persist without their linked alert events. These defects should be removed before post-close history sync, broader realtime promotion, or notification delivery increases their exposure.

## What Changes

- Reject TDX normalized bar rows whose required OHLC values are missing, empty, non-numeric, or non-finite; an explicit provider zero remains distinct from a missing value.
- Make datasource WebSocket broadcast snapshot its connection set under lock, send outside the lock with a finite timeout, and remove failed or timed-out connections without serially blocking healthy clients.
- Bound every backend realtime WebSocket message before its first JSON parse and route the single parsed envelope to ready, control, or native-snapshot validation without reparsing snapshots.
- Persist `StrategySignal` and its pending `StrategyAlertEvent` in one TypeORM transaction and update scan counters only after commit.
- Correct the root audit documents so A/B completion, unresolved C findings, database compatibility boundaries, repository revisions, and release gates are represented accurately.
- Align the monitoring CI Python contract-test command with the cross-repository
  release gate and install its explicit pytest dependency.
- This batch does not add a database migration, unique `dedupe_key` constraint, QMT command capacity policy, schedule deployment, or provider/database field rename.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `datasource-provider-contract`: Normalized TDX bars must reject incomplete required prices instead of manufacturing zero values.
- `datasource-runtime-safety`: WebSocket broadcast must isolate connection mutation and bound slow sends.
- `realtime-market-data-ingress`: Backend message size checks must precede the single JSON parse used for routing and snapshot decoding.
- `strategy-signal-alerts`: A matched signal and its pending alert event must persist atomically.
- `release-ci-safety`: Monitoring CI must install pytest and run the Python
  contract suite through the command enforced by the cross-repository gate.

## Impact

- Repositories: `mist`, `mist-datasource`, and `mist-monitoring`; root workspace
  audit documents are also corrected.
- Runtime behavior: malformed historical TDX rows fail closed, dead/slow backend WebSockets no longer block healthy peers, oversized frames are rejected before parsing, and alert persistence cannot leave a committed signal without its event.
- Database: no table, column, index, or migration change; the existing application-level dedupe race remains explicitly deferred.
- Dependencies: the bar fix is a prerequisite for `sync-post-close-provider-history`; the transaction fix precedes future realtime strategy-signal and notification delivery changes.
