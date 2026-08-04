## Context

realtime candle 与 Strategy-owned Indicator/evaluation contract 分别由前置 changes 提供。该 change 只负责
把市场变化可靠地转换成有界 evaluation，并把候选持久化为 Signal/PENDING AlertEvent。当前一体化
design 的“只重放 72h Redis、绝不读 MySQL”会让较长 lookback 在重启后长期不可用，因此改为内部
有界历史/实时 context port。

## Goals / Non-Goals

**Goals:**

- 以 push trigger 唤醒、bounded pull context 取数。
- 正常路径增量更新，多策略共享 window/indicator/quantity projection。
- 用独立 `apps/signal`、shadow/on、episode 和数据库幂等交付可恢复 realtime evaluation。
- 让 strategy registry refresh 复用 shared RPC boundary；不为 Signal 增加人工执行接口。

**Non-Goals:**

- 不提供公共冷热 K API，不逐策略查询完整历史。
- 不发送通知、不推进 delivery status。
- 不在本 change 修改 strategy schema 或 analysis algorithm。
- V1 contract 不包含 snapshot strategy、`snapshot_update` trigger 或 provisional observation。

## Decisions

### 0. 开发门禁与 `on` promotion 门禁分离

前置 candle change 的自动化、严格 contract、真实 snapshot fixture 离线回放和 shadow 基础足以支持
本 change 开发 trigger、worker、window、period builder、evaluator、episode 及事务代码，并允许以
`off|shadow` 部署和验证。该授权不等于 candle 交易时段 HIL 或 realtime strategy 生产验收完成。

以下证据继续只作为 `on` promotion 的硬门禁：前置 candle change 的真实交易时段 HIL、本 change
任务 6.4 的 TDX/QMT timestamp/quantity seam 与 restart/capacity shadow 证据，以及任务 6.5 的项目
负责人审核和 on-mode transaction/episode/idempotency HIL。任一证据缺失时仍可继续离线自动化和
shadow 开发，但运行模式不得切换为 `on`，文档也不得宣称生产闭环。

### 1. Trigger 与计算数据分离

`StrategyTrigger` 是版本化 wake-up reference，只标识目标市场状态。完整 history、rule、native
snapshot 和 notification payload 不进入 queue。

### 2. V1 先使用 candle-finalization trigger

market candle 的 `sealed|discarded` 终态提供确定性输入。V1 trigger union、BullMQ job name 和 worker
registration 只接受 `candle_finalized`；任何其他 job name 或 trigger kind 必须在 contract validation
boundary 失败，不得进入 window、period builder、episode、Signal 或 AlertEvent。当前最新 snapshot
继续由 market ingress 的 bounded Node memory 持有，不成为 Signal 输入。

### 3. 内部 StrategyMarketDataPort 同时表达 replay 与 realtime capability

前置 `evolve-strategy-evaluation-contract` 在共享 strategy domain library 单一持有 canonical
`StrategyBar`、`StrategyMarketDataPort` 及 criteria/result types。port 同时定义
`readReplayPage()`、`loadRealtimeWindow()` 和 `resolveRealtimeObservation()`；这些是进程内
domain/application 能力，不是 HTTP、OpenAPI 或 RPC 接口。HTTP query string 使用 `*QueryDto`，
内部只读选择条件使用 `*Criteria`，内部结果使用 `*Page`、`*Window`、`*Observation`。

`extract-backtest-runtime` 可在相同公共前置验收后独立实现 MySQL replay adapter；它不是本 change 的
前置。本 change 不重定义公共 types，也不实现 replay method，只实现和装配 realtime adapters：

- `loadRealtimeWindow(StrategyRealtimeWindowCriteria)` 在 cold start 或 registry refresh 提高组内
  compiled `requiredBarCount` 时组合
  MySQL historical K、Redis current-day sealed 1m K，并以
  `(securityId, source, period)` 分组按最大 compiled `requiredBarCount` 有界读取一次；
- `resolveRealtimeObservation(StrategyTrigger)` 在热路径解析单次 `candle_finalized` reference：sealed
  返回当前 canonical 1m bar，discarded 返回无 1m bar 的终态 outcome；
- warmup 完成后使用 signal-owned shared ring window，不逐策略或每 trigger 重载历史；
- hydration 只能读取 `timestamp < anchorAt` 的当日 sealed 1m；anchor 对应的当前 bar 必须随后由
  `resolveRealtimeObservation()` 解析并处理一次，禁止 hydration 提前读取 current/future bar；
- 对 1m group 直接重放这些 1m；对 5/15/30/60m group 必须从相同 pre-anchor 1m 顺序重建已经到达
  固定边界的 derived bars，再以 derived period 自己的 raw bar/window/projector state 继续；
- 任一 eligible plan 消费 `k.volume/k.amount` 时，cold start、进程重启或 registry refresh 必须按时间
  顺序重放上述 pre-anchor 当日序列，以重建 `QuantityForwardFillProjector`。该 day-start replay 只是
  missing-policy seed，不改写 plan `requiredBarCount`，不读取 prior-day Redis/MySQL quantity 作为 seed；
- `apps/signal` 装配 MySQL/Redis/memory capability；`apps/backtest` 不因共享 contract 依赖 Redis，
  `apps/signal` 也不导入 Backtest application source。

`StrategyRealtimeWindowCriteria` 至少表达 `securityId`、精确 `source: 'tdx' | 'qmt'`、`period`、
`anchorAt` 和 `requiredBars`；不携带 strategy rule、完整 target universe、HTTP DTO 或 TypeORM
relation。source 直接来自已接受 trigger，不存在 `StrategySourcePolicy`、source priority 或
arrival-order selection。

MySQL warmup、Redis sealed K 和内存窗口必须使用同一 source。TDX 不得以 QMT 历史补齐，QMT 也
不得以 TDX 历史补齐；同源数据不足只影响未满足自身 demand 的 execution plan，timestamp 跳跃
不构成 gap，重复冲突按本 change 的数据契约失败边界处理。当前
realtime allowlist 已禁止同一 `securityId` 同时由 TDX 与 QMT 订阅，双 source readiness 表示两个
source runtime 均可服务各自 allowlist，不表示同一证券双源合并。

`StrategyDefinition.sources` 只声明允许的来源集合：trigger source 不在集合内时该策略不 eligible；
集合顺序不表示优先级。EF 可继续用于 historical backtest，但没有 realtime trigger，
仅配置 EF 的策略不具备 realtime eligibility。source 是 market-context continuity、episode identity
和 Signal persistence identity 的组成部分。

#### 3.1 Timestamp seam 保留 native 语义并由 HIL 固定

历史与实时都源自 provider native 数据，但不是同一个 native 产品：

- TDX historical 读取 `get_market_data` 的 bar 时间索引，datasource 只补充上海时区，backend
  解析后原样写入 `K.timestamp`；
- QMT historical 读取 `get_market_data_ex(..., subscribe=false)` 的
  `stime → time → row key`，backend 解析后写入 `K.timestamp`；
- TDX/QMT realtime 从 native snapshot 的 business time 生成 canonical `eventTime`，再截断到
  分钟形成 `bucketStartMs`。

因此不能从单元测试中的 `09:31` fixture 推断 historical bar 一定使用 end label，也不能仅因两条
路径都源自 native 就假定所有 provider/period 已使用相同标签。V1 采用以下最小边界：

- canonical `StrategyBar` 继续只有一个 `timestamp`，不新增
  `intervalStart/intervalEnd/sourceTimestamp`；
- MySQL bar 的 `timestamp` 取既有 `K.timestamp`，Redis sealed bar 的 `timestamp` 取
  `new Date(bucketStartMs)`；
- 候选直接身份为 `(securityId, source, period, timestamp)`；
- 不修改数据库 historical timestamp，不增加未经证明的 source-specific offset adapter；
- TDX/QMT 必须分别记录 1/5/15/30/60 分钟上午/下午首尾 native historical 标签，并与 realtime
  bucket/derived-bar 标签对照；
- 标签矩阵未通过支持交易时段 HIL 前，runtime 最多进入 shadow，禁止切换 `on`；
- 若 HIL 证明任一 source/period 使用不同 start/end label，实施必须暂停并回到 design/spec
  明确规范化规则，不能在 reader 中静默平移时间。

historical MySQL 与 current-day Redis 的 OHLC 在存储表达上可以不同，但构造 canonical
`StrategyBar` 时必须经过前置共享 Strategy library 的同一个纯函数 `KPriceProjector`：mysql2
`DECIMAL(20,2)` fixed-scale string 被严格投影为 finite number；Redis sealed K
的 number 通过同一 finite/runtime-price validation 后原值保留。projector 不改 MySQL 精度、不改变
Redis sealed shape、不舍入或回写存储，也不处理量额。window、Indicator、evaluator 和 Chan wrapper
不得看到 MySQL price string 或实现第二套 `Number(...)`。

MySQL `DECIMAL(36,8)` readback 可能由 driver 表达为固定 scale string。historical reader 必须在构造
canonical `StrategyBar` 前通过 candle foundation 的共享 decimal boundary 一次性把
`"1.00000000"` 规范化为 `"1"`；Redis sealed bar 已经必须是 canonical。该 adapter seam 不允许
evaluator/window 同时接受多种等价值，也不允许把 database string 转为 number。

#### 3.1.1 Quantity seam 固定为股与人民币元

同一 realtime window 的 historical MySQL K 与 current-day Redis K 必须在进入 window 前使用相同
领域单位：`StrategyBar.volume=股`、`StrategyBar.amount=人民币元`。source 继续参加 identity 和
provenance，但不改变 rule threshold 的单位含义。

- current-day Redis sealed K 已由 `complete-current-day-realtime-candles` 的 provider adapter 按固定
  profile 转为股/元，Signal reader 只校验 canonical string/null，不重复缩放；
- MySQL `k` 继续保存既有 source-specific historical 值，不在本 change 迁移、回填或就地重解释；
  historical reader 复用 `extract-backtest-runtime` 持有的同一 persistence mapper，在构造
  `StrategyBar` 时规范化 fixed-scale string 并精确换算；
- TDX A 股 historical volume 按 provider 最小单位作为股保留，amount 从万元精确乘 `10000`；QMT
  historical profile 必须用官方契约、真实 fixture 和同源 close HIL 固定后才能启用量额 execution
  plan；任何换算只使用共享 Decimal8 的 `×100/×10000` 整数缩放并执行范围检查；
