## Why

The remaining focused runtime risks after the first audit-remediation batch are
an unbounded QMT historical command/result gateway and a strategy scan dedupe
race that currently surfaces a database unique-key conflict as a failed scan.
Both risks grow as history synchronization and realtime strategy evaluation add
more concurrent work.

## What Changes

- Bound QMT historical pending, in-flight, and retained-result state by count,
  age, and encoded payload bytes.
- Reject over-capacity commands and oversized command/results with stable,
  retryable errors rather than accepting work that cannot be retained.
- Validate and cap bridge poll limits, distinguish a pending command from an
  unknown or expired command, and expose capacity/age diagnostics.
- Preserve the existing owner lease/generation fence and one-command/one-result
  historical protocol; QMT realtime subscription transport is unchanged.
- Align `StrategyAlertEvent` TypeORM metadata with migration `006`'s existing
  named unique `dedupe_key` index.
- Treat only that exact unique-key race as a skipped duplicate after the
  signal/alert transaction rolls back; all other database errors remain fatal.
- Do not modify migration `006`, add a migration, rename database/provider
  fields, deploy schedule, or change QMT terminal bridge artifacts.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `datasource-runtime-safety`: QMT historical command/result state is bounded
  and capacity failures are explicit.
- `bigqmt-datasource-bridge`: Historical command polling retains its one-shot
  owner-fenced protocol while adding bounded lifecycle semantics.
- `monitoring-health-alerts`: QMT command capacity and oldest-age diagnostics
  are observable without high-cardinality labels.
- `strategy-signal-alerts`: Concurrent creation of the same alert dedupe key is
  treated as one committed signal/event plus one skipped duplicate.
- `database-schema-safety`: Entity metadata must match the existing migration
  `006` unique index without rewriting applied migration history.

## Impact

- Repositories: `mist`, `mist-datasource`, and `mist-monitoring`.
- APIs: QMT command enqueue can return capacity/payload errors; querying an
  unknown or expired command no longer reports it as indefinitely pending.
- Database: no schema mutation. Read-only schema evidence is required before
  claiming production uniqueness; missing production index is a blocker, not
  permission to edit migration `006`.
- Dependencies: coordinate with
  `migrate-qmt-realtime-to-native-subscription`, which continues to own the
  separate realtime subscription control path.
