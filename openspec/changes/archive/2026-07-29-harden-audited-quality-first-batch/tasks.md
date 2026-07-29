## 1. TDX bar correctness

- [x] 1.1 Add a structured TDX bar normalization error for missing, blank, non-numeric, and non-finite required OHLC values.
- [x] 1.2 Make TDX bar normalization fail closed on required-series timestamp misalignment while preserving explicit numeric zero.
- [x] 1.3 Add unit and HTTP contract regression coverage proving malformed rows cannot enter normalized results.

## 2. Datasource WebSocket broadcast

- [x] 2.1 Snapshot connections under lock and implement finite-timeout, bounded-concurrency sends outside the lock.
- [x] 2.2 Remove failed connections only when the registered WebSocket instance still matches the broadcast snapshot.
- [x] 2.3 Add concurrency, reconnect replacement, timeout, and healthy-peer delivery tests.

## 3. Backend realtime parsing

- [x] 3.1 Add a shared raw-message parser that checks UTF-8 byte length before one JSON parse and returns an object envelope.
- [x] 3.2 Route TDX and QMT ready, control, and snapshot messages from the parsed envelope and make native-map validation consume it without reparsing.
- [x] 3.3 Add tests for pre-parse oversize rejection, single-parse snapshot routing, malformed envelopes, and unchanged valid ingestion.

## 4. Strategy persistence atomicity

- [x] 4.1 Persist `StrategySignal` and `StrategyAlertEvent` with transaction-scoped repositories.
- [x] 4.2 Move created counters after transaction commit and preserve application-level duplicate skipping.
- [x] 4.3 Add commit and alert-write rollback tests proving no partial success is reported.

## 5. Audit documentation and validation

- [x] 5.1 Correct A/B/C status, finding classifications, repository revisions, database variable inventory, and C routing in both root audit documents.
- [x] 5.2 Run focused and full Mist/datasource tests, lint, typecheck, builds, strict OpenSpec validation, old-pattern scans, and diff checks.
- [x] 5.3 Record passed evidence, remaining database-migration decisions, release/HIL boundaries, and any unresolved gates.

## 6. Monitoring CI contract

- [x] 6.1 Install a pinned pytest version in monitoring CI and run the Python contract suite with `python -m pytest tests`.
- [x] 6.2 Run monitoring Go/Python tests and the Mist cross-repository CI contract gate.
- [x] 6.3 Replace the obsolete known-failure note with passing verification evidence.
