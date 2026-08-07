# 负责人审查包 — Candle 5.4/5.5（complete-current-day-realtime-candles）

> 提交：2026-08-06 16:00 CST 前。用途：`complete-current-day-realtime-candles` tasks 5.4 证据打包
> + 5.5 limit 校准审阅材料。模式保持 `REALTIME_PRODUCTIZATION_MODE=shadow`。
> 按 `mist/docs/project-quality-governance-guide.md` 第 12 节模板输出。

## 范围

| 仓库 | branch / SHA | 说明 |
|---|---|---|
| mist | master `ef5710e2`（backend 运行）+ `fadc0e0`（openspec `candle-degraded-event-recovery`） | 无代码变更（本门禁只打包证据） |
| mist-datasource | master `68e411bf` | QMT NaN-settle 边界修复 + revert 终端桥 |
| mist-deploy | master `09441af`（+ `0c377ce`/`0e6ab42`/`2776157`/`1b4baef`/`5f7dca0` HIL harness） | HIL 在 `.worktrees/integration-realtime-backend-hil-20260806` 运行 |
| mist-monitoring | master `c8aa3398` | candle health/shadow 指标 |

- 生产环境：Windows Docker Desktop appliance（mist-api runner），TDX/QMT 终端 bridge 实装
- 影响链：TDX/QMT 终端 → datasource bridge（owner/WS）→ schema-v2 native map frame →
  backend decoder → CanonicalRealtimeSnapshot → ingress（memory）→ aggregator（securityId,source）→
  finalizer → **Redis market-data（AOF/noeviction，不写 MySQL `k`）** → `candle_finalized` handoff →
  Signal（shadow）。本 change 无新 OpenSpec 需求（已 active change）。

## 结论

- **通过（可进入 5.5 审阅）**：TDX+QMT 双源全链路 HIL（含 Redis AOF restart + protected digest 零写入）、
  TDX/QMT 交易时段 sealed 实证 + vwap 量额对照、quantity profile 唯一/股元/provenance、historical 对照可用。
- **待讨论**：degraded 语义遗留（`candle-degraded-event-recovery` fadc0e0 待推进）；5.5 limit 校准值（见 Findings）；
  **strategy 6.5② on-HIL 发现的 TDX eventTime 契约错位**（修复 `1421cb5` 已提交待部署，见
  `2026-08-06-strategy-on-hil-blocked-tdx-eventtime.md`——candle 链路数据面不受影响，仅 signal worker 消费侧）。
- **未验证/环境阻塞**：无（本门禁不涉及）。

## Findings

| ID | 状态 | 严重度 | 位置 | 影响 |
|---|---|---|---|---|
| F1 | 遗留（已开 change） | 中 | `realtime-candle-health.service.ts` degradedRuntimeReasons | 事件性失败（AOF restart 瞬时 due scan 失败）永久 degraded；`candle-degraded-event-recovery`（master fadc0e0）将区分事件/持续。本次 3 次复现（上午 1 次 + 下午 2 次，scanFailureTotal 0→1 后不再清零）。HIL 以 `AllowInitialProcessLocalDegraded` 有界容忍（仅 due_scan_failed/recovery_gap，其余 fail-closed） |
| F2 | 待审阅（5.5 校准） | 低 | HIL 观测值 | grace=5000ms；queue 8/256；due batch 64；sealed record ≤566B / manifest ≤189B；usedMemory 3.5–4.5MB；AOF 7.9MB；pendingGlobal=0；series 3/10；discardTotals 仅 `backend_restart_open_state_lost=3`（restart 预期） |
| F3 | 通过（契约内） | 低 | `invoke-historical` unitDecision | 收盘同源 historical 对照由验收脚本直接调用 datasource 只读接口；`unitDecision=not-inferred; provider-native historical units remain owned by their reader change`（deferred per 契约） |
| F4 | 通过 | 低 | 5.4.1 | 临时订阅编排已清；HIL 走 observe-existing（lifecycle=on，`skipped_lifecycle_on`），无 snapshot collector |

## 验证（5.4 逐项）

