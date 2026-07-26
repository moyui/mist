## Context

### 当前三条链路

#### QMT 历史：保持不变

```text
Mist/backend
  -> :9002/v1/bars/query
  -> datasource创建一次性history command
  -> QMT bridge /qmt/bridge/poll
  -> get_market_data_ex(..., subscribe=False)
  -> QMT bridge /qmt/bridge/result
  -> datasource返回历史结果
```

历史 command 只产生一次 result，适合 request/response，不参与本次 realtime callback 迁移。

#### QMT realtime：本 change 替换

```text
当前：
datasource每秒创建get_full_tick command
  -> bridge轮询
  -> get_full_tick
  -> 一次result
  -> datasource formal frame
  -> Mist backend

目标：
Mist内部显式subscription control方法（HIL或未来caller调用）
  -> QMT官方callback
  -> bridge有界callback queue
  -> /qmt/bridge/subscriptions/snapshot
  -> datasource统一formal frame schema v2
  -> Mist backend按code拆分
  -> allowlist解析securityId
  -> QMT独立converter
  -> RealtimeSnapshotIngressService按securityId保存latest
```

#### TDX realtime：acquisition 保持，snapshot transport 与 formal frame 简化

```text
TDX callback
  -> dirty symbol
  -> get_market_snapshot
  -> /tdx/bridge/snapshot（无producerSequence、只尝试一次）
  -> TDX datasource
  -> 用symbol把flat native包装成单项native map
  -> datasource统一formal frame schema v2
  -> allowlist解析securityId
  -> TDX独立converter
  -> Mist backend按securityId保存latest
```

TDX terminal bridge 的 `subscribe_hq -> dirty -> get_market_snapshot`、control
poll/result 和 native acquisition 保持。`/tdx/bridge/snapshot` 删除
`producerSequence`、terminal POST 自动重试和 datasource producer-sequence
去重；datasource→backend 改为与 QMT 相同的 schema-v2 native map，不再分配
formal sequence，也不再保留 backend epoch/per-symbol sequence fence。

### 当前 QMT command/result 为什么不能复用

当前 history/realtime polling command 是一次性状态机：

```text
pending -> leased -> completed | expired
```

一个 command 对应一个 result。subscription callback 在同一个 native subscribe 后会持续发生，不能把后续 callback 当作同一 command 的第二、第三个 result。因此 history routes 保持，一组新的 subscription routes 专门承载 control 和 snapshot。

## Goals / Non-Goals

### Goals

- provider acquisition 只迁移 QMT；TDX acquisition 保持。
- datasource→Mist formal transport 在同一 change 内统一 TDX/QMT schema v2，
  不留下未接入的 QMT path 或长期双版本。
- 直接使用官方 callback `{code: tickData}`。
- 同时实现 whole exact sync 与 single subscribe/unsubscribe。
- QMT subId 永久进入 datasource 本地 journal。
- callback 无阻塞、业务无关、队列有界。
- backend 逐 code strict validate，allowlist 解析
  `providerSymbol -> securityId` 后 canonicalize。
- TDX/QMT datasource→backend 使用唯一 active schema v2，同时保留两家的
  provider-native 字段差异。
- TDX/QMT 各自使用一套全新的简化 converter，不复用旧 schema-v1 adapter。
- canonical snapshot 使用明确的 `securityId + providerSymbol` identity，
  公共 ingress 只保留一份按 `securityId` keyed 的 latest；source runtime
  store 不再保留 sequence/epoch fence 或第二份 snapshot。
- TDX/QMT datasource 都有四种 control 能力，Mist 两个 realtime WebSocket
  client 通过同一个 Nest 内部 in-process interface 提供真实可调用的方法，
  但 provider-native value 保持各自语义。
- TDX/QMT snapshot submission 都是 at-most-attempted，不做 bridge-level retry/dedup。
- 保持 Python 3.6、双 bridge 手工覆盖、source-scoped mode switch 和 rollback。

### Non-Goals

- 不修改 QMT 历史链路。
- 不在 callback 后查询 `get_full_tick` 或 `get_market_data_ex`。
- 不实现 current-K refresh。
- 不实现 tick-complete、重试补发或顺序承诺。
- 不实现运行时 QMT↔TDX source switch。
- 不新增 MySQL/Redis subscription state。
- 不修改 candle、strategy、notification、migration 或生产业务数据库。
- 不实现 scheduler、`Security.status=ACTIVE` 变化监听、desired/effective-source
  coordinator 或 latest cleanup。
- 不新增 HTTP/GraphQL/controller、frontend、CLI 或 diagnostic mutation
  endpoint，也不在 `open/ready/reconnect` 自动发送任何 subscription control。

## Decisions

### 1. 官方 callback contract

官方文档访问日期：2026-07-25。

设计依据：

