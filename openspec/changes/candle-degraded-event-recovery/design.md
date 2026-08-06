# Design — Candle Degraded Event Recovery

## 1. 问题

`degradedRuntimeReasons`（`realtime-candle-health.service.ts:191`）用 8 个**单调递增的
进程内计数器 > 0** 判定 degraded。计数器只增不减 → 任何一次失败（哪怕一次 Redis AOF
restart 期间的瞬时 due scan 失败）让 health **永久 degraded**。

2026-08-06 candle shadow HIL 三次复现：AOF restart 后 `due_scan_failed` 永久生效，
sealed 继续正常产出，但 health 卡 degraded。HIL 侧临时加 `AllowInitialProcessLocalDegraded`
有界容忍，backend 语义未修。

## 2. 设计原则（owner 定调，约束后续所有分类）

1. **degraded 报"当前是否需要运维介入"，不报"历史是否出过事"。** 当前生产环节正常运转
   就该是 OK；历史失败由累计计数器永久记录。
2. **采样性质的可疑数据进库是正常的；硬性无效数据上游已在拦截。** 数据有效性分两档：
   - **轻度可疑 / 采样性质**（`quality='provisional'`，`candle.types.ts:157`，恒定单值）→
     进库，下游映射成 `type='incomplete'`（`libs/strategy/.../strategy-bar.ts:3`）自决用不用。
     这档"进库可接受"成立。
   - **硬性无效**（12 类 `InvalidReason`，`candle.types.ts:36-47`：价格非法 / 计数器回滚 /
     session 违规 / queue_overflow 等）→ `validity='invalid'`，finalizer **直接丢弃不写 Redis**
     （`candle-finalizer.ts:143`：`if (candle.validity === 'valid') multi.hset(...)`）。
     这档上游已经在拦，坏数据不进库。
   无论哪档，都不该让上游为"数据好不好"持续告警——degraded 不对数据 validity 负责。
3. **消费是下游的事。** 上游（candle 生产方）告警职责到"是否正常生产 K 线"为止。sealed
   record 写进 Redis，上游职责完成；下游（signal worker）能否解码消费是下游的 bug
   （如 2026-08-06 的 `1421cb5`，在下游修）。上游不保证数据完整性。

## 3. 核心规则（一句话）

**所有非确定性拒绝的失败计数器，统一窗口化判定；确定性拒绝不触发 degraded，仅累积；
累计计数器永久保留供监控。**

判定式：`counter > 0 && now - lastFailureAtMs < REALTIME_CANDLE_DEGRADED_RECOVERY_WINDOW_MS`

没有"事件性 vs 持续状态"二分法。持续故障靠时间戳不断刷新自然涌现——每个 bucket 都失败
= 每次刷时间戳 = 永远在窗口内 = 持续 degraded，直到根因解除。单次失败 = 时间戳记一次 =
窗口过后回 OK。这个维度**不需要在分类时预先判断**，由运行时是否还在刷时间戳自动决定。

degraded 不阻塞数据流：它不被任何数据路径服务注入（已验证
`RealtimeCandleHealthService` 仅被 diagnostic controller 调用），不 throw、不改开关。
数据流（handleSnapshot → seal）从不检查健康状态。

## 4. 完整计数器清单（代码事实，2026-08-06 master）

| 计数器 | observation 字段 | 递增点性质 | 处理 |
|---|---|---|---|
| due scan 失败 | `due.scanFailureTotal` | 瞬时（zrangebyscore throw，下秒重扫） | 窗口化 |
| due 注册失败 | `due.registrationFailureTotal` | **混合**：exec null/throw（瞬时）+ 交易日过期/record bytes（确定性） | 瞬时子路径窗口化，确定性子路径仅累积 |
| 封存失败 | `candle.finalizationFailureTotal` | **混合**：exec null/throw（瞬时）+ expired/record bytes（确定性） | 同上 |
| record 超限 | `candle.recordLimitBreachTotal` | **确定性**（record 超 byte 上限），且**永远与封存失败同时 +1**（`recordFinalizationFailure(true)`） | 仅累积；与封存失败共享一次事件的判定，不各自独立窗口化 |
| 超 horizon | `candle.finalizationHorizonExceededTotal` | 一次性：bucket 到 `bucketEnd+60s` 仍无候选，candidate 释放，那一分钟永久丢 | 窗口化（单次丢失 → 窗口过后回 OK；丢失记入累计计数器供审计） |
| snapshot 入队被拒 | `queue.snapshotOverflowTotal` | 过载/背压 | 窗口化 |
| due 入队被拒 | `queue.dueAdmissionOverflowTotal` | 过载/背压 | 窗口化；与 snapshotOverflowTotal 共享 `queue_overflow` reason，取两者时间戳最近者 |
| 重启缺口 | `candle.recoveryGapTotal` | 启动落在 bucket 中间，当前分钟无 baseline，下一分钟恢复 | 窗口化（同 horizon） |
| quantity profile 拒绝 | `quantity_profile_rejected`（map） | converter 抛 `RealtimeQuantityValidationError`，snapshot 被丢，不进 candle 数据 | 窗口化（map 需加 lastFailureAtMs） |
| 晚于 grace | `candle.lateAfterGraceTotal` | snapshot 晚于 `bucketEndMs + graceMs` | 维持现状：仅累积，不进 degraded |
| candidate 超限 | `candle.candidateCapacityExceededTotal` | candidate capacity 超限 | 维持现状：仅累积，不进 degraded |
| redis_*（6 个） | `redis.*` | `observe()` 实时状态读取（非累计） | 不动（下一次成功 observe 自然清除） |

