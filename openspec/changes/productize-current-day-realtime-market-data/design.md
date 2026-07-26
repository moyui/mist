## Context

当前 `RealtimeSnapshotIngressService.handleSnapshot()` 只把 accepted canonical snapshot 写入
进程内 `Map`。TDX/QMT frame 已统一为 schema v1，包含完整 native object、`eventTime`、
`capturedAt`、quality、epoch 和 per-symbol sequence；transport HIL 已完成并归档。现有 K 查询、
indicator、Chan 和 `StrategyScanService.runScan()` 只读取 MySQL，`apps/schedule` 尚未投产，
Compose 也没有 Redis service。

仓库当前直接依赖 `redis` 但没有产品调用；本 change 按已确认边界使用 `ioredis`。策略 registry
和手工 scanner 只是基础骨架，尚未形成 realtime strategy runtime；例如
`crossesAbove/crossesBelow` 尚无正式执行语义。因此本 change 只建立 market data 产品边界，
不提前实现策略状态、Signal/AlertEvent、BullMQ 或通知。

## Goals / Non-Goals

**Goals:**

- 让 transport-accepted frame 在不阻塞 transport memory store 的前提下更新当日 candle。
- 用 canonical `eventTime` 生成有界、可定时封存并明确记录 restart discard 的
  per-security effective-source 1 分钟 candle。
- 为 K 线、indicator、Chan 和未来策略消费者提供唯一冷热查询边界。
- 在 closed candle 中保存形成该 candle 的 immutable `closingSnapshot`。
- 通过 `off|shadow|on` 分阶段发布，并保持无 migration 回滚。

**Non-Goals:**

- 不修改 datasource frame、bridge、owner、sequence 或 transport mode。
- 不实现 runtime TDX/QMT source switch、effective-source revision 或自动先退后订。
- 不将 Redis snapshot/candle 写入 MySQL，也不创建 Redis→MySQL archive。
- 不合成 5/15/30/60 分钟、日线或历史 tick。
- 不接入 strategy evaluator，不创建策略 runtime state、Signal 或 AlertEvent。
- 不引入 eventKey、NotificationEnvelope、BullMQ producer、handoff reconciler 或 channel delivery。
- 不恢复旧 `runScan()` 作为 realtime 入口，不实现 B2 portfolio backtesting。
- 不在本 change 启用收盘 provider history sync。

## Decisions

### Accepted ingress 与 product path 故障隔离

TDX/QMT client 继续先完成 strict decode、allowlist 和 epoch/per-symbol sequence fence，再调用
公共 `handleSnapshot()`。该方法先更新现有 memory latest，随后把 snapshot 交给
`RealtimeMarketDataProductService`。

product service 按 canonical `securityId` 串行处理 accepted frame，保证 open candle state
遵循 transport 接受顺序，而不是异步 I/O 完成顺序。Redis 写入、恢复或 finalizer 失败只记录
product-path error 并丢弃受影响 candle；不得回滚或破坏 transport memory state，也不得等待
Redis 恢复后补写错过的 realtime candle。
per-symbol queue 必须有容量和 overflow metric，防止 Redis 长时间不可用造成无界内存。

不在两个 realtime client 内分别写 Redis，避免复制 source 行为并把 transport fencing 与
product I/O failure 混在一起。

### 单 product writer 与 per-symbol Promise queue

首版部署只有一个 `mist-backend` realtime product writer，工作负载主要是 Redis I/O 和轻量
OHLC/累计量计算。进程内使用无第三方依赖的
`Map<securityId, Promise<void>>` keyed serial queue：

- 同一 key 的 accepted snapshot task 严格串行；
- 不同 key 可并行等待 Redis I/O；
- Redis due scanner 只发现到期项，`finalizeCandle` 必须进入与 snapshot update 相同的 keyed queue；
- 前一 task 失败不得破坏后续 Promise chain；
- queue 有 per-key/global pending 上限、oldest-age、overflow metric 和 shutdown drain；
- overflow 不静默合并 snapshot；受影响 candle 标记 `queue_overflow` 并在封存时丢弃；
- task 执行前复核 stream epoch；owner generation 或 epoch 已变化时丢弃旧 task。

