# 2026-08-07 交易时段 HIL — candle-degraded 7.2 AOF restart 窗口恢复 PASSED

> 执行：deploy run `31149178628`（13:01-13:04 CST，source=tdx / security 1 / 600519.SH）。
> 对应：`candle-degraded-event-recovery` tasks 7.2（+7.3 首个观测）。
> 前置：当日 TDX 数据链路修复（datasource 重启）后 sealed 持续增长；shadow 观察 PASSED。

## 1. 结果

**result = `realtime-passed-historical-deferred`**（historical 因 `no_completed_bar` 合理 defer：
13:00:58 查询 12:59-13:02 窗口时 1m bar 尚未完成；provider-native historical units 本就由
reader change 拥有）。

## 2. 重启序列与窗口恢复（7.2 核心证据）

| 阶段 | 时间 | 证据 |
|---|---|---|
| canonical 快照 | 13:00:54 | capturedAt=13:00:54+08:00（fresh） |
| 观察段 | 13:01-13:02 | series=2、candidate=2、sealedTotal=52（含上午恢复后数据） |
| backend restart | ~13:02 | `backendRestartPreserved=true`；open_state_lost 丢弃=2（restart 预期） |
| **Redis AOF restart** | ~13:02:19 | `redisAofRestartPreserved=true`；**无 due_scan 失败**（scanFailureTotal=0），触发 `recovery_gap`（lastFailureAtMs=1786078939352 ≈ 13:02:19） |
| 窗口内 health | 13:02:19-13:07:19 | **status=degraded，degradedReasons=[recovery_gap]**（mist_realtime_candle_health=0） |
| **窗口过后自动恢复** | 13:07:19+ | 13:10 实测 **status=ok、degradedReasons=[]**（mist_realtime_candle_health=1）——窗口（300000ms）无新失败自动自愈 |
| 恢复后产出 | 13:03+ | postRestartRecords：13:03 桶 sealed；13:10 sealedTotal=14（进程内持续增长） |

- 关键语义确认：7a1d95b 实现将 recovery_gap 也窗口化（`realtime-candle-health.service.ts:240-242`
  `withinWindow(recoveryGapLastFailureAtMs)`）——今天以 recovery_gap 形式实证了
  "窗口内 degraded → 窗口过后自动回 OK" 的完整路径（due_scan 形式未触发，如实记录 not-observed）。
- 窗口值（默认 300000ms）：首个交易观测判定**合理**——restart 期间 degraded、过后准时恢复，
  无频繁闪动也无掩盖（7.3 勾选，继续多日观察）。

## 3. 保护数据与零写入

- sealed/discard 与 Redis key：backend + AOF 双 restart 后 **Assert-HashPreserved 均 true**。
- protected-table digest：6 表前后 **SAME**（k=4405、k_extensions_ef=0/tdx=4394/qmt=11、
  strategy_signals=0、strategy_alert_events=0）——shadow 零写入 MySQL。
- `mist_component_up` 与 candle health 分层不重叠（restart 期间探针信号独立）。

## 4. 判读与勾选

- **7.2 勾选**：交易时段 HIL 验证通过（AOF restart → 窗口内 degraded → 窗口过后回 OK；
  sealed/discard 与 Redis key 不变；health 0→1）。真实异常未出现的部分（due_scan 失败形式）
  记为 not-observed，不伪造。
- **7.3 勾选**：首个观测窗口默认值（300000ms）合理，无需另建 delta；持续观察见监控 follow-up。
- 关联取证：lifecycle 6.3（restart/reconnect）= 本次 backend/AOF restart 的订阅恢复过程；
  6.4（09:15 full replacement）已另行取证（见 `2026-08-07-lifecycle-64-weekday-0915.md`）。