- runtime 不根据 `amount/volume`、价格或数值范围动态猜测单位，不把 source-specific factor 放入
  strategy rule，也不为 `StrategyBar` 增加 `volumeUnit/amountUnit/amountPrecision`；
- 未通过 unit profile HIL、非 A 股 `SecurityType.STOCK` 或 INDEX 的 `k.volume/k.amount` execution
  plan 必须在 registration 时 ineligible；不读取量额的 price/Indicator plan 可按自身门禁继续。

quantity HIL 与 timestamp-label HIL 同为 `on` 的前置，但证据必须分开记录。每个 TDX/QMT profile
固定 terminal/bridge identity，连续捕获 snapshot，并用换算后的 `amountDelta/volumeDelta` 对照同期
price range；收盘后再比较同 source historical K 的股/元结果。任一 profile 不一致必须暂停并回到
owning candle/replay design，不能在 reader 中增加临时 factor。

#### 3.2 Historical 与 realtime 按 trigger trading day 互斥切分

对 `triggerTradingDay = D` 的一次 realtime window hydration：

- MySQL historical reader 只返回同一 source、period 且 `tradingDay < D` 的 K；
- market Redis reader 只返回同一 source、`tradingDay = D` 且 `timestamp < anchorAt` 的 sealed 1m K；
- requested period 为 5/15/30/60m 时，Signal period builder 从这些 1m 重建已封存 derived bars；Redis
  不被描述为直接保存高周期 K；
- signal-owned memory 只缓存以上输入及其 derived state，不成为第三份权威数据。

`StrategyMarketDataPort` 不把 MySQL 与 Redis 同日记录读入同一个 realtime window。MySQL 即使提前
存在 D 的记录也从该次 realtime query 排除；candle owner 已保证 D 的 market Redis keys 在上海
时间 D+1 00:00 到期。到 D+1，D 只能通过 MySQL historical reader 进入新窗口；若 MySQL 尚无 D，
则交由后续历史不足语义处理，不延长或恢复旧 Redis，也不跨日 fallback。

因此策略 context 不设计 MySQL/Redis 同 timestamp 的权威性竞争或数值冲突矩阵。post-close
provider history 与 Redis 的数值差异、readback 和 cleanup 属于未来重新授权的 post-close focused
change，不属于 realtime context merge。

#### 3.3 Window 按实际监听组动态分配

V1 不新增独立的固定 `STRATEGY_WINDOW_CAPACITY` 或由用户填写的 `lookbackBars`：

- window identity 固定为 `(securityId, source, period)`；
- 只为 source business listener 与至少一个 eligible strategy 的交集创建窗口；
- 同组所有策略共享 canonical bars、Indicator 和 quantity projector state，不复制 per-strategy window；
- 每根 accepted bar 必须先按序进入窗口并完成该位置的 evaluation，再考虑淘汰旧 bar；
- 每组保留长度取所有 active strategy execution plan 内部推导的最大 `requiredBarCount`；该值来自共享
  field catalog 的 `calculationBarCount` 与 operator，而不是 realtime 配置或用户 lookback。`k.close`、
  KDJ(9,3,3) 和 MACD(12,26,9) 当前批准的计算窗口分别为 1、13 和 130，crossover 再增加 1；field
  catalog/validator 必须拒绝无界或超过其已批准参数范围的 rule；
- `k.volume/k.amount` 的普通当前值比较同样为 `calculationBarCount=1`；raw current null 先使用
  shared projector 查找同日前值。day-start replay 不扩大 group ring-window demand；同日无前值时 effective
  value 才 unavailable；
- 普通 MACD evaluation 只对 anchor 结尾的精确 130 根有序 K 重算；MACD crossover 用 131 根形成两个
  相邻 130-bar windows。Signal 不维护 EMA checkpoint/状态表，不从窗口以前的历史隐式续算，也不因
  restart 改变 seed；同组同算法版本只计算一次并供所有 eligible plans 复用；
- listener、最后一个 eligible strategy 或 registry generation 被移除后，释放对应 group 的 raw
  bars 与 derived state；当 `(securityId,source)` 已无任何 period consumer 时再释放其共享
  last-finalized trigger cursor；
- Signal runtime 持有一个进程内 `activeTradingDay`。第一条有效 `candle_finalized` 的 tradingDay 与其不同
  时，single worker 必须在任何 hydration/evaluation 前一次性释放全部旧日 raw/derived windows、
  Indicator derived cache、quantity projector state、last-finalized trigger cursors 与 episode active set，
  再将 `activeTradingDay` 切换到新日并执行有界 hydration；
  不增加午夜 timer，也不从 prior-day Redis 恢复状态；
- V1 不增加 aggregate memory budget、数值 bar cap 或容量 env。shadow 必须观测 listener count、
  group count、raw/derived bar count、heap high-water mark、每组增长和 GC pause，并以实际监听规模
  形成容量证据；
- promotion evidence 必须证明：active group 数稳定后 retained bar 与 heap 不持续单调无界增长；最后
  一个 consumer 移除后对应 raw/derived/Indicator/quantity-projector state 可释放；trading-day rollover 后旧日
  windows、analysis state 与 episode active set 不再被持有；进程没有因内存压力重启；
- 上述任一证据缺失、持续增长、未释放或进程重启都阻止切换 `on`，但不在本 change 临时增加阈值或
  自动回收策略。若实测证明 listener-bound/compiled-demand 边界仍不足，再创建独立 capacity change
  评审 aggregate budget、hard limit 或其他容量机制。

“从 startTime 后全量处理”表示所有 bar 都必须按顺序进入 evaluation；不表示已经处理且不再被
任何 active execution plan 需要的 bar 必须永久留在内存。

#### 3.4 Reader 错误边界继承后端治理指南

`StrategyMarketDataPort` 的 MySQL/Redis readers 不建立策略专属异常体系，直接遵循
`docs/backend-error-handling-governance-guide.md`：

- repository、Redis adapter 和低层 helper 返回正常结果，让 TypeORM、driver、connection 和 Redis
  异常继续向上；
- 低层不 catch-and-wrap、不自动重试、不 readback、不跨存储 fallback，也不把依赖异常转换成
  evaluation `unavailable`；
- 查询成功返回空集合、行数不足或合法缺 K 不是数据库异常，其业务含义由下一项 context
  gap/insufficient review 决定；
- worker/orchestrator 边界负责一次权威日志、失败观测和后续 trigger 隔离；单次失败不得静默成功，
  也不得让长期运行进程因未处理 rejection 退出；
- query/page/time-range 必须保持有界，并使用共享基础设施真实支持的 connection/query/operation
  deadline；不得用无法取消底层查询的临时 `Promise.race` 伪造已取消；
- reader 本身不新增 retry、fallback、strategy-specific timeout code 或恢复语义。后续 handoff
  change 若需要 retry，必须按治理指南单独确认 owner、幂等、次数和 deadline。

因此本项不再评审一套重复的 timeout 数值或错误映射；实现时只需证明遵循常驻治理文档和共享配置
边界。

#### 3.5 Realtime warmup 不足按 execution plan 隔离

`loadRealtimeWindow()` 按组内最大 context demand 进行一次有界 hydration，但 hydration 返回的
有效 K 数量少于组内最大需求时，不得把整个共享窗口标记为不可用：

- readiness 按每个 active execution plan 自身推导出的 context demand 判断；
- 已获得足量证据的 plan 继续使用同一个共享窗口计算；
- 只有证据不足的 plan 返回 `status='unavailable'`，稳定原因为 `insufficient_history`；
- 成功但不足的 hydration 不触发 MySQL 自动重查、旧日 Redis 补洞、跨 source fallback 或
  per-strategy query；
- 后续 accepted sealed K 继续按序追加；当有效 K 数量满足该 plan 的 demand 后，该 plan 从下一次
  evaluation 自然恢复为可计算状态；
- observed/required bar count 只作为有界 diagnostics 或日志字段，不作为高基数 metric label。

本节只约束 `apps/signal` 的 realtime warmup。backtest replay 的区间前预热和早期 unavailable 行为由
`extract-backtest-runtime` / `evolve-strategy-evaluation-contract` 持有，不在本 change 顺带修改。

period-derived 聚合、episode 和 persistence 的剩余细节仍是后续逐项评审门禁。

#### 3.6 缺失允许，重复按 canonical identity 幂等

实时链路无法保证每个理论交易时间槽都有 K。V1 只处理实际存在且通过边界验证的 bar：

- timestamp 跳跃本身不构成 continuity gap，不补零、不复制前值、不生成空 K，也不返回 unavailable；
- lookback 的 bar count 表示最近实际接受的有效 K 数量，不表示理论时间槽覆盖数量；
- 午休、隔夜、停牌、无成交、provider 稀疏输出和无法证明原因的缺失不由 context port 猜测；
- source freshness、持续无数据和 transport/candle degradation 由监控边界观测，不伪装成策略结果；
- 5/15/30/60 分钟 derived bar 的组成 K 规则仍由 worker/period 专项评审持有。

去重 identity 固定为 `(securityId, source, period, timestamp)`，并在共享 window 接受前只执行一次：

- identity 与全部 canonical `StrategyBar` 内容语义相同的重复是幂等 no-op；不 append、不重复计算
  analysis/evaluator、不改变 episode，也不依赖数据库 unique constraint 才消重；
- identity 相同但 canonical 内容不同是数据契约冲突。若 window 已接受一个版本，保留该版本并
  拒绝后来版本；若 hydration batch 在接受前已包含冲突版本，则整次 hydration 失败，不能按数组
  顺序任意选一份；
- 冲突不转换为 unavailable，也不使用 last-write-wins、跨源 fallback 或静默覆盖；异常到达当前
  trigger/hydration 的 worker 边界，由该边界记录和隔离；
- duplicate/conflict 指标只使用低基数 outcome；security、timestamp 和内容差异进入有界日志或
  diagnostics，不成为 metric label。

#### 3.7 Discarded、nullable 字段和非法 K 使用不同边界

upstream candle finalization 已经负责区分 valid 与 discarded；signal runtime 不重新解释或修复
discard reason：

