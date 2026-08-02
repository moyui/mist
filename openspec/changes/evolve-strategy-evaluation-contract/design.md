## Context

当前 StrategyRuleEvaluator 只返回 boolean，context builder 只从单根 K 构建上下文，
`crossesAbove/crossesBelow` 未实现，decimal comparison 会转成 `Number`。现有 legacy manual scan
和 signal-level backtest 已共享 evaluator，但 manual live scan 将被删除；新的公共契约只服务
backtest 与 realtime，且必须承载 lookback、指标和 realtime continuity。V1 不开放 `chan.*` 策略字段。

## Goals / Non-Goals

**Goals:**

- 建立唯一 typed field catalog、validator、context builder 与 pure evaluator。
- 让 backtest 和 realtime 对相同有序输入产生相同 evaluation。
- 以显式 `unavailable | evaluated(matched)` 分开表达能否计算与规则是否命中。
- 在修改 schema 前完成生产存量审计和用户逐字段确认。

**Non-Goals:**

- 不实现 realtime trigger、window owner、queue 或 notification。
- 不实现 portfolio cash/order/position/NAV。
- 不自动转换旧 rule、数字 decimal threshold 或未知字段。

## Decisions

### 1. Evaluation contract 独立于运行方式

evaluator 只消费 bounded immutable context，不知道 MySQL、Redis、HTTP、backtest 或 realtime。
运行方式只负责准备 context 和处理 result。

#### 1.1 公共 market-data domain contract 由本 change 单一持有

本 change 在共享 strategy domain library 定义 canonical `StrategyBar`、`StrategyMarketDataPort` 与
以下内部 domain types：

- `StrategyReplayPageCriteria -> StrategyReplayPage`；
- `StrategyRealtimeWindowCriteria -> StrategyRealtimeWindow`；
- `StrategyTrigger -> StrategyMarketObservation`。

port 同时声明 `readReplayPage()`、`loadRealtimeWindow()` 和 `resolveRealtimeObservation()`，只为保证
identity、排序、timestamp、decimal quantity、complete/incomplete 语义在 Backtest 与 Signal 中一致。
这些不是公共统一 K API，也不是 HTTP/OpenAPI DTO/VO 或 RPC payload。内部 selection 使用
`*Criteria`，结果按 `*Page`、`*Window`、`*Observation` 命名。

公共 contract 不导入 TypeORM entity/repository、Redis client/key、Nest controller/provider、HTTP/RPC
envelope 或 `apps/*` 源码。`extract-backtest-runtime` 只实现 MySQL `readReplayPage()` adapter；
`run-realtime-strategy-evaluation` 只实现 realtime MySQL/Redis/memory window 与 observation adapters。
两个 runtime change 在本 change 验收后可独立推进，不互相成为前置，也不得复制另一份
`StrategyBar` 或 port interface。

canonical `StrategyBar` 至少表达 provider-neutral security identity、精确 source、period、单一
`timestamp`、OHLC、canonical decimal-string/null volume/amount 和必填
`type: 'complete' | 'incomplete'`。source adapter 的单位归一和 persistence mapping 属于 runtime
adapter，不进入公共 contract implementation。

### 2. Field catalog 是唯一类型来源

字段必须声明 path、value type、当前值计算所需的有限 `calculationBarCount`、允许 operator 和
missing-value policy。`k.volume/k.amount` 使用 decimal；普通市场和 indicator 数值使用 finite
number。原始 `StrategyBar` 继续保留 string/null 事实，不改写 provider/candle/persistence 证据。