Node.js 维护 bounded per-bucket open state。Redis 不保存 mutable recovery field；每个新 bucket
只登记一次 due/manifest/TTL，后续 accepted frame 不执行完整 candle `HSET`。finalizer 使用一个
`MULTI/EXEC` 原子提交 closed Hash field、watermark、due removal、manifest 和 TTL。这样 AOF
主要记录每分钟的 due/close/seal，而不是每秒重复记录同一 open JSON。

首版不使用 Redis Lua、`WATCH/MULTI` retry、Redlock、distributed product owner 或 worker
thread。部署禁止 productization `shadow|on` 时 backend `replicas > 1`，发布采用 stop-old 后
start-new。未来横向扩展必须建立独立 distributed product ownership change。

### Node.js latest 与 Redis key/TTL

accepted full snapshot 只存在于 bounded memory latest Map，key 为 canonical `securityId`。
value 保留当前 effective `source`、`providerSymbol`、canonical 和完整 native。新 snapshot
直接替换旧对象；旧对象无引用后由 Node.js GC
回收，不在进程内积累时间点序列。backend restart 后 latest 暂时为空，下一笔 accepted frame
恢复；transport diagnostic 和 latest snapshot API 读取该内存边界。

Redis 不保存 snapshot/latest/timepoint/mutable-open key。完整 provider native 只存在于 bounded
Node latest。只有 `eventTime` 可信、价格有效且属于 session 的 snapshot 才进入 Node candle
product path；缺少 `eventTime` 的 snapshot 仍覆盖 memory latest，但不参与 candle。

自然日和 trading day 按 `Asia/Shanghai` 从 canonical `eventTime` 计算。所有 candle product
keys 的目标过期点为 `dayEnd + 72h`，但由 Node `Clock` 计算剩余时长并使用相对
`EXPIRE`/`PEXPIRE` 设置；查询层只暴露当前日，TTL 不是查询正确性的依赖。

### 时间职责与 Node Clock

首版是单 Windows host、单 backend product writer，不建立 MySQL/Redis/NTP clock-skew
协调机制。时间职责固定为：

- provider canonical `eventTime` 决定 trading day、session 和 minute bucket，不得用 Node 接收
  时间替换，否则跨分钟延迟 frame 会被错误归桶；
- datasource frame 的 `capturedAt` 原样保留，只用于 transport/capture 诊断，不参与
  finalizer、TTL 或 MySQL 业务时间判断；
- backend 在 transport acceptance 后使用同一个可注入 Node `Clock` 生成 `acceptedAt`，并用该
  Clock 生成 `closedAt`、due scanner 当前时刻、finalizer cutoff 判断、当前自然日路由和相对 TTL；
- Redis due ZSET 只保存 Node 计算的 cutoff score，scanner 使用 Node `Clock.now()` 作为
  `ZRANGEBYSCORE` 上界；不得调用 Redis `TIME` 参与业务判断；
- MySQL/Redis 自身的 `NOW()`、server time 或 clock skew 不参与 candle、schedule 和清理决策；
  需要持久化的业务时间由 Node 显式提供，既有数据库审计时间不作为市场数据语义；
- Windows/NTP 运维健康属于后续 production operations readiness，不进入本 change。

所有时间相关 service 必须依赖同一个 `Clock` abstraction，测试注入 fixed/fake clock；禁止在
candle、finalizer、TTL、query rollover 和 schedule 核心逻辑中散落不可替换的 `Date.now()`。

```text
mist:realtime:v1:day:{YYYYMMDD}:{source}:{providerSymbol}:candle:1m:closed
mist:realtime:v1:day:{YYYYMMDD}:{source}:{providerSymbol}:candle:1m:watermark
mist:realtime:v1:day:{YYYYMMDD}:{source}:{providerSymbol}:manifest
mist:realtime:v1:day:{YYYYMMDD}:candle:1m:due
```

`providerSymbol` 保留 source-specific identity；产品查询仍通过 canonical `securityId/securityCode`
解析。manifest 记录固定结构 keys，供后续收盘同步精确删除。`candle:1m:closed` 是日级
Redis Hash，以 `bucketStartMs` 为 field、compact candle JSON 为 value；直接 `HSET`，不做
内容 hash compare。