- [迅投/QMT 行情函数](https://dict.thinktrader.net/innerApi/data_function.html)
- [迅投/QMT get market data 返回对象](https://dict.thinktrader.net/innerApi/data_structure.html?id=ZtoVm0#get-market-data%E8%BF%94%E5%9B%9E%E5%AF%B9%E8%B1%A1)
- [迅投/QMT 行情常见问题](https://dict.thinktrader.net/innerApi/question_answer.html)

#### `subscribe_quote`

```python
ContextInfo.subscribe_quote(
    stock_code,
    period='tick',
    dividend_type='none',
    result_type='dict',
    callback=callback
)
```

必须显式使用 `result_type='dict'`。默认 `''`/`DataFrame` 会产生 `{code: DataFrame}`，不适合 Python 3.6 bridge 的轻量 callback；`dict` 产生：

```text
{
  code: {
    field: value,
    ...
  }
}
```

single callback 正常预期只有目标 code 一项，但 bridge/backend 仍按 map 遍历，不把“一项”编码为另一套数据结构。

#### `subscribe_whole_quote`

```python
ContextInfo.subscribe_whole_quote(
    exact_desired_provider_symbols,
    callback=callback
)
```

官方定义：

- 全推只有分笔周期。
- callback 每次包含发生变化的品种。
- callback 参数为 `{code: data}`。
- `data` 为 `{field: value}`。
- callback 单品种对象与 `get_full_tick` 返回结构相同。

一次 whole callback 可以包含一个或多个 code；不能假设永远只有一项。官方允许 `['SH', 'SZ']`，但本项目禁止市场代码，只允许 exact desired provider symbols，避免订阅整个市场。

#### tickData 逻辑字段

官方结构包含：

```text
time
stime
lastPrice
open
high
low
lastClose
amount
volume
pvolume
stockStatus
openInt
transactionNum
lastSettlementPrice
settlementPrice
askPrice
askVol
bidPrice
bidVol
```

官方数据结构表使用 `time/stime`，而 `get_full_tick` 页面示例还出现
`timetag`，存在版本或示例差异。三者不是三个不同生命周期时间，而是同一个
provider business time 的候选表示：`time` 是数值 timestamp，
`stime/timetag` 是格式不同的 timestamp string。因此：

- `{code: tickData}` 和“同 get_full_tick 逻辑结构”是正式设计 contract。
- bridge/datasource 保留 callback 中实际存在的全部候选字段，不重命名、不删减、
  不解析。
- 当前生产 runtime 的候选字段存在性、优先级、类型、单位、时区、精度和
  optional field 由交易时段 raw fixture/HIL 固定。
- backend 在 production fixture 被接受前不得自行选择 `time`、`stime` 或
  `timetag` 的优先级，也不得假设 epoch 单位、字符串格式或字符串时区。
- accepted fixture 必须说明多个候选同时存在时如何验证其代表同一业务时刻；
  无法解析或候选值无法按已声明精度证明一致时，converter fail closed 为
  `eventTime=null`，并保留原始 native 供 evidence。
- bridge/datasource 不处理 alias；Mist QMT converter 按已接受 fixture 建立
  source-specific strict map。
- fixture 无法证明 provider event time 时，canonical `eventTime=null`；不得用 `capturedAt` 或 backend 当前时间伪造。

#### subscribe/unsubscribe 返回

- `subscribe_quote` 和 `subscribe_whole_quote` 只有
  `type(result) is int` 才算成功；`0` 允许作为有效 `subId`，不附加正负范围
  假设。`bool`、float、string、`None` 和异常均失败。
- 成功 ID 立即写 QMT 固定格式日志，并由 datasource durable journal 保存。
- `unsubscribe_quote(subId)` 的成功返回值由 runtime HIL 固定；只有 `type(result) is int` 且命中 HIL 成功值才删除 ID。
- 对 `unsubscribe_quote`，`None`、`bool`、float、string、未被 HIL 确认为
  success 的整数、异常或 timeout 均视为失败，原 ID 留在原 registry 位置并计入
  monitoring；该规则不限制 subscribe 返回的 integer ID 范围。
- 官方文档没有定义对已确认释放 subId 再次调用 `unsubscribe_quote` 的
  return/exception/idempotency 语义。Windows HIL 必须捕获
  `subscribe -> unsubscribe -> same-subId unsubscribe`，第二次退订前不得创建
  其他 subscription；同时记录可观察的 callback 停止、订阅额度释放和随后新建
  subscription 的 subId 复用情况。未通过前不得把 retained recovery ID 的重复
  退订作为自动恢复路径，也不得宣称它一定有害。
- runtime alias 只做 introspection，不根据名称猜测调用。正式候选仍为 `subscribe_quote`、`subscribe_whole_quote`、`unsubscribe_quote`。

### 2. 质量等级

```text
tick-complete
  声称逐笔完整、有 provider sequence 和丢失证明

latest-state
  每次 callback 是 provider 当前完整 tick snapshot
  callback/transport允许丢失或相同状态再次出现

current-K refresh
  查询时刻的当前K线，不是native tick
```

本 change 只实现 `latest-state native snapshot`。官方行情常见问题将全推定义为客户端持有的最新值，并说明服务端把发生变化的增量部分打包推给下游；`subscribe_whole_quote` 的 changed-symbol map 因此只说明哪些品种的最新 snapshot 发生了更新，不证明每一笔交易所 tick 都产生独立 callback，也不证明 callback 之间没有合并或遗漏。callback `data` 与 `get_full_tick` 的逻辑字段相同只确定 native snapshot contract，不会把质量等级提升为 `tick-complete transport`。

### 3. QMT subscription 语义

datasource 内部状态只有两个逻辑 bucket：

```json
{
  "whole": {
    "subId": 120,
    "symbols": ["300502.SZ", "600030.SH"]
  },
  "singles": {
    "000001.SZ": 121
  }
}
```

`whole` 为 nullable；存在时，`subId` 与 `symbols` 必须成对存在。一个 whole
ID 覆盖其 exact symbol set，所以仅保存 `subId` 无法完成 callback membership
校验或下一次 exact reset。`singles` 是 `providerSymbol -> subId` map，因为每次
`subscribe_quote(symbol)` 都产生一个独立 ID，单独退订时必须按 symbol 找回该
ID。

因此这不是三个并列状态，而是两个 subscription bucket。datasource 不建立
公共 handle union、method 字段或 lifecycle enum；whole/single 由 bucket
区分，不能通过 `subId` 数值或 symbol 数量推断。
`retained-recovery` 只允许存在于 datasource-private lifecycle metadata，
不形成第三个 bucket，也不进入 `get_subscriptions` 或其他 backend-facing
response。

#### `sync_subscriptions(symbols)`

```text
校验、去重、排序exact desired symbols
  -> durable journal intent
  -> 顺序unsubscribe whole.subId（如有）
  -> 按provider symbol升序unsubscribe每个singles[symbol]
  -> 每次native call单独journal
  -> 任一unsubscribe失败：保留对应ID，继续其余unsubscribe但停止replacement
  -> 任一confirmed-unsubscribe result/transition durability失败：
     原ID保留为retained-recovery，立即停止其余mutation与replacement
  -> 全部成功且symbols非空：subscribe_whole_quote(symbols)
  -> 全部成功且symbols为空：完成cancel-all
```

reset 不绑定盘前、盘中或盘后时钟。它只在 Nest 内部 caller 明确调用
`syncSubscriptions()` 时执行，不由 `open/ready/reconnect`、allowlist 或
`Security.status` 变化自动触发。它不是原子事务，也不自动 retry；一个调用
失败后由 caller 查看 typed result、monitoring 和 journal 再决定下一步。

#### `subscribe(symbol)`

- 只建立 single。
- symbol 已属于 `whole.symbols` 或 `singles` 时返回失败，不重复调用 native。
- 只有当前 backend leader 上明确调用 Nest 内部 `subscribe()` 方法才会发送；
  本 change 没有生产调用方。
- 成功 integer `subId`（包括 `0`）先保守写入 `singles[symbol]`；只有 matching
  result/registry transition durable 后才向 backend 报告成功，durability
  failure 时保留该 ID、设置 reconciliation required 并阻止 overlap。

#### `unsubscribe(symbol)`

- 只取消 `singles[symbol]`。
- symbol 属于 `whole.symbols` 时不调用 native，返回
  `QMT_SYMBOL_OWNED_BY_WHOLE` 与 `subscriptionState=subscribed`，调用方改用
  下一次 exact sync。
- native unsubscribe 未取得 HIL 已确认的整数成功值时保留原 single ID，返回
  `QMT_UNSUBSCRIBE_UNCONFIRMED` 与 `subscriptionState=unknown`。
- 只有 HIL 已确认的整数成功值，且对应 result 与 registry transition 已
  durable，才删除原 single ID 并返回 `success:null`。
- confirmed success 后 result/transition append、flush 或 fsync 失败时，原 ID
  暂时保留在原 bucket 并在私有 metadata 标记为 `retained-recovery`；这表示
  datasource 为恢复而保守保存 subId，不是 physical handle confirmed-live
  证明。返回
  `QMT_JOURNAL_DURABILITY_FAILED/subscriptionState=unknown`，设置
  `reconciliationRequired=true`，停止 replacement 和后续 native mutation，
  且不得自动再次调用 `unsubscribe_quote`。

#### `get_subscriptions()`

QMT 由 datasource 当前 in-memory registry 返回；journal 同步留证但本期不自动恢复 registry：

```json
{
  "whole": {
    "subId": 123,
    "symbols": ["300502.SZ", "600030.SH"]
  },
  "singles": {
    "000001.SZ": 456
  }
}
```

若 bucket 中存在 `retained-recovery` ID，public get 仍返回上述相同的
conservative registry shape，不暴露 marker；caller 不能把该 ID 当作 physical
handle confirmed-live。`reconciliationRequired` 与 retained aggregate 只通过
health/structured diagnostic 暴露。

TDX 返回 current terminal bridge fresh native list 的 provider-specific value。两者不强行包装成共同 subscriptions/state 模型。

### 4. backend ↔ datasource control

Mist 两个 realtime client 实现同一个内部 interface：

```ts
interface RealtimeSubscriptionControl {
  syncSubscriptions(symbols: readonly string[]): Promise<SubscriptionControlResult>;
  subscribe(symbol: string): Promise<SubscriptionControlResult>;
  unsubscribe(symbol: string): Promise<SubscriptionControlResult>;
  getSubscriptions(): Promise<SubscriptionControlResult>;
}
```

每个 provider client 内部使用一个 private
`executeSubscriptionControl(request, expectedResponseType)` 管理唯一 pending
Promise、timeout、disconnect、response type matching 与 late-response rejection；
四个 typed 方法只负责构造 exact request union，不能对 caller 暴露任意
`Record<string, unknown>` 的 generic send。

这里的“内部”是 Nest application context 中可注入、可直接调用的方法，不是
HTTP、GraphQL、frontend、CLI、diagnostic controller 或另一个对外 WebSocket。
四个方法都必须走当前 provider client 已持有的 backend→datasource WebSocket，
等待与 request type 匹配的 response 后才 settle Promise；不允许空实现或仅记录
日志的 placeholder。带 target 的方法发送前必须通过当前 source business allowlist
验证 normalized provider symbol，`syncSubscriptions` 还必须去重并固定排序。
WebSocket 未 open、尚未通过 ready contract 或该连接不是 datasource 当前
leader 时，方法不得假定 mutation 成功。前两种情况返回稳定 local not-ready
failure，不发送、不排队也不重试；non-leader 由 datasource 的 stable wire
failure 返回给 caller，同样不自动 retry。

当前 change 只交付 interface 与 transport execution，不注册任何 production
caller。client 收到 `open`、`ready` 或发生 reconnect 时只更新连接/readiness
状态，不得调用上述任一方法；allowlist 初始化/变化与
`Security.status=ACTIVE|SUSPENDED|DELISTED` 变化也不得触发 mutation。未来
subscription-lifecycle change 再由定时 coordinator 计算 desired set，并调用
相同 interface。

每个 provider WebSocket 同时最多一个 outstanding control request。不存在动态
`supportedOperations` 广播；`builtin` build 必须在代码、测试和 health 层同时
具备四种能力。第二个方法调用必须立即返回稳定的 local busy failure，不能在
client 内形成无界队列。

请求：

```jsonl
{"type":"sync_subscriptions","symbols":["300502.SZ"]}
{"type":"subscribe","symbol":"300502.SZ"}
{"type":"unsubscribe","symbol":"300502.SZ"}
{"type":"get_subscriptions"}
```

响应类型：

```text
sync_subscriptions -> subscriptions_synced
subscribe          -> subscribed
unsubscribe        -> unsubscribed
get_subscriptions  -> subscriptions
```

四个接口的 provider 对照如下；“对齐”只表示 request 名称与
`success|failure` 外壳一致，不表示底层 native call、返回值或 actual state
结构一致。

TDX datasource 继续使用现有 transport-level
`desiredSymbols + desiredRevision` 作为 terminal bridge 的收敛目标；它不是
未来根据 `Security.status` 计算 desired 的业务 coordinator。TDX
`sync_subscriptions`、`subscribe`、`unsubscribe` 必须共用一个 source-local
mutation gate，并在任何 HTTP/native mutation 或新的 bridge reconcile
instruction 暴露前，原子建立唯一 target desired：

```text
sync(symbols)  -> exact normalized symbols
subscribe(A)   -> current desired union {A}
unsubscribe(A) -> current desired difference {A}
```

target 变化沿用现有内部 `desiredRevision` 递增与 stale-result fence；该 revision
不进入 backend-facing request/response。bridge poll 若与 HTTP orchestration
交错，只能暂时取得 no mutation 或基于已发布的新 target 计算 instruction，
不能在 mutation 已开始后继续从旧 desired 生成反向 subscribe。已在旧 revision
下暴露的 native call 可能造成已接受的短暂重复，但其 result 不得成为 current
convergence evidence，后续 poll 必须向新 target 收敛。HTTP/provider failure
不把 target desired 回滚到旧值。

| backend API | TDX 执行与成功值 | QMT 执行与成功值 |
| --- | --- | --- |
| `sync_subscriptions(symbols)` | datasource 先在 source-local gate 内把 transport desired 原子替换为 exact normalized symbols 并推进内部 revision；TDX terminal bridge 按现有 batch 对新 desired 调用 `unsubscribe_hq/subscribe_hq(..., callback)`，随后在终端内调用 native `get_subscribe_hq_stock_list` 并回报完整 active list。只有 current owner/epoch/revision 下的 fresh native list 等于 exact desired 才返回 `success:null` | datasource 顺序取消 `whole.subId` 与全部 `singles[symbol]`；全部退订成功后下发 control，由 QMT terminal bridge 调用一次 `subscribe_whole_quote(exactDesiredSymbols, callback)`。非空 desired 返回 `success:<newWholeSubId>`，空 desired 返回 `success:null` |
| `subscribe(symbol)` | datasource 先在 source-local gate 内把 transport desired 更新为 current union symbol 并推进内部 revision，再由现有 TDX terminal bridge 调用 `subscribe_hq([symbol], callback)`；只有 bridge/native list 已包含 symbol 才返回 `success:null` | datasource 下发 control，由 QMT terminal bridge 调用 `subscribe_quote(symbol, period='tick', dividend_type='none', result_type='dict', callback=...)`；只有 `type(result) is int` 才返回 `success:<newSingleSubId>`，其中 `0` 有效 |
| `unsubscribe(symbol)` | datasource 先在 source-local gate 内从 transport desired 移除 symbol 并推进内部 revision；TDX terminal bridge 调用 `unsubscribe_hq([symbol])` 后以 fresh terminal-native active list 不含 symbol 作为成功 postcondition；成功返回 `success:null`，仍在 list 返回 `TDX_UNSUBSCRIBE_NOT_CONVERGED/subscribed`，list 不可验证返回 `TDX_UNSUBSCRIBE_VERIFY_FAILED/unknown`。失败不恢复旧 desired | datasource 从 `singles[symbol]` 取得 `subId` 并下发 control，由 QMT terminal bridge 调用 `unsubscribe_quote(subId)`；只有返回 HIL 已确认的整数成功值才删除 ID并返回 `success:null`。未确认时保留 ID 并返回 `QMT_UNSUBSCRIBE_UNCONFIRMED/unknown`；`whole.symbols` 成员返回 `QMT_SYMBOL_OWNED_BY_WHOLE/subscribed`，不调用 native |
| `get_subscriptions` | datasource-private `nativeProbeRevision` read barrier 要求 current terminal bridge 新执行一次 native `get_subscribe_hq_stock_list`；只在 current owner/epoch/revision result 回报该 probe 后返回 `success:<normalizedProviderSymbolList>` | 不调用 provider；返回 datasource 当前 `whole + singles` in-memory registry |

TDX mutation 的 immediate native/HTTP payload 不直接成为公共 success value。
尤其官方样例可能同时包含说明文本和 `ErrorId="0"`；list 是订阅集合的最终
postcondition。QMT mutation 的原始数值返回、类型与失败细节完整进入 journal，
但 backend-facing unsubscribe success 仍为 `null`。

`get_subscriptions` 的成功值分别为：

```json
{
  "type": "subscriptions",
  "provider": "tdx",
  "data": {
    "success": ["300502.SZ", "600030.SH"]
  },
  "timestamp": "RFC3339"
}
```

```json
{
  "type": "subscriptions",
  "provider": "qmt",
  "data": {
    "success": {
      "whole": {
        "subId": 123,
        "symbols": ["300502.SZ", "600030.SH"]
      },
      "singles": {
        "000001.SZ": 456
      }
    }
  },
  "timestamp": "RFC3339"
}
```

成功：

```json
{
  "type": "subscribed",
  "provider": "qmt",
  "data": {
    "success": 123
  },
  "timestamp": "RFC3339"
}
```

失败：

```json
{
  "type": "subscribed",
  "provider": "qmt",
  "data": {
    "failure": {
      "symbol": "300502.SZ",
      "reason": "QMT_INVALID_SUBSCRIPTION_ID"
    }
  },
  "timestamp": "RFC3339"
}
```

退订失败使用专用且仍然最小的 failure 结构。TDX postcondition 证明 symbol
仍在 fresh terminal-native list 时：

```json
{
  "type": "unsubscribed",
  "provider": "tdx",
  "data": {
    "failure": {
      "symbol": "300502.SZ",
      "reason": "TDX_UNSUBSCRIBE_NOT_CONVERGED",
      "subscriptionState": "subscribed"
    }
  },
  "timestamp": "RFC3339"
}
```

QMT native 返回或异常无法证明物理结果时：

```json
{
  "type": "unsubscribed",
  "provider": "qmt",
  "data": {
    "failure": {
      "symbol": "300502.SZ",
      "reason": "QMT_UNSUBSCRIBE_UNCONFIRMED",
      "subscriptionState": "unknown"
    }
  },
  "timestamp": "RFC3339"
}
```

规则：

- `data` 必须且只能有 `success` 或 `failure`。
- 非 unsubscribe 的普通 control failure 必须恰好为
  `{symbol,reason}`。
- `unsubscribed.data.failure` 必须恰好为
  `{symbol,reason,subscriptionState}`。
- `subscriptions_synced.data.failure` 若来自 reset 的取消阶段，也必须使用
  `{symbol,reason,subscriptionState}`；若来自后续 subscribe/convergence 阶段，
  则使用普通 `{symbol,reason}`。
- `subscriptionState` 只允许：
  - `subscribed`：TDX official current list 或 QMT 当前 whole ownership 能证明
    symbol 仍属于订阅集合；
  - `unknown`：native 调用可能执行但没有 authoritative postcondition，无法证明
    物理状态。
- failure 不使用 `subscriptionState=unsubscribed`；已证明目标不在订阅集合时直接
  返回 `success:null`。
- whole/reset 级失败无法归因到单只股票时 `failure.symbol=null`；这包括 QMT
  whole handle 的取消失败。
- `sync_subscriptions` 仍尝试全部已知取消；若有多个失败，公共 response 选择固定执行顺序中的第一项（whole 在前，single 按 provider symbol 升序），并按该第一项的失败阶段选择上述精确 shape；全部失败细节保留在 journal、monitoring counter 与限频日志。
- success 直接保存 provider-specific value；QMT subscribe 是 exact integer
  `subId`（允许 `0`），QMT get 是 registry object，TDX get 是 fresh terminal-native list。
- backend-facing wire response 不携带 raw provider payload、`Error`、`ErrorId`、完整
  subscription list、ack、`operationId`、revision、CAS、retry directive、
  timeout negotiation、result retention 或 common provider state union。
- 每个 source 使用代码/配置内固定 bounded control timeout；超时返回同一个
  failure union，不自动重放 native call。QMT timeout 后允许 slot 服务下一条
  native call，但 datasource-process-local `callSequence` 不得复用；late
  result 只有与 current slot sequence 完全匹配时才可接受，否则只记录并拒绝。
- WebSocket 断开或调用方超时后，pending Promise 必须以 outcome unknown
  结束且不得自动重发 mutation。重新连接后 client 不自动发送
  `get_subscriptions` 或任何 mutation；未来 caller 若要 reconcile，必须先明确
  调用 `getSubscriptions()`，再自行决定是否调用下一项 mutation。

### 5. QMT loopback control protocol

routes：

```text
POST /qmt/bridge/subscriptions/poll
POST /qmt/bridge/subscriptions/result
POST /qmt/bridge/subscriptions/snapshot
```

三条 route 与现有 history `/qmt/bridge/poll|result` 分离，但复用
`/qmt/bridge/owner` 的 current `ownerId + leaseToken + generation`。

#### poll

请求：

```json
{
  "ownerId": "bigqmt-1234",
  "leaseToken": "...",
  "generation": 1
}
```

poll request 顶层必须且只能有 `ownerId`、`leaseToken`、`generation`。这是
bridge 身份和 current lease fence，不是 native command 的一部分；QMT
subscription route 不使用 `streamEpoch`。

无指令：

```json
{"command": null}
```

每次至多返回一个 native call：

```json
{
  "command": {
    "callSequence": 17,
    "method": "subscribe_quote",
    "symbol": "300502.SZ"
  }
}
```

```json
{
  "command": {
    "callSequence": 18,
    "method": "subscribe_whole_quote",
    "symbols": ["300502.SZ", "600030.SH"]
  }
}
```

```json
{
  "command": {
    "callSequence": 19,
    "method": "unsubscribe_quote",
    "subId": 123,
    "symbol": null
  }
}
```

poll response 顶层必须且只能有 `command`。`command=null` 表示无工作；非空
command 是以下 exact union，禁止 unknown fields：

```text
subscribe_quote:
  {callSequence,method:"subscribe_quote",symbol}
subscribe_whole_quote:
  {callSequence,method:"subscribe_whole_quote",symbols}
unsubscribe_quote:
  {callSequence,method:"unsubscribe_quote",subId,symbol}
```

`unsubscribe_quote.symbol` 对 single cancellation 是对应 provider symbol，
对 whole/reset cancellation 是 `null`。`ownerId`、`leaseToken`、`generation`
不得在 command 内重复，`streamEpoch` 也不得出现。`subscribe_quote` 的固定
`period='tick'`、`dividend_type='none'`、`result_type='dict'` 与 callback wiring
由 bridge dispatch 实现，不作为可变 wire 字段。

`subscribe_whole_quote` 的 native 参数本身是 list，因此该 command 保留
`symbols[]`；“一对一”指一次 poll 只有一条 native call，不是把 native list
参数改写。`callSequence` 由 datasource 在 command 首次暴露时于同一个
single-writer/lock 临界区分配，从 `1` 开始，在 datasource 进程存活期间严格
递增且不复用。datasource restart 后允许重置，因为新进程会签发不同 lease。

datasource 只有一个 in-memory in-flight slot。slot 占用时后续 poll 返回
`command=null`。正常路径中 bridge 必须完成
`poll -> native call -> result` 后才进行下一次 poll；slot timeout/explicit
abandon 后可以暴露下一条 call，但必须使用新的 `callSequence`。

#### result

请求继续携带 current `ownerId + leaseToken + generation`，并原样回传该
command 的 `callSequence`。result request 顶层必须且只能有上述四个字段及
恰好一个 `success|failure`；不得携带 `streamEpoch`、command object、native
arguments 或 retry metadata。成功：

```json
{
  "ownerId": "bigqmt-1234",
  "leaseToken": "...",
  "generation": 1,
  "callSequence": 17,
  "success": 123
}
```

失败：

```json
{
  "ownerId": "bigqmt-1234",
  "leaseToken": "...",
  "generation": 1,
  "callSequence": 17,
  "failure": {
    "symbol": "300502.SZ",
    "reason": "QMT_NATIVE_EXCEPTION"
  }
}
```

规则：

- `success`/`failure` 二选一。
- `failure` 必须且只能有 `{symbol,reason}`；unknown outer/failure fields
  在 native result 或 registry/journal mutation 前拒绝。
- result 只归属于 `callSequence` 完全匹配的唯一 in-flight call；没有
  in-flight 或 sequence 不匹配时拒绝。
- sequence mismatch 必须在任何 registry/journal-result mutation 前拒绝并写
  bounded diagnostic；若 current slot 已由 B 占用，迟到的 A result 不得关闭、
  完成或改变 B。
- bridge failure 只携带 native-call 层的 `{symbol,reason}`；backend-facing
  `subscriptionState` 由 datasource 根据 official postcondition 或当前
  registry 语义补充，bridge 不猜测物理订阅状态。
- 协议不使用 opaque UUID、result array、aggregate status、dedup 或 retry；
  `callSequence` 是唯一的 per-call correlation 字段。
- `callSequence` 不进入 datasource→backend frame、backend-facing control
  response、snapshot route 或 metrics label，也不构成 retry/idempotency key。
- result POST 失败时 bridge 写固定格式限频日志并停止处理该结果，不重新执行 native call。
- datasource 收到 exact integer subscribe 结果（包括 `0`）后立即把 ID 保留在
  内存 registry，防止 journal 故障时重复订阅；只有 journal
  append+flush+fsync 成功后才对 backend 报告成功。journal 失败时保留 ID、
  标记 `reconciliationRequired`、返回
  `QMT_JOURNAL_DURABILITY_FAILED` 并阻止重叠订阅。
- datasource 只有在对应 intent 已 append+flush+fsync 后才能把 native call
  暴露给 bridge。intent durability 失败不分配/暴露 command、不调用 native，
  registry 保持不变。
- confirmed unsubscribe 后若 result/transition durability 失败，原 ID 留在
  bucket 并标记 `retained-recovery`；此时 registry 是用于 recovery safety 的
  conservative upper bound，不能作为该 ID 仍 physical-live 的证明，也不能
  用该 ID 接受新的 callback membership。只读 `get_subscriptions` 可继续返回
  conservative bucket，同时 health 必须显示 `reconciliationRequired`。
- journal 不健康时所有新 mutation 在 native call 前失败。journal 恢复后，
  只有明确 caller 才能发起 recovery；是否允许再次退订 retained ID 取决于
  当前 runtime HIL。未证明安全时要求 operator reload/rebuild context，不自动
  调用 native。

### 6. owner、lease 与生命周期

QMT 复用现有 owner 注册及其现有字段，不增加 context identity 或
transport epoch。bridge 脚本加载时按当前实现生成一次
`ownerId = "bigqmt-" + str(os.getpid())`；同一 QMT 进程内 reload
strategy/context 时 `ownerId` 可以不变，这是本期明确接受的单进程边界。
bridge 在 `init(ContextInfo)` 或 lease loss 后注册；正常 poll 即 heartbeat，
不每秒重新注册。

```text
ownerId
generation
leaseToken
```

- `leaseToken` 使用 constant-time comparison，只存在于 loopback request，不进日志、journal、metrics、health 或 formal frame。
- QMT subscription poll/result/snapshot 全部沿用现有
  `ownerId + leaseToken + generation` fence；不得把 datasource→backend
  realtime collector 的 `streamEpoch` 当作 owner route 字段。
- 相同 active `ownerId` 重复注册幂等；owner stale 或被替换时才轮换
  lease/generation。`generation` 是 datasource 进程内的 owner generation，
  不承诺跨 datasource restart 全局单调。
- 同进程 strategy/context reload 不强制轮换 owner identity。
- 本期不在 datasource restart 后自动 replay journal 或 QMT print log 来重建 live registry；这些记录只作为详细恢复 evidence。
- datasource 意外重启而 QMT context 仍存活时，新 datasource 无法证明物理
  handle membership，必须 fail closed、拒绝旧 callback，并要求操作员
  reload/rebuild QMT context。后续 full sync 只能由 Nest 内部方法的明确 caller
  发起；本 change 只有 test-only HIL harness，不能假设另有 operator endpoint。
- strategy/context reload 产生新 context 时，不自动重复 subscribe/unsubscribe/reset；旧 ID 继续保留在 journal，等待操作员显式处理。
- 本 change 不实现崩溃窗口自动日志恢复脚本；未来可以基于固定格式日志另建人工恢复工具。

### 7. QMT subscription journal

默认路径：

```text
F:\quant\MistAPI\datasource\state\qmt\subscription-journal.jsonl
```

可由 `MIST_QMT_SUBSCRIPTION_JOURNAL_PATH` 覆盖。datasource 在第一次 control
前创建父目录和 active file；单 writer，active 在两次 rotation 之间
append-only，archive immutable，格式均为 UTF-8 JSONL；每行 bounded，
`flush()` 与 `os.fsync()` 成功后才算 durable。

每条至少记录：

```text
schemaVersion
journalSequence
callSequence
datasourceInstanceId
ownerGeneration
bridgeBuildId
action =
  subscribe_intent | subscribe_result |
  unsubscribe_intent | unsubscribe_result |
  rotation_anchor | compaction_checkpoint |
  planned_stop | operator_observation
method
subId
symbol
symbols
nativeArguments
nativeReturnType
nativeReturnValue
success
failureReason
subscriptionState
errorType
errorMessage
createdAt
previousRecordHash
recordHash
```

- intent record 必须先 append+flush+fsync，随后才允许暴露相同
  `callSequence` 的 native command；intent durability 失败时不得执行 native。
- `method` 与 `callSequence` 在 journal 中必须保留，公共 API 不返回。
- subscribe 成功 ID 在 bridge 第一次 result POST 前先输出包含
  `callSequence` 的固定格式 QMT 日志。
- unsubscribe 失败追加原始返回类型/值、稳定 reason、派生
  `subscriptionState=unknown` 与 post-result registry snapshot，并保留 registry
  中原 ID。
- confirmed unsubscribe 的 result 与 post-result registry transition
  durability 失败时，health 与 bounded structured diagnostic 记录
  `QMT_JOURNAL_DURABILITY_FAILED`，last durable journal intent 保持不变，
  内存 ID 标记为 `retained-recovery`；journal 恢复后的 recovery evidence
  只能另写新 record，不得声称失败的 result 已 durable。不得把 confirmed
  native call 改写成 unconfirmed，也不得自动重新执行。
- journal 恢复可写不自动清除 `reconciliationRequired`。同一 datasource
  process 若要解锁，必须由明确 recovery action 追加并 fsync
  `operator_observation`，至少记录 affected journal sequence、recovery mode、
  operator evidence digest 与 observation time；它不能伪造 physical state。
  已释放 ID 的重复 native cancellation 仍必须经过 current-runtime HIL 和正常
  intent/result durability。当前 change 不新增外部 recovery endpoint；没有
  已实现明确 recovery action 时，运维路径是 reload/rebuild QMT context 后
  restart datasource。
- journal 不保存 leaseToken、callback native 行情或业务数据。
- 损坏尾行隔离并报警；此前完整记录仍保留为人工恢复 evidence，本期不自动 replay。
- datasource single writer 同时是 rotation/compaction owner。active file 在下一
  条 append 将超过 `MIST_QMT_SUBSCRIPTION_JOURNAL_ROTATE_BYTES` 时必须先
  rotation；默认值固定为 `67108864` bytes（64 MiB）。active、archives、
  manifests 与 checkpoints 的总字节在将超过
  `MIST_QMT_SUBSCRIPTION_JOURNAL_ARCHIVE_MAX_BYTES` 时必须先 compaction；
  默认值固定为 `536870912` bytes（512 MiB）。两个配置都必须是 exact
  positive integer，rotate limit 必须能容纳最大 bounded record 加 anchor，
  archive max 至少为 rotate limit 的两倍；非法配置使 QMT control readiness
  在第一次 mutation 前 fail closed，不能 clamp 或动态增大。
- rotation 在同一个 writer lock 内执行：flush+fsync 当前 active，关闭后改名为
  带 first/last `journalSequence` 的 immutable archive，计算 SHA-256 并通过
  temp+atomic replace 写 checksum manifest，再创建包含 archive name、digest、
  last `recordHash` 的 `rotation_anchor` 作为新 active 第一条；manifest 和新
  active fsync 成功后才恢复 control。rename/replace 还必须使用 Windows
  支持的 durable metadata publish 等价机制，使 process interruption 后至少
  存在一个可验证的 old/new copy。任何 `.tmp/.rotating` 中断状态必须在 startup
  通过 hash chain/manifest 确定性完成或回滚，不能删除最后一个有效 copy。
- compaction 只能处理所有 subId 都已有 durable confirmed-unsubscribe，或已有
  durable terminal `operator_observation` 明确证明 context reload/rebuild，或
  HIL-qualified repeated unsubscribe 已取得 durable accepted result 的
  archive；普通 acknowledgement 不能解析 lifecycle。先写并 fsync immutable
  `compaction_checkpoint`，其中保留每个 resolved lifecycle 的 subId、bucket、
  first/last journal sequence、terminal record hash 与 archive SHA-256，再
  atomic publish checkpoint，最后才能删除源 archive。
- resolved per-ID checkpoint detail 的保留期由
  `MIST_QMT_SUBSCRIPTION_JOURNAL_RESOLVED_RETENTION_DAYS` 控制，默认精确为
  `90` days 且必须是 exact positive integer。超过保留期后，single writer
  可以把 resolved-only detail 折叠成一个 fixed-size rolling sealed-range
  checkpoint：保存 first/last journal sequence、resolved lifecycle count，
  以及由 prior sealed checkpoint digest 与本批 terminal-record/archive
  digests 计算的 SHA-256 root。新 checkpoint 必须 atomic publish+fsync 后才能
  删除被替代的 resolved-only archive/checkpoint；这保留 cryptographic
  continuity，但不承诺过期 resolved ID 仍可逐项查询。
- 没有 durable confirmed-unsubscribe evidence 的 lifecycle（包括
  `retained-recovery`）必须保留完整 records，不能被 summary 取代或删除。若
  pinned active/archive evidence 本身将超过配置上界，journal health 进入
  fail-closed，下一条 mutation 在 intent/native 前失败并要求 operator
  maintenance；不得删除 unresolved evidence 来腾空间。

### 8. callback 边界与有界队列

callback 输入统一为：

```text
datas: dict[str, dict[field, value]]
```

callback 只执行：

```text
确认顶层是dict
  -> 有界安全复制完整{code:tickData,...}
  -> 记录capturedAt
  -> 关联subscriptionId
  -> non-blocking入队
  -> 返回
```

禁止：

- HTTP、等待 datasource。
- DataFrame/pandas 转换。
- 价格、时间或 alias 解析。
- Redis/MySQL I/O。
- canonical conversion、strategy、notification。
- 无限循环、无界重试。

队列配置：

```text
global callback count hard limit
global bytes hard limit
max symbols per callback
max native bytes/depth/collection
snapshot hard age
max posts per run_time
```

没有 per-symbol retry/dedup queue。容量不足、超龄、JSON 不可编码或 datasource 不可用时允许丢弃并写有界限频日志；不补发。bridge 只按顶层 code entry 做可复制性、JSON-safety 与 size/depth guard，不解析任何行情字段；单个 entry 失败时只丢该 entry，剩余 accepted map 仍入队。正式 provider-field validation 在 backend。

### 9. QMT snapshot route

一次 callback 对应一次 POST：

```json
{
  "ownerId": "bigqmt-1234",
  "leaseToken": "...",
  "generation": 1,
  "subscriptionId": 123,
  "capturedAt": "RFC3339",
  "native": {
    "300502.SZ": {
      "...": "get_full_tick tick fields"
    },
    "600030.SH": {
      "...": "get_full_tick tick fields"
    }
  }
}
```

datasource 接受前检查：

- current `ownerId + leaseToken + generation`。
- `subscriptionId` 是 current whole ID 或 current single ID。
- `native` 是非空、bounded、JSON-safe 的 `{code: object}`。
- 每个 code 属于该 ID 的 current symbol set；非法 code 可逐项剔除，不能阻塞同 callback 的其他合法 code。
- 若没有合法 code，整条拒绝。

上述 provider allocation 校验统一命名为 `current handle membership`。它只回答
“这个 code 是否属于 datasource 已有 whole/single handle 分配”，不读取
`SecuritySourceConfig`、不判断 Mist 业务授权，也不解析 `securityId`；文档中
不得再把它称为 datasource allowlist。

成功只需 HTTP 2xx；不返回 item ack、sequence 或 retry instruction。bridge 不重试。

#### Bridge → datasource provider-local fence 与 TDX snapshot 简化

两边 snapshot request 只共享：

```text
leaseToken
capturedAt
native
```

owner fence 与 provider extension 保留各自真实语义：

```text
TDX: streamEpoch + symbol
QMT: ownerId + generation + subscriptionId
```

TDX `/tdx/bridge/snapshot` 目标 request 为：

```json
{
  "leaseToken": "...",
  "streamEpoch": "...",
  "symbol": "600030.SH",
  "capturedAt": "RFC3339",
  "native": {
    "...": "TDX get_market_snapshot object"
  }
}
```

TDX 必须删除：

- bridge `producerSequence` counter 与 request 字段；
- snapshot POST 使用相同 body 的自动 retry；
- datasource route/model 的 `producerSequence`；
- gateway producer-sequence duplicate/out-of-order state、比较与 rejection；
- success response 的 `accepted/sequence` item ack；bridge 只判断 HTTP status，
  不读取 datasource formal sequence；
- 只用于该链路的 tests、metrics、health、evidence 和文档字段。

TDX 与 QMT 都对每份 snapshot 只进行一次 POST attempt；失败、超时或无法得到
响应时允许丢失，不重试、重放或补发。重复 provider state 后续再次到达时允许
再次接受。success 只使用 HTTP 2xx，不返回 item ack、sequence 或 retry
instruction。datasource 不再为任一 source 分配 formal sequence；请求内的
TDX `streamEpoch` 与 QMT `ownerId + generation` 只在
bridge→datasource 验证期间使用。

### 10. datasource → backend 统一 formal frame

外层沿用当前 WS message：

```text
type = realtime.native_snapshot
provider = qmt | tdx
timestamp = datasource发送时间
```

TDX/QMT 都使用唯一 active schema v2：

```json
{
  "type": "realtime.native_snapshot",
  "provider": "qmt",
  "timestamp": "2026-07-25T10:00:00+08:00",
  "data": {
    "schemaVersion": 2,
    "capturedAt": "2026-07-25T10:00:00+08:00",
    "native": {
      "300502.SZ": {
        "...": "QMT callback tickData"
      }
    }
  }
}
```

TDX 使用完全相同的 envelope：

```json
{
  "type": "realtime.native_snapshot",
  "provider": "tdx",
  "timestamp": "2026-07-25T10:00:00+08:00",
  "data": {
    "schemaVersion": 2,
    "capturedAt": "2026-07-25T10:00:00+08:00",
    "native": {
      "600030.SH": {
        "...": "TDX get_market_snapshot object"
      }
    }
  }
}
```

固定规则：

- outer exact keys 为 `type`、`provider`、`timestamp`、`data`；
  `type` 必须是 `realtime.native_snapshot`，`provider` 必须是当前连接对应的
  `tdx|qmt`，`timestamp` 必须是 RFC3339 datasource 发送时间。
- `data` exact keys 为 `schemaVersion`、`capturedAt`、`native`。
- `schemaVersion` 必须严格等于 `2`；active runtime 不同时接受 schema v1。
- `capturedAt` 是 bridge 观察到该 snapshot/callback 的时间；外层
  `timestamp` 是 datasource 创建 WS message 的时间；二者都必须是 RFC3339，
  且不能合并。
- `native` 必须是非空、bounded、JSON-safe 的
  `{providerSymbol: providerNativeObject}` map；key 必须符合 source 的 provider
  symbol contract，value 必须是 object。
- QMT 直接保留 callback one/multi-code map。
- TDX datasource 使用 bridge request 的独立 `symbol` 作为 map key，把一个
  flat native object 包装成恰好一个 entry 的 map；不得把 code 注入或改写 TDX
  native。
- formal frame 不包含 `payloadType`、`source`、`acquisitionProfile`、
  `streamEpoch`、`sequence`、`sequenceScope` 或独立 `symbol`。
- top-level `provider` 选择 source-specific native decoder/converter；统一
  envelope 不表示 TDX/QMT native 字段、时间字段或数值 alias 相同。

#### 时间语义与聚合边界

TDX/QMT 使用同一套时间责任边界，但不共享 provider-native 字段映射：

| 字段 | 产生位置与含义 | 可否用于行情聚合 |
|---|---|---|
| QMT native `time/stime/timetag` | provider 原始对象中同一 business time 的候选表示；全部原样保留 | 只能在 QMT converter 按 accepted fixture 规范化后使用 |
| TDX native time field | `get_market_snapshot` 原始对象中由 accepted TDX fixture 确认的 business time | 只能在 TDX converter 按 accepted fixture 规范化后使用 |
| canonical `eventTime` | source converter 从 provider-native business time 规范化得到的 RFC3339 时间 | **唯一允许用于 candle 分桶、交易日归属和时间排序的时间** |
| `capturedAt` | bridge 观察 callback/snapshot 的本机时间 | 否，仅用于 callback/transport latency 与 freshness |
| formal outer `timestamp` | datasource 创建并发送 WS message 的本机时间 | 否，仅用于 datasource transport 观测 |
| `acceptedAt` | Mist common ingress 接受 observation 的本机时间 | 否，仅用于 runtime/freshness |
| journal/control timestamps | subscription 控制与留证时间 | 否 |

本 change 不实现 candle，但它固定下游输入 contract：

- 两个 source converter 都只能从完整 `native` 中解析 provider business time，
  不能从 `capturedAt`、formal `timestamp`、`acceptedAt` 或当前系统时间构造
  `eventTime`。
- QMT 当前 runtime 的有序候选和每个候选的 parser 由生产 fixture/HIL 激活；
  TDX 的字段与 parser 同样必须由 accepted TDX raw fixture 激活。
- `eventTime=null` 的 price-valid observation 仍可进入 common latest，供
  latest-state 展示和 freshness 诊断，但所有 realtime candle/聚合 consumer
  必须跳过它并记录低基数原因，不能改用任一测量时间补位。
- 未来 Theme B B1 必须直接消费 canonical `eventTime`，而不是重新读取 native
  alias，也不能使用 transport 到达顺序模拟业务时间。

### 11. backend decoder、两套 converter 与公共 ingress

公共 formal decoder 新建在 realtime 公共目录，固定职责为 strict 解码唯一
active schema-v2 envelope；它不承担任何 provider-native 字段转换：

```text
apps/mist/src/realtime/realtime-native-map-frame.ts

decodeRealtimeNativeMapMessage(raw, expectedProvider)
  -> exact outer/data keys
  -> type/schemaVersion/provider/RFC3339
  -> native map type/cardinality/byte hard limit
  -> iterable entries
```

`expectedProvider` 来自当前 TDX 或 QMT WS client；message 中的 `provider`
不匹配时整帧拒绝。公共 decoder 只证明 `native` 顶层是非空 bounded object，
不解析 `time/stime/timetag`、价格、盘口、累计量或跨 provider alias。为了保证
QMT multi-code 隔离，它也不因一个 map value malformed 而拒绝其他 entry。

decoder 后固定按以下顺序处理：

```text
遍历 native entries
  -> 逐 entry 校验 providerSymbol 与 native object
  -> source business allowlist.resolve(providerSymbol)
  -> 取得 canonical securityId
  -> 调用对应 source converter
  -> 每个 accepted entry 调用 handleSnapshot()
```

- TDX formal map 必须恰好一个 entry；空 map 或多 entry 是整帧 contract
  rejection。
- QMT formal map 可以有一项或多项，但不得超过统一 hard limit。
- envelope、provider、schema、时间格式、map 类型或 cardinality 错误拒绝整帧。
- 单个 providerSymbol、allowlist、native object 或 converter 错误只拒绝该
  entry；converter exception 必须在 entry 边界 containment，不能断开 WS
  client，也不能阻塞同帧其他合法 entry。
- 全部 entry 都失败时不调用 ingress，但必须记录一份 frame decode 成功、
  accepted entry 为零的低基数诊断。
- 两边都不执行 formal epoch/sequence fence，也不对相同 native observation
  去重；相同状态后续再次到达时仍可进入 ingress 并覆盖 latest。

Mist backend 的 TDX/QMT source business allowlist 统一提供：

```text
resolve(providerSymbol) -> securityId | null
```

`resolve()` 同时完成授权与 canonical identity 解析，是本 change 唯一的业务
授权与 `providerSymbol -> securityId` owner。未授权 entry 不进入
converter；QMT 不再只返回 boolean 后让 converter 或 ingress 再猜
`securityId`。初始化还必须验证 TDX/QMT 两份 source business allowlist 的 resolved
`securityId` 不重叠；冲突时 fail closed，避免 transport-only 阶段由 snapshot
到达顺序隐式完成 source switch。allowlist 只限定允许通过本通路的最大集合，
不在本 change 中等同于 `Security.status` 驱动的 current desired subscription。
Datasource 已通过的 `current handle membership` 只证明 provider allocation，
不能替代这里的 business authorization；反之，backend allowlist 也不证明某个
code 属于 callback 携带的 `subscriptionId`。

conversion 实现固定为两个同职责、同相对路径的新文件：

```text
apps/mist/src/sources/tdx/realtime/native-snapshot.converter.ts
apps/mist/src/sources/qmt/realtime/native-snapshot.converter.ts
```

两者分别导出一个小而明确的入口：

```text
convertTdxNativeSnapshot({
  securityId,
  providerSymbol,
  capturedAt,
  native
})

convertQmtNativeSnapshot({
  securityId,
  providerSymbol,
  capturedAt,
  native
})
```

实施约束：

- 两个 converter 只接收已经解析的
  `securityId + providerSymbol + capturedAt + native`，不自行访问 allowlist，
  也不接收 formal frame、lease、epoch、sequence、subscription ID 或
  acquisition profile。
- 两者只共享 `CanonicalRealtimeSnapshot` 类型和公共 ingress；不得建立 generic
  provider adapter、继承层、公共 alias table 或跨 source 字段猜测。
- 不复用、包装、转调或继续 import 当前
  `tdx/qmt/realtime/realtime-native.adapter.ts`。旧 adapter 与依赖 v1 frame 的
  tests 在新 fixture 测试通过后删除，不保留 active compatibility branch。
- TDX converter 按 accepted TDX raw fixture 重新实现必要的价格、累计量和时间
  映射；不改变 `get_market_snapshot` native object，且不允许任何本机时间
  fallback。
- QMT converter 按本次 accepted callback fixture 实现；把 fixture 激活的
  `time/stime/timetag` 有序候选规范化为同一个 business `eventTime`。
  候选未被生产 fixture 证明、无法解析或无法按 fixture 规则证明一致时，
  `eventTime=null`。
- converter 不负责 allowlist、map iteration、重试、去重、排序、持久化或
  subscription control。

canonical snapshot 固定为：

```ts
type CanonicalRealtimeSnapshot = Readonly<{
  source: 'tdx' | 'qmt';
  securityId: number;
  providerSymbol: string;
  eventTime: string | null;
  capturedAt: string;
  prices: Readonly<{
    last: number;
    open: number | null;
    high: number | null;
    low: number | null;
    lastClose: number | null;
  }>;
  cumulativeVolume: number | null;
  cumulativeAmount: number | null;
  quality: Readonly<{
    eventTimeAvailable: boolean;
    partialPrices: boolean;
  }>;
  native: Readonly<Record<string, unknown>>;
}>;
```

- formal frame 没有 standalone `symbol`；canonical 中的 `providerSymbol`
  来自拆分后的 native-map key，不能改用 `Security.code` 或从 native value
  猜测。
- `securityId` 来自当前 source business allowlist 的 `resolve()` 结果，是 Mist 内部
  canonical identity。
- `capturedAt` 来自 formal frame；`eventTime` 只来自 fixture-backed provider
  business-time 字段。Mist 接收时刻 `acceptedAt` 属于 ingress/runtime
  metadata，不写入 canonical snapshot，也不能冒充 provider event time。
- `native` 保留该 provider symbol 对应的完整原生 object。WebSocket JSON
  decode 已形成本次 observation 的对象边界，converter 以 readonly contract
  使用它，不做第二次大对象深拷贝，也不得修改字段。
- canonical snapshot 不含 `symbol`、`streamEpoch`、`sequence`、
  `sequenceScope`、`acquisitionProfile` 或 event identity。

QMT native 必须保留完整单品种 tickData；QMT converter 不删除 order book 或
provider 扩展。`time/stime/timetag` 作为同一个 business time 的候选表示，
其有序 fallback、解析格式和一致性检查只由生产 fixture 固定；无法可靠解析
时 `eventTime=null`，不使用 backend 当前时间伪造。缺少可靠 event time 不
单独导致价格合法的 observation 被拒绝，此时
`quality.eventTimeAvailable=false`，但该 observation 不具备 candle 聚合资格。
TDX converter 继续以 accepted TDX raw fixture 固定自己的时间与价格规则，
并受同一“provider business time only”聚合约束。

公共 `RealtimeSnapshotIngressService` 只保存 canonical latest：

```text
Map<securityId, CanonicalRealtimeSnapshot>
```

本 change 不建立 desired-subscription coordinator 或
`effectiveSourceBySecurityId`。`handleSnapshot()` 只接收已经通过当前
connection source business allowlist 解析、且已通过 cross-source business-allowlist conflict
gate 的 canonical snapshot，并覆盖同一个 `securityId` 的 latest。相同或较旧
provider state 不使用顺序字段比较，仍可覆盖 latest。

latest 的当前静态内存上界由两份有界 source business allowlist 的 resolved union 决定。
运行期间 `Security.status` 或 source config 变化不会在本 change 中动态重算
desired set、发送 subscription mutation 或清理 latest；backend restart 仍会
自然清空内存。后续 subscription-lifecycle change 必须新增 current desired /
effective-source ownership，并在成功退订或 accepted desired transition 后定义
latest cleanup。

TDX/QMT 各自保留一个同职责、provider-local runtime store，但只保存连接与
诊断状态：

```text
connected
ready
ownerId
generation
datasourceBuildId
bridgeBuildId
lastAcceptedAt
lastCapturedAt
lastError
bounded reject counters
```

source runtime store 不再保存另一份完整 native/canonical snapshot，也不保留
`lastSequence`、`currentStreamEpoch`、per-symbol sequence fence 或
`epochMismatch/duplicate/outOfOrder` rejection。owner generation 仍用于
control/health，不能重新成为 backend snapshot ordering fence。断线时标记
`connected=false/ready=false`，latest 暂时保留并由 `lastAcceptedAt` 显示
stale；backend restart 后内存自然清空。

internal diagnostic endpoint 通过 provider allowlist 把
`providerSymbol -> securityId`，再组合公共 ingress latest 与 source runtime
health。diagnostic snapshot 不再返回 epoch/sequence；freshness 使用
backend `acceptedAt/lastAcceptedAt`，provider time 仍单独显示
`eventTime`。现有 `RealtimeSymbolSequenceFence`、active client/store 中仅为
epoch/sequence rejection 服务的字段、代码和 tests 在 v2 切换时一并删除。

本层不执行历史、K线、strategy 或持久化。Theme B B1 后续只能消费上述
canonical identity 与时间语义：不得重新依赖 transport sequence/epoch；
candle event-time ordering、重复 latest-state 处理和 backend processing
time 必须在 B1 change 中独立定义。

### 12. TDX control 对齐

对外 request/response 使用与 QMT 相同的四种消息类型与 `success|failure` union，但 success value 保持 provider-specific。

TDX provider-native control 依据：

- [TDX 订阅行情更新](https://help.tdx.com.cn/quant/docs/markdown/ctx.stock.md/mindoc-1h1104d65vr68.html)
- [TDX 取消订阅更新](https://help.tdx.com.cn/quant/docs/markdown/ctx.stock.md/mindoc-1h112vh7jtsms.html)
- [TDX 获得订阅列表](https://help.tdx.com.cn/quant/docs/markdown/ctx.stock.md/mindoc-1h1137r4k2mas.html)

```text
sync_subscriptions:
  -> source-local gate: desired exact + desiredRevision++
  -> terminal bridge native unsubscribe/subscribe/list
  -> 只按新desired和current revision收敛

subscribe:
  -> source-local gate: desired union symbol + desiredRevision++
  -> 既有TDX bridge按新desired收敛

unsubscribe:
  -> source-local gate: desired difference symbol + desiredRevision++
  -> terminal bridge native unsubscribe
  -> fresh terminal-native active list验证

get_subscriptions:
  -> datasource-private nativeProbeRevision++
  -> terminal bridge强制native list probe并回报同一revision
```

TDX terminal bridge 的 control `/tdx/bridge/poll|result`、native
`subscribe_hq/get_market_snapshot` 保持；
`/tdx/bridge/snapshot` 按第 9 节删除 `producerSequence`、自动 retry 与
producer dedup。datasource→backend 则按第 10、11 节迁移为统一 schema v2
和全新 TDX converter。poll/result 增加 datasource-private
`nativeProbeRevision`，但 backend-facing 三种
mutation 的 datasource orchestration 必须调用现有
`set_desired/add_desired/remove_desired` 等价 transition，并共用同一个
source-local mutation gate。gate 串行化 target transition 与 bridge
reconcile instruction emission；poll 不得从旧 desired 生成反向 subscribe。
短暂重复 control 调用由现有 `desiredRevision` stale-result fence 和后续
terminal-native list/reconcile 向唯一 target 收敛；公共 mutation 只有在
current bridge result 已证明
postcondition 后才返回 `success:null`。

TDX `unsubscribe(symbol)` 的最终判定固定为：

| terminal-native postcondition | backend-facing wire result |
| --- | --- |
| current owner/epoch/revision 的 fresh native list 已不含 symbol | `success:null` |
| fresh native list 仍含 symbol | `failure{symbol,reason:"TDX_UNSUBSCRIBE_NOT_CONVERGED",subscriptionState:"subscribed"}` |
| native list probe 失败、超时、owner 被替换或返回无法规范化的结果 | `failure{symbol,reason:"TDX_UNSUBSCRIBE_VERIFY_FAILED",subscriptionState:"unknown"}` |

官方取消订阅样例的说明文本与 `ErrorId` 存在矛盾，因此
`unsubscribe_hq` 的 immediate payload、错误文本或 invocation exception
都不能单独决定公共结果。它们只进入 bounded structured local log/evidence；
只要后续 authoritative list 已不含 symbol，公共结果仍为成功。若最终 list
仍含 symbol 或无法读取，使用上表的稳定 reason。TDX `sync_subscriptions`
取消阶段复用同一判定，并只把确定性执行顺序中的第一项失败返回给调用方。
无论公共结果是 success 还是 failure，已经发布的 unsubscribe/sync target
不得回滚成旧 desired；否则 terminal bridge 会把刚取消的 symbol 自动补订。

两条 snapshot acquisition 的差异也保持显式：

| 项目 | TDX | QMT |
| --- | --- | --- |
| callback 外形 | dirty notification，官方样例为 `{"Code":"300502.SZ","ErrorId":"0"}` | native map：`{"300502.SZ":{...tickData...}}`；whole 可包含多个 changed symbols |
| callback 后动作 | bridge worker 再调用 `get_market_snapshot` | 不再二次查询，直接有界复制 callback native map |
| bridge→datasource | `leaseToken/streamEpoch/capturedAt/symbol/native`，one attempt，无 producer sequence | `ownerId/leaseToken/generation/capturedAt/subscriptionId/nativeMap`，one attempt |
| datasource 输入 | separate `symbol` + one flat native object | one `{code: tickData}` native map |
| 正式 frame | 统一 schema v2；datasource 包装成 one-entry native map | 统一 schema v2；保留 one/multi-entry callback map |
| backend 转换 | 全新 TDX converter，只消费单项 provider native | 全新 QMT converter，逐项消费 provider native |
| 质量 | latest-state snapshot；不宣称 tick-complete | `latest-state native snapshot`；“与 `get_full_tick` 结构相同”不表示传输每一笔 tick |
| 时间字段 | 以 accepted TDX fixture 重新实现简化 converter | `time/stime/timetag` 精确映射由生产 fixture/HIL 决定；无法证明时 `eventTime=null` |

### 13. 静态 source identity 与未来 subscription lifecycle

- control wire 使用 provider symbol；`Security.code` 不带市场后缀，canonical
  identity 仍由 source config/allowlist 解析为 `securityId`。
- 同一 `securityId` 不能同时出现在 TDX/QMT realtime allowlist；本 change 在
  初始化时拒绝冲突，不根据 snapshot 到达或 control success 实现 source
  switch。
- 现有 allowlist 初始化可以校验当时的 `Security.status=ACTIVE`，但该查询只用于
  启动时授权与 identity resolution，不能成为自动 sync、subscribe 或
  unsubscribe trigger。
- 本 change 的 Mist control client 不拥有或自动派生业务 desired set，也不因
  control success 修改业务 `Security`、source config 或 common latest。
  TDX datasource 为驱动现有 terminal bridge 而维护的 transport-level
  `desiredSymbols/desiredRevision` 仍然存在，并由每次明确 control call
  原子更新；它不等于未来 lifecycle coordinator。
- 后续独立 change 才实现定时 reconciliation：读取
  `Security.status=ACTIVE` 与 source config，按 `securityId` 去重并建立
  current desired/effective-source view，再调用本 change 提供的四个内部方法。
- source 变动、active 状态切换、latest cleanup、重试 cadence 与 runtime
  source switch 的失败语义都留给该 follow-up；不得在本 change 中暗含。

### 14. Python 3.6 与 bridge 运行约束

- 不使用 `dict[...]`、`list[...]`、`X | Y`、`match`。
- 不假设 `__file__` 存在。
- 不要求 native method 支持 `inspect.signature()`。
- callback queue 使用明确线程安全的 lock/deque，并设置 hard limit。
- 不依赖 pandas。
- callback 异常必须被 containment，不能终止 strategy。
- `run_time` 串行执行 poll、单 native call、result 与 bounded snapshot drain，不新增后台 worker thread。

### 15. Monitoring

共同 control counter：

```text
mist_realtime_subscription_control_total{
  source = qmt | tdx,
  operation = sync_subscriptions | subscribe | unsubscribe | get_subscriptions,
  result = success | failure,
  reason = bounded_enum
}
```

`result=success` 时 `reason` 必须精确为 `"none"`，使所有成功样本都携带完整且
一致的四标签集合；`result=failure` 时 `reason` 必须是已记录的 bounded
stable code，禁止空值、遗漏或 free-form text。

source lifecycle 的 monitoring 判定必须逐 source 独立：

- TDX 或 QMT 显式为 `off` 时，报告 intentional rollback mode，不因该 source
  缺少 owner、subscription 或 snapshot 发 unavailable/freshness alert；另一
  enabled source 的 metrics 与 alerts 继续输出。
- enabled source 在 startup/session grace 内只展示 control、subscription 与
  freshness 状态；超过 grace 后按具体失败类别报警。
- 闭市或其他不期待 supported-session observation 的时段，不得仅因 snapshot
  不新鲜报警，也不得把 silence 当作 control ready 或 unsubscribe success。

至少增加：

```text
QMT current whole ID present
QMT current single ID count
subscribe/unsubscribe failure
journal append/fsync failure
operator reconciliation required after datasource restart
datasource-visible snapshot accepted/rejected
snapshot native code count
snapshot age
backend formal frame decoded/rejected
backend canonical entry accepted/rejected
allowlist identity rejection/cross-source configuration conflict
owner/lease ready
TDX terminal-native list/unsubscribe/read-barrier failure
```

不长期使用 symbol、subId、native error text 或 journal sequence 作为 metric label。symbol/subId 只进入脱敏限频日志。bridge-local callback/queue drops 不增加 telemetry wire；HIL 通过本地日志采集。
`subscriptionState` 供 control response、结构化日志和 health 展示，不新增为
metric label；TDX/QMT 继续使用完全相同的 control counter 维度。backend
formal-frame 与 canonical-entry counter 必须分开，使一份有效 QMT envelope
中的 accepted/rejected entry 可同时被观察；不得恢复 symbol label、
sequence/epoch health 或 duplicate/out-of-order counter。

### 16. Fixtures 与验证

本 change 严格区分 provider raw fixture 与 datasource→Mist formal frame
golden，二者不得共用 owner 或用同一个 SHA 互相替代。

Provider raw fixtures 由 `mist-datasource` 与 Windows provider HIL 采集和
维护，用于固定 provider-native callback/snapshot 的原始 shape、字段、类型和
business-time 候选：

```text
subscribe_quote result_type=dict one-code callback
subscribe_whole_quote one-code callback
subscribe_whole_quote multi-code callback
get_full_tick reference tickData
TDX get_market_snapshot flat native
```

每份 accepted raw fixture 必须记录独立 raw SHA；它只证明 provider input 和
converter mapping，不是跨仓 WebSocket formal contract 的 golden。

正式 schema-v2 golden 继续遵循
`relocate-cross-repo-contract-assets` 已确定的 canonical/pinned contract：

```text
canonical:
  mist/test/fixtures/realtime/realtime-native-frame-v2.json
  mist/test/fixtures/realtime/realtime-native-frame-v2.sha256

pinned copies:
  mist-datasource/tests/fixtures/realtime/realtime-native-frame-v2.{json,sha256}
  mist-deploy/scripts/fixtures/realtime/realtime-native-frame-v2.{json,sha256}
  mist-monitoring/tests/fixtures/realtime/realtime-native-frame-v2.{json,sha256}
```

`mist` 是 formal golden 的唯一 canonical owner。formal fixture 必须覆盖 QMT
one-code、QMT multi-code 与 TDX one-entry map 的 exact schema-v2
outer/data keys；三个 consumer 仓保存字节一致的 pinned copy，各仓 contract
test 只读取本仓文件并重新计算 sidecar SHA，不依赖联网或同时 checkout 其他
仓。跨仓 candidate/release gate 再比较四份 JSON 字节和四份 sidecar，要求
全部固定同一个 formal SHA。现有 schema-v1 golden 不得继续作为 active
schema-v2 验收依据；若为 legacy-rejection test 保留，必须明确隔离，不能满足
active golden gate。archive 中的历史 fixture 不重写。

fixture chain：

```text
accepted provider raw fixture (raw SHA)
  -> bridge snapshot body
  -> datasource unified formal frame v2
  -> canonical/pinned formal golden (formal SHA)
  -> common envelope decoder
  -> QMT native converter
  -> per-code canonical snapshot
  -> common ingress
```

TDX fixture chain：

```text
TDX dirty callback
  -> accepted get_market_snapshot flat raw fixture (raw SHA)
  -> bridge snapshot body
  -> datasource wraps {symbol:native}
  -> unified formal frame v2
  -> canonical/pinned formal golden (formal SHA)
  -> common envelope decoder
  -> TDX native converter
  -> canonical snapshot
  -> common ingress
```

control end-to-end HIL 使用 test-only in-process harness。该 harness 通过 Nest
application context 构造正常的 TDX/QMT realtime client，并作为目标 provider
唯一 backend leader 连接 datasource；正常 Mist backend 的同 source client
必须先停止或隔离，避免第二条连接抢占 leader。harness 直接调用
`syncSubscriptions/subscribe/unsubscribe/getSubscriptions`，不得绕过 client
另开裸 WebSocket，也不得添加 production HTTP/diagnostic mutation endpoint。

Windows QMT HIL 使用 `300502.SZ`，whole multi-code 测试再使用一只操作员批准且
allowlisted 的 symbol。交易时段验证：

- `subscribe_quote(... result_type='dict')` 返回 exact integer（允许 `0`）与一项 map。
- `subscribe_whole_quote(exact list)` 返回 exact integer（允许 `0`）与 changed-symbol map。
- tickData 与 `get_full_tick` reference 的逻辑字段/类型。
- `time/stime/timetag` 当前 runtime 的实际存在性、候选优先级、类型、单位、
  时区、精度、同时出现时的一致性，以及 backend `eventTime` 映射。
- callback count、map cardinality、capturedAt latency、queue drop。
- callback count 只用于测量，不得据此宣称每一笔 tick 完整到达。
- unsubscribe 数值返回与 ID 保留/删除规则。
- datasource 逐 code current handle membership、backend 逐 code source
  business allowlist、全新 QMT converter 与 canonical ingress。
- datasource/backend/terminal restart 和 source-scoped rollback。
- bridge installed path/SHA-256/build ID。
- protected tables digest 不变。

TDX native acquisition 不变，但 datasource→backend formal frame 改为统一
schema v2。local contract/integration 必须增加 TDX one-entry map fixture，
证明 request 不含 `producerSequence`、失败不 retry、datasource 不分配 formal
sequence，并用 accepted raw fixture 验证全新 TDX converter。Windows 需要由
同一 test-only in-process harness 验证四种 control 方法及
`TDX get_market_snapshot -> schema v2 -> new converter -> common ingress`；
accepted TDX raw fixture 还必须证明 canonical
`eventTime` 来自 provider-native business time 且没有 receipt-time
fallback。HIL evidence 必须分别记录 raw fixture SHA 与 formal schema-v2
golden SHA，不得把 provider raw capture 称为 formal golden。无需重新定义
未变化的 TDX dirty callback 或其他 provider native 字段 contract。

### 17. 发布与回滚

发布：

```text
OpenSpec/fixtures/tests完成
  -> QMT_REALTIME_MODE=off
  -> 暂停TDX realtime bridge/datasource snapshot traffic
  -> 操作员分别手工覆盖TDX/QMT bridge并记录path/SHA/build
  -> 更新compatible datasource与Mist backend
  -> 按source分别重启受影响datasource并recreate backend
  -> 正常backend确认ready/reconnect不发送control
  -> 停止或隔离正常backend的目标source client
  -> test-only in-process harness调用四种control方法
  -> QMT交易时段callback-to-Mist HIL
  -> TDX control与snapshot-to-Mist HIL
  -> harness尽力syncSubscriptions([])并退出
  -> restart/rollback/protected digest
```

bridge-first 暂时对旧 datasource 报错是维护窗口内的预期状态；此时不得发布 snapshot 或报告 ready。
TDX `producerSequence` wire 删除也属于 incompatible maintenance step；新旧
TDX bridge/datasource 不得被当作 rolling-compatible pair。
正常 backend candidate 启动后没有 production subscription caller，因此不得把
“client ready”写成“订阅已建立”或“realtime 已激活”。部署完成只表示
transport/control primitives 已就绪；`Security.status` 驱动的 production
activation 等待后续 change。

回滚：

- 显式切换 `QMT_REALTIME_MODE=off`。
- 若 HIL harness 仍是唯一 leader，尽可能在旧 bridge/datasource 在线时通过
  `syncSubscriptions([])` 执行 cancel-all；harness 不可用时不虚构其他
  operator mutation 入口。
- 操作员手工恢复旧 bridge并 reload strategy/terminal。
- 若已安装本 change 的 TDX bridge，操作员也必须手工恢复匹配旧 datasource contract 的 TDX bridge并 reload terminal。
- 回滚 datasource/backend image。
- 不回滚数据库、不删除 Redis volume、不修改 TDX mode。
- 退订失败的原 ID 继续留在 journal/registry，并通过 monitoring 显示。

本 change 的主 rollback 仍不修改 TDX mode；但为保留 stable baseline contract，
任何 separately approved rollback 将 TDX 或 QMT 置为 `off` 时，production
baseline 都必须记录 affected source、双 source effective mode、operator
action、backup identifier、reason、精确 recovery command/procedure，以及另一
enabled source 的 monitoring 仍存在；不得把 `off` 写成普通健康、物理退订证明
或长期默认。

### 18. Theme B B1 与 post-close

本 change 的统一 TDX/QMT schema v2 是 `latest-state`、允许丢失和相同状态
重复，且不向 backend 提供 transport sequence。Theme B B1 在解除阻塞前必须：

- 使用新 QMT one/multi-code fixtures。
- 使用 canonical `securityId + providerSymbol` identity 和按 `securityId`
  keyed 的 latest snapshot，不依赖已删除的模糊 `symbol`。
- 不假设 tick-complete 或 formal sequence。
- 重新校准 freshness grace、callback-to-backend latency、drop/capacity。
- candle 分桶、交易日归属和时间排序只使用 canonical provider
  `eventTime`；`capturedAt`、formal `timestamp`、`acceptedAt` 和 backend
  processing time 都不得作为聚合 fallback。
- `eventTime=null` 的 observation 不进入 candle 聚合；另行定义重复
  latest-state 的累计量处理，不得用 transport epoch/sequence 补回顺序保证。

`sync-post-close-provider-history` 等待 B1 归档后实施，因此它继承的是上述
schema-v2 baseline，而不是编写 post-close artifacts 时的旧 schema-v1
baseline。当前 post-close proposal、design、tasks 与
`datasource-provider-contract` delta 必须同步刷新：

- historical `/v1/bars/query`、normalizer、source-specific persistence 与届时
  已接受的手工 bridge 行为保持不变；
- post-close 不修改已接受的 schema-v2 formal realtime frame、fixture/SHA、
  transport mode 或 provider-local bridge fence；
- 不得重新引入或要求已从 formal frame 删除的 `streamEpoch`、`sequence`、
  `sequenceScope` 或 per-symbol sequence fence；
- 只有 diff、fixture/SHA 与 installed bridge evidence 证明 realtime artifact
  未受影响时，post-close 才可引用已接受的 schema-v2 transport HIL 而不重跑；
  TDX/QMT historical API regression、target-day fixtures 与 post-close
  integration 仍必须执行。

本 change 不实现 B1 candle、Redis 产品化或 post-close history sync。

## Risks / Trade-offs

- control 仍为 single-in-flight，且不引入跨进程 opaque operation ID；QMT
  仅使用 datasource-process-local `callSequence` 关联 poll/result 并拒绝旧
  result，不提供并发 request、自动 retry 或跨进程恢复。这是本期明确接受的
  本机单设备约束。
- snapshot 不重试，datasource不可用或队列 overflow 会丢失 realtime observation；与 `latest-state` 质量一致。
- TDX 删除 producer dedup 后，response 丢失不会触发 bridge retry；已接受的
  snapshot 直接进入统一 schema v2，不再分配 formal sequence，也没有 backend
  epoch/sequence fence。
- QMT official docs 对 `time/stime/timetag` 示例存在差异；三者按同一个
  business time 的候选表示处理，生产 fixture 仍是候选顺序、解析与一致性
  规则的 activation gate。
- callback tickData 与 `get_full_tick` 字段相同不等于逐笔完整；whole changed-symbol push 和全推 latest-value 机制只支持 `latest-state native snapshot` 声明。
- 统一 formal frame 不提供 epoch/sequence，因此 TDX/QMT 都没有 backend 级
  duplicate/out-of-order fence；两边 datasource 必须在内部完成
  lease/stale transport rejection。
- 全新 TDX/QMT converter 不复用旧 adapter，初次切换风险由 accepted raw
  fixtures、
  source-specific converter unit tests 和双 source HIL 控制。
- QMT whole callback map 可包含多个 code，单次对象大小必须有 hard limit。
- unsubscribe 返回 contract 只有 HIL 证明数值语义后才能启用物理退订；失败时不删除 ID、不创建 replacement。
- 内部 control 方法当前没有 production caller，存在后续集成前被接口漂移破坏
  的风险；common interface guard、direct-method contract tests 与 Windows HIL
  harness 是本 change 的防漂移证据，不能用空 stub 代替。
- transport-only 阶段不跟随运行期 `Security.status` 变化清理 latest；latest
  只受有界 allowlist 与 backend process lifetime 限制。动态 desired、cleanup
  和 reconciliation 属于后续 change。

## Open Questions / Runtime Gates

- production runtime 中实际存在的 `*all*/*whole*` alias 清单；alias 只记录，不猜测调用。
- `unsubscribe_quote` 当前版本成功数值。
- single/whole 最大订阅数、VIP权限和 whole exact-list规模。
- callback 是否并发/重入及最大单次 code 数。
- `time/stime/timetag` 的实际存在性、类型、单位、时区、精度与 backend 映射，以及 order book 层数和 JSON scalar 的实际类型。
- planned stop/reload 中 QMT callback 停止时序。

## Tooling Status

本机通过 `pnpm` 安装的 OpenSpec CLI 固定版本为 `1.6.0`。本 artifact 修改后
已使用该版本执行 focused strict validation 与 `--all --strict`：2026-07-25
分别为 focused valid、52/52 items passed；未调用未锁定的 `@latest`。产品实现
和归档前仍须按 tasks 重新执行。
