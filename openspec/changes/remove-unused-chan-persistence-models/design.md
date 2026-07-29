## Context

Chan analysis currently consumes request-provided K data and returns merged K,
fenxing, Bi, and channel values directly. The calculation module registers no
Chan repositories, the application TypeORM configurations register no Chan
entities, and the workspace has no reads or writes for the legacy
`chan_bis`, `chan_fenxings`, `chan_index_periods`, or `chan_states` table
names.

Five classes under `apps/mist/src/chan/entities/` nevertheless contain TypeORM
decorators and persistence-only fields. Their shapes differ from the current
algorithm/API VO shapes, so mechanically converting all five classes into
interfaces would preserve concepts that the algorithm does not use.

## Goals / Non-Goals

**Goals:**

- Make request-time derivation the explicit ownership model for Chan results.
- Remove all unused Chan persistence decorators, table names, and schema
  obligations.
- Keep pure TypeScript contracts for the derived structures used by the
  algorithm while retaining runtime classes for OpenAPI reflection.
- Audit, but do not automatically delete, any legacy production tables.
- Preserve current API shapes and Phase A/Phase B algorithm behavior.

**Non-Goals:**

- Persist fenxing, Bi, channel, index-period, or algorithm state in MySQL.
- Add incremental realtime snapshot processing in this change.
- Change Chan algorithms, response fields, or frontend rendering.
- Drop production tables without separate production evidence and approval.

## Decisions

### Remove persistence-only models instead of baselining their tables

Delete the five files in `apps/mist/src/chan/entities/` and the now-unused
`Table` enum. No replacement is created for `ChanIndexPeriod` or `ChanState`
because no current calculation consumes those concepts.

Alternative considered: generate a migration from the entity metadata. This is
rejected because it would create storage for reproducible derived data and
would guess at an unobserved production schema.

### Separate compile-time calculation contracts from runtime API classes

Add a `chan-analysis.types.ts` module for the current merged-K, fenxing, Bi, and
two-phase result shapes. Swagger VO classes remain classes and implement the
corresponding interfaces because TypeScript interfaces are erased at runtime.
The interfaces contain no database IDs, audit columns, source-table enums, or
TypeORM decorators.

Alternative considered: turn every VO into an interface. This is rejected
because NestJS OpenAPI decorators require runtime class metadata.

### Treat Chan output as reproducible request-time data

Chan calculation services remain repository-free. Given the same ordered K
input and algorithm version, the service recalculates the result rather than
loading a stored fenxing/Bi/state row. A future realtime integration may
recompute a bounded window or maintain process-local incremental state, but
that state does not become authoritative MySQL history.

### Audit legacy tables before any physical cleanup

Add a read-only information-schema audit that reports whether each legacy
table exists and emits exact-count and `SHOW CREATE TABLE` statements for an
operator to run. This change adds no `DROP TABLE` migration.

If production evidence later confirms the tables are unused and disposable, a
separate forward-only cleanup change can define backup, drop order, rollout,
and rollback. Keeping destructive DDL out of automatic migrations prevents an
application deployment from deleting unreviewed historical data.

## Risks / Trade-offs

- [External consumers query legacy tables outside this workspace] → Inventory
  table existence, row counts, DDL, and operational consumers before a later
  drop change.
- [Interface and VO shapes drift] → Make the VO classes implement the pure
  interfaces and add a compile-time/guard test.
- [Request-time recomputation is expensive for very large windows] → Preserve
  the current behavior now; design bounded-window or process-local caching only
  when measured latency requires it.
- [Removing the `Table` enum breaks a hidden algorithm branch] → Workspace-wide
  reference search and full Chan tests are release gates.

## Migration Plan

1. Remove unused persistence models and their naming guard assertions.
2. Introduce pure derived-analysis interfaces and bind the API VOs to them.
3. Run focused Chan tests, typecheck, lint, contracts, and strict OpenSpec
   validation.
4. Deploy the code without database DDL; current runtime has no dependency on
   the legacy tables.
5. Run the read-only legacy-table audit in production.
6. If physical removal is desired, create a separate reviewed cleanup change
   from the captured evidence.

Rollback restores the deleted TypeScript files. Because this change performs
no production DDL, rollback does not require database restoration.

## Open Questions

- Whether legacy production tables exist and contain data remains a deployment
  observation, not an implementation assumption.
- A future realtime Chan change must decide between bounded recomputation and
  process-local incremental state; neither choice changes MySQL ownership.
