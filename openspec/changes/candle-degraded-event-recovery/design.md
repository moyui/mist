# Design — Candle Degraded Event Recovery

## 1. 现状

`degradedRuntimeReasons`（`realtime-candle-health.service.ts`）用 8 个累计
计数器 > 0 判定 degraded。累计计数器只增不减 → 一次性事件永久 degraded。

2026-08-06 HIL 实测：Redis AOF restart 期间一次 due scan 失败 →
`due_scan_failed` 永久生效，sealed 继续产出但 health 卡 degraded。

## 2. 目标语义

| 类别 | 判定 | 恢复 |
|---|---|---|
| 事件性失败 | `counter > 0 && now - lastFailureAtMs < WINDOW` | 窗口内无新失败 → 回 OK |
| 持续状态 | `counter > 0`（保持现状） | 手动/状态重建 |

事件性失败：`due_scan_failed`、`due_registration_failed`、
`finalization_failed`、`finalization_horizon_exceeded`、
`record_limit_breach`、`queue_overflow`。
持续状态：`recovery_gap`、`quantity_profile_rejected`。

## 3. 观测结构

runtime observation 增加：
```ts
due: { scanFailureTotal, scanLastFailureAtMs, ... }
candle: { finalizationFailureTotal, finalizationLastFailureAtMs, ... }
queue: { snapshotOverflowTotal, snapshotOverflowLastFailureAtMs, ... }
```

每次对应失败发生时更新时间戳。窗口值待评审（候选 5 分钟，候选范围
1-15 分钟，参考 `REALTIME_CANDLE_GRACE_MS` 的配置模式）。

## 4. 配置

新增 `REALTIME_CANDLE_DEGRADED_RECOVERY_WINDOW_MS`（默认 300000，
有效范围 60000..900000），经 `libs/config` 校验。

## 5. 影响面

- `mist`：health service、observation types、constants、单测。
- `mist-monitoring`：candle health metrics 新增 lastFailureAge 维度；
  render.go REQUIRED_METRICS；contract test。
- `mist-deploy`：candle HIL health 断言改为新语义；移除 HIL 侧临时容忍。
- OpenSpec：本 change 的 specs/ delta spec。

## 6. 验收

- 单测：事件性失败在窗口内 degraded、窗口外恢复、持续状态不受窗口影响。
- HIL：Redis AOF restart 后 health 在窗口内回 OK，sealed 保留。
- 不改变 sealed/discard 数据与 Redis key。
