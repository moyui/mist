## 1. Required price initialization

- [x] 1.1 Initialize `K.open`, `K.high`, `K.low`, and `K.close` with `Number.NaN`.
- [x] 1.2 Add an entity regression test proving all unassigned required prices are non-finite.

## 2. Persistence boundary

- [x] 2.1 Add shared pre-insert validation for finite OHLC values in `saveBaseK`.
- [x] 2.2 Add persistence tests for `NaN`, infinities, missing/non-number values, explicit zero, and no-insert-on-failure behavior.
- [x] 2.3 Verify all current provider base-K writers continue to use `saveBaseK` and no direct K insert bypass remains.

## 3. Verification

- [x] 3.1 Run focused tests for the entity and shared K save helper.
- [x] 3.2 Run backend lint/typecheck and relevant test gates.
- [x] 3.3 Run `openspec validate fail-closed-uninitialized-k-prices --strict`.

## 4. QMT historical completeness

- [x] 4.1 Replace QMT historical invalid-OHLC row filtering with a fail-closed error containing provider symbol, row key, and invalid fields.
- [x] 4.2 Add QMT regression tests for missing, blank, non-numeric, `NaN`, infinite, and explicit-zero required OHLC values.
- [x] 4.3 Run focused QMT tests and the standard backend/OpenSpec gates.