- discarded outcome 表示该 bucket 没有可消费的 1m `StrategyBar`，因此不进入 1m 共享窗口、不运行
  1m analysis/evaluator、不产生 1m unavailable，也不直接改变 1m episode；它必须由
  `candle_finalized` trigger 推进 finalization cursor 和 period builder，使所属高周期在固定边界生成
  complete/incomplete 或零输出。若生成 derived bar，则该高周期仍按普通 evaluator/episode 语义运行；
  discard 指标和原因继续由 market/monitoring 边界观测，不进入 trigger payload；
- `volume=null` 或 `amount=null` 是 raw canonical K 的合法状态。只要 required OHLC、identity、source、
  period 和 timestamp 合法，整根 bar 必须保留在窗口中并计入实际有效 bar count，nullable 字段也
  必须原样保留，禁止删除字段、删除 bar 或补成 `0`；
- 构建 evaluation context 前必须使用共享 `QuantityForwardFillProjector`；它按
  `(securityId, source, period, tradingDay)` 分组并对 volume/amount 独立维护同日最近有效值。当前
  non-null 值更新状态，当前 null 使用同日最近值，无同日前值时仍为 null；
- 不读取量额字段的 execution plan 可以继续计算；读取某个 quantity 且投影后 effective value 仍为
  null 时，返回 `status='unavailable', reason='field_unavailable'`；
- snapshot cumulative counter 的同日 hold 已由 candle owner 在形成 interval delta 前完成；Signal
  projector 的 interval forward fill 不得被解释为当前 cumulative counter，也不得读取 future K 或跨交易日；
- raw window 保留当前 string/null，immutable evaluation context 使用 effective value。Signal
  `contextSnapshot` 必须消费 `evolve-strategy-evaluation-contract` 的共享 serializer：量额 scalar 继续保存
  effective value，并为 compiled plan 所需 current/prior observation 保存
  `raw/effective/resolution`；resolution 只允许 `observed|forwardFilled`，unavailable 不产生 Signal；
- 非法 required OHLC、identity、timestamp、非 null decimal representation 或其他
  `StrategyBar` contract violation 必须拒绝当前 trigger/hydration，并把异常抛到 worker 边界；
  不能转换成 unavailable 后继续假装成功；
- analysis/indicator 正常返回已定义的 evidence-insufficient 结果可以映射为 unavailable；kernel、
  context builder 或 evaluator 直接抛出的异常必须按后端错误治理传播到当前任务边界。

本边界保证 unavailable 只表达合法输入上的证据不足，不承担数据契约异常或程序异常的错误通道。

#### 3.8 V1 evaluability 与 match 使用两阶段结果

shared evaluation contract 固定为：

```ts
type EvaluationResult =
  | {
      status: 'unavailable';
      reason: 'insufficient_history' | 'field_unavailable';
    }
  | {
      status: 'evaluated';
      matched: boolean;
    };
```

V1 unavailable reason union 只包含：

- `insufficient_history`：当前 execution plan 的实际 accepted valid bar count 小于其内部推导的
  context demand，包括尚未满足的 indicator warmup bar demand；
- `field_unavailable`：bar count 已满足，但规则消费的 nullable 或 derived field 当前没有可用值。

`unavailable` 不创建 Signal/AlertEvent，不写策略业务表，也不得被转换成
`evaluated(matched=false)`。episode 对 unavailable 执行 no-op：不创建、清除或改变 active
membership，也不触发 candidate。只有 `evaluated` 才进入第二阶段 alert decision。

metrics 只使用上述 bounded reason。`fieldPath`、`observedBars`、`requiredBars`、resolution 和
`observedAt` 可以进入有界日志、trace 或 diagnostics，但不得作为高基数 metric label。静态未知或
目标 source/runtime 永远不支持的字段必须在 definition validation/realtime registration 阶段拒绝，
不能靠持续 unavailable 掩盖非法策略。

V1 只定义 candle-finalization observation。`StrategyMarketDataPort` 不包含 snapshot observation input，queue
不注册 `snapshot_update`，Signal 也不读取 ingress 最新 snapshot。未来若产品需要未封 K 信号，必须
另建 focused change，重新评审 owner、canonical payload、频率/coalescing、同分钟幂等、与 sealed K
的顺序及 episode 语义；不能把当前 change 的 candle-finalization contract 当作隐式扩展授权。backtest 不需要
模拟 snapshot。

#### 3.9 Derived period 使用同一 StrategyBar 并显式标记 incomplete

canonical `StrategyBar` 增加必填枚举 `type: 'complete' | 'incomplete'`，不建立另一种 incomplete
result、诊断 DTO 或并存的 `isComplete`。historical MySQL K 与有效 sealed 1m 映射为 `complete`。

period 窗口在固定边界前只有内部、未封存的 completeness outcome `unknown`，此时不输出
`StrategyBar`。边界到达后一次性决议为 `complete`、`incomplete` 或零组成 K 时不输出；
`unknown` 不是 `StrategyBar.type` 的第三个枚举值。V1 丢弃迟到组成 K，因此已经输出的 complete 或
incomplete bar 都是终态，不再相互转换。

这里的“边界到达”只由前置 candle foundation 的 `candle_finalized` 终态 watermark 推进。B1 对 active
listener 的每个完整理论 1m bucket 注册 expected-bucket due，完全没有 snapshot 时也提交 discarded，
因此 period builder 在最后组成分钟缺失、午休前或收盘前仍能得到关闭事件。Signal 不增加
session/grace timer、不按本地 wall clock 猜测终态，也不复制 B1 listener/due scanner；如果 B1 因进程
中断留下未恢复 gap，realtime 继续接受缺失而不补造 trigger。

5/15/30/60 分钟由当日 sealed 1m 按 A 股上午、下午固定 session 槽分别合成，不跨午休。周期边界
到达时：

- 所有组成 1m 都存在时生成 `complete` derived bar；
- 缺少任一组成 1m（包括该分钟被 upstream discarded）但仍至少存在一根可用组成 K 时，生成字段
  形状相同的 `incomplete` derived bar；
- 完全没有可用组成 K 时无法形成 required OHLC，因此不生成 derived bar；
- V1 丢弃迟到组成 1m，不修订、不回补、也不重新触发已经生成的 derived bar。

period builder 本质上是固定 session 时间窗口上的有界归约器。derived bar identity 在归约前已经由
`(securityId, source, period, slot bucketStartMs)` 确定，canonical `timestamp` 必须取该 slot 的
`bucketStartMs`，不能取第一根或最后一根实际组成 K 的 timestamp。比如 `[09:30,09:35)` 缺少
`09:30` 但存在 `09:31..09:34` 时，derived bar 仍使用 `09:30`。60m 在上午、下午分别形成
`09:30–10:30`、`10:30–11:30`、`13:00–14:00`、`14:00–15:00` 四个独立窗口。

OHLC 只在窗口内实际存在且已接受的组成 1m 上执行标准归约：

- `open` 取最早实际组成 K 的 open；
- `close` 取最后实际组成 K 的 close；
- `high` 取所有实际组成 K 的 high 最大值；
- `low` 取所有实际组成 K 的 low 最小值。

缺失时间槽不产生价格输入，不补 `0`、不 carry-forward、不复制相邻 K，也不推导理论 open/close。
因此 `[09:30,09:35)` 仅存在 `09:31/09:32/09:34` 时，timestamp 仍为 `09:30`，open 取
`09:31.open`，close 取 `09:34.close`，high/low 只从这三根计算，并以 `type='incomplete'` 暴露缺口。

`volume` 与 `amount` 独立执行以下 exact-decimal 归约：

- 只累加实际存在组成 K 的规范十进制字符串；每个值通过 candle foundation 持有的共享
  scale=8 `Decimal8(bigint)` 解析，使用 add 归约，并在每次结果写回前执行 `DECIMAL(36,8)` 范围检查
  和 canonical format；算法不得经过 JavaScript `number`；
- 实际组成 K 明确提供 `"0"` 时按已确认的零增量累加；
- 整根组成 1m 缺失时不注入 `0`，derived 数值表示已观察组成 K 的合计，并由
  `type='incomplete'` 明确它不是完整周期覆盖；
- 任一实际组成 K 的对应字段为 `null` 时，derived 对应字段也为 `null`，不能忽略 null 后伪造
  精确合计；volume 与 amount 分别判断，互不连带；
- period aggregation 不执行跨 K carry-forward，原始 derived bar 保持 null。该 bar 封存后才进入共享策略
  projector；projector 只可使用同 security/source/period/tradingDay 的早期 derived bar，不得在 1m
  constituent 聚合前填充 null，避免重复计入量额。

period builder 不实现第二套 decimal parser/comparator，不引入 decimal library，不使用
`Number`、`String(number)`、`BigInt(number)` 或 raw bigint serialization。`Decimal8` 只存在于归约
过程，最终 `StrategyBar.volume/amount` 仍为 canonical string/null。V1 不在周期聚合中执行乘除、平均、
比例或舍入。

`complete` 与 `incomplete` 都是可接受的 canonical K，进入同一个共享 window，并由 Indicator
和 evaluator 正常消费；runtime 不得仅因 `type='incomplete'` 自动过滤、返回 unavailable 或改变
episode。typed field catalog 暴露 `k.type`，值为同一枚举且只支持 `eq/ne`，需要排除 incomplete
的策略必须显式声明。derived bar 触发 evaluation 时，immutable context 和持久化
`contextSnapshot` 必须保留该 `type`，使后续审计不依赖内存或 Redis 回查。

V1 不为 `StrategyBar` 增加 `observedBarCount`、`expectedBarCount`、`volumeUnit`、`amountUnit`、
`amountPrecision` 或其他 provenance 字段。incomplete coverage 已由 `type` 完整表达；股/元单位由
field contract 固定，provider quantity precision 由既有 `source` 和该 source 的固定 adapter contract
表达：TDX 来自 native decimal string，QMT volume 来自 provider integer、amount 来自 provider
float 的可观察字符串。immutable context/contextSnapshot 保存 `source`、`type` 和 evaluation 实际使用的
effective value；共享 `quantityEvidence.current/previous` 只为 compiled plan 消费的量额 observation 保存
raw/effective 及 `observed|forwardFilled` resolution。该 evidence 是 consumer-level evaluation audit，
不是 `StrategyBar` 的 per-bar precision 字段，也不改变 raw bar。如果未来同一 source 出现混合
precision contract，必须新建或更新 OpenSpec 后才能扩展 canonical bar。

