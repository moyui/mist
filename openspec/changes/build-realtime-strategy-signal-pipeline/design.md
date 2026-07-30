## Context

正式 realtime transport 已把 TDX/QMT schema-v2 native map 转换为 backend-owned
`CanonicalRealtimeSnapshot`，但 ingress 仍是 memory-only。现有策略平台提供 versioned
definition、单条 declarative rule、manual scan、Signal/AlertEvent transaction 和 signal-level
backtest；没有盘中 candle、可靠 handoff、共享实时窗口或 episode。

此前三个 active change 分别描述 B1 current-day market data、portfolio simulation 和 realtime
signals，却在实现草稿中共享并争夺 exact-decimal、paired rules、migration、K reader 与部署所有权。
本设计主动废止这条三-change依赖链：一个 change 对 realtime signal 闭环负责，并以内部 phase
gate 保持 market sealing、strategy evaluation 和未来 notification delivery 的故障边界。

当前约束：

- 单台 Windows API 机器、Docker Compose app stack、单个 `mist-backend` product writer；
- datasource/bridge、transport owner 和 schema-v2 wire 不在本 change 修改；
- schema-v1 `streamEpoch/sequence` 已退役，不得进入 canonical、candle、job、episode 或 signal；
- 完整 native snapshot 只保留在 bounded Node latest，Redis/queue/context 不复制完整 native；
- MySQL migration `001–013` 不可修改，TypeORM synchronize 保持关闭；
- `sync-post-close-provider-history` 仍无限期延期，盘中 Redis 不写回 MySQL `k`；
- stash 只作为代码参考，任何复用都必须按当前 spec 重审、重测，不能整体 apply。

## Goals / Non-Goals

**Goals:**

- 形成 `accepted snapshot → sealed 1m → durable wake-up → bounded in-memory evaluation →
  Signal/AlertEvent` 的可恢复闭环。
- 对 market writer、strategy worker 和未来 notifier 使用独立 mode、health、Redis 与回滚边界。
- 只用 canonical `securityId` 作为 Mist runtime identity；source/providerSymbol 仅作 provenance。
- 让量额及相关规则阈值全程保持 exact decimal string。
- 让多个策略共享同一内存窗口、周期构建、指标和 Chan Phase B projection。
- 以显式三态 episode 和数据库唯一键实现重启可识别、至少一次处理和逻辑幂等。
- 允许选择性重用 stash 中已经验证过的纯逻辑和 tests，同时重新满足本 change 的门禁。

**Non-Goals:**

- 不新增统一冷热 `MarketKQueryService`，不改 K API，不让前端合并实时/历史 K。
- 不在 worker 正常路径或冷启动时查询完整 MySQL K 历史。
- 不实现 portfolio cash、positions、orders、trades、fees、NAV、equity 或 benchmark simulation。
- 不写回 derived 5/15/30/60m candle，不持久化 Chan，不新增买卖点算法。
- 不发送 WeCom、微信或 AstrBot，不推进 delivery status，不实现 notification dead-letter。
- 不支持日线、tick、期货、期权、做空、自动 source failover 或多 backend writer。

## Decisions

### 1. 一个 change、三个内部发布门禁

本 change 统一 schema 和跨仓发布所有权，但实现必须顺序通过：

1. **Candle foundation gate**：exact-decimal、identity、Node aggregation、Redis seal/replay、
   capacity、TDX/QMT supported-session HIL；
2. **Shared strategy gate**：paired rules、migration、field catalog、validator/evaluator、
   prior context、前端编辑契约、真实 MySQL pre/postflight；
3. **Realtime evaluation gate**：queue handoff、worker/window/period/Chan、episode、transaction、
   shadow/on HIL。

后续 phase 可以复用前一 phase 的已提交代码，但前一 gate 未通过时不得启动、勾选或发布后一
phase。这样避免多个 active change 争夺同一 entity、migration 和 module，同时保留严格顺序。

备选是继续维护 B1、portfolio、connect 三个 change；由于 paired rule 和 exact decimal 横跨三者，
且完整 portfolio simulation 不是 realtime signal 的必要条件，因此拒绝。

### 2. Runtime identity 只使用 securityId

Node maps、keyed queues、Redis partition、due member、jobId、worker cursor 和 episode 均以
canonical `securityId` 为核心。建议 key：

```text
mist:realtime:v1:day:{YYYYMMDD}:security:{securityId}:candle:1m:closed
mist:realtime:v1:day:{YYYYMMDD}:security:{securityId}:candle:1m:watermark
mist:realtime:v1:day:{YYYYMMDD}:security:{securityId}:manifest
mist:realtime:v1:day:{YYYYMMDD}:candle:1m:due
```

