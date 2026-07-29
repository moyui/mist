## 1. Backend audit vocabulary

- [x] 1.1 Rename all 12 entity creation properties to `createdAt`.
- [x] 1.2 Rename the nine mutable entity update properties to `updatedAt`.
- [x] 1.3 Update backend runtime consumers, tests, and JSON contract assertions.

## 2. Database migration and safety

- [x] 2.1 Add migration 011 renaming the five legacy audit column pairs.
- [x] 2.2 Add a pre/post information-schema audit for names, attributes, and mixed-schema rejection.
- [x] 2.3 Lock migrations 001–010 and migration 011 inventory in schema-safety tests.
- [x] 2.4 Update migration and root audit documentation.

## 3. Explicit MySQL timezone

- [x] 3.1 Configure all four TypeORM MySQL connections with `timezone: '+08:00'`.
- [x] 3.2 Add connection-option and audit/K timestamp round-trip contract tests.

## 4. Frontend breaking contract

- [x] 4.1 Rename all `mist-fe` strategy/backtest response timestamp properties.
- [x] 4.2 Update UI consumers and frontend fixtures without compatibility fallbacks.

## 5. MySQL verification

- [x] 5.1 Replay migrations 001–011 through the repository runner on MySQL 8.4.
- [x] 5.2 Seed all affected tables and prove audit values and column attributes survive migration 011.
- [x] 5.3 Prove insert defaults, mutable updates, raw K upserts, and append-only shapes.

## 6. Full verification

- [x] 6.1 Run focused backend metadata, schema, API, timezone, and migration tests.
- [x] 6.2 Run full `mist` lint, typecheck, tests, contracts, Docker build, and strict OpenSpec validation.
- [x] 6.3 Run full `mist-fe` lint, typecheck/build, and tests.
- [x] 6.4 Scan both repositories for retired runtime names and run diff checks.