V1 的 `k.volume/k.amount` missing policy 是 `forwardFillWithinTradingDay`。共享策略库提供显式调用的
`QuantityForwardFillProjector`，而不是 HTTP/Nest interceptor：backtest 和 realtime 必须在构建
evaluation context 前使用同一实现。projector 以 `(securityId, source, period, tradingDay)` 分组，
volume/amount 分别维护最近有效值；当前非 null 更新状态，当前 null 使用同日最近值，无同日前值
则保持 null。交易日变化时必须在处理新日首根 bar 前清空状态；不读取更晚的 future bar，不为缺失时间槽虚构 K，
不修改 raw `StrategyBar`、Redis 或 MySQL。日线每根 K 属于不同 tradingDay，因此日线 null 始终不从
前一交易日继承，停牌日无 K 时也不创建 evaluation anchor。

持久化 `contextSnapshot` 使用一套共享 serializer，并把“参与计算的值”与“该值如何得到”分层保存：

```json
{
  "k": {
    "type": "complete",
    "volume": "100"
  },
  "quantityEvidence": {
    "current": {
      "volume": {
        "raw": null,
        "effective": "100",
        "resolution": "forwardFilled"
      }
    }
  }
}
```

`k.volume/k.amount` 保持 evaluator 实际使用的 canonical decimal string 标量，不能为增加 provenance
改成 object。`quantityEvidence.current` 只包含 compiled execution plan 需要的 quantity observation；
operator 需要 prior observation 时才增加同形 `quantityEvidence.previous`。如果 plan 不消费量额，整个
`quantityEvidence` 省略。证据集合按 compiled plan 预先确定并在 boolean evaluation 前 materialize，
不得因 `all/any` 的 runtime 短路顺序而变化，也不按 condition 重复保存同一 current/prior observation。

每个 evidence item 的 `raw` 是对应 raw `StrategyBar` 的 canonical decimal string 或 null；
`effective` 是实际参与计算的 non-null canonical decimal string；`resolution` 只有 `observed` 或
`forwardFilled`。`observed` 要求 `raw` 非 null 且等于 `effective`；`forwardFilled` 要求 `raw=null`，
effective 来自同 trading day 更早 observation。`unavailable` 只是 projector/evaluator 的进程内状态，
不能进入持久化 vocabulary：它不会产生 live Signal 或 Backtest result，因此也不存在该次
`contextSnapshot`。`k.type` 仍只表达 bar 的 `complete|incomplete`，不得用于表达量额填充；V1 不增加
`evaluationQuality`，不复制完整 raw K，也不增加数据库列、表或 migration。live 与 backtest 必须调用
同一个 serializer，保证相同 strategy version 与有序 context 产生同形证据。

`k.volume` 的领域单位固定为“股”，`k.amount` 固定为“人民币元”。单位属于 field catalog 与
canonical `StrategyBar` 契约，不属于 strategy definition、rule threshold 或每条 context 的可变
metadata；因此同一个阈值在 TDX/QMT 上含义一致，`source` 只保留 provenance/identity。provider-native
历史或实时值必须在进入 `StrategyBar` 前由 owning market-data adapter 归一，evaluator 不执行单位
换算，也不按 source 改写 threshold。

V1 只批准 A 股 `SecurityType.STOCK` 的量额单位 profile。创建的 definition 可以继续包含不读取量额
的价格或 Indicator 规则；但任何引用 `k.volume/k.amount` 的 execution plan 在目标包含
`INDEX`、非 A 股证券或 unit profile 尚未通过 HIL 时，必须在 validation/load/enable/realtime
registration 的相应边界拒绝或标记 ineligible，不能持续返回 `field_unavailable`，也不能套用
`1 手=100 股` 的股票假设。

decimal field 的 rule threshold、canonical bar、immutable context/contextSnapshot 和持久化值始终是
规范十进制字符串或 `null`。validator/compiler 只接受 string threshold，并使用
`complete-current-day-realtime-candles` 持有的共享 `Decimal8` 把当前值和阈值编译为 scale=8 的内部
`bigint`；evaluator 用 Decimal8 compare，不经过 `Number(actual)`/`Number(expected)`。compiled value
不得进入 rule snapshot 或其他序列化边界，任何输出先 format 回 canonical string。

