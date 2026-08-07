# Evidence — candle-degraded-event-recovery（实施完成，2026-08-06/07）

> 三仓实施已完成并通过自动化验证。交易时段 HIL（7.2）与窗口校准（7.3）待部署后执行。

## 三仓 commit

| 仓库 | 分支 | Commit | 内容 |
|---|---|---|---|
| mist | `integration/realtime-backend-hil-20260806` | `7a1d95b` | feat(realtime): windowed degraded verdict + deterministic split |
| mist-monitoring | `maintenance/cleanup-superseded-productize` | `1468b58` | feat(monitoring): candle health reflects degraded verdict |
| mist-deploy | `feat/productize-current-day-realtime-market-data` | `84deef1` | feat(deploy): candle HIL asserts windowed degraded verdict |

mist `7a1d95b` 含审查修复：`releaseAtHardHorizon` 的 `Date.now()` → `this.clock.now()`（保持
horizon 时间戳在注入时钟下确定性）、finalizer JSDoc、candle.types.ts session 注释、design §9
事实修正（1421cb5 未部署 / 15:02 bug 归属 fix-close-auction）。

## 自动化验证（7.1）

### mist（`integration/realtime-backend-hil-20260806` @ `7a1d95b`）
- `pnpm run lint:check` ✅
- `pnpm exec tsc --noEmit` ✅
- `env TZ=UTC pnpm run test:ci` ✅ **1208 passed, 3 skipped**（chan.controller 预存 skip）
- `pnpm run ci:contracts` ✅
- `openspec validate --strict candle-degraded-event-recovery` ✅
- 单测覆盖（tasks 4.1 全项）：窗口内 degraded / 窗口外恢复 / 窗口内再失败刷新时间戳 /
  持续失败持续 degraded / 确定性拒绝不降级 / queue_overflow 共享 reason 取最近者 /
  record_limit_breach 与 finalization_failed 耦合不撕裂 / 单次数据丢失窗口过后回 OK /
  quantity_profile_rejected 窗口过后回 OK / counter 保留累计 / horizon 时间戳用注入时钟。

### mist-monitoring（`maintenance/cleanup-superseded-productize` @ `1468b58`）
- `go test ./...` ✅
- `python3 tests/test_metrics_contract.py` ✅ **8 passed**
- collector `candleHealth.Status` 解析、`candleSamples` ok/degraded→1/0、`mist_component_up`
  不重叠、probe 失败不发 health metric。

### mist-deploy（`feat/productize-current-day-realtime-market-data` @ `84deef1`）
- `test-realtime-candle-shadow-hil.ps1` ✅（pwsh-preview）
- `test-docker-compose-config.ps1` ✅
- `test-deploy-docker-appliance.ps1` ✅
- HIL 移除 `AllowInitialProcessLocalDegraded`，改断言窗口内回 OK。

## 待办（7.2 / 7.3）

- **7.2 交易时段 HIL**：部署后用 `run-windows-realtime-candle-shadow-hil.ps1` 验证 Redis AOF
  restart 后 health 窗口内回 OK。注意窗口起算点是**最后一次失败时间戳**（restart 会刷新
  scanFailure 时间戳），`RecoveryTimeoutSeconds` 需 ≥600（窗口 5min > 默认 180s）。
- **7.3 窗口校准**：HIL 后若 5min 默认值不合理，另建 reviewed OpenSpec delta。
- **部署前置**：生产 `REALTIME_PRODUCTIZATION_MODE` 审查线程观测为 `off`（非 shadow），部署前
  需核实；HIL 要求 shadow。