至此 4.2 已确认 canonical shape、session 边界、timestamp、OHLC、量额、provenance、消费方式和
生命周期，可以进入 period builder 实现门禁。

### 4. 进程边界先于仓库边界

signal runtime 使用同仓 `apps/signal` entrypoint，Nest project 名为 `signal`，根模块为
`SignalAppModule`；它依赖 strategy-domain 与 market-analysis libraries。`apps/mist` 继续持有
control APIs，两个 app 不得互相导入源码。registry refresh 等 request-response command 必须使用
`libs/transport/rpc` 的 `RpcRequestV1/RpcResultV1` 和必填 correlation；Signal pattern、payload 和
error code/decoder 由本 change 新增的 `libs/signal/src/contracts` 单一持有，并通过 `@app/signal`
同时提供给 caller/handler；不得进入 `libs/transport`、`libs/strategy` 或任一 app source。

`apps/signal` 使用一个单实例 Hybrid Nest application，而不是三个独立进程：

- `NestFactory.create(SignalAppModule)` 提供仅供 Compose/monitoring 使用的内部 HTTP
  health/diagnostics listener；
- 同一个 application 通过 Nest microservice connection 承载 `signal.registry.refresh.v1` TCP
  request-response；该入口只刷新定义，不运行策略；
- 同一个 module graph 注册 BullMQ `strategy-trigger` worker；
- HTTP、TCP 和 BullMQ 共用一份 immutable registry、共享 ring windows、Indicator derived state、
  quantity projection state
  与 persistence services；不得跨进程复制或通过应用源码互相调用；
- web gateway 不增加 `/api/signal` 或其他公共 signal route。公共 strategy API 仍只属于
  `apps/mist`；
- deployment identity 固定为 Compose service `signal`、container `mist-signal`，复用与 backend/chan
  相同的 `MIST_IMAGE:MIST_IMAGE_TAG`，command 为 `node dist/apps/signal/main.js`。`build:docker` 必须
  增加 `nest build signal`；不创建独立 Dockerfile、image repository 或 image tag；
- internal HTTP 使用 container-local `PORT=8010`，registry-refresh TCP 使用
  `SIGNAL_RPC_PORT=9010`；`apps/mist` 通过 `SIGNAL_RPC_HOST=signal`、`SIGNAL_RPC_PORT=9010` 使用
  Compose DNS。两个 listener 可在 `mist-network` 内探测，但 Compose 不配置 host `ports`，Dockerfile
  的 `EXPOSE` 只作镜像文档，不能变成公共入口；
- 选择 `8010/9010` 避开现有 8001/8003/8008、datasource 9001/9002 和已退役且由 negative tests
  禁止恢复的 8009。BullMQ Worker 不监听第三个端口；
- `SignalAppModule` 复用当前 backend 的 `TypeOrmModule.forRootAsync()` 配置模式建立本进程 MySQL
  pool。Nest/TypeORM bootstrap 成功后才开始 HTTP/TCP listener；初始配置、MySQL pool 或首轮 registry
  查询失败直接抛到应用启动边界，不在 Signal 内再叠加 connect manager、轮询、fallback 或自定义
  retry/readback；
- 不新增 `mysqlReady` 或无作用域 `ready`。Signal health 采用 datasource 已有的“根服务存活 + scoped
  responsibility state”模型；`off` 表示 realtime reader/worker/evaluation 按设计不启动，服务仍可
  健康并处理 registry refresh。`apps/mist` 不轮询 Signal health；明确的 handler 前 TCP connection
  failure 作为 strategy mutation 已提交但 runtime refresh 未确认的 service-unavailable 结果处理；
- `shadow/on` 才装配 realtime Redis/BullMQ worker；其初始化失败同样停在启动边界，不带着半初始化
  worker 接受 job。HTTP/TCP 端口值留在部署子项确认，不能从 `apps/mist`、`apps/chan` 或
  `apps/backtest` 端口机械复制。正常停止复用 Nest shutdown hooks 与 BullMQ provider lifecycle，
  不另建 Signal 专属 draining 状态、shutdown coordinator、deadline env、错误码或任务补偿协议；
  异常退出继续服从已批准的 failed/stalled 和 best-effort 语义。

#### 4.1 Signal health 使用 datasource 风格的 scoped 状态

Signal 只提供内部 raw `GET /health`，response type 命名为 `SignalHealthVo`，但不套公共业务
`ApiResponseDto`。该 endpoint 只在 Compose network 内由 healthcheck 与 monitoring 使用，不发布 host
port 或 gateway route；不增加 `/app/hello` alias、`/live`、`/ready` 或第二套 health endpoint。

V1 contract shape 为：

```ts
type SignalHealthVo = {
  status: 'ok';
  instance: 'signal';
  realtimeMode: 'off' | 'shadow' | 'on';
  registry: {
    ready: boolean;
    generation: number;
    definitionCount: number;
    executionPlanCount: number;
    lastRefreshAt: string | null;
    lastRefreshOutcome: 'success' | 'failed' | null;
    lastFailureCode: string | null;
  };
  marketData: {
    state: 'off' | 'ready' | 'error';
    lastTriggerTime: string | null;
    lastAcceptedAt: string | null;
    windowGroupCount: number;
    rawBarCount: number;
    derivedBarCount: number;
    lastFailureCode: string | null;
  };
  queue: {
    state: 'off' | 'ready' | 'reconnecting' | 'error';
    workerRunning: boolean;
    concurrency: 1;
    activeCount: number;
    processedCount: number;
    failedCount: number;
    lastProcessedAt: string | null;
    lastOutcome:
      | 'completed'
      | 'failed'
      | 'expired_trading_day'
      | 'out_of_order_trigger_discarded'
      | null;
    lastFailureCode: string | null;
  };
  evaluation: {
    state: 'off' | 'idle' | 'running' | 'error';
    lastEvaluatedAt: string | null;
    lastOutcome:
      | 'evaluated_matched'
      | 'evaluated_not_matched'
      | 'unavailable'
      | 'failed'
      | null;
    activeEpisodeCount: number;
    lastFailureCode: string | null;
  };
};
```

约束如下：

- endpoint 能正常构造 typed body 时返回 HTTP 200，根 `status='ok'` 只表示进程可响应；nested
  `ready/state/outcome` 可以表达 realtime capability 未就绪或失败，不能把它们折叠成根
  `status='degraded'`；
- bootstrap 配置、TypeORM、初始 registry，或 `shadow/on` 初始 Redis/BullMQ 失败时 HTTP/TCP listener
  尚未启动，因此不会产生假健康响应；进程启动后的单 job/reader/worker/evaluation 异常不改变根 200，
  由对应子对象、metrics 和日志表达；
- `registry.ready` 是 scoped readiness。成功初始加载后为 true；refresh 失败保留旧 snapshot，generation
  不递增、ready 保持 true，同时记录 `lastRefreshOutcome='failed'` 与安全 `lastFailureCode`；
- 所有 count 是当前进程内非负 aggregate，重启后归零。`queue.activeCount` 在 concurrency=1 下只能为
  0 或 1；`processedCount` 统计本进程到达 processor terminal boundary 的总 job 数，`failedCount` 是
  其中 failed 子集；这些值不是 BullMQ retained queue depth；
- `expired_trading_day` 与 `out_of_order_trigger_discarded` 都是正常完成的 queue outcome，计入
  `processedCount` 而不计入 `failedCount`，也不更新 `evaluation.lastEvaluatedAt`；普通成功与相同
  canonical 内容的 duplicate no-op 都使用 `completed`，V1 不再为 duplicate 增加 health 枚举；
- 所有 `*At` 与 `lastTriggerTime` 为 RFC3339 string 或 null。`marketData.lastTriggerTime` 是最近一次真正
  推进任一 `(securityId,source)` last-finalized cursor 的最大 market time；sealed 与 discarded 都可以
  推进，但 expired、out-of-order、duplicate no-op、contract/content conflict 或 acceptance 前失败均不
  更新，且该值不得因处理较旧 job 而倒退。`marketData.lastAcceptedAt` 是上述 cursor 最近推进时的
  Signal 服务时间，同样可由 sealed/discarded 更新；它不声称 Redis bar 一定进入 window。
  `queue.lastProcessedAt` 与 `evaluation.lastEvaluatedAt` 分别是各 owning stage 的服务时间；
- sealed acceptance 增加 `rawBarCount`；discarded acceptance 不增加 raw count，但若它关闭周期并产生
  derived bar，则增加 `derivedBarCount`。expired、out-of-order、duplicate no-op 和 acceptance 前失败不
  改变 raw/derived count；所有到达 queue terminal boundary 的 job 仍更新 `queue.lastProcessedAt`；
- `lastFailureCode` 只能是 owning component 定义的 bounded safe code 或 null，禁止返回 SQL、driver
  message、stack、strategy/security identity 或任意 exception object；
- `REALTIME_STRATEGY_MODE=off` 时 registry 仍完成初始加载；`marketData.state`、`queue.state` 与
  `evaluation.state` 均为 `off`，workerRunning=false，进程内 count 为 0，时间/outcome/failure 为 null；
- health handler 只读取进程已持有的 immutable snapshot、state 与 counters，不执行 MySQL query、Redis
  PING、BullMQ `getJobCounts()`、key scan、used-memory 或 AOF 查询，也不修改状态。waiting/retained job
  depth、shared Redis capacity/AOF 和跨进程 queue health 继续由 `mist-monitoring` 的独立 bounded probe
  持有；
- Compose healthcheck 只验证 HTTP 200 和 typed root contract，不把 nested realtime failure 变成容器
  restart 信号；monitoring 必须解析 nested state 并单独告警。

#### 4.2 Registry 使用启动全量加载与按 definition 刷新

Signal registry 保持单机、内存和 immutable，不引入数据库 generation 表、Redis registry、副本表、
outbox 或定时 polling：

- `apps/signal` 每次启动只执行一次全量查询，读取所有 enabled `StrategyDefinition` 及其 current
  `StrategyVersion`；每个 version 必须包含前置 change 已批准的单一 `rule` 与必填 `signalKind`，完成
  validator/单 execution-plan 编译后发布首个 registry snapshot；任一基础
  查询失败直接到启动边界。合法的零 enabled strategy 生成空 registry，不算启动失败；
