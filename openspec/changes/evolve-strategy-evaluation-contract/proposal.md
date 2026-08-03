## Why

当前策略 context 只有单根 K，rule evaluator 不支持可靠 lookback、指标 context、显式 evaluability
或有效 crossover。实时与历史计算需要先共享同一套经过验证的策略契约，不能在 realtime worker
中复制第二套规则引擎。

## What Changes

- 单一持有 runtime-neutral canonical `StrategyBar`、`StrategyMarketDataPort` 及 replay/realtime
  criteria/result domain types。公共 contract 同时声明 `readReplayPage()`、`loadRealtimeWindow()` 和
  `resolveRealtimeObservation()`，但不包含 TypeORM、Redis、HTTP/OpenAPI/RPC 或 app-specific source；
  Backtest 和 Signal changes 只实现各自 adapter，不互相依赖或重定义这些类型。
- 定义共享 field catalog、类型系统、内部推导的 bounded `requiredBarCount`、
  `unavailable | evaluated(matched)` 两阶段 evaluation 和 current/prior context 语义。HTTP DTO、
  rule JSON 和数据库均不新增用户 `lookbackBars`。
- field catalog 为每个字段声明代码固定的 `calculationBarCount`，compiler 再按 operator 推导
  `requiredBarCount`：普通比较取字段计算窗口，crossover 额外需要一个 prior observation，组合规则取
  子节点最大值。首批直接 K 字段固定为 `k.open/high/low/close/volume/amount/type`，指标字段固定为
  `indicator.kdj.k/d/j` 和 `indicator.macd.line/signal/histogram`。KDJ(9,3,3)=13、
  MACD(12,26,9)=130；MACD crossover 因两个相邻
  130-bar rolling windows 需要 131 根。该窗口不是用户配置，也不引入 indicator checkpoint、状态表或
  无限历史 replay；其他 Indicator 字段必须逐项证明有限窗口后才能进入 catalog。V1 明确不开放
  `chan.*`，Chan kernel 抽取继续由独立 change 持有。
- `k.volume/k.amount` 的普通当前值比较同样只需 1 根。原始 `StrategyBar` 保留规范字符串或
  `null`；共享 `QuantityForwardFillProjector` 在 `(securityId, source, period, tradingDay)` 内对
  volume/amount 分别向前填充后再构建 evaluation context。新交易日必须清空前值，日线因每根 K
  属于不同 tradingDay，不得从前一日线继承；无同日前值才返回 `field_unavailable`。不读取更晚的
  future bar、不虚构缺失 K，不覆盖 MySQL/Redis/raw `StrategyBar`。
- live Signal 与 Backtest result 复用同一个 `contextSnapshot` serializer。`k.volume/k.amount` 继续保存
  evaluator 实际使用的 canonical scalar；当 compiled execution plan 消费量额时，额外保存
  `quantityEvidence.current/previous.{volume|amount}` 的 `raw/effective/resolution`，其中 resolution 只允许
  `observed|forwardFilled`。证据按 plan 所需 observation 统一 materialize，不随 `all/any` 短路变化；
  `unavailable` 不落 snapshot，也不产生结果。不复制完整 raw K，不新增列、表或 migration。
- 固定 rule tree 的版本化资源边界：root depth 记为 1、最大 depth 为 8、整棵树最多 64 个
  condition；group 与 condition 使用 exact-key shape。该限制由共享 validator/compiler 持有，不做
  runtime config，也不依赖 HTTP body size。
- field catalog 暴露枚举 `k.type='complete'|'incomplete'`，只允许 `eq/ne`；未显式引用该字段的
  策略不得自动排除 incomplete bar。
- 策略版本继续只持有一棵 immutable `rule`，并增加必填 `signalKind='entry'|'exit'`；不引入
  `entryRule`/`exitRule`、可空 exit rule 或定义间配对关系。需要 entry 与 exit 两种提醒时创建两个
  独立策略定义。
