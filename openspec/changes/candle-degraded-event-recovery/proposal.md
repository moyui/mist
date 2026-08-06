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

- 区分**事件性失败**（once 型：瞬时扫描/注册/封存失败，恢复后应回 OK）与
  **持续状态**（level 型：`recovery_gap` 重启丢状态、`quantity_profile_rejected`
  数据持续异常，保持累计判定）。
- 为事件性失败增加**最近失败时间**观测（`lastFailureAtMs`），degraded 判定改为
  `counter > 0 && now - lastFailureAt < 窗口`（窗口值待评审，候选 5 分钟）。
- 保留累计计数器供监控面板展示"历史失败次数"；新增"最近失败 age"维度。
- 同步 `realtime-candle-health.service.ts`、runtime observation types、
  monitoring exporter/render metrics、`docs/metrics.md` 与 candle HIL 的
  health 断言语义。
- HIL 侧已加的"Redis AOF restart 容忍瞬时 due_scan_failed"作为临时缓解，
  本 change 落地后按新语义回归。

## Capabilities

### New Capabilities

- `candle-degraded-event-recovery`: 事件性失败带恢复窗口的 degraded 判定。

### Modified Capabilities

无。

## Impact

- 主要影响 `mist` 的 `realtime-candle-health.service.ts` 与 runtime observation。
- 影响 `mist-monitoring` 的 candle health metrics（新增最近失败 age 维度）。
- 影响 `mist-deploy` 的 candle HIL health 断言（恢复窗口语义）。
- 不改变 sealed/discard 数据、Redis key、subscription 或 strategy 链路。
