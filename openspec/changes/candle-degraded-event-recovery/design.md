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

**redis_* 六个 reason 是实时状态快照，不适用窗口化**：表格末行"不动"需要明确——这 6 个
reason（`redis_unavailable`、`redis_observation_failed`、`redis_aof_disabled`、
`redis_aof_error`、`redis_eviction_policy`、`redis_retention`）来自 `observe()` 每次调用对
Redis 的**实时状态读取**（INFO/CONFIG/EXISTS），不是单调累计计数器。它们的语义是"当前这一刻
Redis 状态是否健康"，下一次 `observe()` 成功时自然重新求值、条件不成立即清除——**不走
lastFailureAtMs + 窗口判定**。实现时不要给它们加时间戳或窗口化逻辑。

其中两个容易混淆的 reason 需区分（均为"读不到 Redis"，但故障层不同）：
- `redis_unavailable`（`health.service.ts:85`）：Redis client 不存在（`this.redis.client`
  为 null，连接从未建立）→ early return，后续 INFO/CONFIG 探测都不执行。优先级最高——
  连接都没建。
- `redis_observation_failed`（`health.service.ts:153`）：client 存在但 `observe()` 的
  INFO/CONFIG/EXISTS 命令 throw（连接中断 / 命令超时 / 权限）。client 建了但命令失败。
两者独立，同一故障可能只触发其一；operator 看到不同 reason 可定位故障层（连接建立 vs
命令执行）。

## 5. 实现要点

### 5.1 finalizer 时间戳来源：复用调用点 `nowMs`（不注入 Clock）
`CandleFinalizer` 的 `seal(redis, candle, nowMs)` 与 `discardDue(..., nowMs)` 已把 `nowMs`
作为显式参数传入，8 个 `recordFinalizationFailure` 调用点全部在 `nowMs` 作用域内。因此
**不注入 Clock**——直接复用调用点的 `nowMs` 作为 `finalizationLastFailureAtMs` 时间源，
避免引入与 product service 不同的第二时钟源。design 早期版本"注入 Clock"作废。

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

**map 必须有界**：key 是 `${source}:${field}:${reason}`，理论组合有限（2 source × 2 field ×
7 reason = 28），但不同 provider symbol 异常可能产生变体。实现时 map 容量必须有上限
（如与 `MAX_NATIVE_ENTRIES` 同模式的 bounded guard），窗口外的 key 应清理（窗口判定已
不触发 → 无保留价值），避免长期运行无界增长。当前 map 只有 `set(+1)` 无 `delete/clear`，
窗口化时需同步引入清理逻辑。

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
- **mist-monitoring**：`mist_realtime_candle_health` 从恒 1 改为反映 degraded 生产健康；
  `candleHealth` struct 加 `Status`、`parseCandleHealth` 解析 `data.status`、
  `candleSamples` 改值；`render.go` help + `docs/metrics.md` 契约同步；metric contract test。
- OpenSpec：本 change 的 specs/ delta spec。

### 7.1 监控两层信号拆分（owner 定调）

监控侧已存在两层，本 change 让第二层真正生效：

| 层 | metric | 语义 | 本 change |
|---|---|---|---|
| 基础设施探活 | `mist_component_up{component="realtime-candles"}` | endpoint 可达 + envelope 解析 + 契约合法；进程死/500/契约崩 → 0 | 不动 |
| 生产健康 | `mist_realtime_candle_health` | 当前恒 1；改后 `status=ok`→1、`degraded`→0、`disabled`→1 | **改** |

两层职责不重叠：
- `mist_component_up=0` → 系统挂了（最高优先级），生产健康 metric 不发（基础设施都没了，
  生产健康无从断言）；
- `mist_component_up=1` 且 `mist_realtime_candle_health=0` → 系统活着但生产环节在出问题
  （窗口期内），次级告警。

**契约变化**：`mist_realtime_candle_health` 从"contract parse 成功"变"生产健康判定"。
之前 =0 与 `mist_component_up=0` 重复；改后 =0 独立表达 degraded。需同步 `docs/metrics.md`
第 42 行描述与 `render.go:54` help 文本，并在 metric contract test 断言。

`mist_realtime_candle_health` 在 `mist_component_up=0`（probe 失败 / 契约违反）时**不发**
——collector.go:113 的逻辑是 parse 失败时 `up=false` 且不 append candleSamples，已满足。

## 8. 验收

- 单测：窗口内 degraded / 窗口外恢复 / 窗口内再失败刷新时间戳 / 持续失败持续 degraded /
  确定性拒绝不降级 / queue 双计数器共享 reason / record_limit_breach 与 finalization_failed
  耦合不撕裂 / 单次数据丢失窗口过后回 OK / counter 保留累计。
- 监控 contract test：`mist_realtime_candle_health` 在 ok/degraded/disabled 下的取值；
  `mist_component_up` 与生产健康不重叠。
- HIL：Redis AOF restart 后 health 在窗口内回 OK，sealed 保留；移除临时容忍。
- 不改变 sealed/discard 数据与 Redis key；不改 `quality` 字段语义。

## 9. 不在本 change 范围

- queue failed → alert（Alertmanager 后续项）。
- 收盘 15:01/15:02 `outside A-share sessions`（已由
  `fix-close-auction-bucket-semantic` 解决——session 改半开 `[13:00,15:01)`，
  收盘桶 due 加成；2026-08-06 前此现象与 TDX 格式 bug 混杂，现独立 change 修复）。
- TDX eventTime `+08:00`（独立 bug，已由 `1421cb5` 修复，**未部署**——待审查后重建 backend 镜像部署）。
