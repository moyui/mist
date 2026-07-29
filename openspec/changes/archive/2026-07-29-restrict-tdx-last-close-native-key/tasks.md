## 1. Strict native field contract

- [x] 1.1 Make datasource realtime validation accept only exact native `LastClose` and reject retired aliases.
- [x] 1.2 Remove `PreClose` and `lastClose` aliases from the backend TDX realtime converter.

## 2. Verification and documentation

- [x] 2.1 Add datasource and backend positive/negative tests for exact `LastClose`.
- [x] 2.2 Document the historical-bars and realtime-bridge acquisition paths after removing the orphaned HTTP snapshot product route.
- [x] 2.3 Run strict OpenSpec and focused validation in both repositories.