closed value 保留 `source`、`providerSymbol` 和 precision provenance，但不保存 `securityCode`。
策略 registry 在加载 definition 时把 target code 唯一解析为 `securityId`；Signal 持久化需要
`securityCode` 时从 immutable registry/security row 取得，不能信任 queue payload。

effective source 在启用前固定；运行时不自动切源。source provenance 改变不得产生第二个逻辑
candle/signal identity。

### 3. Exact decimal 仅覆盖量额

`volume/amount` 使用与 `DECIMAL(36,8)` 相同的 canonical non-negative decimal string：

- TDX `Volume/Amount` 只接受 native string；数字形态 fail closed；
- QMT `volume` 接受 safe integer并规范化为 string；
- QMT `amount` 接受有限 provider float，把可观察值规范化为 string，并标记
  `provider-float`；超过 precision/scale 或需要舍入时 fail closed；
- baseline、delta、counter-reset、period sum 和 rule comparison 使用 fixed-point integer 或
  等价 exact arithmetic；
- missing/invalid 为 `null` 或 unknown，不补零。

OHLC、普通 indicator 和 Chan 数值继续使用经过有限数校验的 `number`。前端只在绘图 formatter
边界把 decimal string 转为显示 number；规则 JSON 永远保持 string。

### 4. Node open state 与 Redis sealed state

每个 `securityId` 的 accepted snapshot 和到期 finalizer 进入同一有界 Promise chain；不同
security 可并行。Node 只保留 latest snapshot 和相邻少量 open buckets。Redis 只保存 due、
sealed closed、watermark 和 manifest，不保存 full snapshot、latest snapshot、mutable open
record 或 strategy state。

source-specific grace 必须由 shadow lateness evidence 校准。到 cutoff 时：

- valid candle 以单个 Redis `MULTI/EXEC` 写 closed/watermark、移除 due、刷新 manifest/TTL；
- invalid candle 只推进 discarded watermark；
- due registration/Redis/finalizer 不确定失败不能产生 guessed candle；
- backend restart 丢失 Node open state时 discard，对已 sealed 数据可重放。

finalizer 不等待 BullMQ、worker、MySQL 或 notifier。handoff 仅在 closed commit 确认后执行。

### 5. 不建立通用 MarketKQueryService

realtime worker 按 `(securityId, period)` 维护共享硬上限 ring windows。正常路径每个 sealed 1m
只 append 一次，多策略共享 period、indicator 和 Chan context。

冷启动或 worker restart 时，replay loader 只读取 market Redis manifest 指向的 retained sealed
candles：

- 按 trading day/bucket 排序；
- 读取量不超过当前 registry 最大 window capacity；
- retention 最长为 day-end + 72h；
- 不查询 MySQL，不扫描无界 keyspace，不为每个策略重复读取；
- retained 数据不足、gap、discard 或 capacity mismatch 时，对受影响 context 返回 unknown。

进程持续运行时 ring window可以跨交易日保留；restart 后能否恢复跨日窗口取决于有限 Redis
retention。V1 接受“证据不足则暂不发信号”，不通过完整历史查询伪造 continuity。

### 6. Paired V1 和 migration 由本 change 拥有

未正式使用的 V1 从单 `rule` 直接迁移为：

```text
entryRule: required
exitRule: optional
lookbackBars: bounded integer
signalKind: entry | exit
```

下一条 migration（当前代码基线应为 `014`，实施前以真实 `schema_migrations` 为准）负责
`rule → entry_rule`、`exit_rule`、`lookback_bars`、`signal_kind` 和逻辑 candle dedupe index。
不增加 rule-schema enum、不双写 legacy `rule`、不自动把数字 decimal threshold 转字符串。

migration 必须具备：

- production schema/preflight 和存量 rule audit；
- protected-table counts/digests；
- ORM metadata、raw SQL 和 named unique conflict tests；
- postflight/readback；
- 旧镜像不兼容新 schema 时的整版本 rollback 说明。

完整 portfolio simulation 被移出范围；未来若重启，必须以新的 focused change 基于当前 paired
rule contract 设计。

### 7. Queue 是 wake-up reference

market Redis 与 queue Redis 物理隔离。job payload：

```json
{
  "contractVersion": 1,
  "tradingDay": "YYYYMMDD",
  "securityId": 123,
  "bucketStartMs": 1780000000000,
  "bucketEndMs": 1780000060000,
  "source": "tdx",
  "providerSymbol": "600030.SH",
  "closedRecordVersion": 1
}
```

jobId：

```text
rt-strategy-v1-{tradingDay}-{securityId}-{bucketStartMs}
```

