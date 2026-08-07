## Why

`/internal/realtime/candles/status` 的 `degradedReasons` 全部由**累计计数器
> 0** 判定（`due_scan_failed`、`due_registration_failed`、
`finalization_failed`、`finalization_horizon_exceeded`、`record_limit_breach`、
`queue_overflow`、`recovery_gap`、`quantity_profile_rejected`）。累计计数器
只增不减，因此**任何一次事件性失败（例如 Redis AOF restart 期间 ioredis
重连瞬间的一次 due scan 失败）都会让 health 永久 degraded**，即使 scanner
已恢复、sealed candle 继续正常产出。

`degraded` 名义上是"当前状态"，实际表达的是"进程生命周期内出过事"——事件性
失败与持续异常被混为一谈。2026-08-06 candle shadow HIL 在 Redis AOF restart
阶段实测命中：一次瞬时 `due_scan_failed` 让 HIL 的 health 断言卡死
（已在 HIL 侧容忍记录，backend 语义未修）。

## What Changes

- degraded 的语义从"进程生命周期内是否出过事"改为"当前生产环节是否在正常运转"。
- 所有非确定性失败的计数器**统一窗口化判定**
  （`counter > 0 && now - lastFailureAtMs < REALTIME_CANDLE_DEGRADED_RECOVERY_WINDOW_MS`）。
  没有"事件性 vs 持续状态"二分法——持续故障靠时间戳不断刷新自然涌现。
- 确定性拒绝（交易日过期、record 字节超限等正常生命周期路径）不触发 degraded，仅累积计数器。
- 累计计数器永久保留供监控/审计；新增每个计数器的 `lastFailureAtMs` 供窗口判定。
- 同步 `realtime-candle-health.service.ts`、runtime observation types、`CandleFinalizer`
  （注入 Clock + 拆分确定性/瞬时路径）、quantity rejection map、candle HIL 的 health 断言。
- `mist_realtime_candle_health` 从恒 1 改为反映 degraded 生产健康，与 `mist_component_up`
  （基础设施探活）拆成两层不重叠的信号（见 design §7.1）。
- HIL 侧已加的"Redis AOF restart 容忍瞬时 due_scan_failed"作为临时缓解，
  本 change 落地后按新语义回归。

## Capabilities

### New Capabilities

- `candle-degraded-event-recovery`: 统一窗口化的 degraded 判定（报当前生产健康，不报历史）。

### Modified Capabilities

无。

## Impact

- 主要影响 `mist`：`realtime-candle-health.service.ts`、runtime observation types、
  `CandleFinalizer`（注入 Clock + 拆分确定性/瞬时路径）、quantity rejection map、config。
- 影响 `mist-monitoring`：`mist_realtime_candle_health` 从恒 1 改为反映 degraded 生产健康；
  与 `mist_component_up`（基础设施探活）拆成两层信号，不重叠。
- 影响 `mist-deploy` 的 candle HIL health 断言（恢复窗口语义，移除临时容忍）。
- 不改变 sealed/discard 数据、Redis key、`quality` 字段语义、subscription 或 strategy 链路。
