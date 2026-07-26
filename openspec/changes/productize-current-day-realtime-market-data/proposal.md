## Why

TDX/QMT 正式 realtime transport 已完成生产 HIL，但 accepted snapshot 仍只保存在 backend
内存，K 线查询和前端无法消费可靠的当日实时数据。需要在不污染 MySQL 历史 K、不改变
datasource/bridge contract、也不提前绑定尚未正式接入的策略运行时的前提下，把 Redis 提升为
当日 market data 产品边界。

## What Changes

- 在 transport strict validation、allowlist 和 epoch/per-symbol sequence fence 之后，accepted
  canonical/native snapshot 继续只覆盖 backend 内存中按 canonical `securityId` 唯一定位的
  effective-source latest；不建立
  Redis snapshot/latest/timepoint 历史。
- 每个 accepted frame 只更新 Node.js 中有界的 per-bucket open candle；Redis 不保存 mutable
  candle recovery Hash，避免同一 field 的每帧覆盖被 AOF 全量记录。新 bucket 只登记一次 due，
  finalizer 写一次 closed/watermark；backend restart 时丢弃无法完整恢复的 open/due bucket，
  记录丢弃原因并从最近 closed cumulative totals 重建后续 baseline。Redis due 登记失败时由
  Node 本地 sweep 有界清理对应 open state，不等待 Redis 恢复补写 candle。
- closed candles 使用日级 Redis Hash，以 `bucketStartMs` 直接 `HSET` compact candle JSON；
  `closingSnapshot` 只包含 future consumer 必需的 compact canonical fields，不复制完整 native
  或 order book；不做内容 hash、GET compare、Stream 或 Redis→MySQL archive。
- 在 Redis 中维护 source/security 隔离的 due、closed candles、sealing watermark 和 manifest，
  不向 MySQL `k` 写入 realtime candle。
- 普通分钟的 finalization grace 不写死：`shadow` 分别测量 TDX/QMT accepted frame 相对
  bucket close 的延迟分布和候选 grace 漏帧率，形成 accepted evidence 后才允许为两个 source
  显式配置并切 `on`。
- 在 `Security` 初始化与 `SecuritySourceConfig` 新增、更新、删除边界确定唯一 effective
  realtime source：TDX/QMT provider code 必须归属同一个无后缀 canonical `Security.id`，enabled
  TDX/QMT source 中最高 `priority` 必须唯一。多个 source config 可继续用于历史同步，realtime
  订阅和所有产品内存结构只以 `securityId` 作为 runtime identity；`source` 与 `providerSymbol`
  是初始化映射/Redis 分区元数据。若 mutation 会改变或移除已初始化的 `(source, providerSymbol)`，
  必须以 `EFFECTIVE_SOURCE_CHANGE_UNSUPPORTED` 原子拒绝，不执行 unsubscribe/subscribe，
  不改变 latest/open/baseline；runtime source switch 留给未来独立 focused change。
- realtime OHLC 明确定义为 snapshot-sampled provisional data，不追求逐笔精确；检测到 invalid
  price/time/session、baseline unavailable/counter reset、queue overflow、epoch discontinuity 或
  Redis due/register/finalize failure 时整根 candle 丢弃，不写 closed/query，并以稳定 reason code 接入
  monitoring。
- 增加 `REALTIME_PRODUCTIZATION_MODE=off|shadow|on`；`shadow` 写 Redis 和聚合但不开放产品
  查询，`on` 开放当日查询。
- 建立唯一冷热 K 查询边界：非当日读 MySQL，当日读 Redis，跨日合并；自然日切换后不读取旧日
  Redis 分区。
- closed candle 内联保存形成该 K 线的 `closingSnapshot`，作为未来策略接入的不可变行情输入；
  本 change 不运行策略、不创建 Signal/AlertEvent、不写 BullMQ，也不让 candle sealing 等待业务
  消费者。