- registry snapshot 使用进程内正 safe integer `registryGeneration`。首个成功 snapshot 为 `1`，
  每次成功 cutover 递增；重启后重新从 `1` 开始。该值只进入 bounded diagnostics/log，不写 MySQL、
  Redis、Signal、AlertEvent、job payload 或 idempotency identity；
- strategy enable/disable transaction commit 后，`apps/mist`
  使用 shared RPC envelope 发送：

  ```ts
  pattern = 'signal.registry.refresh.v1'
  RpcRequestV1<RefreshSignalRegistryCommandV1>
  RpcResultV1<SignalRegistryRefreshV1, never>

  type RefreshSignalRegistryCommandV1 = {
    strategyDefinitionId: number;
  };

  type SignalRegistryRefreshV1 = {
    strategyDefinitionId: number;
    registryGeneration: number;
    action: 'upserted' | 'removed';
  };
  ```

- Signal 收到 command 后只查询该 definition 及 current version。仍为 enabled 且 aggregate 合法时，
  copy-on-write upsert；不存在、draft、disabled 或 archived 时 copy-on-write remove。刷新操作必须避免
  并发 cutover 丢失另一个 definition 的更新；最终 pointer swap 是同步原子步骤；
- 每个 realtime job 在开始时捕获一个 registry snapshot reference 和 generation，并使用到该
  operation 结束；cutover 不修改旧对象。新 operation 只读取最新 pointer，禁止一次计算中途混用
  两个 version；旧 snapshot 在无 in-flight reference 后由 Node GC 回收；
- refresh DB 查询、aggregate validation、RPC handler 或 cutover 失败时保留当前 registry pointer，
  不递增 generation、不局部修改旧对象、不自动 retry。非预期错误使用 shared RPC error channel；
- refresh 必须在 owning database transaction commit 后发送，不能把 RPC 等待放进 MySQL transaction。
  如果 DB 已提交但 connection、handler 或 timeout 使 refresh 未确认，public mutation 使用真实
  `503/502/504` 和 `SIGNAL_SERVICE_UNAVAILABLE/STRATEGY_RUNTIME_REFRESH_FAILED/
  STRATEGY_RUNTIME_REFRESH_TIMEOUT`；typed data 只含
  `{strategyDefinitionId,persistence:'committed',runtimeRefresh:'unknown'}`。API 不伪造数据库回滚，
  operator 可以重启 Signal；
- DB commit 到 RPC send 之间的进程 crash 仍可能留下 stale registry。V1 接受该 best-effort 窗口，
  不增加周期补偿、outbox 或后台 retry；Signal 下一次启动的全量加载是唯一自动收敛点。

#### 4.3 V1 使用单 realtime worker

V1 优先保证可解释的稳定执行顺序，不在单机 Signal runtime 中预设多层并发调度：

- `strategy-trigger` BullMQ Worker 固定使用代码常量 `concurrency=1`。不新增 concurrency env、
  per-symbol keyed queue、worker thread pool 或同一 queue 的第二个 consumer；任一时刻最多只有一个
  active `candle_finalized` job；
- 单 worker 只保证 job 不并行以及共享 window/analysis/episode state 不被两个 realtime job 同时
  修改。每个 `(securityId,source)` 保存最后接受的 1m finalization trigger timestamp；startup
  compensation 必须按 `triggerTime ASC, source ASC, securityId ASC` 提交。BullMQ delivery order 仍不
  被解释为 market timestamp order：同组较旧 trigger 晚到时以 bounded queue outcome
  `out_of_order_trigger_discarded` 正常完成，不读取/插入该 bar、不倒序推进 period builder 或运行
  Indicator/evaluator、不改变 episode 或 persistence；相同 timestamp/outcome/content 继续按 duplicate
  no-op，sealed/discarded 冲突或 sealed canonical 内容冲突仍失败；
- current finalization 一旦通过 canonical acceptance，sealed bar 进入共享 window，discarded slot 进入
  period builder 的缺失集合，并同步推进 last-finalized cursor；后续某个 derived/evaluation plan 失败
  不会倒退 window/period state/cursor。该 job 仍 failed，后续 trigger 可继续；V1 不重跑失败 trigger，
  也不把内存 rewind 伪装成数据库事务回滚；
- 每个 realtime job 在捕获 registry snapshot 后先生成 eligible execution plans，再按
  `definitionId ASC → versionId ASC → period minute rank ASC` 稳定排序，其中周期 rank 固定为
  `1m < 5m < 15m < 30m < 60m`。trigger 已经固定 `securityId/source`，不得再以对象遍历顺序、注册
  顺序或异步完成顺序决定策略执行顺序；
- 每个 plan 只能使用其 immutable version 声明的 signal kind；worker 不接受 `entryRule/exitRule`，也不
  从一次 matched 计算同时生成 entry 与 exit；
- 一个 execution plan 的 analysis/evaluator/persistence 抛出非目标异常时，当前 job fail fast，
  不继续执行排序中后续 plan；此前已经提交的短事务保持提交，异常到达 BullMQ processor boundary，
  不用一个跨 plan 长事务回滚整轮。

不存在 manual live-scan handler、manual admission slot 或 manual/realtime overlap。人工执行在独立
`apps/backtest` 故障域中读取 historical K 和写 BacktestSignalResult，不读取或修改 Signal realtime
window/episode，也不参与 live persistence identity。Signal 内唯一策略执行并发面就是上述单 BullMQ
worker。

### 5. Signal 与 AlertEvent 是 notification 交接边界

#### 5.1 Episode identity 延续 source-isolated 计算链

V1 episode store 是日内、进程内抑制状态，不是 Redis/MySQL 业务记录：

```ts
type EpisodeStore = {
  tradingDay: string | null;
  activeKeys: Set<EpisodeKey>;
};
```

episode key 固定为：

```ts
type EpisodeKey = {
  definitionId: number;
  versionId: number;
  securityId: number;
  source: 'tdx' | 'qmt';
  period: Period;
  signalKind: 'entry' | 'exit';
};
```

TDX/QMT 使用独立 market bar、window 和 analysis context，因此也必须使用独立 episode。若省略
`source`，一条链的 true 会抑制另一条链的 candidate，一条链的 false 也可能重置另一条链，最终
结果依赖 provider 到达顺序。`type` 不进入 key，因为 complete/incomplete 是一次 bar 观察质量；
timestamp 不进入 key，因为 episode 必须跨连续 bar 保存状态。definition version 进入 key，避免
不同 immutable rule version 共享 continuity。Signal persistence 使用 5.2 的 result identity，不能
复用不含 timestamp 的 episode key。`tradingDay` 属于 store generation，不重复进入每个 key；日切以
整体替换 `activeKeys` 表达。

episode suppression 是 evaluation 之后的第二阶段。V1 可用一个 source-aware `Set<EpisodeKey>`
表达，并形成以下 `AlertDecision`：

```ts
type AlertDecision = 'emit' | 'suppress' | 'clear' | 'no-op';
```

- key 不存在表示 inactive；`evaluated(matched=true)` 产生 `emit`，并在接受的时点加入 active；
- key 已存在且再次 `evaluated(matched=true)` 时产生 `suppress`，保持 active；
- `evaluated(matched=false)` 产生 `clear` 并删除 key，后续 matched 可以形成新 episode；
- `unavailable` 产生 `no-op`，不新增、不删除、不改变 key；
- `StrategyBar.type` 不参与上述转换，complete/incomplete bar 都只以 evaluator 最终结果驱动；
- 第一条新 tradingDay 的有效 trigger 在 evaluation 前整体清空 active set，因而昨日持续 matched 的
  条件在今日第一次 matched 时可以产生新的 candidate；这是一项明确的每日重新提醒语义；
- 进程重启或 mode 切换到 `off` 也清空 active set，下一次 matched 可以重新产生 candidate。同日
  重启后的重发属于 V1 接受的 at-least-once 行为，不从 MySQL、Redis 或既有 Signal 反推 continuity。

active set 的结构上限是当前 listener 与 compiled eligible execution plan 可形成的全部 EpisodeKey：

- registry cutover 删除不再 enabled/current/eligible 的 definition/version/period/source/security key；
- listener 或最后一个 eligible consumer 移除时删除对应不可达 key；
- 加入 active set 前必须证明 key 属于该 job 捕获的 immutable execution plan；不得以随机淘汰旧 key
  处理 invariant breach；
- 不增加固定 `EPISODE_CAPACITY` env、TTL、Redis/MySQL episode persistence、cooldown 或定时 cleaner；
  active key count 作为 bounded process metric，shadow 证据不足时不得切 `on`。

registry refresh 与 in-flight job 可重叠：已捕获旧 generation 的 job 按既有 snapshot 语义完成，因而
禁用或换版后最多仍可能提交一个已经在途的旧版本结果；job 结束时不得把最新 registry 已不可达的
key 留在 active set。V1 不为“mutation commit 后绝无在途结果”增加全局执行锁或长事务。

candidate 的 active cutover 按 mode 固定：

- `shadow` 不写 Signal/AlertEvent；`emit` candidate 到达 shadow observation boundary 并记录 outcome
  后，single writer 立即把 key 加入 active set。否则连续 matched bar 会反复产生 shadow candidate，
  无法模拟 on 模式的 episode suppression；
- `on` 不得在 evaluation matched 或 transaction 开始时提前 activate。只有 Signal + PENDING
  AlertEvent 的短 transaction commit 成功后，才把 key 加入 active set，并记录 bounded
  `created` persistence outcome；
- 若持久化精确命中 5.2 固定的 `uq_strategy_alert_events_dedupe_key`，可把它解释为相同结果已存在，计入
  bounded `duplicate_skipped` persistence outcome 并 activate。只判断通用 `ER_DUP_ENTRY`、模糊
  SQL message、其他 unique、
  FK、NULL、类型或未知 constraint 均不得进入该分支；
- transaction rollback、AlertEvent 写入失败、未知约束或其他 TypeORM/MySQL 错误时，key 保持
  inactive，原始异常传播到 BullMQ worker boundary。V1 不因该失败自动 retry；后续新的
  matched observation 仍有资格形成 candidate；
