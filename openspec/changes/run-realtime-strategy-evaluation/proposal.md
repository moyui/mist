## Why

市场数据变化目前不能可靠唤醒策略计算，也没有把历史 K、当日 sealed K 和共享内存窗口组合成
有界策略 context 的内部边界。需要在 candle、分析内核和策略契约稳定后，以独立运行时交付
realtime evaluation。

## What Changes

- 定义轻量、版本化 `StrategyTrigger`；trigger 只负责唤醒，不携带完整 history、rule 或 native payload。
- V1 只交付 deterministic `sealed_bar` 触发；本 change 不定义 `snapshot_update` trigger kind、job、
  payload、producer 或 evaluator 入口。任何非 `sealed_bar` job 在 trigger contract 边界明确拒绝，
  不进入 window、episode 或 persistence；未来 snapshot evaluation 必须另建 focused change 从头定义。
- 复用统一内部 `StrategyMarketDataPort`：`loadRealtimeWindow()` 在冷启动或 registry refresh 使组内
  compiled `requiredBarCount` 扩大时
  合并历史 MySQL K、当日 Redis sealed K 和共享内存窗口；
  `resolveRealtimeObservation()` 在热路径解析单次变化；不新增公共通用 K API。
- hydration 只重放 current trigger 之前的当日 sealed 1m，current bar 由 observation capability 单独
  处理一次；5/15/30/60m 从这些 pre-anchor 1m 重建已结束的 derived bars，不能假设 Redis 保存高周期
  K，也不能读取 future K 污染当前 context。
- 正常路径只 append/update 变化数据；cold start 或 compiled demand 扩大按分组最大
  `requiredBarCount` 有界读取
  一次，禁止逐策略完整查库。
- V1 realtime window 固定使用 trigger 的精确 TDX/QMT source；MySQL warmup、Redis sealed K 和内存
  window 不跨 source 拼接、fallback 或按到达顺序选源。`StrategyDefinition.sources` 只作
  eligibility，不表达优先级；EF 不参与 realtime trigger。
- episode key 固定为
  `(definitionId, versionId, securityId, source, period, signalKind)`，使 TDX/QMT 两条计算链互不抑制
  或重置。bar `type` 是观察质量、timestamp 是 episode 内事件时间，二者都不进入 episode key；
  Signal persistence 使用包含结果时间的另一套 identity，不能复用 episode key。
- period 窗口封存前 completeness outcome 为内部 unknown，封存时一次性产生 complete/incomplete
  StrategyBar 或在零可用组成 K 时不产出；unknown 不进入 bar type，V1 不修订终态 derived bar。
- shared evaluation 使用两阶段 typed result：不能计算时返回
  `unavailable(insufficient_history|field_unavailable)`；能够计算时返回
  `evaluated(matched:boolean)`。episode 只保存 source-aware active key：inactive + matched 产生
  candidate，active + matched 抑制，evaluated non-match 清除，unavailable 不改变 membership。episode
  store 只服务一个 tradingDay：新交易日、进程重启或 mode 切换到 off 都清空 active set，下一次
  matched 可重新产生 candidate；同日重启后允许 at-least-once 重发，不从 MySQL/Redis 恢复 episode。
  shadow 在记录 candidate outcome 后 activate
  且零策略表写入；on 仅在 Signal + PENDING AlertEvent transaction commit，或精确命中既有
  `uq_strategy_alert_events_dedupe_key` 后 activate。rollback、未知 constraint 或其他数据库错误不 activate 并传播到
  worker 边界；`emit` 不表示外部通知已经发送。
- V1 live persistence identity 固定为
  `(definitionId, versionId, securityId, source, period, signalKind, signalTime)`，并按
  `live-v1:{definitionId}:{versionId}:{securityId}:{source}:{period}:{signalKind}:{signalTimeEpochMs}`
  生成 `StrategyAlertEvent.dedupeKey`。`signalTime` 是实际产生结果的 canonical StrategyBar timestamp：
  1m 使用 sealed 1m timestamp，5/15/30/60m 使用 derived K 的理论 `bucketStartMs`，不得改用唤醒它的
  最后一根 1m `triggerTime`。
