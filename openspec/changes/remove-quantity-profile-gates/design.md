# Design: remove-quantity-profile-gates

## 改动概览

### Gate 1：回测 API 层（backtest-run-command.service.ts）

移除 `createRun()` 中的 quantity 检查。移除后 `rule_dsl` 策略不再区分 quantity/non-quantity 字段，统一走 `kind = StrategyKind.RULE_DSL`。

同步清理：`ConflictException` import、`StrategyExecutionPlanService` 依赖注入（`planService`）。

### Gate 2：实时注册层（strategy-execution-plan.service.ts）

`compileForRealtimeRegistration()` 原本在 `compileStoredVersion()` 基础上检查 `plan.fields` 是否含 `k.volume`/`k.amount`，有则抛 `ConflictException`。

移除后直接委托 `compileStoredVersion()`，不再有独立的 quantity 门禁。

同步清理：`ConflictException` import、`QUANTITY_FIELDS` 常量。

### Gate 3：回测 executor 层（backtest-run.executor.ts）

`execute()` 中 `compilePlan()` 后检查 `plan.kind === 'rule_dsl' && fields 含量价`，有则抛 `BacktestRunFailure('BACKTEST_QUANTITY_PROFILE_UNAVAILABLE')`。

移除此检查，quantity plan 直接进入 replay 阶段。

### QMT 数据补齐

通过 `POST /v1/collector/collect` 对 600519/300502 两只证券的 1m/3m/5m/15m/30m/60m 周期进行历史数据拉取，时间范围 2026-01-01 ~ 2026-08-21。

QMT 1m 历史数据（2026-01 ~ 2026-07）需逐月拉取（半年范围查询 bridge 10s timeout）。

## 不改的部分

- `RealtimeQuantityValidationError`（实时链路 quantity 校验）保留
- `chan_bsp` 策略的 quantity 行为不变（chan_bsp 不消费量价）
- `backtest-health-state.service.ts` 中的 `BACKTEST_QUANTITY_PROFILE_UNAVAILABLE` 枚举值保留（类型安全，不影响逻辑）