grace 期间上一 bucket 等待封存时下一 bucket 已开始，因此同一 `securityId` 可以短暂存在
两个相邻 Node open states。每个 bucket 只保留一份聚合 state；当前 closing snapshot 随最新
accepted frame 直接覆盖，不形成历史。正常相邻 bucket 并存继续处理业务并记录 monitoring，
不标记 invalid/degraded。

```text
retentionHorizonMs = sourceGraceMs + dueScannerIntervalMs + queueToleranceMs
expectedOpenBucketCount = 1 + ceil(retentionHorizonMs / 60000)
```

短暂超过 expected range 记录 warning/overlap metric，持续超过 oldest-age/backlog threshold
才 degraded。另设更高的 `REALTIME_CANDLE_MAX_OPEN_BUCKETS_PER_SYMBOL` hard limit；触及后
禁止静默淘汰或覆盖已有 bucket，transport/latest 继续，受影响的新 candle fail closed。

`candle:1m:watermark` 至少保存：

```text
sealedThroughBucket, outcome(closed|discarded),
closingCumulativeVolume, closingCumulativeAmount,
streamEpoch, lastSequence
```

watermark 在 restart 后阻止旧 snapshot 重开 closed 或 discarded bucket。restart 时如果 due
存在但对应 open state 已随进程消失，该 bucket 以 `backend_restart_open_state_lost` 丢弃；不得
从残缺 checkpoint 猜测 OHLC。

closed record 的 `closingSnapshot` 是 compact canonical projection，允许：

```text
securityId, securityCode, providerSymbol, source,
eventTime, capturedAt, price,
cumulativeVolume, cumulativeAmount,
quality, streamEpoch, sequence
```

禁止复制完整 native object、order book 或其他未被产品消费的 provider fields。完整 native 仅在
Node latest 中保留。

正常 A 股约 240 根、港股约 330 根 1 分钟 K。旧 414-byte 假设只作为被否定的下限，不再作为
capacity baseline。目标 compact closed record 按实测约 1–2 KB 预算，对应单只股票单 source
单日 A 股约 0.3–0.5 MB、港股约 0.4–0.7 MB（含 Redis overhead 的初始规划值）；`dayEnd+72h`
极端可同时保留约 4 个交易日分区。正式值必须用生产形态 golden/HIL payload 的
P50/P95/P99/max、Redis `MEMORY USAGE`、订阅规模和 allocator/AOF 实测替换。

### Candle state machine

每个 `securityId + tradingDay` 只维护当前 effective source 的累计量 baseline 和 minute bucket；
source/providerSymbol 作为 partition metadata。state 至少包含
bucket、OHLC、volume/amount delta、first/last event time、last cumulative totals、
last applied event time、quality、validity、invalid reason、session、last sequence 和
`closingSnapshot`。

- 仅 session 内、价格有效且 `eventTime` 存在的 snapshot 参与 candle。
- 相同或更早的 `eventTime` 仍可覆盖 memory latest，但不得回退 candle state；记录
  duplicate/late metric。
- 累计量正常增加时取非负 delta；回退时当前 bucket 标记 `counter_reset` 并丢弃，同时把当前
  累计值作为后续 bucket baseline。
- 首次建立 bucket 读取 sealing watermark 或上一根 closed candle 的 closing cumulative totals。
- session 中途没有任何可信 baseline 时，当前 bucket 标记 `baseline_unavailable` 并在封存时
  丢弃；最后累计值可作为下一 bucket baseline。
- 午休不生成空 candle，baseline 跨午休保留；不同自然日不继承 baseline。
- 每个 bucket 首次建立时只登记一次 due/manifest/TTL；后续 frame 不重复写完整 open state。

不等待下一分钟第一笔 tick 才闭合，因为午休、收盘和停牌时可能没有下一笔。

所有 realtime candle 都是 `quality=provisional` 的 snapshot-sampled OHLC：

- `open` 为 bucket 内第一份已观察价格；
- `high/low` 为已观察价格极值；
- `close` 为最后一份已观察价格；
- 不承诺覆盖采样间隔内全部成交，采样误差本身不是异常。