- 策略定义改为 creation-only：创建时一次提交 metadata、rule 与 signal kind，并原子生成唯一的
  version 1；删除现有 `PATCH /v1/strategies/:id`、`UpdateStrategyDefinitionDto`、service update 和
  对应前端编辑调用。内容变化必须创建新定义；enable/disable 仍是独立生命周期动作。
- live `StrategySignal` 的目标身份字段固定使用 non-null `securityId` 与 `signalKind`，不保留
  `securityCode` 兼容列或双写；本 change 持有相应 production schema audit、forward-only migration
  与 repair-forward。realtime change 只复用既有 AlertEvent `dedupe_key` named unique，不争夺 migration
  所有权。
- 让 create/load/enable、signal-level backtest 和未来 realtime registration 共用 validator、
  context builder 和 pure evaluator；legacy manual live scan 不作为第三种运行模式。
- `k.volume/k.amount` 及对应阈值在 rule、wire、persistence 和 context snapshot 边界使用规范十进制
  字符串；V1 字段单位固定为 `k.volume=股`、`k.amount=人民币元`，不随 source 改变。strategy create
  可以把合法无符号 fixed-point string（例如 `"001.2300"`）一次性规范化为 canonical `"1.23"`，但
  numeric JSON、sign、whitespace 和 exponent 继续拒绝，load/enable/realtime registration 只接受已
  canonical 的 stored rule。validator/evaluator 复用 candle change 持有的共享 `Decimal8(bigint)`
  完成解析和比较，禁止策略侧第二套 decimal 实现。普通 OHLC 和 indicator 数值保持 finite
  number。V1 量额规则只对已证明 unit profile 的 A 股 `SecurityType.STOCK` eligible；指数或其他未
  批准证券类型不能借用股票换算因子。
- 任何 schema 修改、migration、兼容策略、存量 rule 处置和前端契约必须先完成只读生产审计并
  与项目负责人逐项确认；未确认前不得写 migration 或实现兼容层。
- 本 change 不实现实时 queue/window、Signal 实时触发、notification 或 portfolio simulation。

## Capabilities

### New Capabilities

- `strategy-evaluation-contract`: 定义 backtest 与 realtime 共用的 typed context、validator 和 evaluator。

### Modified Capabilities

- `strategy-definition-registry`: 增加经评审确认后的字段目录、编译后 `requiredBarCount`、单一 rule、
  必填 signal kind 和 realtime eligibility。
- `strategy-signal-alerts`: 统一 evaluability、matched、版本声明的 signal candidate 和共享 evaluator
  语义。
- `strategy-signal-backtesting`: 使用与 live 相同的 bounded context 和 evaluator，不扩大为 portfolio simulation。
- `strategy-operator-ux`: 仅在公共策略契约确认后同步编辑器输入和 decimal-string 保真。

## Impact

- **`mist`**：strategy entities/DTO/services、canonical market-data domain contract、shared
  evaluator/context/backtest contracts/tests，并删除
  strategy PATCH controller/DTO/service/test 链路；
  backtest runtime extraction 由 `extract-backtest-runtime` 持有，是否修改 schema 取决于单独评审结论。
- **`mist-fe`**：由独立前端交付删除 update client/type、编辑既有策略 action 和 tests；创建表单继续
  提交完整 definition。后端 PATCH 删除与前端 consumer 删除属于同一个 breaking release gate。
- **数据库**：`StrategyVersion.signalKind` 以及 `StrategySignal.securityId/signalKind` 目标契约和
  单一 migration owner 已确认；实际编号、DDL、外键、存量 version/row 映射与 repair-forward 仍须在
  production preflight 后逐项授权。项目当前预期没有 strategy 存量；实施前必须用只读查询证明相关
  definition/version/signal/backtest 表为零，才能采用无回填 migration，发现任意存量立即停止。既有
  `uq_strategy_alert_events_dedupe_key` 保留，不新增 Signal composite unique，也不新增
  `lookback_bars` 列。
- **不包含**：portfolio engine、实时 queue、部署 topology、notification worker。
