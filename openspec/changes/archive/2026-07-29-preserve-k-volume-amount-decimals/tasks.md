## 1. Datasource contract

- [x] 1.1 Add an exact nullable decimal normalizer for TDX historical `volume` and `amount`, preserving finite values and mapping missing, blank, non-numeric, and non-finite values to explicit null
- [x] 1.2 Change TDX historical models/OpenAPI/tests to emit decimal strings or null without omitting nullable fields
- [x] 1.3 Normalize QMT historical `volume` and `amount` to the same decimal-string-or-null wire contract and add regression tests

## 2. Backend persistence contract

- [x] 2.1 Add bounded `DECIMAL(36,8)` string validation and update shared/source historical DTOs to use exact nullable decimals
- [x] 2.2 Remove volume rounding, missing-value zero filling, and QMT row rejection based only on missing volume
- [x] 2.3 Update TypeORM `K` and downstream indicator, Chan, strategy, and API boundaries to handle exact nullable decimal values without implicit zero coercion

## 3. Database migration

- [x] 3.1 Add the next forward-only migration changing `k.volume` and `k.amount` to `DECIMAL(36,8) NULL` without modifying applied migrations
- [x] 3.2 Add schema/migration guards and isolated MySQL exact-decimal/null round-trip coverage

## 4. Verification

- [x] 4.1 Run focused datasource and backend unit/contract tests, lint, and typecheck
- [x] 4.2 Run migration contract tests, available isolated MySQL tests, OpenAPI legacy-shape checks, and `openspec validate --all --strict`
