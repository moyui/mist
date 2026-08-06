# Design — Candle Degraded Event Recovery

## 1. 现状

`degradedRuntimeReasons`（`realtime-candle-health.service.ts`）用 8 个累计
计数器 > 0 判定 degraded。累计计数器只增不减 → 一次性事件永久 degraded。

2026-08-06 HIL 实测：Redis AOF restart 期间一次 due scan 失败 →
`due_scan_failed` 永久生效，sealed 继续产出但 health 卡 degraded。

## 2. 完整计数器清单（代码事实，2026-08-06）

| 计数器 | 递增点 | observation 字段 | 当前是否计入 degraded |
|---|---|---|---|
| due scan 失败 | due scanner `zrangebyscore` 抛异常 | `due.scanFailureTotal` | 是（累计判定） |
| due 注册失败 | due MULTI/EXEC null/throw；交易日过期；record bytes 断言 | `due.registrationFailureTotal` | 是（累计判定） |
| 封存失败 | seal bounds 失败；交易日过期；`multi.exec()` null/throw；discardDue 同类失败 | `candle.finalizationFailureTotal` | 是（累计判定） |
| record 超限 | seal/discardDue record bytes 断言失败（与封存失败同时 +1） | `candle.recordLimitBreachTotal` | 是（累计判定） |
| 超 horizon 仍无候选 | `releaseAtHardHorizon` 超过 hard horizon | `candle.finalizationHorizonExceededTotal` | 是（累计判定） |
| snapshot 入队被拒 | snapshot 入队 rejection | `queue.snapshotOverflowTotal` | 是（累计判定，与下行共用一个 reason） |
| due 入队被拒 | due task 入队 rejection | `queue.dueAdmissionOverflowTotal` | 是（累计判定，与上行共用一个 reason） |
| 重启缺口 | 进程启动在 bucket 中间，从下一个完整 bucket 恢复 | `candle.recoveryGapTotal` | 是（累计判定） |
| 晚于 grace | snapshot 晚于 `bucketEndMs + graceMs` | `candle.lateAfterGraceTotal` | 否（仅监控累积） |
| candidate 超限 | candidate capacity 超限 | `candle.candidateCapacityExceededTotal` | 否（仅监控累积） |
| quantity profile 拒绝 | converter 抛 `RealtimeQuantityValidationError` | `quantity_profile_rejected`（map） | 是（累计判定） |
| redis_* | observe() 实时状态读取（非累计） | `redis.*` | 是（瞬时状态，可自然清除） |

## 3. 目标语义

健康判定与状态累积分离：**所有计数器继续累积供监控/审计**，degraded 判定
换用独立输入。

| 类别 | 判定 | 恢复 |
|---|---|---|
| 事件性失败 | `counter > 0 && now - lastFailureAtMs < WINDOW` | 窗口内无新失败 → 回 OK |
| 持续状态 | `counter > 0`（保持现状） | 手动/状态重建 |
| 确定性拒绝 | 不参与 degraded（仅累积） | — |

事件性失败（窗口判定）：`due_scan_failed`、`due_registration_failed`、
`finalization_failed`、`finalization_horizon_exceeded`、
`record_limit_breach`、`queue_overflow`。
持续状态（累计判定）：`recovery_gap`、`quantity_profile_rejected`。
仅累积不判定：`late_after_grace`、`candidate_capacity_exceeded`（维持现状）。

**待评审问题**（本 design 未擅自定案，交 owner/复核线程）：
1. `due_registration_failed` / `finalization_failed` 计数里混有**确定性拒绝**
   （交易日过期、record bytes 断言），这些递增点是否应在健康判定中排除
   （仅累积）？本 design 倾向排除（spec 已写入"确定性拒绝不降级"场景）。
2. `queue_overflow` 是一个 reason、两个计数器，是否各自维护
   `lastFailureAtMs`、取最近者驱动窗口？本 design 倾向是（spec 已写入）。
3. `recovery_gap` 每次进程重启都会 +1，代表当日数据确有缺口；保持"进程
   生命周期内永久 degraded"（窗口不可清除）。
4. 窗口值候选 5 分钟（范围 1-15 分钟），默认 300000，交 owner 定。

## 4. 观测结构

runtime observation 增加（每个事件性计数器配一个时间戳）：
```ts
due: {
  scanFailureTotal, scanLastFailureAtMs,
  registrationFailureTotal, registrationLastFailureAtMs,
}
candle: {
  finalizationFailureTotal, finalizationLastFailureAtMs,
  finalizationHorizonExceededTotal, finalizationHorizonExceededLastFailureAtMs,
  recordLimitBreachTotal, recordLimitBreachLastFailureAtMs,
  recoveryGapTotal, /* 持续状态，无时间戳 */
}
queue: {
  snapshotOverflowTotal, snapshotOverflowLastFailureAtMs,
  dueAdmissionOverflowTotal, dueAdmissionOverflowLastFailureAtMs,
}
```

每次对应失败发生时更新时间戳（与计数递增同点）。窗口值待评审（候选
5 分钟，候选范围 1-15 分钟，参考 `REALTIME_CANDLE_GRACE_MS` 的配置模式）。

## 5. 配置

新增 `REALTIME_CANDLE_DEGRADED_RECOVERY_WINDOW_MS`（默认 300000，
有效范围 60000..900000），经 `libs/config` 校验。

## 6. 影响面

- `mist`：health service、observation types、product service 计数器递增点
  （同步时间戳）、constants、config、单测。
- `mist-monitoring`：candle health metrics 新增 lastFailureAge 维度；
  render.go REQUIRED_METRICS；contract test；`mist-monitoring/docs/metrics.md`。
- `mist-deploy`：candle HIL health 断言改为新语义；移除 HIL 侧临时容忍。
- OpenSpec：本 change 的 specs/ delta spec。

## 7. 验收

- 单测：事件性失败在窗口内 degraded、窗口外恢复、窗口内再次失败刷新
  时间戳、持续状态不受窗口影响、确定性拒绝不降级、queue 双计数器共享
  reason 各自时间戳、counter 保留累计。
- HIL：Redis AOF restart 后 health 在窗口内回 OK，sealed 保留。
- 不改变 sealed/discard 数据与 Redis key。
