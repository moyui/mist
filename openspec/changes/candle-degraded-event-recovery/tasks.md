## 1. finalizer 前置改造

- [ ] 1.1 `[mist]` `CandleFinalizer` 注入 `Clock`（当前构造器只有 logger，见
  `candle-finalizer.ts:60`）；为后续 `finalizationLastFailureAtMs` 提供时间源。
- [ ] 1.2 `[mist]` `recordFinalizationFailure(recordLimitBreach=false)` 加 `deterministic`
  参数，拆分 8 个调用点：
  - 确定性（4 处：seal expired、seal record bytes、discardDue record bytes、discardDue
    expired）→ 传 `deterministic=true`，只递增计数器，**不更新时间戳**；
  - 瞬时（4 处：seal exec null/throw、discardDue exec null/throw）→ 传 `false`，递增 +
    更新 `finalizationLastFailureAtMs`。
- [ ] 1.3 `[mist]` `recordLimitBreach` 与 `finalizationFailureTotal` 的耦合处理：两者同源于
  一次 `recordFinalizationFailure(true)` 调用，确定性 record bytes 路径走"仅累积"，确保
  同一事件不在两个 reason 间撕裂（一个恢复、一个还 degraded）。

## 2. 时间戳维护（统一窗口化的输入）

- [ ] 2.1 `[mist]` 为每个非确定性计数器维护 `lastFailureAtMs`，在递增同点同步更新：
  `due.scanLastFailureAtMs`、`due.registrationLastFailureAtMs`（仅瞬时子路径）、
  `candle.finalizationLastFailureAtMs`（仅瞬时子路径）、
  `candle.finalizationHorizonExceededLastFailureAtMs`、
  `queue.snapshotOverflowLastFailureAtMs`、`queue.dueAdmissionOverflowLastFailureAtMs`、
  `candle.recoveryGapLastFailureAtMs`。
- [ ] 2.2 `[mist]` `realtime-market-observability.service.ts` 的 `quantityRejections` map
  为每个 key（`${source}:${field}:${reason}`）维护 `lastFailureAtMs`；health 判定从
  "map 非空"改为"存在 key 满足窗口条件"。

## 3. health 判定改写

- [ ] 3.1 `[mist]` `RealtimeCandleRuntimeObservation` 类型：`due`/`candle`/`queue` 各加
  对应 `lastFailureAtMs` 字段（无失败时 `null`）。
- [ ] 3.2 `[mist]` `degradedRuntimeReasons()` 重写为统一窗口化判定：
  `counter > 0 && now - lastFailureAtMs < REALTIME_CANDLE_DEGRADED_RECOVERY_WINDOW_MS`；
  需传入 `now` 与 `windowMs`。删除原 `> 0` 直接映射。
- [ ] 3.3 `[mist]` `queue_overflow` 由 `snapshotOverflowLastFailureAtMs` 与
  `dueAdmissionOverflowLastFailureAtMs` 取最近者驱动；任一刷新即刷新共享窗口。
- [ ] 3.4 `[mist]` 确定性拒绝路径（finalizer expired/record bytes、due 注册 expired/record
  bytes）不计入窗口判定，仅累积计数器。
- [ ] 3.5 `[mist]` `lateAfterGraceTotal` / `candidateCapacityExceededTotal` 维持仅累积、
  不进 degraded（保持现状）。
- [ ] 3.6 `[mist]` 新增配置 `REALTIME_CANDLE_DEGRADED_RECOVERY_WINDOW_MS`（默认 300000，
  范围 60000..900000），经 `libs/config` 校验。

## 4. 测试

- [ ] 4.1 `[mist tests]` 单测覆盖：
  - 窗口内 degraded / 窗口外恢复 / 窗口内再失败刷新时间戳；
  - 持续失败（每 bucket +1）持续 degraded，根因解除后窗口过后回 OK；
  - 确定性拒绝不降级（expired/record bytes 路径只累积）；
  - `queue_overflow` 双计数器共享 reason 取最近者；
  - `record_limit_breach` 与 `finalization_failed` 耦合不撕裂；
  - 单次数据丢失（horizon_exceeded / recovery_gap）窗口过后回 OK；
  - quantity_profile_rejected 窗口过后回 OK；
  - counter 保留累计不重置。

## 5. HIL 断言语义

- [ ] 5.1 `[mist-deploy]` `run-realtime-candle-shadow-hil.ps1` 的 `Assert-CandleHealth`：
  移除 `AllowInitialProcessLocalDegraded` 临时容忍；改为断言 Redis AOF restart 后 health
  在 `REALTIME_CANDLE_DEGRADED_RECOVERY_WINDOW_MS` 内回 OK。
- [ ] 5.2 `[mist-deploy]` HIL contract test 同步新断言语义。

## 6. 发布与验收

- [ ] 6.1 `[mist/mist-deploy]` 运行 unit、contract、lint、typecheck、`git diff --check`
  与 OpenSpec strict validation。
- [ ] 6.2 `[operator]` 交易时段 HIL 验证：Redis AOF restart 瞬时失败后 health 窗口内回 OK，
  sealed/discard 数据与 Redis key 不变。
- [ ] 6.3 `[operator]` 本 change 发布后，若观测表明窗口默认值不合理，另建 reviewed
  OpenSpec delta 调整，不在本 change 中反复修改生产语义。