create DTO 的 string threshold 是唯一允许的宽松入口：它只接受 ASCII 无符号整数及可选一到
8 位小数，并在 regex、scale 校验和 bigint 构造前先拒绝超过 37 个 ASCII 字符的原始文本；该上限
来自 `DECIMAL(36,8)` 的最长紧凑形式，不依赖 HTTP 整包上限。随后检查原始 scale，再去除前导/
尾随零、确认规范化后整数不超过 28 位并持久化唯一 canonical value。`"001.2300"` 保存为
`"1.23"`，`"0.00000000"` 保存为 `"0"`；number、whitespace、sign、exponent、`.5`、`1.`、locale
separator、Unicode digit 和仅靠无限前导零延长的输入明确拒绝。后续 load、enable、backtest/realtime
compilation 不再重复宽松规范化，发现 stored rule 不是 canonical 时 fail closed；零存量假设意味着不
增加旧 rule rewrite。

Decimal8 可以在进程内表达 signed math，但 `k.volume/k.amount` 的 actual value 和 threshold 都是非负
领域值，负值与 negative zero 均拒绝。该限制属于 field catalog/validator，不把 Decimal8 错误收窄为
只能处理无符号数学值。

strategy change 不复制 parser/comparator，也不增加 decimal dependency。禁止 `String(number)`、
`BigInt(number)`、raw bigint JSON 或隐式 number/bigint 混算。V1 decimal rule 只需要比较，不增加
乘除、比例或舍入；provider adapter 的精确整数单位缩放由 candle foundation 持有，不进入 evaluator
operation set。未来策略计算需要这些操作时必须在 owning change 中先定义 scale/rounding。

`lookbackBars` 不属于公共策略输入，也不进入 rule JSON、HTTP DTO、Entity 或独立数据库列。validator
将合法 rule 编译成内部 immutable execution plan，并按以下规则推导 `requiredBarCount`：

- 普通比较使用 field catalog entry 的 `calculationBarCount`；
- `crossesAbove/crossesBelow` 使用 `calculationBarCount + 1`，以同时形成当前与前一个相邻 rolling
  observation；
- `all/any` group 取所有子条件需求的最大值，不相加；
- 每个 immutable strategy version 的单一 rule 只编译一个 execution plan；plan 同时携带该 version
  必填的 `signalKind` 与自身推导出的 `requiredBarCount`；
- backtest 与 realtime 只消费已编译值，不接受调用方覆盖。

`calculationBarCount` 是 field catalog 随代码发布的版本化算法语义，不是 env、数据库列、strategy
参数或调用方 warmup 提示。首批 catalog 只包含：

| path | type | calculationBarCount | operators |
|---|---|---:|---|
| `k.open/high/low/close` | finite number | 1 | `gt/gte/lt/lte/eq/ne/crossesAbove/crossesBelow` |
| `k.volume/amount` | decimal string/null | 1 | `gt/gte/lt/lte/eq/ne/crossesAbove/crossesBelow` |
| `k.type` | `complete/incomplete` | 1 | `eq/ne` |
| `indicator.kdj.k/d/j` | finite number, KDJ(9,3,3) | 13 | `gt/gte/lt/lte/crossesAbove/crossesBelow` |
| `indicator.macd.line/signal/histogram` | finite number, MACD(12,26,9) | 130 | `gt/gte/lt/lte/crossesAbove/crossesBelow` |

Indicator 不开放 `eq/ne`，避免把浮点精确相等当作稳定业务语义。`k.type` 只有两个取值，`eq/ne`
已完整表达 V1 需求，不增加 `in` 的 array threshold 分支。旧实现中的 `neq` 不是兼容别名，新契约统一
使用 `ne`。`crossesAbove X` 固定为 prior `<= X` 且 current `> X`；`crossesBelow X` 固定为
prior `>= X` 且 current `< X`。