closed candle 保存 `closingCumulativeVolume`、`closingCumulativeAmount` 和 compact canonical
`closingSnapshot`。前两者用于下一 bucket/restart baseline；后者是未来策略 change 可使用的
不可变行情输入，但本 change 没有策略消费者。

### 异常 candle 丢弃

以下结构性异常使 bucket invalid：

```text
invalid_event_time
invalid_price
session_violation
baseline_unavailable
counter_reset
queue_overflow
epoch_discontinuity
backend_restart_open_state_lost
redis_due_registration_failed
redis_finalization_failed
invalid_ohlc
```

重复 frame 或可安全忽略的 late frame 只计 metric，不自动使整根 candle invalid。invalid bucket
到期时 finalizer 原子推进 discarded watermark 并删除 due state，但不得 `HSET` closed field，
也不得进入 K query、Indicator 或 Chan。

每次 invalid、discard 或 recovery 写 versioned structured log，至少包含：

```text
schemaVersion, event, severity, reason, component, operation,
source, market, securityId, securityCode, providerSymbol, tradingDay,
bucketStart, bucketEnd, session, quality, validity,
eventTime, capturedAt, firstEventTime, lastEventTime,
streamEpoch, acceptedSequence, lastAppliedSequence,
observedPrice, OHLC,
observedCumulativeVolume, observedCumulativeAmount,
baselineCumulativeVolume, baselineCumulativeAmount,
closingCumulativeVolume, closingCumulativeAmount,
queuePendingForKey, queuePendingGlobal, queueOldestAgeMs,
redisKeyType, redisOperation, redisErrorCode,
recoveredBaselineFrom, consecutiveDiscardCount,
traceId, errorName, errorCode, errorMessage
```

不适用字段显式为 `null`。不得输出完整 provider native、Redis value、连接串、凭据或 token；
只输出 allowlisted scalar 摘要，文本必须脱敏限长。日志 sink 失败不得阻塞 transport。

### Due-candle finalizer 与 grace

backend 按 Node `Clock` 每秒扫描当前日 due ZSET，将到期 finalizer 放入相同 keyed queue。backend 在 transport
acceptance 后、任何异步 product I/O 前记录 `acceptedAt`：

```text
arrivalOffsetMs = acceptedAt - bucketEnd
captureLagMs = capturedAt - eventTime
backendIngressLagMs = acceptedAt - capturedAt
```

`shadow` 使用显式较长 observation window（初始建议 30 秒），同时计算
1/3/5/10/15/30 秒候选 grace 下的 late-frame/affected-bucket 数量和比例，并按
`source + market + session` 输出 P50/P95/P99/P99.9/max。symbol/bucket 只进入 structured log。

```text
TDX_REALTIME_CANDLE_GRACE_MS
QMT_REALTIME_CANDLE_GRACE_MS
TDX_REALTIME_CANDLE_CALIBRATION_ID
QMT_REALTIME_CANDLE_CALIBRATION_ID
REALTIME_CANDLE_LATENESS_OBSERVATION_MS
```

`5s` 只作为候选点。每个 source 至少完成 3 个完整支持交易日 shadow，覆盖开盘、上午、午休
前后、普通午后和收盘；推荐 5 日。候选按 `P99.9 + due scanner jitter + safety margin` 选择；
样本不足时使用 observed max 加安全余量。`on` 缺少 accepted evidence、显式 grace 或 evidence
ID 时 fail closed。

A 股最后一个 bucket 延迟到 15:02，港股 closing-auction 最后 bucket 延迟到 16:10。valid
candidate 到期后，finalizer 直接在一个 `MULTI/EXEC` 中写 closed、更新 watermark、移除 due
member、更新 manifest/TTL。candle sealing 不等待策略、MySQL、BullMQ 或其他业务消费者。

finalization 后到达的旧 bucket tick 只覆盖 memory latest，不重开 candle、不修改 closed field；
记录 `late_after_finalize` metric 和 structured log。连续超阈值时 product health degraded，但
不得误报 transport 断线。

snapshot/finalizer race 按以下规则关闭：