**注意 record_limit_breach 与 finalization_failed 的耦合**：`recordFinalizationFailure(true)`
一次调用同时递增两个计数器。实现时两者必须共享同一时间戳（同一次事件），或确定性路径
统一走"仅累积不更新时间戳"，避免同一事件在一个 reason 已恢复、在另一个 reason 还 degraded
的撕裂。

**validity / InvalidReason 与 degraded 正交**：`InvalidReason`（`candle.types.ts:36-47`）的
12 个值里有 4 个与 degraded 计数器同名或同源（`queue_overflow`、
`redis_due_registration_failed`、`redis_finalization_failed`、`candidate_capacity_exceeded`），
容易误以为"invalid candle 必然 degraded"。但两者职责不同：
- `markInvalid(...)` 标记的是"**这根** candle 的数据有问题，discard 不入库"——单根 K 线的
  **局部数据**判定；
- degraded 计数器 +1 标记的是"生产环节出现了一次过载/失败"——**全局生产健康**判定。

一次 queue overflow 同时触发两者：这根 K 被 discard（数据面，局部，由 finalizer 处理），
`snapshotOverflowTotal++`（健康面，全局，由本 change 窗口化）。degraded 窗口化处理的是后者；
前者与 degraded 无关。`candidate_capacity_exceeded` 当前仅累积不进 degraded 是合理的（单根
容量超限是局部数据问题，不是生产环节故障），落位维持不变。

## 5. 实现要点

### 5.1 finalizer 注入 Clock（前置依赖）
当前 `CandleFinalizer` 构造器只有 logger（`candle-finalizer.ts:60`），没有 Clock。要维护
`finalizationLastFailureAtMs` 必须先注入 Clock。

### 5.2 确定性/瞬时拆分
`recordFinalizationFailure(recordLimitBreach=false)` 被 8 个调用点共用：
- **确定性**（4 处）：seal 的 expired tradingDay（line 133）、seal 的 record bytes 断言
  （line 122）、discardDue 的 record bytes（line 246）、discardDue 的 expired（line ~258）；
- **瞬时**（4 处）：seal 的 exec null（line 182）、seal 的 exec throw（line 195）、discardDue
  的 exec null（line 277）、discardDue 的 exec throw（line 281）。

拆分方式：给 `recordFinalizationFailure` 加 `deterministic` 参数；确定性路径传
`deterministic=true` 只递增计数器不更新时间戳；瞬时路径传 `false` 同时递增 + 更新时间戳。
due 注册侧同理：`dueRegistrationFailureCount++` 的 catch 块按错误来源区分。

### 5.3 quantity rejection map
`realtime-market-observability.service.ts` 的 `quantityRejections` Map 当前只有计数。
需为每个 key 维护 `lastFailureAtMs`；health 判定从"map 非空"改为"存在 key 满足窗口条件"。

### 5.4 observation type 与 health 判定
- `RealtimeCandleRuntimeObservation` 的 `due`/`candle`/`queue` 各加 `lastFailureAtMs` 字段；
- `degradedRuntimeReasons()` 重写为窗口化判定（需传入 `now` 与 `windowMs`）；
- `lateAfterGraceTotal` / `candidateCapacityExceededTotal` 维持不进 degraded。

## 6. 配置

新增 `REALTIME_CANDLE_DEGRADED_RECOVERY_WINDOW_MS`（默认 300000，范围 60000..900000），
经 `libs/config` 校验。窗口值待 owner 最终确认（候选 5 分钟）。

## 7. 影响面

- **mist**：health service、observation types、product service 计数器递增点（同步时间戳）、
  finalizer（注入 Clock + 拆分确定性/瞬时）、observability map、constants、config、单测。
- **mist-deploy**：candle HIL health 断言改为新语义；移除 `AllowInitialProcessLocalDegraded`
  临时容忍，改为断言 Redis AOF restart 后 health 在窗口内回 OK。
- **mist-monitoring**：`mist_realtime_candle_health` 当前恒为 1（collector.go 的
  `candleHealth` struct 不解析 `status`/`degradedReasons`）。**本 change 不改监控导出语义**
  （是否让该 metric 反映 degraded 是单独决策，待 owner 定）；监控侧无 REQUIRED_METRICS 变更。
- OpenSpec：本 change 的 specs/ delta spec。

## 8. 验收

- 单测：窗口内 degraded / 窗口外恢复 / 窗口内再失败刷新时间戳 / 持续失败持续 degraded /
  确定性拒绝不降级 / queue 双计数器共享 reason / record_limit_breach 与 finalization_failed
  耦合不撕裂 / 单次数据丢失窗口过后回 OK / counter 保留累计。
- HIL：Redis AOF restart 后 health 在窗口内回 OK，sealed 保留；移除临时容忍。
- 不改变 sealed/discard 数据与 Redis key；不改 `quality` 字段语义。

## 9. 不在本 change 范围

- `mist_realtime_candle_health` 是否反映 degraded（监控契约变更，待 owner 决策）。
- queue failed → alert（Alertmanager 后续项）。
- 收盘 15:02 `outside A-share sessions`（独立 bug，另开 change）。
- TDX eventTime `+08:00`（独立 bug，已由 `1421cb5` 修复，已部署）。