这里的 MACD 130 是明确的
有限窗口定义：anchor `t` 的当前值只以 `K[t-129...t]` 重算；crossover 的前值只以
`K[t-130...t-1]` 重算，因此合计需求为 131，不能用一个 131-bar seed 只算一次后截取两个值。

MACD/KDJ strategy calculation 每次只消费上述精确有序窗口，不持有跨调用 EMA/KDJ checkpoint，
不新增状态表，也不以进程从更早历史累计得到的隐式状态改变重启结果。130 的取值是当前 slow period
26 的五倍 warmup；它定义“最近 130 根上的 windowed MACD”，不宣称等同于从无限历史连续演算的
MACD。realtime 与 backtest 必须在同一 anchor 使用相同窗口定义，多个策略只共享一次同版本计算。

后续 RSI 或其他 Indicator 必须逐字段评审固定参数、`calculationBarCount`、数值容差和输出路径，不能
自动继承 MACD 的 130。V1 不开放任何 `chan.*` field；现有 Phase B 的 latest/count 无法证明固定
raw-K 上限，任意固定窗口都只能定义新的 window-local Chan 产品语义。后续接入必须由独立 change 重新
评审，不得从 kernel output 自动暴露。

`k.volume/k.amount` 的普通当前值比较仍使用 `calculationBarCount=1`。该值指的是 projector 生成的
effective current value；同日 day-start replay 是 missing policy 的投影准备，不是用户 lookback，也不改写 plan 的
`requiredBarCount`。projector 只维护进程内当日最近值，新交易日清空；当日首段连续 null 在首个非 null 出现前
仍为 `field_unavailable`。如果 operator 需要 prior observation，compiler 仍按通用规则增加一根，current/prior 均使用各自
anchor 经过 projector 的 effective value。

rule tree 自身使用固定版本化资源边界：root expression depth 记为 1，最大 depth 为 8，整棵树最多
64 个 condition。validator 在尝试进入第 9 层或观察到第 65 个 condition 时立即停止并拒绝，不能先
完整遍历再报告。group object 必须只有一个 key，即非空的 `all` 或 `any`；condition object 必须恰好
包含 `field/operator/value`。单 child group 和重复 condition 保持合法，不做隐式简化、去重或语义
重写；同时包含 group/condition 字段、`lookbackBars`、metadata 或其他 unknown key 的节点均拒绝。

depth/condition limit 是 shared strategy contract 的代码常量，不进入 `ConfigService` 或环境变量；
否则 `apps/mist`、`apps/backtest` 与 `apps/signal` 会对同一 immutable rule 产生不同 eligibility。exact
node shape、typed catalog value、depth 8 和 64 conditions 已经形成结构硬上限，因此 V1 不再增加
rule JSON bytes、group count 或 per-group child count 参数；HTTP body size 只保留为独立 transport
防线。create 请求违反边界属于请求契约错误并使用真实 HTTP 400。持久化 rule 违反边界则是 Mist-owned
数据不变量错误：不得裁剪、改写或转为 evaluation unavailable；Signal initial load 不发布部分
generation，单 definition refresh 保留旧 generation，Backtest run 在任务边界失败。

共享 validator/compiler 在 create、load、enable、Backtest compilation 和 Signal registration 复用
上述边界并只产出 immutable execution plan。evaluator 不接收或逐 K 重新校验 raw rule JSON；非法
compiled plan 属于程序不变量错误并传播到 owning HTTP/RPC/task boundary。

V1 field catalog 只允许固定、有限 `calculationBarCount` 的字段，因此不增加全局
`STRATEGY_WINDOW_CAPACITY` 或
用户可调窗口参数。若未来增加参数化 Indicator field，新增 change 必须同时定义参数范围与有限
demand function；创建、加载或 realtime registration 发现未知、无界或越界 demand 时必须
fail closed。现有 Indicator/Chan 公共 API 和通用 K 查询重构不属于本决定，后续由独立 focused change
持有。