- persistence identity 不加入 jobId、trigger price、context/rule JSON、bar type、tradingDay、createdAt
  或 registry generation。它只阻止同一个 live result 被重复持久化，不承担 episode 连续抑制，也不
  阻止另一根 K、另一交易日或另一个 BacktestRun 产生结果。
- on 模式不先查询 `dedupeKey`；直接在短事务中依次插入 Signal 与 PENDING AlertEvent，以既有 named
  unique 作为唯一并发裁决。只有 MySQL duplicate code 与精确 constraint name 同时匹配时才把整个
  rollback 分类为 `duplicate_skipped`；其他 unique、FK、NULL、类型、连接或未知数据库错误原样传播。
- `StrategySignal.securityId`、`signalKind` 及移除 live Signal `securityCode` 的目标 schema 由前置
  `evolve-strategy-evaluation-contract` 持有；本 change 复用既有 AlertEvent dedupe unique，不新增
  migration 或第二组 Signal composite unique。实际 DDL、迁移编号和存量数据处置仍须先通过真实
  `schema_migrations`/production data preflight。
- active episode 数量始终是当前 listener 与 compiled eligible execution-plan key universe 的子集；
  registry/listener cutover 删除不可达 key，不增加固定 capacity env、TTL、episode Redis/数据库
  persistence、cooldown 或定时清理器。
- canonical `StrategyBar` 保留单一 `timestamp`：historical 使用 provider native bar time
  写入的 `K.timestamp`，realtime 使用 provider native snapshot `eventTime` 生成的
  `bucketStartMs`。不预设二者存在偏移，不增加未经证明的 interval 字段或 source-specific offset；
  TDX/QMT 的 1/5/15/30/60 分钟 native 标签矩阵通过 HIL 前禁止 realtime `on`。
- canonical `StrategyBar` 必填 `type='complete'|'incomplete'`。historical MySQL K 与有效 sealed 1m
  映射为 `complete`；由 sealed 1m 合成的 5/15/30/60m 在缺少任一组成分钟时仍生成同形
  `incomplete` bar，只要该周期至少存在一根可用组成 K。两种 type 进入同一 window、Indicator
  和 evaluator，不因 incomplete 自动返回 unavailable；规则可通过枚举字段 `k.type` 显式筛选。V1
  realtime strategy 不计算或暴露 `chan.*`，Chan kernel 抽取只服务现有 API 与后续独立接入 change。
- canonical `StrategyBar.volume/amount` 固定使用股/人民币元，不随 TDX/QMT source 改变。Redis sealed
  K 已由 candle owner 完成实时单位归一；MySQL historical K 保持 source-native 存量值，由共享
  market-data reader 在构造 `StrategyBar` 前按已批准 source profile 精确换算。本 change 不迁移或
  回填 MySQL `k`，也不增加 per-bar unit 字段；quantity profile HIL 未通过时量额 execution plan
  realtime-ineligible。
- period builder 是固定 session 时间窗口的归约器；derived bar 的 canonical `timestamp` 固定为该
  理论周期槽的 `bucketStartMs`，不得因开头分钟缺失而改用第一根实际组成 K 的 timestamp。
- derived OHLC 只使用窗口内实际存在的组成 1m：open/close 分别取最早/最后实际 K，high/low 取
  实际 K 极值；缺失位置不得补零、复制前值或虚构价格。
- derived `volume/amount` 分别精确累加实际存在组成 K 的规范十进制字符串；明确的 `"0"` 按零，
  整根缺失不补零且由 incomplete type 表示部分覆盖，实际组成 K 中任一对应字段为 `null` 时 derived
  字段也为 `null`。period aggregation 不得复制其他 K 的区间量额；它封存 raw derived
  `StrategyBar` 后，共享 `QuantityForwardFillProjector` 才可在同 `(securityId, source, period,
  tradingDay)` 内为 evaluation context 向前填充量额。
- V1 不为 derived bar 增加 observed/expected count 或 precision provenance 字段；coverage 使用既有
  `type`，固定股/元单位来自 field contract，provider precision 使用既有 `source` 及其固定 adapter
  contract。raw bar 保留 null，evaluation 使用 projector 的 effective value；live Signal 使用前置策略
  契约的共享 contextSnapshot serializer：`k.volume/k.amount` 保存 effective scalar，compiled plan 实际
  需要的 current/prior quantity observation 另存 `raw/effective/resolution`，resolution 仅为
  `observed|forwardFilled`。unavailable 不产生 Signal 或 snapshot，本 change 不自定第二套 shape。