| 5.4 要求 | 证据 | 状态 |
|---|---|---|
| TDX 交易时段 sealed + 量额对照 | 08-05 14:42-14:44 CST `sealedTotal=9→15`、`discardTotals=[]`（ledger `2026-08-05-strategy-64-status.md`）；08-06 上午 observation+vwap PASSED（run 31068439399 前序） | **trading-session-HIL-pass** |
| QMT 交易时段 sealed 直接证据 | 08-06 下午 run 31074655336：300502.SZ（qmt:4）2 个新 sealed 1m bucket，`volume=176800/142900 股`、`amount=74134000/59841600 元`，vwap 419.31/418.77 **均 within-price-range**；`quantityProfile=volume=shares,amount=yuan`、`amountPrecisionProvenance=source=qmt,fixed-adapter=provider-float-observable-value`（`2026-08-06-qmt-candle-hil-afternoon.md`） | **trading-session-HIL-pass** |
| restart/AOF HIL | backend restart：TDX（上午）+ QMT（下午）sealed hash 保留 PASSED；**Redis AOF restart：QMT（run 31074655336）+ TDX（run 31075678182）双源 PASSED**（AOF restart 期间瞬时 due scan 失败 → raw AOF flags 恢复 → sealed 保留；post-restart bucket 继续 sealed；TDX finalHealth 仅 recovery_gap，QMT 侧 [due_scan_failed, recovery_gap] 属文档化遗留） | **trading-session-HIL-pass（双源完整）** |
| protected-table 零写入 | QMT 前后 6 表 digest **全 SAME**：k=4405、k_extensions_ef=0、k_extensions_tdx=4394、k_extensions_qmt=11、strategy_signals=0、strategy_alert_events=0；08-05 TDX 会话 strategy_signals=0 | **pass** |
| quantity profile 唯一 + 股/元 + provenance | 01/08 TDX 官方文档（Volume=手×100、Amount=万元×10000）+ QMT ×100 provider-float；`evidence/2026-08-03-provider-quantity-profile.md`；sealed record 内嵌 provenance | **pass** |
| 收盘同源 historical 对照 | QMT HTTP 1m bars 300502.SZ 可用（`providerHistoricalSample`）；unitDecision deferred per 契约 | **pass（deferred 子项）** |
| 真实异常 not-observed | `anomalies.observed=[]`、`absentGate=not-observed; see capture-realtime-provider-anomalies` | **pass** |
| 自动化和静态门禁 | 08-03 `evidence/2026-08-03-automated-validation.md`（全量基线）；HIL harness 本地 `test-realtime-candle-shadow-hil.ps1` + `test-workflow-config.ps1` PASSED；`openspec validate` 全绿 | **automated-pass** |

## 发布与回滚

- 本门禁无发布；当前生产 `shadow` 模式不变。
- **切 on 硬门禁（未满足，不切）**：owner 审阅 5.5（limit 校准 + HIL 证据，双源已齐）+ strategy
  on-HIL 修复部署与重跑完成，缺一不可。
- 回滚：`REALTIME_PRODUCTIZATION_MODE` 三态 env 可随时回 shadow/off；Redis market-data key 有
  72h retention + 上海 D+1 00:00 expiry，无 MySQL 写入需回滚。

### 补充：spec 点名的复核项逐项对照（5.5 审阅材料，2026-08-06 晚补）

design.md/tasks.md 中明确要求"复核/校准/观测"的项与 HIL 证据对照：

| spec 复核项 | 出处 | HIL 证据 | 状态 |
|---|---|---|---|
| grace 具体值：先 shadow 采样并经用户确认 | design Risks `[grace 过短丢弃迟到数据]` | graceMs=5000 固定；lateAfterGraceTotal=0（两个完整交易时段，TDX+QMT） | **待用户确认 5000ms** |
| used memory / AOF size / due lag / record bytes / 增长趋势 | design §2 "必须在 shadow/HIL 中观测" | 4 次快照 usedMemory 4.32→4.50→3.51→4.50MB（平缓）；AOF 7.27→7.93MB；due oldestLagMs=0、pendingCount=3；sealed ≤566B / manifest ≤189B；全天 sealed 总量 66.9KiB（131 条） | **通过（已观测）** |
| closed JSON 上界估算（~4.7 MiB/day）不被豁免 | design §2 | 实测 1 条 series 240 分钟上界 ≈133KiB，远低于估算 | **通过（余量充足）** |
| TDX capture-time 跨 bucket 偏移/延迟：不可接受则保持 shadow 重评审 | design §3 | 131 条 sealed fe/le **全部落在 bucket 分钟内，0 偏移**（fe 秒位 01-02、le 55-59） | **通过（未观察到）** |
| 双 source quantity profile 与股/元换算复核 | design Migration Plan 4 | TDX 手×100/万元×10000（native-decimal-text provenance）+ QMT ×100（provider-float provenance），sealed 内嵌 provenance，vwap 均在价格区间 | **通过（已复核）** |
| 2.3 候选值（queue 8/256、batch 64、byte 2048/128/1024、series 10） | tasks 2.3.x | pendingGlobal=0 未触顶；batch 未超；sealed 566B/2048B；series 3/10 | **通过（未触顶）** |