- 前端 K 线和 latest snapshot 只通过 Mist backend API 消费；监控增加 Redis/candle record
  bytes、订阅规模、resident memory、AOF bytes/write rate/rewrite、磁盘余量、72 小时容量投影、
  finalization、延迟和 product-path failure 指标。
- 不修改 datasource frame、terminal bridge、transport mode/owner/sequence contract、migration
  `006` 或其他 MySQL migration。
- 不实现 runtime TDX/QMT source switch、effective-source revision 或自动先退后订。
- 首版 realtime product writer 明确只支持单个 `mist-backend` 实例；同一 symbol 的 snapshot
  update 与 finalizer 使用同一个进程内 Promise queue，不引入 Lua、`WATCH/MULTI`、Redlock、
  distributed lock 或 worker thread。
- realtime Redis 使用独立 `MIST_REALTIME_REDIS_URL` 和 `mist-realtime-redis` service/volume；
  本 change 不部署 BullMQ。未来通知队列必须使用物理独立的 `MIST_QUEUE_REDIS_URL`、
  `mist-queue-redis` service/volume，不能与 market-data TTL、cleanup 或容量策略共用实例。

## Capabilities

### New Capabilities

- `current-day-realtime-market-data`: Node.js bounded latest/open candle、Redis 当日 closed
  candle/watermark、restart discard、TTL 和 productization mode 契约。
- `unified-market-k-query`: MySQL 历史与 Redis 当日数据的统一查询、跨日合并和去重契约。

### Modified Capabilities

- `realtime-market-data-ingress`: 将原 memory-only accepted ingress 扩展为 feature-gated market
  data sink，同时保持 transport store 与产品故障隔离。
- `backend-datasource-integration`: backend snapshot preservation boundary 不再无条件禁止 Redis/K
  聚合，但仍禁止 realtime candle 写入 MySQL。
- `frontend-live-kline-viewer`: K 线页面通过统一查询显示当日 candle/latest snapshot 和数据状态。
- `monitoring-health-alerts`: 落地 Redis product path、arrival lateness/grace、candle
  lag/failure、discard/recovery 和容量观测；未来可重构实现但不得遗漏观测契约。
- `windows-docker-appliance`: 部署持久化 Redis service、配置 productization flag，并支持无
  migration 回滚。

## Impact

- **`mist`**：新增 `ioredis` repository、key/schema、candle state/finalizer、统一 K 查询和 API。
- **`mist-deploy`**：新增 Redis service/volume、backend 配置、health、shadow/on 发布和回滚验证。
- **`mist-fe`**：扩展当日 K、latest snapshot 与 product status 展示。
- **`mist-monitoring`**：扩展 exporter/watchdog metrics、structured log、告警与
  source/product 状态分类。
- **`mist-datasource`**：只运行现有 frame contract 回归；预期无产品代码或 bridge 改动。
- **`mist-skills`**：不修改。
- **数据库**：不新增 migration；盘中 protected tables 必须保持 row count/digest 不变。

## Residual Work

- `connect-realtime-strategy-signals`：在策略规则、历史 context 和状态语义正式完成后，消费
  immutable closed candle；定义 `false/unknown -> true` 通知、持续为真抑制、稳定 eventKey、
  Signal/AlertEvent、Node→BullMQ primary、MySQL fallback 和 restart recovery。eventKey 继续使用
  canonical `securityId` 且不包含 source；相关纯函数按语义集中在 `libs/identity`，不得实现万能
  ID generator。
- `deliver-strategy-notifications`：实现 channel consumer、WeCom/AstrBot、delivery
  retry/dead-letter 和最终状态推进。
- 本 change 不预先创建上述 runtime state、queue、identity generator 或数据库副作用。
- 后续 BullMQ change 必须部署物理独立的 queue Redis；B1 只部署 market-data Redis，不预留
  未使用的 queue service、volume 或连接配置。
- 若未来需要改变已初始化的 effective realtime source，必须创建独立 focused change 定义
  维护窗口或 runtime transition；B1 不为该能力预留自动 subscription control。