- realtime window 按 trigger 的上海时区交易日互斥切分：MySQL 只读取此前交易日 historical K，
  Redis 只读取触发当日且早于 trigger 的 sealed 1m K；旧日 Redis 不补历史，MySQL 当日数据不参与该次 realtime
  window，内存不作为第三份权威数据。
- 第一条新 tradingDay 的有效 `sealed_bar` 在 evaluation 前整体清空旧日 raw/derived window、
  Indicator context、quantity projector 前值、last-accepted trigger cursors 和日内 episode active set，
  再按 MySQL 历史与当日 Redis K 有界 hydration；
  Redis prior-day market state 已由 candle owner 在上海 D+1 00:00 到期。
- realtime window 不预设独立的固定 bar-capacity 配置。只为实际监听且存在 eligible strategy 的
  `(securityId, source, period)` 创建共享窗口，长度取该组规则/指标内部推导出的最大上下文
  需求；所有 K 按序处理后才允许淘汰已不再需要的旧 K，最后一个 consumer 移除时释放整组窗口。
  V1 不增加 aggregate memory budget 或数值 cap。shadow 必须按 listener/group/bar/heap/GC 实测；
  group 稳定后 heap/bar 不得持续无界增长，consumer removal 与 trading-day rollover 必须释放旧
  raw/derived/Indicator/quantity-projector/episode state。证据不足、持续增长、未释放或进程重启均阻止切 `on`；
  若实测需要限额，再创建独立 capacity change。
- MySQL/Redis reader 的错误分类、传播、timeout 和日志直接继承
  `docs/backend-error-handling-governance-guide.md`：低层不包装、不重试、不 fallback；基础设施异常
  抛到 worker 边界，查询成功但数据不足另按 realtime warmup 语义处理，不把二者混成依赖异常。
- realtime warmup 成功但 K 数量不足时，readiness 按各 execution plan 的实际 context demand 判断：
  已满足需求的策略继续计算，只有证据不足的策略返回
  `unavailable(insufficient_history)`；该结果不触发
  MySQL 重查或跨源补齐，后续 sealed K 增量积累到足量后自然恢复。
- realtime 1m K 缺失只表示该分钟 bar 不存在：不按理论时间槽补造 1m K，也不因 timestamp 跳跃
  产生 unavailable。固定高周期边界可以从实际存在的组成 1m 生成 `incomplete` derived bar，但不得把
  缺失分钟复制、补零或伪造成组成 K。
  同一 `(securityId, source, period, timestamp)` 的 canonical 内容完全相同时按幂等重复忽略；内容
  不同时保留已接受版本并将后来版本作为数据契约冲突抛到 worker 边界。
- upstream discarded outcome 不生成该 1m 的 `StrategyBar`，也不运行该 1m evaluator；它在所属
  高周期内等价于一个缺失组成分钟，并按 derived incomplete 规则处理。合法 K 的 nullable
  `volume/amount` 必须连同 raw `null` 原样保留并计入窗口。evaluation 前使用共享 projector 按同交易日
  向前填充；只有当日尚无对应前值时才返回 field-level unavailable。projector 不读取更晚的 future
  bar、不跨日继承。非法 canonical K 或
  analysis/evaluator 异常按错误治理抛到 worker 边界。
- V1 unavailable reason 只允许 `insufficient_history | field_unavailable`；unavailable 不生成
  Signal/AlertEvent 或策略业务记录，metrics 只按 bounded reason 聚合，具体字段和 bar count 进入
  有界 diagnostics。
- sealed-bar realtime trigger 使用 NestJS 的 BullMQ integration，由 `@nestjs/bullmq`/`bullmq`
  接入现有单机 `MIST_REALTIME_REDIS_URL`、Redis service/volume 和 AOF；不新增
  `MIST_QUEUE_REDIS_URL`、第二个 Redis service、第二个 volume 或独立 logical DB。market state 固定
  使用 `mist:realtime:v1` namespace，BullMQ 固定使用 `mist-bullmq` prefix；不得把 ioredis
  `keyPrefix` 用作 BullMQ prefix。
