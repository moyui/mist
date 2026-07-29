## Context

The audit's first remediation batch crosses the Python datasource boundary and the NestJS backend but deliberately avoids schema migration. TDX bar normalization currently unions timestamps from required and optional series and converts missing numbers to zero. The datasource WebSocket manager iterates a mutable connection dictionary across serial awaits. Backend clients parse every message to route it and then parse snapshot messages again inside the strict decoder, so the size guard does not protect the first parse. Strategy scanning saves its signal and alert event through separate repository calls.

The current A/B readiness and naming changes are already present in the same working trees and must not be reverted or given compatibility paths.

## Goals / Non-Goals

**Goals:**

- Fail closed before an incomplete TDX bar can enter the normalized HTTP response or persistence chain.
- Prevent connection-set mutation and a single slow connection from blocking broadcast to healthy backend clients.
- Guarantee a raw frame byte limit before one and only one JSON parse.
- Guarantee that a signal and its alert event commit or roll back together.
- Make the audit report distinguish completed A/B work from unresolved C work.

**Non-Goals:**

- Change database tables, columns, indexes, or provider-native field names.
- Add database-enforced dedupe, QMT command limits, schedule deployment, or notification delivery.
- Change realtime ready/snapshot wire shapes or terminal owner registration.

## Decisions

### Required TDX price fields fail the whole normalized request

`open`, `high`, `low`, and `close` are required for every timestamp emitted by the normalizer. Missing, blank, non-numeric, or non-finite values raise a structured normalization error containing source, symbol, timestamp, and invalid fields. An explicit numeric zero is accepted as provider data. Failing the request is chosen over silently dropping rows because downstream callers must distinguish an authoritative complete response from a malformed nonempty provider result.

`volume` and `amount` retain the current explicit/missing numeric behavior in this batch; their nullable/rejection policy remains a separate database-contract decision.

### Broadcast snapshots connections under lock and sends outside it

The manager copies `(client_id, websocket)` pairs under its lock, then sends outside the lock with a configurable finite timeout and semaphore. Failed/timed-out entries are removed only if the mapping still points to the same WebSocket, so a reconnect reusing the client ID is not accidentally removed.

### Raw parsing is centralized at the shared decoder boundary

A shared parser checks UTF-8 byte length, parses JSON once, and requires an object envelope. Provider clients route that parsed object. Native-map decoding accepts the parsed object rather than raw text, preserving exact-key validation without another parse.

### Strategy writes use the repository manager transaction

The existing signal repository's TypeORM manager opens the transaction. Transaction-scoped repositories create and save both entities. Scan counters increment only after the transaction resolves. This avoids new module injection and guarantees the existing repositories cannot accidentally perform one of the writes outside the transaction.

Application-level pre-check dedupe remains unchanged; database-enforced concurrency dedupe is deferred because it requires a migration.

### Monitoring CI uses the enforced pytest entrypoint

Monitoring contract tests remain ordinary `unittest.TestCase` tests, which
pytest can collect without a rewrite. The workflow installs a pinned pytest
version after Python setup and runs `python -m pytest tests`, matching the
cross-repository CI contract exactly. This keeps one canonical CI entrypoint
instead of weakening the gate to accept multiple command spellings.

## Risks / Trade-offs

- **A malformed provider row now fails the request instead of returning partial data** → expose the exact invalid fields and add regression fixtures for mixed timestamp series.
- **A send timeout may evict a temporarily slow backend** → use a conservative default, keep it constructor-injectable for tests, and only remove the same connection instance.
- **Changing decoder input from raw text to parsed objects can miss a call site** → repository-wide reference scan, typecheck, and full contract tests.
- **Transaction mocks may pass while real TypeORM wiring differs** → assert transaction-scoped repository use and retain real-MySQL verification as a later release gate.
- **A floating Python test dependency could change CI behavior** → pin pytest in
  the workflow and keep the contract suite dependency-free beyond the runner.

## Migration Plan

1. Deploy datasource and backend candidates together with the existing A/B contract revisions.
2. Run malformed-bar, broadcast concurrency, oversized-frame, and transaction rollback tests.
3. No database migration or data rewrite is required.
4. Rollback restores the prior datasource/backend revisions together; database state needs no rollback.

## Open Questions

None for this batch. Volume/amount nullability and database-enforced alert dedupe remain explicit later decisions.
