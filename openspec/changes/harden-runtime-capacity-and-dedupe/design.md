## Context

`QmtCommandGateway` is the in-memory, single-owner historical request/response
bridge. It currently appends pending commands and retained results without a
count, byte, or age bound. Internal `/v1/bars/query` consumers remove results,
but the public bridge command-status route reads without consuming, so completed
results can remain for process lifetime. Accepted historical results may also
contain large nested market-data payloads.

The first audit-remediation batch made `StrategySignal` and
`StrategyAlertEvent` atomic. Migration `006_strategy_platform_core.sql` already
defines `uq_strategy_alert_events_dedupe_key`, but the entity metadata omits it
and the scanner's pre-check race turns the expected database conflict into a
failed scan.

TypeORM synchronization is disabled. Migration `006` is immutable and production
schema evidence is a release gate, not a reason to rewrite migration history.

## Goals / Non-Goals

**Goals:**

- Put deterministic count, age, and encoded-byte limits around QMT historical
  commands and results.
- Preserve one accepted command → one terminal result, including timeout,
  oversize, and owner-replacement outcomes.
- Fail closed before accepting work for which no terminal-result slot exists.
- Keep QMT command capacity visible through strict datasource health and
  low-cardinality monitoring metrics.
- Convert only the named alert dedupe unique-key race into a skipped duplicate.
- Align migration and entity metadata without schema mutation.

**Non-Goals:**

- Change QMT realtime subscription control/callback transport.
- Add retry, replay, parallel native execution, Redis, MySQL, or disk
  persistence to the QMT history gateway.
- Modify the terminal bridge artifact or owner lease protocol.
- Edit migration `006`, create another migration, or rename database fields.
- Implement strategy delivery/BullMQ or change the dedupe-key formula.

## Decisions

### Capacity reserves a terminal-result slot at enqueue

Defaults are intentionally conservative and constructor-injectable:

- maximum outstanding commands (`pending + inFlight`): `64`;
- maximum retained results: `64`;
- completed-result TTL: `300` seconds;
- maximum poll limit: `16`;
- maximum encoded command bytes: `65,536`;
- maximum encoded single result bytes: `8,388,608`;
- maximum retained result bytes: `33,554,432`.

Before enqueue, the gateway expires timed-out work and removes expired completed
results. It rejects the command if either the outstanding limit or
`retained results + outstanding` result-slot reservation is full. This ensures
owner replacement and timeout can always record a small terminal result.

Alternatives rejected:

- silently evicting unexpired results, because a caller could wait forever for a
  result the gateway previously accepted;
- count-only limits, because one historical result can be many megabytes;
- an unbounded tombstone map, because it recreates the same leak.

### JSON encoding measures the retained boundary

Commands and terminal results are compactly JSON-encoded with non-finite values
rejected. The gateway stores the original validated object plus its encoded byte
count; it does not store a second encoded payload. An oversized or
non-serializable successful result is replaced by a bounded terminal failure
(`QMT_COMMAND_RESULT_TOO_LARGE` or `QMT_COMMAND_RESULT_INVALID`) so the waiting
caller completes and the native payload is not retained.

If retaining an otherwise valid result would exceed the aggregate byte limit,
the command receives `QMT_COMMAND_RESULT_CAPACITY_EXCEEDED`. No previously
accepted unexpired result is evicted.

### Command status distinguishes active from unknown

The gateway exposes an internal state lookup:
`pending | in_flight | completed | unknown`. HTTP status lookup returns `202`
only for pending/in-flight commands, `200` for retained results, and `404` for
unknown or expired IDs. No expired-ID tombstones are retained.

Enqueue capacity and command-payload failures return HTTP `429` and `413`
respectively with stable structured error details. A result payload that is too
large is accepted as a bounded terminal failure so the bridge does not retry the
same native call implicitly.

### Maintenance runs at every gateway boundary

A single `_maintain(now)` path expires pending/in-flight commands and prunes
expired results before enqueue, poll, result lookup, result post, and health
snapshot. Gateway methods remain synchronous and contain no `await`, preserving
the accepted single-process/event-loop serial mutation model.

### Health exposes fixed fields and monitoring uses bounded labels

Bridge health adds configured limits, retained bytes, oldest pending/result age,
and cumulative rejection counters. Monitoring exports fixed metrics with only
bounded `state`, `kind`, and `reason` label sets. Existing
`mist_realtime_bridge_pending` remains for compatibility and represents pending
history commands.

### Dedupe relies on the existing named database index

The entity receives the exact metadata name
`uq_strategy_alert_events_dedupe_key`. The scanner keeps its pre-check for the
common duplicate path. If the transaction raises MySQL duplicate entry
(`ER_DUP_ENTRY`/1062) and the driver message identifies that exact index, the
transaction has already rolled back and the result increments
`skippedDuplicates`. Other constraint, connection, timeout, or SQL errors
propagate unchanged.

Unit tests cover classifier boundaries. A real-MySQL concurrent scan test and
read-only production `schema_migrations`/`SHOW INDEX` evidence remain release
gates. If the production index is absent, implementation stops; migration `006`
is never edited.

## Risks / Trade-offs

- **A legitimate historical result exceeds 8 MiB** → return a structured
  terminal oversize failure and require callers to narrow symbol/date/count
  scope.
- **External status polling begins after the five-minute TTL** → return `404`;
  callers must poll within the documented retention window.
- **Capacity defaults are too small for production bursts** → expose exact
  limits/ages/rejections and adjust only through a later reviewed configuration
  change.
- **MySQL duplicate error text differs by driver version** → test supported
  driver shapes and fail open as an error rather than swallowing an ambiguous
  database failure.
- **Entity metadata falsely implies production schema proof** → keep
  synchronization disabled and require read-only production index evidence.

## Migration Plan

1. Deploy datasource and monitoring candidates with existing QMT mode unchanged.
2. Exercise capacity/TTL/status behavior against the datasource without a
   terminal bridge artifact update.
3. Verify monitoring emits bounded metrics and no strict-health contract
   violations.
4. Before backend promotion, verify migration `006` checksum and the named
   production unique index read-only.
5. Deploy backend and run concurrent real-MySQL scanner verification.
6. Rollback datasource/monitoring/backend together; no database rollback is
   required.

## Open Questions

None for implementation. Production default calibration and any future
operator-configurable limits require HIL evidence and a separate change.
