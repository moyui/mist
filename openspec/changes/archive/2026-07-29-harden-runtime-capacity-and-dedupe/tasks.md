## 1. QMT gateway bounded state

- [x] 1.1 Add validated fixed defaults, structured capacity errors, encoded command/result sizing, result-slot reservation, and deterministic maintenance to `QmtCommandGateway`.
- [x] 1.2 Bound poll limits and expose active/completed/unknown command status without silently evicting accepted unexpired work.
- [x] 1.3 Add unit tests for count, TTL, per-item/aggregate bytes, timeout, owner replacement, invalid configuration, and exact boundary acceptance.

## 2. QMT HTTP and health contracts

- [x] 2.1 Map command capacity/payload failures to stable HTTP responses and return `404` for unknown/expired command IDs.
- [x] 2.2 Extend strict QMT bridge health/OpenAPI with limits, retained bytes, oldest ages, and bounded rejection totals.
- [x] 2.3 Add route, root/scoped health, and OpenAPI regression tests including retired/invalid shapes.

## 3. Monitoring capacity diagnostics

- [x] 3.1 Extend the strict Go health decoder for QMT command capacity fields and bounded rejection reasons.
- [x] 3.2 Export and document fixed QMT command item, limit, byte, age, and rejection metrics while preserving `mist_realtime_bridge_pending`.
- [x] 3.3 Add Go and Python metric-contract tests for valid, malformed, disabled, and bounded-label cases.

## 4. Strategy dedupe race

- [x] 4.1 Align `StrategyAlertEvent` metadata with migration `006`'s named unique dedupe index and add a byte-identity/schema guard.
- [x] 4.2 Classify only the exact MySQL dedupe-index conflict as `skippedDuplicates` after transaction rollback; propagate all other database errors.
- [x] 4.3 Add unit concurrency/error-shape coverage and a real-MySQL integration gate without adding or modifying a migration.

## 5. Validation and handoff

- [x] 5.1 Run focused and full datasource pytest/Ruff/Pyright and regenerate OpenAPI artifacts.
- [x] 5.2 Run monitoring Go/Python tests and Mist lint/typecheck/Jest/build/CI-contract gates.
- [x] 5.3 Run strict OpenSpec, old-pattern/capacity scans, migration `006` checksum guard, and four-repository diff checks; record production schema/HIL as release gates.
