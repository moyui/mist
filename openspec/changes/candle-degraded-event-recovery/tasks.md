## 1. 事件性失败窗口判定

- [ ] 1.1 `[mist]` 为事件性失败维护 `lastFailureAtMs` 时间戳：`due.scanLastFailureAtMs`、
  `due.registrationLastFailureAtMs`、`candle.finalizationLastFailureAtMs`、
  `candle.finalizationHorizonExceededLastFailureAtMs`、
  `candle.recordLimitBreachLastFailureAtMs`、`queue.snapshotOverflowLastFailureAtMs`、
  `queue.dueAdmissionOverflowLastFailureAtMs`；每次对应计数器递增时同步更新时间戳。
- [ ] 1.2 `[mist]` `degradedRuntimeReasons` 改为事件性判定：
  `counter > 0 && now - lastFailureAtMs < REALTIME_CANDLE_DEGRADED_RECOVERY_WINDOW_MS`；
  窗口内无新失败则不再计入 degraded；持续状态（`recovery_gap`、`quantity_profile_rejected`）
  保持累计判定不变。
- [ ] 1.3 `[mist]` 累计计数器保留用于监控（总量语义不变），observation type 增加
  lastFailureAtMs 字段，且窗口参数经 `libs/config` 校验（默认 300000，范围 60000..900000）。

## 2. 观测与监控同步

- [ ] 2.1 `[mist tests]` 单测：事件性失败在窗口内 degraded、窗口外恢复、窗口内再次失败
  刷新时间戳、持续状态不受窗口影响、counter 保留累计。
- [ ] 2.2 `[mist-monitoring]` candle health 指标增加 lastFailureAge 维度（bounded
  label，无失败时 0/absent）；`render.go` REQUIRED_METRICS 与 contract test 同步。
- [ ] 2.3 `[mist-deploy]` candle HIL health 断言改为新语义；移除 HIL 侧对
  degraded 的临时容忍，改为断言 Redis AOF restart 后 health 在窗口内回 OK。

## 3. 发布与验收

- [ ] 3.1 `[mist/mist-monitoring/mist-deploy]` 运行 unit、contract、lint、
  `git diff --check` 与 OpenSpec strict validation。
- [ ] 3.2 `[operator]` 交易时段 HIL 验证：Redis AOF restart 瞬时失败后 health
  窗口内回 OK，sealed/discard 数据与 Redis key 不变，protected-table digest 一致。
- [ ] 3.3 `[operator]` 本 change 发布后，若观测表明窗口默认值不合理，另建 reviewed
  OpenSpec delta 调整，不在本 change 中反复修改生产语义。
