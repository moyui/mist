## 1. Derived analysis contracts

- [x] 1.1 Add persistence-free interfaces for merged-K, fenxing, Bi, and two-phase Chan results.
- [x] 1.2 Make the OpenAPI VO classes implement the derived interfaces without changing response fields.
- [x] 1.3 Add a guard proving Chan calculation contracts and services contain no TypeORM persistence boundary.

## 2. Legacy persistence removal

- [x] 2.1 Delete the five unused Chan persistence-shaped model files.
- [x] 2.2 Delete the persistence-only `Table` enum and update naming/layout guards.
- [x] 2.3 Verify the workspace has no runtime references to retired Chan table names or models.

## 3. Database and documentation safety

- [x] 3.1 Add a read-only production audit for legacy Chan table existence, exact-count commands, and DDL capture commands.
- [x] 3.2 Document that physical table removal requires a separate reviewed cleanup change and is not part of automatic migrations.
- [x] 3.3 Update root audit/database review documents to cancel the obsolete Chan baseline, FK, unique, JSON, and timestamp backlog.

## 4. Verification

- [x] 4.1 Run focused Chan algorithm, controller/OpenAPI, and persistence-boundary tests.
- [x] 4.2 Run backend lint, typecheck, full tests, contracts, Docker build, and strict OpenSpec validation.
- [x] 4.3 Run final retired-name and `git diff --check` scans.