- commit 后、内存 activate 前若进程退出，已提交 pair 保持提交；重启仍按已接受的 continuity 规则
  从空 active set 开始，不从数据库反推 episode。该窗口不引入 readback、episode persistence 或
  自动修复。

这里 `AlertDecision='emit'` 只表示候选获准进入 shadow/persistence boundary，不表示 Signal 已提交，
更不表示外部 notification 已发送。实际通知仍由后续 owning change 消费 PENDING AlertEvent。

#### 5.2 Persistence identity 表达一次 live result

episode identity 回答“这个条件是否仍连续成立”，persistence identity 回答“这一根结果是否已经写入”。
两者用途不同：前者不能包含 timestamp，后者必须包含结果时间。V1 固定：

```ts
type LiveSignalPersistenceIdentity = {
  definitionId: number;
  versionId: number;
  securityId: number;
  source: 'tdx' | 'qmt';
  period: Period;
  signalKind: 'entry' | 'exit';
  signalTime: number;
};
```

`signalTime` 是 actual result bar 的 canonical timestamp，序列化时使用 Unix epoch milliseconds：

- 1m result 使用 sealed 1m `StrategyBar.timestamp`；
- 5/15/30/60m result 使用 derived K 理论 slot 的 `bucketStartMs`；
- 不使用唤醒计算的最后一根 1m `triggerTime`。否则同一 derived bar 被另一次 trigger 观察时会被误认为
  新结果；
- 每日 episode reset 后，下一交易日的 result timestamp 自然不同，因此不会被昨日 unique 阻止。

`dedupeKey` 使用无哈希、可诊断的版本化 ASCII 形式：

```text
live-v1:{definitionId}:{versionId}:{securityId}:{source}:{period}:{signalKind}:{signalTimeEpochMs}
```

`live-v1` 同时固定 `signalSource=live` 的命名空间。identity 不加入 `jobId`、原始 1m
`triggerTime/triggerPrice`、context/rule JSON、bar type、tradingDay、createdAt 或 registry generation。
这些字段要么不是 result identity，要么会让同一个结果因 transport/runtime 细节不同而绕过去重。
不同 result time、source、period、signal kind、immutable version 或 BacktestRun 均不冲突；该约束不是
业务唯一性、cooldown 或 episode persistence。

V1 复用当前 `strategy_alert_events.dedupe_key` 上既有 named unique
`uq_strategy_alert_events_dedupe_key`，不在 `strategy_signals` 再增加复合 unique，也不在本 change
创建 migration。on-mode writer 不执行 `findOne(dedupeKey)` 预查询，而是直接执行一个短事务：

1. 插入 `StrategySignal`；
2. 使用已生成 Signal id 插入关联的 PENDING `StrategyAlertEvent` 与 deterministic `dedupeKey`；
3. 两条写入一起 commit 或 rollback；
4. 只有 MySQL duplicate code 与精确 named constraint 同时匹配时，才将 rollback 记为
   `duplicate_skipped` 并 activate episode。实现可以使用 driver 的结构化 constraint 字段，或通过
   real-MySQL tests 验证的精确 index-name 提取器；只看 errno、通用 `ER_DUP_ENTRY` 或模糊 message
   substring 不足以分类；
5. 其他 unique、FK、NULL、类型、连接、lock/timeout 或未知 TypeORM/MySQL 错误保持原始异常，episode
   保持 inactive，并传播到 BullMQ processor boundary。

collision 发生在 AlertEvent insert 时，新插入的 Signal 会随同一事务回滚；数据库中既有 pair 保持
原状，不重置既有 alert status，也不创建第二个投递事件。notification retry/failed-event 处置由后续
delivery change 持有。V1 不为 duplicate path 增加 readback、自动 retry 或修复事务。

前置 `evolve-strategy-evaluation-contract` 持有 live Signal schema 的单一 migration ownership：目标
row 使用 non-null `securityId` 与 `signalKind`，不保留 `securityCode` 兼容列/双写；实际 migration
编号、DDL、外键、存量 row 映射和 repair-forward 必须在 production `schema_migrations` 与数据审计后
另行确认。本 change 只有在该 schema 门禁通过且既有 AlertEvent named unique 被实库验证后才能实现
on-mode persistence。

`apps/signal` 是 realtime live candidate 的唯一 writer。on 模式只在 evaluation candidate
通过 episode 后，以一个 MySQL transaction 写入 Signal 和 PENDING AlertEvent；幂等由事务内 named
unique 决定，不通过预查询决定。
`apps/mist` 只持有策略控制 API、backtest command acceptance 和结果查询，不运行 live scan；
`apps/backtest` 也不得写 live records。未来 notifier 只消费该持久化边界。

### 6. 细节分阶段评审

实施顺序按 context port、trigger/handoff、worker/window、episode/persistence、deploy/HIL 分五轮；
每轮先输出具体协议、容量、失败矩阵和测试，再由用户确认。

### 7. Realtime trigger 使用 NestJS BullMQ integration

candle-finalization trigger 是持久化异步 event，不是 request-response command。V1 在 Nest application 中
使用 `@nestjs/bullmq` 与 `bullmq` 接入：

- producer 位于 market candle 成功 commit 之后，consumer 位于 `apps/signal`；
- V1 单机部署只使用现有 `MIST_REALTIME_REDIS_URL`、Redis service/volume 和 AOF，不新增
  `MIST_QUEUE_REDIS_URL`、第二个 Redis service、第二个 volume 或独立 logical DB；
- market state namespace 固定为 `mist:realtime:v1`；BullMQ prefix 固定为 `mist-bullmq`，queue/job
  名称继续按 7.6 的 code constants。不得把 ioredis `keyPrefix` 当作 BullMQ prefix；
- 四个 logical connection owner 分别为 `apps/mist` market writer、`apps/mist` BullMQ producer、
  `apps/signal` market reader 和 `apps/signal` BullMQ Worker。它们不得共享同一个 ioredis client
  object；BullMQ 为 blocking Worker 自行创建或复制的内部连接数量属于 library implementation，不能
  被测试或运维契约固定成一个数；
- `REALTIME_STRATEGY_MODE=off` 时，`apps/mist` 不创建 BullMQ producer，`apps/signal` 不创建
  BullMQ Worker 或 market reader。`REALTIME_PRODUCTIZATION_MODE` 独立控制 candle market writer，
  因而 strategy off 不得关闭或删除 market Redis state；
- market read/write client 与 BullMQ producer 使用 fail-fast command semantics，不把断连期间命令留在
  offline queue 等待重放。BullMQ Worker 可以使用 library 标准 reconnect 恢复连接，但该 transport
  reconnect 不改变 `attempts=1`、`maxStalledCount=0` 和无业务 retry 的 job contract；
- market expiry/cleanup 只能操作 `mist:realtime:v1` 下由 market owner 精确构造的 keys。禁止
  `FLUSHDB`、跨 namespace wildcard delete、按模糊 prefix 扫描删除或由 market owner 清理
  `mist-bullmq` keys；BullMQ keys 只由 BullMQ lifecycle/retention 管理；
- Redis 必须验证 `maxmemory-policy=noeviction`。V1 不配置 Redis `maxmemory` 数值上限、market/queue
  用途配额或 queue backlog hard cap；market 与 queue 分别观测 key/record/job 数量、retention、失败、
  used memory 与 AOF。共享 Redis 故障会同时影响两者，health 不得声称物理故障隔离；
- 不使用 Nest Redis transporter/PubSub 承担 durable trigger，也不以 TCP `emit()` 自建
  checkpoint/replay；
- TCP request-response 只承载 strategy registry refresh 等控制面 command，不承担策略执行；
- 当前 `package.json`/`pnpm-lock.yaml` 尚未声明并锁定 `@nestjs/bullmq`/`bullmq`。本地
  `node_modules` 中存在的未受 manifest/lockfile 管理的 `bullmq` 不构成可复现依赖证据；正式依赖、
  module wiring 和 lockfile 只在对应实现任务中新增。本设计确认不等于已安装或已部署。

连接与命名空间拓扑固定为：

```text
mist-realtime-redis (same Redis DB / AOF / volume)
├─ apps/mist
│  ├─ market writer connection  -> mist:realtime:v1:...
│  └─ BullMQ producer connection -> mist-bullmq:strategy-trigger:...
└─ apps/signal
   ├─ market reader connection  -> mist:realtime:v1:...
   └─ BullMQ Worker connections -> mist-bullmq:strategy-trigger:...
```

共用 endpoint 只减少单机部署组件，不表示 client ownership、key lifecycle 或健康语义合并。market
candle commit 后的 `queue.add()` 失败仍按 7.2 记录为 handoff failure，已经提交的 candle 不回滚。

#### 7.1 Candle-finalization job contract 与身份

V1 job name 固定为 `candle_finalized`，job data 是可直接理解的 1m 终态事实，不复制完整 candle：

```ts
type CandleFinalizedTriggerV1 = {
  contractVersion: 1;
  securityId: number;
  source: 'tdx' | 'qmt';
  period: '1m';
  triggerTime: string;
} & (
  | {
      outcome: 'sealed';
      triggerPrice: number;
    }
  | {
      outcome: 'discarded';
      triggerPrice: null;
    }
);
```

- `triggerTime` 必须是 RFC3339 string，表示 realtime 1m bucket 的 canonical timestamp，即
  `bucketStartMs` 所指向的同一 instant；它不是 BullMQ 入队时间、服务当前时间或 `closedAt`；
- `outcome='sealed'` 时 `triggerPrice` 必须是有限 `number` 且表示该 sealed K 的 `close`；
  `outcome='discarded'` 时 `triggerPrice` 必须严格为 `null`；payload 不携带 discard reason；
- job payload 不包含完整 K、history、strategy/rule、native snapshot、notification payload、
  `securityCode`、`providerSymbol` 或可由 `triggerTime` 按上海时区推导的 `tradingDay`；
- 确定性 jobId 固定为
  `candlefinal-v1-{source}-{securityId}-{period}-{Date.parse(triggerTime)}`。jobId 不加入 outcome，因为
  candle foundation 对同一 bucket 只能提交一个 sealed/discarded 终态；所有组成字段均来自已验证
  contract，separator 使用 `-`，不得使用 BullMQ 禁止的 `:`；
- `source` 是 job/canonical market identity 的一部分，不能省略，否则同一证券、period、time 的
  TDX/QMT trigger 会碰撞；
