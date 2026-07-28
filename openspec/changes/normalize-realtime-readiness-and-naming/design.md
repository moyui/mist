## Context

TDX and QMT already share the canonical realtime snapshot contract, but their health and ready metadata evolved independently. TDX exposes `tdxRealtimeBridgeReady` while QMT uses `bridge.ready`; QMT additionally maps bridge readiness to the misleading `collectorReady`. The backend then uses `ready` for successful WebSocket protocol negotiation. These states feed deployment health checks, recovery guards, and monitoring, so the naming mismatch is operational rather than cosmetic.

The change spans four repositories and deliberately provides no compatibility aliases. The datasource services are the producers, while the backend, deploy scripts, and monitoring are consumers. Terminal-side owner registration and provider-native payloads are stable boundaries and are not part of the rename.

## Goals / Non-Goals

**Goals:**

- Give service, transport, bridge-owner, subscription, and freshness state distinct names.
- Make equivalent TDX and QMT public state use the same JSON path.
- Keep bridge-scoped endpoints concise while making aggregate health objects explicit.
- Align selected internal symbols and paths where the current name contradicts the responsibility.
- Make cross-repository contract inventory and naming review repeatable.

**Non-Goals:**

- Rename database tables or columns.
- Rename provider-native keys or the terminal bridge registration payload.
- Make TDX and QMT native transports share an inheritance hierarchy.
- Fix unrelated audit findings such as bar validation, broadcast concurrency, transactionality, or unbounded command results.

## Decisions

### Aggregate and scoped health use context-appropriate paths

Datasource root health returns a nested `bridge` object with `ready`, `ownerId`, `ownerGeneration`, and `bridgeBuildId`. A bridge-specific endpoint returns the same bridge health object directly, so its readiness remains top-level `ready`. This avoids provider-prefixed fields while not adding redundant `bridge.bridge` nesting.

### Protocol readiness and bridge readiness remain independent

The `realtime.ready` event name remains unchanged because it identifies a protocol event. Its metadata contains the nested bridge object. Backend diagnostics rename the state derived from accepting the event to `transportReady` and preserve bridge-owner readiness separately. Connection, protocol, owner, subscription, and freshness MUST NOT be collapsed into one boolean.

### No compatibility aliases

`tdxRealtimeBridgeReady`, `collectorReady`, ambiguous public `generation`, and unproduced `datasourceBuildId` are removed. Producers and every known consumer change in one release. Contract tests reject the retired shapes so they cannot silently return.

### Internal naming follows responsibility, not mechanical symmetry

Internal files are renamed when their current basename or relative path describes the wrong role: pure candle calculation is not a Nest resolver, injectable clock code is a service, and native-map conversion is a decoder. Same-role files under provider-scoped directories intentionally keep identical basenames. Different roles remain different even when both manage owner state: the accepted `realtime-source-layout` contract retains TDX `realtime/runtime.py`, provider-specific QMT `bridge.py`, TDX/QMT `source.service.ts`, and `tdx-source.interface.ts`.

Chan entity classes and files become singular while explicit TypeORM table names remain unchanged. Security identity, previous-close, and lifecycle vocabulary are documented and corrected only at internal boundaries; persisted and provider-native names remain stable.

### Documentation separates defects from intentional provider differences

The audit records producer-to-consumer evidence and classifies findings as confirmed, partial, intentional, or not found. Severity is based on impact, likelihood, and exposure. Shared contracts are required only where semantics are identical; provider adapters remain source-specific.

## Risks / Trade-offs

- **Mixed versions cannot read each other's health contract** → Pin all four repository revisions, suspend automated recovery during the switch, and roll forward or back as a set.
- **Broad path renames can miss imports or test discovery** → Use repository-wide reference scans, type checking, Python import tests, and old-name absence guards.
- **Entity class renames can accidentally change persistence metadata** → Retain explicit table names and add metadata/repository tests proving no schema change.
- **Readiness may still be overinterpreted as market freshness** → Keep subscription and snapshot-age evidence separate and test that bridge readiness alone does not imply freshness.
- **Root workspace documents are not versioned by a child repository** → Deliver them as explicit workspace artifacts and record their current repository SHAs.

## Migration Plan

1. Complete producer and consumer code, generated OpenAPI, tests, monitoring docs, deployment scripts, and audit documents against pinned revisions.
2. Build and validate all four repositories; reject retired identifiers outside archives and migration notes.
3. In the production maintenance window, suspend TDX/QMT automated recovery, install updated deploy/monitoring logic, switch datasource and backend images, and validate both health and ready-frame contracts.
4. Re-enable recovery only after TDX and QMT show service health, `transportReady`, `bridge.ready`, subscription/freshness evidence, and stable monitoring metrics.
5. Rollback restores all four prior revisions together. Partial rollback and mixed contracts are unsupported.

## Open Questions

None. The implementation boundaries and breaking-release policy are fixed for this change.