- `apps/mist` market writer、`apps/mist` BullMQ producer、`apps/signal` market reader 和
  `apps/signal` BullMQ worker 是四个独立 connection owner，不共享同一个 ioredis client object；
  BullMQ 为 Worker 创建的内部连接数量不作为业务 contract 固定。strategy mode 为 `off` 时不创建
  producer、worker 或 Signal market reader；candle Redis 是否启动仍只由
  `REALTIME_PRODUCTIZATION_MODE` 决定。
- market adapter 与 BullMQ producer 连接/命令失败时 fail fast，不启用 offline replay；Worker 可以使用
  BullMQ 标准 Redis reconnect，但 job 仍保持 `attempts=1`、无业务 retry。market expiry/cleanup 只能
  删除 owner 的精确 keys，不得使用 `FLUSHDB`、跨 namespace wildcard delete 或触碰 BullMQ keys。
  queue 写失败不得回滚已封存 candle，共用 Redis 的物理故障会同时影响 market 与 strategy queue。
  不使用 Nest Redis Pub/Sub transporter 或 TCP event；Signal TCP request-response 只承载
  `signal.registry.refresh.v1` 等已批准控制面 command，不提供人工策略执行入口。
- V1 BullMQ job name 固定为 `sealed_bar`，payload 只传
  `contractVersion=1`、`securityId`、精确 `source`、`period='1m'`、RFC3339 `triggerTime` 和有限
  `triggerPrice`。`triggerTime` 是该 sealed K 的 canonical timestamp，`triggerPrice` 是其 close；
  不传完整 K、history、rule、native payload、`securityCode`、`providerSymbol` 或重复的
  `tradingDay`。worker 按该身份只解析一根 Redis sealed K 并追加共享窗口，外部通知消费后续持久化
  Signal/AlertEvent，而不读取内部 queue 或 market Redis。
- candle commit 后只尝试入队一次，失败不得回滚 candle，也不在热路径循环重试。启用 realtime
  strategy 的 `apps/mist` 每次启动只对当前上海交易日 valid closed candles 做一次有界补投；
  completed/failed job 保留到当日补偿窗口结束，以确定性 jobId 降低重复。补偿失败后不自动重跑，
  不扫描前序交易日，也不新增持续 reconciler、handoff marker 或 outbox；该机制明确是
  best-effort，不承诺 candle/queue 完全一致、exactly-once 或跨日补发。
- V1 不新增 queue backlog 上限、Redis `maxmemory` 数值上限/用途配额、producer admission check、
  rate limit、`addBulk` 或 batch job；部署必须验证 `maxmemory-policy=noeviction`。realtime 与 startup
  compensation 都保持一根 sealed K 一个独立 job，允许 BullMQ waiting 自然积压。分别观测 market
  key/record 数、queue waiting/active/completed/failed、Redis used memory、AOF 和 drain throughput；
  若实际监听规模或 worker outage 证明积压成为问题，先切 strategy `off`，再以独立 change 设计容量、
  batch 或物理拆分，不在本 change 预设复杂度。
- worker 消费 waiting job 时按 `triggerTime` 的上海日历日检查时效：与当前上海日历日相同则继续，
  已跨日则以 queue outcome `expired_trading_day` 正常结束，不读取 Redis K、不运行 evaluator，也不
  写 Signal/AlertEvent。跨日过期不是 strategy evaluation `unavailable`，同日盘后延迟仍允许处理。
- startup compensation 按 canonical trigger time 稳定提交；若同一 `(securityId,source)` 的较旧 job
  在较新 trigger 已接受进入共享 state 后才到达，则以 `out_of_order_trigger_discarded` 正常完成，禁止
  倒序修改 window/projector/episode 或补发旧信号。
- V1 job 明确使用 `attempts=1`、无 backoff，worker 使用 `maxStalledCount=0`：processor 抛出的
  Redis/MySQL/analysis/persistence 异常直接使 job failed，worker crash 或 lock loss 导致的首次
  stalled 也直接 failed。failed job 当日保留且 startup compensation 不自动 retry；不增加
  dead-letter、manual retry API 或 repair loop。正常停止沿用 Nest/BullMQ 标准生命周期关闭 worker，
  不新增 Signal 专属 shutdown 状态机或配置。