- `apps/signal` 对 sealed payload 通过 `resolveRealtimeObservation()` 只解析这一根 Redis sealed K，
  然后追加共享 window 并运行 1m 路径；正常 trigger 不查询完整历史。完整 OHLC、nullable 量额和
  Indicator 计算输入继续由 market-data port 提供，不能只用 `triggerPrice` 代替完整 StrategyBar；
- discarded payload 不解析或构造 1m bar，不运行 1m evaluator；它只记录该 slot 已终结但无 bar，推进
  finalization cursor，并让 period builder 决议所有到达固定边界的 derived window。该决议产生 derived
  bar 时，triggerPrice 由 derived close 得出，而不是使用 null 或反查 queue；
- 内部 queue 和 market Redis 不是外部通知查询接口。由该 trigger 产生的持久化 Signal
  `contextSnapshot` 至少保留 `triggerTime` 与 `triggerPrice`，使后续 AlertEvent/notifier 不必反查
  queue 或 market Redis；这里的 trigger evidence 必须来自实际产生 Signal 的 StrategyBar，1m 使用
  sealed close，derived 使用 derived close，discarded 本身不产生 Signal。若 compiled plan 消费量额，
  还必须通过共享 serializer 保留 effective scalar 和 `quantityEvidence`，不得由 realtime runtime
  自行创建另一套字段；
- jobId 只在对应 job 仍被 BullMQ 保留时抑制重复；job 被清理后可能再次入队，因此共享窗口的
  canonical identity/content 幂等仍是最终数据入口保护。

#### 7.2 当日 best-effort handoff 补偿

V1 不追求 candle 与 queue 的事务一致性。market sealed/discarded commit 是先行且独立的事实：

- sealed 或 discarded commit 成功后，post-commit port 都只执行一次 `queue.add()`；失败记录一次权威
  错误和 bounded metric，不回滚 market state，也不在 sealing 热路径重试；port 未安装或 strategy
  mode=off 时 candle foundation 的提交行为不变；
- 如果进程在 candle commit 与 `queue.add()` 之间退出，该 trigger 只有在同一上海交易日内后续
  重启时才有机会补投；
- realtime strategy mode 为 `shadow` 或 `on` 时，`apps/mist` 在 Redis 与 BullMQ producer
  ready 后，每次进程启动只执行一轮 startup compensation；`off` 不扫描、不投递；
- 该轮只遍历当前上海交易日、当前 listener/candle manifest 可达的 sealed/discarded 终态，并按
  7.1 的 contract 和确定性 jobId 调用 `queue.add()`；不扫描前序交易日，不创建定时 reconciler；
- completed 与 failed job 必须至少保留到其上海交易日的 startup-compensation 窗口结束。这样同日
  重启重扫时，成功或失败 job 的现存 jobId 都能阻止再次创建；failed job 保持 failed，不因启动
  补偿自动 retry；
- startup compensation 本身只执行一次。扫描、读取或 enqueue 任一步失败时，记录本轮 failed
  outcome 后结束，不在当前进程生命周期内循环、退避或定时重跑；
- 不增加 per-candle `enqueued` marker、Redis/MySQL outbox 或 candle/queue 两阶段提交；
- 该机制只降低同日 commit-to-enqueue crash window 的漏投和重复概率。health、metrics、文档和
  验收不得把它描述成 exactly-once、完整 reconciliation、candle/queue 强一致或 delivery 保证；
- 如果 enqueue 失败后进程未重启、补偿本身失败，或停机跨过交易日，漏掉的 realtime trigger
  保持漏失，不进行历史补发。

#### 7.3 V1 接受自然积压，不实现 backlog cap 或 batch

基于当前单机部署和少量 listener，V1 不设置 `REALTIME_STRATEGY_QUEUE_MAX_BACKLOG`、Redis
`maxmemory` 数值上限或 market/queue 用途配额，也不在 producer 侧执行 count-before-add、admission
lock、达到阈值丢弃或 BullMQ rate limit：

- live handoff 和 startup compensation 都保持一个 1m finalization 一个独立 `candle_finalized` job；
- startup compensation 不使用 `Queue.addBulk()`，也不建立一个 job 携带多根 K 的 batch contract；
- waiting job 允许在 worker 变慢或停止时自然积压，producer 不因 backlog 数量停止添加；
- completed/failed 仍按 7.2 的当日补偿语义保留；不得用过小的 count 提前删除当日 job 并继续
  宣称同日补偿可以依赖 jobId 去重；
- monitoring 必须分别暴露 market key/record count、waiting/active/completed/failed、Redis used memory、
  AOF 增长和 drain throughput，并验证 Redis `maxmemory-policy=noeviction`；但不自动限流、批处理、
  清队列或删除 waiting job；
- 这是项目负责人明确接受的 V1 容量风险，也是对常规 queue hard-limit 治理的显式例外。worker
  长期不可用时 waiting 可以跨日增长并最终挤压与 market state 共享的 Redis；出现该证据时先把
  realtime strategy mode 切回 `off` 停止新增 trigger，再以独立 OpenSpec 评审 backlog cap、
  batch、清理或物理拆分，不能在运行代码中临时加阈值；
- shadow/HIL 必须记录实际 listener 数、每日 job 数、峰值 waiting、Redis memory/AOF 与 drain
  throughput；没有容量证据不得把“当前未设置上限”描述成已证明无限安全。

#### 7.4 跨日 waiting job 过期

自然积压不表示旧 realtime 告警可以隔日补发。worker 在解析并验证 V1 contract 后、读取 Redis
candle 之前，使用注入的 Clock 将 `triggerTime` 与当前时间分别转换为 Asia/Shanghai 日历日：

- 二者日历日相同时继续正常处理；即使已经收盘，只要仍是同一上海日历日也不视为过期；
- `triggerTime` 的上海日历日早于当前上海日历日时，返回稳定 queue outcome
  `expired_trading_day`，让该 BullMQ job 正常完成；
- expired job 不调用 `resolveRealtimeObservation()`、不修改共享 window/episode、不运行
  Indicator/quantity projector/evaluator，也不创建 Signal 或 AlertEvent；
- `expired_trading_day` 是 handoff/queue outcome，不加入 V1 strategy evaluation unavailable reason；
- monitoring 只按该 bounded outcome 聚合，securityId、source、triggerTime 等高基数信息只进入一次
  diagnostics/log；
- 本项不增加 midnight cleanup、waiting-job deletion timer 或历史 replay。旧 job 仍由 worker
  逐个消费并以 expired 完成。

#### 7.5 Job failure 与 stalled 均不自动重试

V1 继续选择 best-effort 和减少重复，而不是 BullMQ 默认的 stalled recovery：

- producer 必须显式设置 `attempts: 1`，不配置 fixed/exponential backoff；
- worker 必须显式设置 `maxStalledCount: 0`。首次 worker crash、event-loop starvation 或 lock loss
  造成 stalled 时，job 直接进入 failed，不重新回到 waiting 执行；
- Redis/MySQL adapter、Strategy-owned Indicator calculation、evaluator 或 persistence 抛出的非目标异常继续按后端错误
  治理传播到 processor 边界，由 BullMQ 将 job 标记 failed；worker 不 catch-and-success，也不包装
  成 evaluation unavailable；
- failed job 按当日 compensation retention 保留。startup compensation 使用相同 jobId，不能把它
  重新创建或自动 retry；
- V1 不增加 dead-letter queue、自动 repair、手动 retry HTTP/RPC API 或定时 retry；
- worker 必须监听 failed 与 stalled events，分别记录 bounded outcome 和一次权威日志；job payload
  高基数身份只进入 diagnostics；
- 正常停止由 Nest/BullMQ 标准 lifecycle 关闭并等待已注册 Worker；实现只需验证 provider 被框架
  正确销毁，不增加 Signal 专属 shutdown coordinator、draining 状态或 deadline 配置；
- 如果 worker 在任何业务写入前退出，trigger 可以漏失；如果在事务提交后、BullMQ completion ack
  前退出，job 仍可显示 failed。V1 接受这些不一致窗口，不宣称 exactly-once 或 complete delivery。

#### 7.6 Queue namespace 与 24 小时结果 retention

V1 使用以下 code constants，而不是环境变量：

```text
BullMQ prefix = mist-bullmq
queue name    = strategy-trigger
job name      = candle_finalized
```

BullMQ Queue 与 Worker 必须使用完全相同的 prefix/queue constants；market Redis adapter 不得使用
该 prefix。jobId 的唯一性作用域固定在 `strategy-trigger` queue 内。

结果 retention 固定为：

```ts
removeOnComplete: { age: 86_400 }
removeOnFail: { age: 86_400 }
```

- `age` 单位为秒，从 job 完成或失败开始计算；不设置 count；
- 24 小时覆盖任一 A 股 1m job 从当日产生到上海零点的剩余时间，因此同日 startup compensation
  仍可依赖 retained jobId；
- BullMQ age removal 是惰性的，过期 job 可以在后续 completed/failed outcome 到来前继续保留；
  这是允许的，不增加零点 cleanup、scheduler 或额外配置；
- expired job 作为 completed 同样使用 24 小时 retention；
- waiting/active 不适用 completed/failed removal policy；跨日 waiting 按 7.4 由 worker 消费并
  完成，不由 retention 删除；
- 禁止 `removeOnComplete: true`、`removeOnFail: true` 或低 count 提前清掉同日 job，否则 startup
  compensation 无法区分已处理与从未入队。

#### 7.7 Job deadline 使用底层真实 timeout，超时即失败

V1 不为 Redis、MySQL、analysis 和 persistence 分别建立一套策略专属 timeout 配置，而是由
shared config 提供 `REALTIME_STRATEGY_JOB_TIMEOUT_MS=30000`。底层 shared infrastructure
budget 固定为 Redis connect 5 秒、Redis command 3 秒、MySQL connect 5 秒、historical SELECT
5 秒和 InnoDB lock wait 3 秒；这些底层预算不再增加策略专属 env。processor 通过注入 Clock 在
job 开始时计算 `deadlineAt`，并在交易日校验、Redis observation、historical hydration、
analysis/evaluation 和 persistence 各阶段开始前后检查剩余预算：

- deadline 到达后不得启动下一阶段，直接向 BullMQ processor 边界抛出共享 task-deadline
  exception；该异常不是 strategy evaluation `unavailable`；
