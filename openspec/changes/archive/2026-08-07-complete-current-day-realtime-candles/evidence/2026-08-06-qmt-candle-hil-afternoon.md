# 2026-08-06 下午观察窗口 QMT Candle HIL — 全流程 PASSED

> 窗口：13:00-14:50 Asia/Shanghai。运行时间 13:31-13:44 CST（05:31:39Z-05:44Z）。
> GitHub run：mist-deploy `31074655336`（deploy SHA `09441af`）。
> 模式：`REALTIME_PRODUCTIZATION_MODE=shadow`、`REALTIME_SUBSCRIPTION_LIFECYCLE_MODE=on`（observe-existing）。
> 目标：QMT sealed 直接证据 + Redis AOF restart 验证（0c377ce 修复后首次真正执行）+ protected-table digest。

## 1. 结果

**result = passed**（5.4 全流程：identity → 观察 → backend restart → Redis AOF restart → sealed 保留 → historical → digest）

## 2. 身份与契约

| 项 | 值 |
|---|---|
| source / securityId / symbol | qmt / 4 / 300502.SZ（新易盛，**QMT 唯一 ACTIVE assignment**，08-05 创建） |
| closedKey | `mist:realtime:v1:day:20260806:qmt:4:candle:1m:closed` |
| bridge | `mist-qmt-realtime-bridge-v2.0`，fingerprint `720cde6e…`（**08-04 的 `2c616197…` 已过期**，preflight 首轮失败后取当前值），owner bigqmt-17584 gen 1 |
| intended SHAs | backend `ef5710e2` / datasource `68e411bf` / monitoring `c8aa3398`（compose 实测一致） |
| lifecycle | on → `manualSubscription.subscribe.result = "skipped_lifecycle_on"`（observe-existing，未做 manual control） |

> 注：600519.SH 是 **TDX 单源**（assignment 1），QMT 侧没有——13:06/13:13 两轮失败即为该预期不匹配，改用 300502.SZ 后 identity 全过。

## 3. QMT sealed 直接证据（观察段，2 个新 sealed 1m 记录）

| bucket | firstEventTime→lastEventTime (UTC) | volume (股) | amount (元) | vwap | 判定 |
|---|---|---|---|---|---|
| 1785994680000 | 05:38:00 → 05:38:57 | 176800 | 74134000 | 419.3099… | within-price-range |
| 1785994740000 | 05:39:00 → 05:39:57 | 142900 | 59841600 | 418.7656… | within-price-range |

- `quantityProfile = volume=shares, amount=yuan`；`amountPrecisionProvenance = source=qmt,fixed-adapter=provider-float-observable-value`
- 观察时 health：sealedTotal=171（3 series），discardTotals 仅 `backend_restart_open_state_lost=3`（restart 预期），finalization/queue/quantity 全 0
- `initialToleratedReasons = [due_scan_failed, recovery_gap]` — 今早 AOF restart 遗留的进程内计数器（candle-degraded-event-recovery 记录对象），经 `-AllowInitialProcessLocalDegraded` 有界容忍

## 4. 故障注入恢复（本次验证的核心）

| 阶段 | 结果 |
|---|---|
| backend restart | afterBackendRestartHealth：scanFailureTotal **归 0**、recoveryGapTotal=1；**Assert-HashPreserved PASSED** |
| Redis AOF restart | **扫描期间再次出现瞬时 due scan 失败（scanFailureTotal 0→1）**——正是 0c377ce 针对的场景；raw AOF 轮询等到 `available=true && aofEnabled=true && aofLastWriteStatus=ok`；**Assert-HashPreserved PASSED**（redisAofRestartPreserved=true） |
| 重启后产出 | postRestartRecords：05:41:00Z bucket 继续 sealed（cv=43500500, ca=18217551200） |
| finalHealth | sealed 继续（进程内 sealedTotal=3），degraded `[due_scan_failed, recovery_gap]`（**遗留语义问题未修**，与 openspec change 一致），strategyHandoff liveEnqueue 6 success / 0 failure |

## 5. Historical 与 anomaly

- providerHistoricalSample：QMT HTTP 1m bars 300502.SZ 可用；`unitDecision = not-inferred; provider-native historical units remain owned by their reader change` ✓
- anomalies：`not-observed; see capture-realtime-provider-anomalies` ✓

## 6. Protected-table digest（前后一致，shadow 零写入 MySQL）

| 表 | rowCount | contentDigest | 前后 |
|---|---|---|---|
| k | 4405 | `54379e2b…` | SAME |
| k_extensions_ef | 0 | `e3b0c442…` | SAME |
| k_extensions_qmt | 11 | `74b43001…` | SAME |
| k_extensions_tdx | 4394 | `aeafc640…` | SAME |
| strategy_signals | 0 | `e3b0c442…` | SAME |
| strategy_alert_events | 0 | `e3b0c442…` | SAME |

## 7. 本窗口的 harness 修复（均为容忍开关透传/0c377ce 补完，非 degraded 语义修复）

| commit | 内容 |
|---|---|
| `0e6ab42` | `AllowInitialProcessLocalDegraded` 开关（仅容忍 due_scan_failed/recovery_gap）+ **0c377ce 补完**：AOF 恢复循环改轮询 raw redis flags（原实现仍被 blocking 断言卡死，0c377ce 路径从未真正跑过） |
| `2776157` | Wait-CandleCandidate 透传开关 |
| `1b4baef` | backend restart 后 gate 透传（restart 期间又失败一次 scan → 计数器 1） |
| `5f7dca0` | Wait-CandleHealth 透传（非 advanced 函数会把未知参数吞进 $args，首版未生效） |
| `09441af` | observation 段 health 记录透传 |

全部经 `test-realtime-candle-shadow-hil.ps1`（CI 门禁同款）本地通过后推送 master。

## 8. 遗留

- `candle-degraded-event-recovery`（openspec change，master `fadc0e0`）：事件性失败窗口化语义——本窗口 3 次证实：AOF restart 前后各产生一次瞬时 due scan 失败且永久 degraded，**用户后续推进**
- 5.4 收尾项：TDX 侧 sealed 直接证据已有（上午观察+vwap 对照 PASSED，run 31068439399 前序）+ 本 QMT 侧证据；两个 spec 的 evidence 打包给负责人审（下一步）