- `sealed_bar` 使用 shared config 管理的单一整轮 deadline。每个可阻塞 I/O 使用 client 或
  MySQL 服务端真实支持的 connection/command/query/lock-wait timeout，processor 在阶段边界检查
  剩余预算；禁止以无法取消底层 TypeORM 查询的 `Promise.race` 伪造取消。deadline/timeout 直接使
  当前 job failed，不重试、不转为 evaluation `unavailable`，也不启动后续持久化阶段。预算固定为
  job 30 秒、Redis connect 5 秒/command 3 秒、MySQL connect 5 秒、historical SELECT 5 秒和
  InnoDB lock wait 3 秒；只有 job deadline 使用 `REALTIME_STRATEGY_JOB_TIMEOUT_MS=30000`，
  不为每个 adapter 增加策略专属 env。
- BullMQ 命名固定为 prefix `mist-bullmq`、queue `strategy-trigger`、job `sealed_bar`，全部是代码
  contract constant，不新增环境变量。completed 与 failed 使用 `removeOnComplete/removeOnFail`
  `age=86400` 秒且不设 count；惰性清理可多保留但不得早于同日补偿窗口。waiting/active 不套用该
  retention，跨日 waiting 仍由 worker 以 `expired_trading_day` 消费完成。
- 在同仓独立 `apps/signal` 中使用一个 Hybrid Nest application，同时承载内部 HTTP
  health/diagnostics、TCP registry-refresh RPC 和 BullMQ worker，并共享同一 registry、window、
  Indicator、quantity projection 和 episode context；不拆成多个内存 state owner，不向 web gateway 暴露公共
  signal route。Compose service 固定为 `signal`、container name 为 `mist-signal`，复用
  `MIST_IMAGE:MIST_IMAGE_TAG` 并执行 `node dist/apps/signal/main.js`；内部 HTTP 使用 `PORT=8010`，
  registry-refresh TCP 使用 `SIGNAL_RPC_PORT=9010`，均不发布 Windows host port。`apps/mist` 通过
  `SIGNAL_RPC_HOST=signal`、`SIGNAL_RPC_PORT=9010` 连接；不创建独立 Signal image/repository；
  MySQL 复用 Nest `TypeOrmModule.forRootAsync()` 初始化，不新增 connect manager 或
  `mysqlReady`；bootstrap 成功后才监听，失败直接停在启动边界。Signal 采用 datasource 风格的内部
  raw `GET /health`，不使用业务 `ApiResponseDto`、`/app/hello` alias、`/live` 或 `/ready`。根
  `status='ok'` 只表达进程可响应；`registry`、`marketData`、`queue`、`evaluation` 子对象分别表达
  scoped readiness/state、进程内 aggregate count、最后时间/outcome 和安全 bounded failure code。
  health handler 只读取既有进程状态，不查询 MySQL、Redis job depth、used memory 或 AOF；这些依赖和
  容量数据继续由 monitoring 单独采集。默认 `off` 是正常关闭 realtime reader/worker/evaluation，
  不是服务故障；先 shadow，经 HIL 后才允许 on。
- Windows appliance 启动顺序固定为 datasource containers → MySQL healthy → realtime Redis healthy →
  backup/migration success → 同批启动 `signal`、`mist-backend`、`chan-api`、`mist-fe` → recreate
  `web-gateway` → monitoring/Prometheus/Grafana → 最终 health/diagnostics。`signal` 只依赖 MySQL/Redis
  healthy，不依赖 datasource/backend/gateway/monitoring；backend 也不依赖 Signal，允许 producer 先于
  Worker 入队。Signal 启动失败不得阻断 market ingestion 或 candle sealing，但最终部署验收必须因
  Signal health 失败而失败。gateway 不发布 Signal，monitoring 也不得以 Signal healthy 作为自身启动
  前置；Signal 使用 `restart: unless-stopped`。