`k.type` 使用非 nullable enum，唯一取值为 `complete | incomplete`，只允许 `eq/ne`。两种取值
对应同一个 canonical `StrategyBar` shape；evaluator 和 context builder 不得仅因 incomplete 自动
过滤或返回 unavailable。需要完整 K 的策略必须在 rule 中显式引用 `k.type`，该字段及实际值必须进入
immutable context/contextSnapshot。

### 3. 一个策略版本只表达一种信号意图

V1 保留现有单 rule 模型：每个 immutable `StrategyVersion` 恰好持有一棵 `rule`，并持有必填
`signalKind='entry'|'exit'`。create 公共契约必须接受这两个字段，不接受 `entryRule`、
`exitRule`、可空 exit rule 或 paired-rule JSON。validator 将该 rule 编译成一个 execution plan，并把
version 的 signal kind 原样带入 plan；backtest 与 realtime 只能产出该 kind，不能在运行时推断或
合成相反类型。

需要 entry 与 exit 两种提醒时，用户创建两个独立策略定义。V1 不增加 pairing id、definition relation
或隐式联动生命周期；两个定义分别版本化、启停、回测、注册和抑制。这个模型只描述“条件命中时产生
哪类信号”，不创建 position/order/trade，不实现自动平仓或 portfolio simulation。未来完整 portfolio
若需要成对规则，必须由独立 change 重新定义，不能把 paired schema 反向加入本 alert-first V1。

策略定义内容在创建后不可修改。`POST /v1/strategies` 一次提交 name、description、target universe、
periods、sources、rule 和 signal kind，并在同一事务中创建 `StrategyDefinition`、唯一的
`StrategyVersion(versionNumber=1)` 及 `currentVersionId`。V1 不提供 version 2 创建路径；
`currentVersionId` 创建后不再切换，但 version/entity/只读 versions route 继续保留，供 Signal、Backtest
和历史结果引用 immutable identity。

现有 `PATCH /v1/strategies/:id → UpdateStrategyDefinitionDto → StrategyDefinitionService.update()`
链路必须作为 breaking API 删除。名称、描述、标的、周期、来源、rule 或 signal kind 任一内容需要
变化时，都创建新的 strategy definition；旧定义可 disable，既有版本、Signal 和 Backtest 引用继续
可查询。`POST /:id/enable` 与 `POST /:id/disable` 只改变生命周期状态，不改变定义内容或 current
version，因此不属于 update 链路。

`mist-fe` 的 update client/type、选中既有策略后的编辑保存 action 及其 tests 由独立前端交付删除；
创建表单保留并增加必填 signal kind。backend PATCH route 与 frontend consumer 必须以匹配版本切换，
不能在旧前端仍可发送 PATCH 时单独宣称 breaking cleanup 已完成。

### 4. Evaluability 与 matched 分为两阶段

合法 context 中允许为空且被规则读取的字段不可用、lookback/指标 warmup 证据不足时返回
`{status:'unavailable',reason}`；调用方不得把 unavailable 当作规则不匹配或 episode reset。只有
context 可计算时才返回 `{status:'evaluated',matched:boolean}`。合法 K 的
`volume/amount=null` 必须原样保留，不能删除 bar、删除字段或补零。

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

合法 raw `StrategyBar.volume/amount=null` 先经过 `QuantityForwardFillProjector`。若存在同
`(securityId, source, period, tradingDay)` 的最近有效值，evaluation context 使用该 effective value；若当日尚无
任何有效值，读取该字段的 plan 返回 field-level unavailable。projector 不读取更晚的 future bar、不跨交易日、不改写 raw bar；
不读取该字段的 plan 继续计算。显式 canonical `"0"` 是新的 observed value，必须更新 projector 状态，不能与 null
合并。

非法 canonical `StrategyBar`、非法非 null decimal representation 以及 context builder、analysis
kernel 或 evaluator 抛出的异常不是 unavailable；它们必须按后端错误治理传播到当前 HTTP/RPC/任务
边界。

