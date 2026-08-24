# Tasks: remove-quantity-profile-gates

## 1. 移除 quantity profile gates

- [x] 1.1 移除 `backtest-run-command.service.ts` 中的回测 gate：删除 `plan.fields.some(k.volume/k.amount)` 检查 + `BACKTEST_QUANTITY_PROFILE_UNAVAILABLE` 异常 + 未使用的 `ConflictException` import + `StrategyExecutionPlanService` 依赖注入
- [x] 1.2 移除 `strategy-execution-plan.service.ts` 中的实时注册 gate：`compileForRealtimeRegistration` 直接委托 `compileStoredVersion`，删除 `QUANTITY_FIELDS` 常量 + `ConflictException` import
- [x] 1.3 移除 `backtest-run.executor.ts` 中的 executor gate：删除 `plan.kind === 'rule_dsl' && fields 量价` 检查 + `BACKTEST_QUANTITY_PROFILE_UNAVAILABLE` 异常
- [x] 1.4 更新 `strategy-definition.service.spec.ts`：`enable()` 测试改为验证 quantity 策略可以成功 enable（不再 reject）
- [x] 1.5 更新 `backtest-run-command.service.spec.ts`：移除 `planService` mock 参数
- [x] 1.6 更新 `backtest-run.executor.spec.ts`：quantity plan 测试改为验证 proceed-to-replay（不再期望 BACKTEST_QUANTITY_PROFILE_UNAVAILABLE）

## 2. QMT 分钟级数据补齐

- [x] 2.1 通过 `POST /v1/collector/collect` 补齐 QMT 1m/5m/15m/30m/60m 数据（600519 + 300502，2026-01 ~ 2026-08）
- [x] 2.2 补齐 QMT 3m 数据（之前只有 2 根）
- [x] 2.3 验证 TDX/QMT 日线交叉对照：volume 差 0.00%、amount 差 0.0000%
- [x] 2.4 验证 1m 聚合 vs 日线一致性（差额 < 20 元，provider 精度差异）

## 3. 部署验证

- [x] 3.1 部署新镜像 `d0dc170`（API 层 gate 移除）→ k.volume 回测仍被 executor gate 拒绝
- [x] 3.2 部署新镜像 `8b12623`（executor gate 移除）→ k.volume 回测 run 11 completed，15 signals
- [x] 3.3 全栈 healthy：所有容器正常运行