- `apps/signal` 启动时一次读取全部 enabled definition/current version，构建进程内 immutable registry
  generation。策略定义内容 creation-only；后续 enable/disable commit 后，`apps/mist` 只发送
  `signal.registry.refresh.v1 {strategyDefinitionId}`；Signal 只回读该 definition aggregate，以
  copy-on-write 构建并原子替换 registry，不周期轮询、不逐 trigger 查询完整策略表。in-flight operation
  使用开始时捕获的旧 generation，后续 operation 使用新 generation；generation 仅为进程内诊断整数，
  重启从 1 开始，不持久化、不参与幂等。
- refresh 查询、验证或 RPC 失败时保留旧 registry，不发布半成品、不自动 retry；数据库已经 commit
  但 runtime refresh 未确认时，公共 mutation 返回 technical failure 与 typed committed/unknown
  evidence。Signal 重启时的全量初始加载是唯一自动收敛点，不增加 outbox、定时补偿或 registry
  polling。
- V1 `sealed_bar` BullMQ worker 固定 `concurrency=1`，不新增并发配置、per-symbol keyed queue 或
  worker thread pool。一个 job 内的 eligible execution plan 按 `definitionId`、`versionId`、周期分钟数
  升序执行；queue delivery order 不替代 canonical K timestamp 的排序、重复和冲突语义。
- 删除 legacy `POST /v1/strategy-scans/run` 及其 controller/service/DTO/types/registration/tests；不把
  它迁移为 Signal RPC、BullMQ job 或第二套 run lifecycle。相应删除 `signal.scan.run.v1`、manual
  summary/error contract、`STRATEGY_SCAN_COMMAND_TIMEOUT_MS`、admission slot、busy/timeout mapping、
  gateway headroom 和 manual-scan monitoring。
- 人工执行策略只通过 `POST /v1/strategy-backtests` 创建 `BacktestRun` 并由 `apps/backtest` 写
  `BacktestSignalResult`，不得产生 live Signal/AlertEvent。`mist-fe` 对 legacy manual-scan action、
  client/types/tests 的删除由独立 frontend 项目持有，必须与 backend route removal 作为 breaking
  contract 一起验收。
- on 模式在一个事务中写入 Signal 和 PENDING AlertEvent；notification delivery 不属于本 change。
- queue、history seam、window、episode、幂等、mode、部署和 HIL 的每项细节在实施
  前逐项评审并记录。

## Capabilities

### New Capabilities

- `strategy-market-context`: 定义统一内部 market-data capability、历史/实时 K 合并、共享窗口、
  缺失容忍和重复冲突语义。
- `realtime-strategy-evaluation`: 定义 trigger、worker、episode、shadow/on 和 Signal/AlertEvent 交接。

### Modified Capabilities

- `strategy-definition-registry`: 增加 strategy commit 后的版本化 Signal registry refresh、immutable
  generation cutover 和失败可见性。
- `strategy-signal-alerts`: 将 live Signal owner 收敛为 realtime trigger，移除 legacy manual scan，
  并增加 realtime candidate、episode、事务与逻辑幂等语义。
- `strategy-operator-ux`: 删除 manual live-scan action，把人工执行统一到 backtest workflow。
- `windows-docker-appliance`: 增加经评审确认的 `signal` service 和可靠 trigger 基础设施。
- `monitoring-health-alerts`: 增加 trigger、context、window、evaluation、episode 和 persistence 观测。

## Impact

- **前置依赖**：`standardize-service-boundary-contracts`、
  `complete-current-day-realtime-candles`、`extract-market-analysis-kernels` 和
  `evolve-strategy-evaluation-contract` 必须先通过各自验收门禁。
- **`mist`**：internal context port、NestJS BullMQ queue adapter、`apps/signal`、
  registry/window/evaluation、legacy strategy-scan route removal、realtime job deadline config 和 tests。
- **`mist-fe`**：独立 frontend 项目删除 manual-scan client/type/button/tests；本 change 不直接修改其
  源码，但 backend route 不得在 consumer 未同步时单独发布。
- **`mist-deploy` / `mist-monitoring`**：独立运行时、配置、health、metrics 和 HIL；V1 不新增
  Signal 专属 rollback 流程或自动化，既有 appliance 通用回滚保持原样。
- **数据库**：只消费已确认的 strategy schema，不在本 change 争夺 migration 所有权。
- **不包含**：WeCom、微信、AstrBot delivery、portfolio simulation、公共 K API、Chan persistence
  或任何人工 live-scan 替代入口。