1. ingress 完成 transport acceptance 后同步记录 `acceptedAt` 并立即提交 product task；
2. 只有 `acceptedAt <= bucketEnd + sourceGrace` 的 frame 可以修改对应 Node open state；
3. due scanner 只能提交 finalizer task；到达队首后读取最新 Node open state和 Redis watermark，
   并复核 time、cutoff、epoch、sequence 和 sealed state；
4. 同一 key 的 due buckets 按 bucket/cutoff 升序处理；
5. valid bucket 使用一个 `MULTI/EXEC` 完成 closed/sealing 状态迁移；
6. invalid bucket 推进 watermark 为 `discarded`，但不写 closed；
7. restart 后 due bucket 没有完整 Node open state时，以
   `backend_restart_open_state_lost` 丢弃并监控；
8. Redis commit 结果不确定时暂停该 key、进入 degraded，并从 Redis reload 后才能恢复；不得
   回放 outage 期间错过的 realtime candle。

### Redis 快速失败与 Node 本地有界清理

market-data Redis client 不得在断线时缓存并延后回放旧命令。`ioredis` 使用
`enableOfflineQueue=false`、有界 `maxRetriesPerRequest`（首版为 `0` 或 `1`）以及显式
connect/command timeout；所有 product Promise task 必须在 timeout 内 resolve/reject，不能永久
占住 keyed queue。具体 timeout/retry 值在 shadow 中校准并纳入配置与 health。

每个 Node open bucket 在创建时同时进入本地 cutoff/oldest-age sweep，不以 Redis due 登记成功
作为内存回收前提：

1. due/manifest 登记失败或超时后，将 bucket 标记
   `redis_due_registration_failed`，不再尝试把该 candle 作为完整数据补写；
2. 到 cutoff 或 hard cleanup horizon 时，本地 sweep 仍进入同一个 `securityId` queue，丢弃并
   删除 Node open state；
3. Redis 已恢复时可以幂等移除残留 due member、推进 discarded watermark；Redis 仍不可用时
   Node state 仍必须释放，残留 Redis key 由 TTL 或 restart discard 处理；
4. 记录 source/security/bucket、Redis operation/error、queue age 和 cleanup outcome，产品
   health degraded；transport/latest 继续。

这只是有界清理与故障观测，不建立 persistent continuity/missing-interval state，不从
datasource/MySQL 回填，也不向
API 声明分钟连续完整。

### Security 初始化时确定唯一 realtime source

source-specific native/candle/history 继续保留，但同一 canonical `securityId` 的 realtime
subscription 首版只允许一个 effective source。该不变量在 `Security` 初始化及
`SecuritySourceConfig` 新增、更新、删除事务建立：

1. `Security.code` 是无市场后缀 canonical code，例如 `300502`；
2. TDX/QMT `formatCode` 保留 provider symbol，例如 `300502.SZ`，但必须关联同一个
   canonical `Security.id`；
3. 同一 `(source, normalized formatCode)` 不得关联多个 `securityId`；
4. enabled TDX/QMT configs 中 `priority` 唯一最高者是 effective realtime source；
5. 无 TDX/QMT config 表示不具备 realtime 资格；最高 priority 并列或 identity ambiguous 时
   拒绝 source mutation；
6. 其他 enabled source configs 可继续用于历史同步。

source mutation 在事务内读取变更前后的全部候选 configs。已有数据在启用 B1 前只读审计；
identity ambiguity 或最高 priority 冲突时 fail closed，由操作员修复，不以 migration 猜测
默认值。首次初始化可以选出一个 effective identity；初始化完成后，只允许不会改变
`(source, providerSymbol)` 的 mutation。任何会改变或移除该 identity 的 mutation 必须在配置提交、
desired 更新、subscription control 或 product state 变化之前，以
`EFFECTIVE_SOURCE_CHANGE_UNSUPPORTED` 原子拒绝。

runtime 只把已校验的 `securityId -> effective source + providerSymbol` 转为 desired sets，并按
`securityId` 去重，不根据 freshness/owner 自动切源。allowlist 只是 transport safety ceiling；
初始化选定的 providerSymbol 必须处于对应 source ceiling，非 effective source 不产生第二订阅。
若非 effective source frame 仍到达，transport memory/fencing 可保持 accepted，但 candle product
path 以 `non_effective_realtime_source` 拒绝并监控。