payload 不含 `securityCode`、history、rule、native、epoch/sequence 或 notification data。
bounded handoff buffer异步 `Queue.add`；满载、timeout 或断连不回滚 candle。reconciler 使用
manifest 和 bounded cursor补投 deterministic job。

### 8. Worker、period 和 Chan 共享内存

同一 `securityId` 的 job 进入有界 ordered chain。job 是 target wake-up；worker 从内存 cursor
到 target 顺序处理所有 retained sealed 1m。cursor 仅在全部到期 context完成 shadow evaluation，
或 on transaction成功/精确 dedupe后推进。

period 支持 1/5/15/30/60 分钟，上午 09:30、下午 13:00 独立对齐，不跨午休。任一组成分钟缺失、
discarded、冲突或 session 非法使整个高周期 unknown；不 fill-forward。

Chan adapter 对排序 window 分配临时 ordinal，只输出现有 Phase B latest Fenxing/Bi/Channel 与
count、algorithm version和输入 fingerprint。ordinal 不进入 Redis/MySQL/context public identity。

### 9. Episode 显式三态

```text
EpisodeState = unknown | false | true
key = definitionId + versionId + securityId + period + signalKind
```

- unknown/false + true → candidate；
- true + true → suppress；
- complete false → false；
- incomplete、gap、missing decimal、context error → unknown；
- restart → unknown；
- day/version/disable/security removal执行有界 cleanup；
- capacity用尽 fail closed，不随机淘汰 active true。

episode 只在 shadow evaluation 完整成功，或 on commit/指定 dedupe conflict 后更新。数据库其他
错误交给 BullMQ retry。

### 10. Mode、部署与监控分层

```text
REALTIME_PRODUCTIZATION_MODE=off|shadow|on
REALTIME_STRATEGY_MODE=off|shadow|on
MIST_REALTIME_REDIS_URL=...
MIST_QUEUE_REDIS_URL=...
```

- strategy off 不连接 queue Redis；
- strategy shadow 要求 candle foundation shadow/on；
- strategy on 要求 candle foundation on 和 accepted HIL；
- notification 没有 flag，且不属于该 runtime。

两个 Redis 分别使用独立 service、volume、AOF、health、capacity budget 和 cleanup。strategy
health 可以因 queue/replay/window/episode/evaluation/persistence降级，但不得改变 transport 或
candle health。

## Risks / Trade-offs

- [无 MySQL warmup 导致重启后历史不足] → 有界重放 72h sealed candles；不足时明确 unknown，
  shadow evidence评估可接受窗口，不静默查询完整历史。
- [一个 change 规模仍较大] → 用三个不可跳过的内部 gate、分仓提交和独立 mode 控制；每个 gate
  必须有自己的自动化、HIL、rollback evidence。
- [migration 使旧镜像不兼容] → promotion 前核对 schema，匹配版本组部署；回滚使用兼容镜像/
  repair-forward方案，不宣称只回滚镜像。
- [provider float amount 已有精度损失] → 保存 observable decimal 与 `provider-float` provenance，
  不宣称恢复原始交易所小数。
- [Redis retention不足以恢复长 lookback] → context unknown并阻止 candidate；不扩大为无界 retention。
- [两个 Redis 不能原子提交] → market commit优先，deterministic reconciler补偿 enqueue。
- [stash 代码与新契约不一致] → 逐文件选择性移植；禁止恢复 MarketK、providerSymbol key、
  securityCode payload、boolean episode 和旧 task completion。

## Migration Plan

1. 记录六仓 branch/SHA/dirty/worktree、真实 migrations、生产 Compose、bridge artifact SHA 和
   protected-table baseline。
2. 实施 candle foundation，模式保持 off；完成自动化后以 shadow 收集双 source grace/capacity，
   通过 supported-session HIL、restart 和 rollback才允许 on。
3. 审计存量策略 rule，实施下一条 paired-rule migration、ORM/API/frontend同步和真实 MySQL
   pre/postflight；不启用 realtime strategy。
4. 部署 queue Redis 和 realtime worker，strategy保持 off；完成 replay/capacity/failure tests。
5. 切 strategy shadow，至少三个支持交易日验证无策略表写入、窗口/period/Chan/episode和重启。
6. 切 strategy on，验证 Signal/PENDING AlertEvent transaction、dedupe、protected-table changes。
7. rollback先把 strategy切 off，再按匹配版本回滚应用；保留两个 Redis volume和已提交 events。

## Open Questions

无产品语义待定项。实施时仍必须以只读 preflight 核实 production `schema_migrations`；若其并非
本地 `001–013` 集合，停止 migration 并 repair-forward。V1 realtime 只启用 A 股；72h retained
bars 不足最大 lookback 的策略标记 realtime-ineligible；`exitRule=null` 的策略只产生 entry
episode，不虚构 exit。