- market Redis adapter 继续使用独立于 BullMQ blocking connection 的 ioredis client，并使用
  client 原生 `connectTimeout`、`commandTimeout`、关闭 offline queue 和有界
  `maxRetriesPerRequest`；Redis timeout 后不得 fallback 到 MySQL 或重新读取；
- historical K 的只读 SELECT 必须使用 MySQL 服务端实际终止 statement 的 query deadline，例如
  `MAX_EXECUTION_TIME(min(5000, remainingMs))` 或经验证等价机制。当前 TypeORM 版本的
  slow-query logging 不能冒充 query cancellation；
- Signal/AlertEvent 固定短事务只允许在 deadline 尚未到达时开始，并必须使用 shared MySQL 的有限
  5 秒 connection timeout 与 3 秒 InnoDB lock-wait deadline。事务异常继续由 TypeORM rollback
  后抛到 processor；timeout 后不得在提交状态未知时自动重复写入；
- 不允许用 `Promise.race` 或只 reject 外层 Promise 的 timer 宣称已取消仍在运行的 TypeORM、
  mysql2 或 Redis operation；
- Indicator、quantity projector 和 evaluator 的同步计算依靠已确认的 bounded window、有限 execution plan 和
  算法测试保证终止。V1 不为同步计算引入 worker-thread kill、child-process kill 或无法真实中断的
  软 timeout；
- 任一 deadline/connection/command/query/lock-wait timeout 都让当前 job failed。结合
  `attempts=1` 和 `maxStalledCount=0`，它不会自动 retry、不会转为 success/unavailable，也不会产生
  timeout 后续阶段的新写入；
- worker boundary 只记录一次权威日志和 bounded timeout category；securityId、source、triggerTime
  等身份只进入 diagnostics，不进入 metric label。failed job 继续服从 24 小时 retention；
- 正常进程关闭继续使用框架与容器的通用 lifecycle；本 change 不把容器停止宽限期扩展成策略业务
  deadline、取消协议或新的配置面。

这些预算是 ceiling，而不是对无法取消操作的强杀承诺：每个阶段开始前和返回后都检查整轮
deadline，已经开始的底层 I/O 由自身真实 timeout 收口。shadow/HIL 必须记录实际耗时分布；如需
调整任一数值，必须修改 shared config/contract 并重新验证，不能在 adapter 内临时覆写。

#### 7.8 Legacy manual live scan 直接退役

当前 `POST /v1/strategy-scans/run` 会在公共 API 进程查询最新 K、执行策略并写 live Signal/AlertEvent。
该能力与“人工执行只属于回测、live Signal 只由 realtime trigger 产生”的边界冲突，因此不迁移：

- 删除 `StrategyScanController`、`StrategyScanService`、`RunStrategyScanDto`、旧 scan result type、
  Nest registration、API/OpenAPI contract 和相关 tests；同步移除 `apps/schedule` 对这些 provider 或
  controller 的遗留注册，使所有 Nest project 继续可构建；
- 不创建 `signal.scan.run.v1`、`RunStrategyScanCommandV1`、`StrategyScanSummaryV1/Vo`、
  `StrategyScanErrorCodeV1`、manual run table、manual BullMQ job、admission slot、busy/timeout error、
  `STRATEGY_SCAN_COMMAND_TIMEOUT_MS`、gateway headroom 或 manual-specific monitoring；
- `apps/signal` TCP microservice 只承载 `signal.registry.refresh.v1` 等控制面 command；registry refresh
  只重载 definition aggregate，不读取 K、不运行 evaluator、不写 Signal/AlertEvent；
- operator 人工执行统一调用 `POST /v1/strategy-backtests`，按 `extract-backtest-runtime` 登记和提交
  BacktestRun。Backtest 结果只写 `BacktestSignalResult`，不得进入 live episode、Signal 或 AlertEvent；
- `mist-fe` 当前 manual-scan client、button、summary display 和 tests 必须由独立 frontend 项目删除。
  backend route 与 frontend consumer 是 breaking contract 的同一发布集合，不得新旧错配；
- Signal 查询和 AlertEvent 查询/确认入口继续保留，因为它们展示和处理 realtime 已持久化结果；
  删除 manual producer 不代表删除 live result consumers。

### 8. Windows 启动顺序保持 market 与 strategy 解耦

Windows appliance 延续现有“基础设施 → migration → 应用 → gateway → monitoring”编排，只把
`signal` 加入应用批次，不建立 backend 与 Signal 的启动依赖：

```text
datasource containers
  → MySQL healthy
  → realtime Redis healthy
  → backup + migration success
  → signal + mist-backend + chan-api + mist-fe
  → recreate web-gateway
  → monitoring + Prometheus + Grafana
  → final health checks and diagnostics
```

- datasource containers 保持现有最先启动的顺序；Signal 不直接连接它们，因此 Compose 不声明
  datasource dependency；
- `signal.depends_on` 只包含 MySQL 与 realtime Redis 的 `service_healthy`。migration 仍由部署
  PowerShell 在应用批次前显式运行并检查退出码，不把 `mist-migrate` 变成长驻依赖，也不增加
  `service_completed_successfully`；
- `signal`、`mist-backend`、`chan-api` 与 `mist-fe` 在同一次 Compose app batch 启动。backend 不
  `depends_on: signal`，Signal 也不依赖 backend；producer 可在 Worker ready 前提交 BullMQ job，
  waiting job 由 Redis 保留，market sealing 不等待 Worker；
- Signal bootstrap 或 health 失败不得触发 backend rollback，也不得停止 realtime ingress/candle
  sealing。部署过程仍在最终 health/diagnostics 阶段判定本次整体验收失败，并保留 Signal failure
  evidence；
- `web-gateway` 不依赖 Signal，也不增加 Signal route；
- monitoring 在应用批次之后启动，但 Compose 不以 `signal: service_healthy` 作为 monitoring 的启动
  前置，否则 Signal 失败时 monitoring 无法报告故障。monitoring 必须把 Signal unavailable/degraded
  作为独立结果；
- Signal 使用 `restart: unless-stopped`，与现有长驻应用一致。最终部署 health/diagnostics 必须显式
  检查 `http://signal:8010/health` 的 root contract 与 nested capability，不能只以容器 running 代替
  Signal 验收。

## Risks / Trade-offs

- [native historical 标签与 realtime bucket 标签未证明一致] → 保持单一 timestamp、不预设偏移，
  以 TDX/QMT 各周期首尾标签矩阵 HIL 阻止 `on`。
- [historical 与 realtime 或 TDX/QMT 量额单位不同导致错误阈值] → `StrategyBar` 固定股/元，Redis 由
  candle adapter 归一、MySQL 由共享 persistence mapper 归一；固定 artifact 的 quantity profile 与
  historical seam HIL 未通过前量额 plan ineligible 且 realtime 不切 `on`。
- [上一日 Redis 已日切但 MySQL 历史尚缺失] → 按 execution plan demand 返回
  `insufficient_history`；不延长/恢复 Redis TTL，也不跨日 fallback。
- [下一交易日 MySQL 历史仍缺上一日] → 不读取旧 Redis 补洞；按 execution plan demand 判断
  `insufficient_history`，后续实际有效 K 可自然补足数量。
- [固定容量值脱离实际监听规模] → 不预设独立 bar cap 或 aggregate budget，按 active listener group
  和内部最大 context demand 分配；shadow 必须证明稳定 group 下无持续无界增长、consumer/day
  cleanup 可释放且进程不因内存压力重启，否则阻止 `on` 并另开 capacity change。
- [reader 自行包装或吞掉基础设施错误] → 直接继承后端错误治理指南；低层原样传播，worker
  边界统一记录和隔离，成功空结果留给 context 语义。
- [trigger 至少一次产生重复] → 在共享窗口入口按 canonical identity/content 幂等；冲突版本
  fail closed，数据库 unique 仅承担后续 persistence 身份，不替代 market-data 去重。
- [同日 startup scan 把已完成 job 当成漏投] → completed/failed job 保留到当日补偿窗口结束；
  补偿仍是 best-effort，不承诺 job 永不重复或 trigger 永不漏失。
- [worker 重启 continuity 丢失] → active set 从空开始；bounded warmup 后的下一次 true 允许重新
  candidate，不从数据库或旧内存伪造 episode continuity；同日重复提醒是 V1 明示的
  at-least-once trade-off。
- [queue 积压最终挤压共享 Redis] → V1 显式接受无 backlog cap，以 job-state、Redis memory/AOF 和
  drain throughput 观测；出现压力先切 strategy off，再通过独立 change 设计容量或 batch，不回滚
  candle。
- [隔日补发旧 realtime 告警误导用户] → worker 在任何 market-data read/evaluation 前按上海日历日
  过期旧 job，并以 `expired_trading_day` 正常完成。
- [BullMQ 默认 stalled recovery 重复执行] → `attempts=1` 且 `maxStalledCount=0`，普通失败和首次
  stalled 都直接 failed；相应代价是 crash-before-write 时允许 trigger 漏失。
- [结果 job 立即清理导致同日补偿重复投递] → completed/failed 固定保留 24 小时且不设 count；
  接受 BullMQ 惰性清理造成的额外保留，不增加定时 cleanup。

## Migration Plan

1. 确认 service boundary、candle 自动化/严格契约/真实 fixture shadow 基础和 strategy contract
   足以支撑开发；未完成的交易时段 candle HIL 与 timestamp/quantity/capacity 证据保留为 `on`
   promotion 门禁，不阻塞 `off|shadow` 实现。
2. 删除 legacy manual live-scan backend route/service/types/registration/tests；由独立前端项目同步删除
   对应 action/client/types/tests，并把人工执行统一到 Backtest workflow。
3. 逐项评审并实现 StrategyMarketDataPort realtime capability，保持 runtime off。
4. 评审 trigger transport 和 failure recovery，再部署基础设施。
5. 以 shadow 运行并证明策略表零写入。
6. 评审 episode/persistence evidence 后才启用 on。
7. V1 不新增 Signal 专属 rollback 流程或自动化；`REALTIME_STRATEGY_MODE=off` 只是已定义的运行模式
   开关，既有 appliance 通用回滚保持原样。若后续需要 Signal binary/schema rollback，再创建独立
   change 评审兼容版本组。