该拒绝不得调用 TDX/QMT `sync_subscriptions`、`subscribe` 或 `unsubscribe`，也不得清理或迁移
现有 Node latest/open/baseline、Redis closed candles 或 datasource desired/actual state。其他
source config 可以继续服务历史同步，只要 mutation 后的 effective identity 不变。未来若需要
维护窗口换源或 runtime transition，必须由独立 focused change 定义，不属于 B1。

### 统一冷热 K 查询

新增 `MarketKQueryService`：

- `Period.ONE_MIN` 非当日范围读 MySQL；
- 当前 `Asia/Shanghai` 自然日范围读 Redis closed candles；
- 跨日合并、按 timestamp 升序，并以
  `source + security + period + timestamp` 去重；
- 当前日以外 Redis partition 永不返回，即使物理 key 尚未清理；
- 其他 period 保持 MySQL-only，不从 1 分钟 realtime candle 派生高周期。

K API、Indicator 和 Chan input adapter 依赖该 service，不各自实现冷热拼接。frontend 只访问
Mist backend，不直连 Redis/datasource。

### 后续策略与通知边界

本 change 的终点是 immutable closed candle 和统一查询。future
`connect-realtime-strategy-signals` 必须在策略规则、prior-context 和 activation state 语义正式
完成后接入，且不能反向改变 market-data sealing：

- closed candle 可以作为 future strategy input，但 candle 是否封存不依赖策略结果；
- future strategy state 属于 strategy runtime，不放入本 change 的 candle repository；
- 普通条件持续为 true 时不得每分钟通知；首版应定义 `false/unknown -> true` episode 语义，
  continuity unknown 时优先允许可识别重发而不是静默漏发；
- stable eventKey 使用 canonical `securityId` 且不包含 source；identity 纯函数按不同语义集中
  组织在 `libs/identity`，禁止万能 generator；
- Node→BullMQ full-envelope primary、MySQL Signal/AlertEvent fallback、双向 repair 和 channel
  delivery 在后续 focused changes 定义；future BullMQ 必须使用物理独立 queue Redis；
- 本 change 不创建预留 Redis strategy key、BullMQ queue 或数据库副作用。

### Redis 服务物理隔离

B1 只部署 market-data Redis：

```text
MIST_REALTIME_REDIS_URL -> mist-realtime-redis -> mist-realtime-redis-data
```

realtime due/closed/watermark/manifest 以及 schedule operational status 使用该实例内互不重叠的
namespace。后续通知 change 若引入 BullMQ，必须另行部署：

```text
MIST_QUEUE_REDIS_URL -> mist-queue-redis -> mist-queue-redis-data
```

两者不得只靠 Redis logical DB 编号隔离，也不得共享 volume、`FLUSHDB`、maxmemory/eviction、
TTL cleanup 或 capacity budget。本 B1 不创建未使用的 queue Redis service/config。

### Redis capacity 与 AOF monitoring

容量验收同时观察最终 resident state 和写放大，禁止只用 closed Hash 最终大小推导磁盘需求。
shadow 至少采集：

- compact `closingSnapshot` 与完整 closed record 的 P50/P95/P99/max serialized bytes；
- subscribed security count、A/HK bucket count、当前日和 `dayEnd+72h` projected bytes；
- Redis `used_memory`、`used_memory_rss`、fragmentation、evicted/expired keys；
- AOF current/base bytes、每分钟 byte growth、rewrite in-progress/status/duration、rewrite peak；
- Redis volume used/free bytes、宿主磁盘 free bytes；
- application due/closed transaction rate，确认 snapshot rate 不会等比例变成 AOF full-record writes。

metric label 只使用 `source + market + recordType + outcome` 等低基数维度，symbol 不作为长期
label；超大 record/security 只进入脱敏、限长 structured log。

首版配置至少提供：

```text
REALTIME_CLOSED_RECORD_MAX_BYTES
REALTIME_CLOSING_SNAPSHOT_MAX_BYTES
REALTIME_MAX_SUBSCRIBED_SECURITIES
REALTIME_REDIS_MAX_MEMORY_BYTES
REALTIME_REDIS_MAX_AOF_BYTES
REALTIME_REDIS_MIN_DISK_FREE_BYTES
REALTIME_REDIS_CAPACITY_CALIBRATION_ID
```

