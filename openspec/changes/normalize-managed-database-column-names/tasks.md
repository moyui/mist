## 1. Entity and runtime mappings

- [x] 1.1 Map `SecuritySourceConfig.formatCode` and `K.securityId` to snake_case physical columns.
- [x] 1.2 Map all EF, TDX, and QMT extension camelCase properties to snake_case physical columns.
- [x] 1.3 Update realtime allowlist raw SQL to use physical snake_case columns while preserving camelCase result aliases.

## 2. Forward migration and audits

- [x] 2.1 Add migration 010 renaming exactly the approved 26 columns.
- [x] 2.2 Add pre/post information-schema audit for retired and target column names.
- [x] 2.3 Update migration documentation with atomic rollout, backup, verification, and rollback requirements.

## 3. Tests and current consumers

- [x] 3.1 Extend entity metadata tests to assert every TypeScript-to-physical column mapping.
- [x] 3.2 Extend schema-safety tests to lock migration 010, the 26-column inventory, and migrations 001–009 immutability.
- [x] 3.3 Update current operational SQL and raw-query tests for the post-010 schema.
- [x] 3.4 Update root database audit/review documents to mark physical snake_case normalization complete.

## 4. MySQL verification

- [x] 4.1 Replay migrations 001–010 on MySQL 8.4.
- [x] 4.2 Seed all affected tables and prove values/types/nullability survive migration 010.
- [x] 4.3 Prove K natural-key/FK and extension one-to-one constraints remain enforced.

## 5. Full verification

- [x] 5.1 Run focused entity, schema, allowlist, collector, and migration tests.
- [x] 5.2 Run backend lint, typecheck, full tests, contracts, Docker build, and strict OpenSpec validation.
- [x] 5.3 Scan the post-010 managed schema contract for camelCase physical names and run `git diff --check`.
