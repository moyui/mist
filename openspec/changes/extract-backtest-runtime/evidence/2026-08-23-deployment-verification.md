# 5.6 Deployment Verification Evidence

**Date**: 2026-08-23
**Image**: `3c76044308f97e530369fb8f82b20e129db73293`

## Root Cause & Fix

### First DI failure (index [4] - StrategyDefinitionRepository)
- **Cause**: `add-chan-bsp-backtest-evaluation` added `@InjectRepository(StrategyDefinition)` to `BacktestRunExecutor`, but `BacktestAppModule.forFeature` did not register `StrategyDefinition` entity
- **Fix**: Added `StrategyDefinition` to `TypeOrmModule.forFeature([...])` in `backtest-app.module.ts`
- **Commit**: `5226a0bc`
- **Prevention**: Added module-level regression test asserting `forFeature` covers all injected repository tokens

### Second DI failure (index [9] - ChanBspDetector)
- **Cause**: `BacktestRunExecutor` constructor had default parameter values (`chanBspDetector = new ChanBspDetector()`, `chanBspCursors = new Map()`). NestJS webpack builds with `transpileOnly:true`, which strips `__decorate` metadata for parameters with default values, causing DI resolution failure at index [9]
- **Fix**: Moved default values to class-level property declarations
- **Commit**: `08eebfe`
- **Note**: AGENTS.md §7 explicitly warns about this pattern — "Signal 服务构造函数用默认值参数 → webpack transpileOnly 丢 __decorate → DI can't resolve dependencies"

## Deployment Verification

### Container Health
```
mist-backtest  Up X minutes (healthy)  ghcr.io/mist-trade/mist:3c76044308f97e530369fb8f82b20e129db73293
```
- Exit code: 0 (no restart)
- Health check: passing
- Startup log: `backtest startup reconciled admitted=0` + `Nest application successfully started`

### End-to-End Backtest (Run 8)
- **POST** `/v1/strategy-backtests` → 202 ACCEPTED (runId=8)
- Strategy: `k.close>0` (versionId=1, rule_dsl)
- Target: 600030, daily (1440), TDX, 2026-08-01 to 2026-08-21
- **GET** `/v1/strategy-backtests/8` → status=completed, signalCount=15, matchedSecurityCount=1
- Full chain verified: HTTP → RPC → backtest execution → COMPLETED → query

### Full Stack Status (all healthy)
| Container | Status | Image |
|-----------|--------|-------|
| mist-backend | healthy | 3c760443 |
| mist-backtest | healthy | 3c760443 |
| mist-signal | healthy | 3c760443 |
| mist-notification | healthy | 3c760443 |
| mist-chan-api | healthy | 3c760443 |
| mist-fe | healthy | ea4632a |
| mist-tdx-datasource | healthy | 7131e88 |
| mist-qmt-datasource | healthy | 7131e88 |
| mist-mysql | healthy | mysql:8.4 |
| mist-realtime-redis | healthy | redis:7.4-alpine |

### Quantity Profile Gate
- `k.volume`/`k.amount` rules are blocked by `BACKTEST_QUANTITY_PROFILE_UNAVAILABLE` — this is the intended policy gate, not a bug
- `chan_bsp` strategies bypass the gate (line 130: "quantity 门禁跳过：chan_bsp 不消费量价（D3）")
- Gate remains `ineligible` until quantity profile HIL is approved (pending TDX 1m data availability)

## Conclusion

5.6 backtest deployment verification: **PASS**. The backtest runtime is deployed, healthy, and serves end-to-end backtest requests. The RPC-only mist-backend cutover is a separate step (not yet due — V1 keeps both HTTP+RPC in mist-backend).