warning threshold 用于 degraded/alert，hard threshold 阻止 `on` promotion 或新增订阅，但不得
停止 transport/latest。`on` 必须关联 accepted capacity evidence；evidence 记录真实 payload、
订阅规模、单日/72h 投影、AOF steady/rewrite peak 和磁盘余量。future subscription expansion
超过已验收 ceiling 时需要重新 calibration。

### Feature flag、health 与 mode

- `off`：不连接/写 Redis，保持 memory-only。
- `shadow`：运行 Node open aggregation、写 due/closed/watermark 和诊断，但查询不暴露 Redis。
- `on`：开放 Redis-backed current-day query。

非法值启动失败。TDX/QMT `builtin|off` 独立，productization mode 不改变 transport mode。
health 区分 transport ready、Redis ready、product queue、last write、due/overdue candle、
finalizer failure 和 capacity state。

### 部署和回滚

Redis 使用独立 persistent volume 和 AOF，先于 backend 启动，不公开 host port。backend image
包含 off/shadow/on 代码，首次发布保持 `off`。回滚只改 flag/镜像，不运行 migration、不删除
volume、不关闭 TDX/QMT builtin transport。

## Risks / Trade-offs

- [eventTime 乱序] → memory latest 按 transport acceptance 覆盖，candle 只接受允许顺序并记录。
- [Redis 故障] → transport 继续 memory-only；product health 明确失败，不伪造 candle。
- [Redis 断线缓存旧命令] → 关闭 offline queue、限制 request retry/timeout，旧命令不在恢复后
  自动回放。
- [due 登记失败导致 Node state 泄漏] → 独立本地 sweep 在 hard horizon 丢弃并释放 open state。
- [closingSnapshot 较大] → 只保存 compact canonical projection，并用 hard byte limit 拒绝。
- [backend restart 丢失 open candle] → due/watermark 识别丢失，丢弃 bucket、记录
  `backend_restart_open_state_lost`，从 closed totals 恢复后续 baseline。
- [AOF 写放大] → 每个 bucket 只登记一次 due并写一次 closed/seal，不把 snapshot rate 转成
  full-record AOF rate；监控 current/base bytes、growth、rewrite peak/failure 和 disk headroom。
- [固定 grace 过早] → shadow 按 source/session 校准；无 accepted evidence 不允许 `on`。
- [误启两个 writer] → config guard 拒绝多 replica，发布 stop-old/start-new。
- [无 baseline] → 丢弃当前 bucket，并以最后累计值建立下一 bucket baseline。
- [mutation 试图改变 effective source] → 在配置提交、subscription control 和 product state
  变化前以 `EFFECTIVE_SOURCE_CHANGE_UNSUPPORTED` 原子拒绝；不实现 runtime transition。
- [结构性异常] → 整根丢弃并监控，不保存看似正常的 K。
- [Redis 与 MySQL 当前日重叠] → query key 去重；权威历史替换由后续 change 负责。
- [未来策略尚未完成] → B1 独立封存/查询，不提前实现或模拟策略与通知。

## Migration Plan

1. 完成 OpenSpec、golden fixture 和隔离 Redis tests；确认 migration `006` byte-identical。
2. 部署 Redis、backend、monitoring，`REALTIME_PRODUCTIZATION_MODE=off`。
3. 切 `shadow`，以 TDX `600030.SH`、QMT `300502.SZ` 验证 snapshot/candle/restart/AOF，并完成
   至少 3 个完整交易日的 source/session lateness、record bytes、resident memory、AOF
   growth/rewrite peak、72h projection 和 protected digest。
4. 写入 accepted TDX/QMT grace 与 capacity calibration ID 后切 `on`，验证统一查询、compact
   `closingSnapshot`、restart discard、capacity monitoring 和 frontend。
5. 演练 flag/image rollback；保留 Redis volume，不改变 transport mode 或数据库。

## Open Questions

无。首版只支持 Redis 当日 1 分钟 market data；strategy signal/notification、高周期聚合和
收盘历史同步由后续 focused changes 处理。