V1 unavailable reason union 只包含 `insufficient_history | field_unavailable`。
前者表示 actual accepted bar count 尚未满足 execution plan 的 bounded demand；后者表示 bar count
足够，但规则消费的 nullable/derived field 当前仍不可用。静态未知
或目标 runtime/source 不支持的 field 必须在 validation/registration 阶段拒绝，不能持续返回
unavailable。

### 5. Schema 细节暂停到生产审计后

已确认的 registry 目标契约是 `StrategyVersion` 持有 non-null `signalKind='entry'|'exit'`；live Signal
目标契约是 non-null `securityId`、non-null `signalKind='entry'|'exit'`，并删除 `securityCode` 兼容列/
双写。本 change 是这些 schema 修改的单一 migration owner；
`run-realtime-strategy-evaluation` 只消费结果，并复用既有
`uq_strategy_alert_events_dedupe_key`，不得新增 migration 或第二组 Signal composite unique。

目标契约已确认不等于 DDL 已授权。迁移编号、零存量验证、securityCode→securityId 目标 schema、
外键、pre/postflight、repair-forward 和 legacy decimal threshold 处置都必须通过：

1. 当前 entity/migration 审计；
2. production `schema_migrations` 与存量 JSON 分布；
3. 候选 schema/兼容/回滚比较；
4. 用户逐项确认。

未完成上述记录时，不得编写 migration 或改变公共 DTO。

项目负责人确认当前预期没有策略存量，因此 V1 不设计旧 version 的 signal kind 推断、默认
`entry` 回填、nullable 过渡、`legacy` 枚举或双字段兼容。实施 migration 前必须在目标 MySQL 只读
统计 `strategy_definitions`、`strategy_versions`、`strategy_signals`、`strategy_alert_events`、
`backtest_runs` 和 `backtest_signal_results`；只有相关表均为零且 `schema_migrations` 与仓库基线一致
时，才允许直接采用最终 non-null `strategy_versions.signal_kind`，并且最终列不保留数据库 default。

发现任意存量时，零存量假设即失效，migration 必须在 DDL 前停止并提交精确表/行数证据重新评审；
不得把旧 rule 猜成 entry/exit，也不得为绕过门禁临时删除、归档或自动改写数据。preflight 脚本、最终
DDL、migration 编号、postflight/readback 和 repair-forward 仍须在实施阶段单独确认。

## Risks / Trade-offs

- [shared evaluator 扩展破坏现有 scan/backtest] → 同 fixture differential tests 和显式 version snapshot。
- [unavailable 导致信号减少] → 暴露 reason，不以 matched=false 或默认值掩盖证据不足。
- [breaking schema 使旧镜像不兼容] → forward-only migration、匹配版本部署和 repair-forward 计划。
- [field catalog 过度耦合 UI] → backend contract 为权威，frontend 只消费生成/显式类型。
- [同一量额阈值在不同 source 表达不同单位] → field catalog 固定股/元，历史与实时 adapter 在
  `StrategyBar` 前归一；未证明的证券/source profile 在注册边界 ineligible，不由 evaluator 猜测。

## Migration Plan

1. 先完成无数据库修改的 field/evaluator/context 设计评审。
2. 只读审计真实 schema，并证明六张 strategy/backtest 相关表均为零；任一非零立即停止。
3. 单独评审已确认 `StrategyVersion.signalKind`、Signal identity 的实际 DDL 与零存量失败门禁；不
   增加 `entry_rule`、`exit_rule`、pairing relation 或 `lookback_bars` 列。
4. 经用户确认后更新 design/spec，再实施 migration/API/frontend。
5. 以共同 fixture 验证 backtest/realtime evaluator parity，再允许 `extract-backtest-runtime` 与
   realtime change 消费。

## Open Questions

- `securityCode` 存量 row 如何可靠映射为 `securityId`，以及审计发现孤儿/歧义时如何 repair-forward。
