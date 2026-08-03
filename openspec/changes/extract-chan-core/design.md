## Context

当前生产 gateway 将 `/api/chan/*` 路由到 `chan-api:8008`，前端通过该入口消费
`/v1/indicators/k` 与 `/v1/chan/*`。与此同时，`apps/mist` 也装配 `IndicatorModule` 和
`ChanModule`；`apps/chan` 则直接导入 `apps/mist/src/chan/chan.module`。因此当前不仅有算法耦合，
还存在 HTTP route、K read adapter 和 Nest module owner 未分离的问题。

Strategy runtime 已有另一条边界：Backtest/Signal 通过 `StrategyMarketDataPort` 获取 canonical
`StrategyBar`，共享 Strategy evaluator 按 field catalog 计算 KDJ/MACD。该链路不应调用当前公共
Indicator API，也不应依赖 ChanCore。

## Goals / Non-Goals

**Goals:**

- 抽取只包含当前 Chan 算法的 `libs/chancore` pure ChanCore。
- 消除 `apps/chan` 对 `apps/mist` 业务源码的 import。
- 保持当前 Chan 算法、HTTP URL、响应和无 persistence 行为，但修正已批准的空历史/不足数据结果。
- 在 source move 前固定 route、adapter、input/output、错误和 differential contracts。

**Non-Goals:**

- 不抽取公共 IndicatorService，不为 Strategy 建立通用 Indicator base。
- 不修改 Strategy KDJ/MACD、field catalog、窗口或 evaluator；这些由
  `evolve-strategy-evaluation-contract` 持有。
- 不新增公共统一 K API，不让 Chan 使用 `StrategyMarketDataPort`。
- 不迁移或删除公共 URL，不修改前端、Compose、gateway 或 monitoring topology。
- 不修订 Chan 算法、不新增买卖点、不写 Chan 表。

## Decisions

### 1. ChanCore 与 Strategy Indicator 计算是两个独立 owner

ChanCore 只服务现有 Chan 分析产品。Strategy 的 KDJ/MACD 是 evaluator-owned fixed-window
calculation，由 Backtest 与 Realtime 通过同一个 Strategy library 复用。本 change 不建立
`@app/analysis/indicator`，Strategy changes 也不导入 ChanCore。

公共 `/v1/indicators/*` 可以继续使用当前 IndicatorService，但它不是 Strategy engine 的计算边界。

### 2. Chan adapter 负责取数，ChanCore 只负责派生计算

pure library 的落位固定为：

- source root：`libs/chancore/src`；
- Nest project key：`chancore`；
- import path：`@app/chancore`。

迁移范围包括当前 Trend、K merge、Fenxing、Bi Phase A/Phase B、Channel Phase A/Phase B、
`bi-range.helper`、`span-merge.helper` 及算法实际使用的 enums/types。迁移后的实现必须是 plain
TypeScript，不保留 `@Injectable()` 等 Nest 装饰器，也不能继续以 HTTP DTO/VO 或 TypeORM Entity 作为
library contract。

`@app/chancore` 的 public barrel 只导出：

- 无状态 `ChanCore`；
- `ChanCore.mergeK(orderedK)`；
- `ChanCore.findFenxings(orderedK)`；
- `ChanCore.createBi(orderedK)`；
- `ChanCore.createChannels(orderedK)`；
- 上述签名实际需要的 algorithm-owned input/output types 和 enums。

四个方法都从同一份原始有序 `ChanK[]` 开始；`findFenxings` 和 `createBi` 在内部完成 K merge，
`createChannels` 在内部完成 K merge、Bi 计算并固定消费 Bi Phase B。public barrel 不导出 Trend、
KMerge、Bi、Channel 实现类、helpers 或 Nest module，也不为当前不存在的调用方增加统一
`analyze()`。内部算法测试可以直接覆盖 library-internal 文件，但测试便利性不能扩大 public exports。

`ChanK` 固定为完整的 raw market-bar value object：

```ts
interface ChanK {
  id: number;
  symbol: string;
  time: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: string | null;
  amount: string | null;
}
```

完整 OHLCVA 是 Chan 自己的可演进输入边界，不表示所有字段都参与当前算法。当前 K merge、Fenxing、
Bi 和 Channel 的判断行为保持不变；`open/close/volume/amount` 为未来笔力度、背驰和量价算法保留。
`volume/amount` 必须保持 canonical decimal string 或 `null`，禁止为方便计算转换成 JavaScript
`number`。`source/period/securityId/type` 仍由 application request/query context 持有，不重复塞进每根
`ChanK`。

`mergeK` 的 library-owned 输出固定为：

```ts
interface ChanMergedK {
  startTime: Date;
  endTime: Date;
  high: number;
  low: number;
  trend: TrendDirection;
  mergedCount: number;
  mergedIds: number[];
  mergedData: ChanK[];
}
```

`startTime/endTime` 分别来自该组合并 K 的第一根和最后一根原始 K；`high/low` 是包含关系算法处理后的
价格，不得重新解释为原始 K 的简单区间极值。`mergedCount` 必须与 `mergedIds.length`、
`mergedData.length` 一致。虽然 `mergedIds` 可由 `mergedData` 推导，当前算法和 HTTP contract 都使用它，
V1 继续显式保留。`mergedData` 保留完整 `ChanK`，使后续 focused strength change 不需要从不完整输出
重新补行情字段。

core 使用标准 `high/low`；现有 HTTP VO 的 `highest/lowest` 由 adapter 显式映射。以后若 Chan 用
MACD 判断笔力度，focused change 应从 `close` 派生 Chan-owned calculation 并固定参数、版本和输出；
它不能直接导入公共 IndicatorService 或 Strategy evaluator，也不能在本次 source move 中顺手加入。
当前 HTTP `KVo` 没有 `volume`；本 change 不扩展公共 HTTP 输出。adapter 将完整 `ChanK` 映射成现有
`KVo` 外观时可以不暴露该字段，但不得因此从 ChanCore 的 `mergedData` 中删除它。

`findFenxings` 的 library-owned item 固定为：

```ts
interface ChanFenxing {
  leftIds: number[];
  middleIds: number[];
  rightIds: number[];
  middleIndex: number;
  middleOriginId: number;
  type: FenxingType;
  high: number;
  low: number;
}
```

三组 IDs 分别保留左、中、右三个合并 K 所包含的全部原始 K identity；`middleIndex` 是中间合并 K 在
本次 `ChanMergedK[]` 中的位置，`middleOriginId` 是中间合并 K 内实际产生顶/底极值的原始 K identity。
两者不能互换，也不得把 `middleIndex` 当数据库 ID。顶分型的 `high` 来自中间最高点、`low` 来自左右
范围；底分型的 `low` 来自中间最低点、`high` 来自左右范围。

V1 不向 `ChanFenxing` 复制三组完整 K 或新增 `time`；算法可使用同一轮上游 `ChanMergedK` 和这些
identity 找到原始行情。HTTP adapter 继续把 core `high/low` 映射成现有 `highest/lowest`。极值相等时
`middleOriginId` 的选择属于后续 numeric/tie-breaking 评审，不在输出字段确认中提前改变。

`createBi` 的 library-owned 输出固定为：

```ts
interface ChanBi {
  startTime: Date;
  endTime: Date;
  high: number;
  low: number;
  trend: TrendDirection;
  type: BiType;
  status: BiStatus;
  independentCount: number;
  originIds: number[];
  originData: ChanK[];
  startFenxing: ChanFenxing | null;
  endFenxing: ChanFenxing | null;
}

interface ChanBiTwoPhaseResult {
  phaseA: ChanBi[];
  phaseB: ChanBi[];
}
```

`startTime/endTime` 是首尾分型实际极值原始 K 的时间，`high/low` 是整笔覆盖范围的算法极值。
`originData` 保留完整、按输入顺序排列并按 identity 去重的 `ChanK[]`；`originIds` 继续显式保留真实 K
identity，不能改成序号或要求 adapter 临时重建。`independentCount` 表示该笔包含的独立原始 K 数量；
它与两个 origin 数组的强一致性规则留给 invariant 评审确认。

`type` 表示结构是否完成，`status` 表示算法有效性，二者不得合并成一个枚举。完整笔必须同时具有
`startFenxing/endFenxing`；未完成笔必须有 `endFenxing=null`，其 `startFenxing` 可以是上一完整笔的
终点，也可以在整段数据尚无分型时为 `null`。未完成笔使用 `Unknown`；完整笔保留现有
`Valid/Invalid` 判定。

`phaseA` 保留局部归约后的预览结果及 invalid 残留，`phaseB` 保留进一步消化 invalid 区间后的结果。
adapter 不得压扁、合并或只返回其中一阶段；Channel 计算固定消费 Bi Phase B。HTTP adapter 递归映射
`high/low → highest/lowest`，并把完整 `ChanK` 映射成当前 `KVo` 外观。

`createChannels` 的 library-owned 输出固定为：

```ts
interface ChanChannel {
  bis: ChanBi[];
  zg: number;
  zd: number;
  gg: number;
  dd: number;
  level: ChannelLevel;
  type: ChannelType;
  status: ChannelStatus;
  trend: TrendDirection;
  startId: number;
  endId: number;
  displayStartId: number;
  displayEndId: number;
}

interface ChanChannelTwoPhaseResult {
  phaseA: ChanChannel[];
  phaseB: ChanChannel[];
}
```

`bis` 保留构成中枢的完整笔序列；`zg/zd` 是重叠区间上下沿，`gg/dd` 是整个中枢覆盖范围极值。
这些名称是 Chan domain contract，不改写成 `high/low`。当前算法只生成 `level=bi`、
`type=complete`，但保留现有 `bi|duan` 和 `complete|uncomplete` 枚举，不在抽取时增加段级或未完成
中枢算法。Phase A 可以包含 `Valid/Invalid`，Phase B 只保留最终 `Valid` 中枢。

当前 `ChannelVo` 把 `startId/endId` 注释为 K 线索引，但实现写入的是中枢首尾原始 K 的真实 identity；
`displayStartId/displayEndId` 同样是为绘制选择的原始 K identity。core 和 HTTP V1 保留现有字段名，
但必须修正注释并禁止对这些 ID 做位置差计算。display identity 仍由算法生成，adapter 不重新计算。

`phaseA` 保留枚举出的基础中枢，`phaseB` 保留延伸、合并和过滤后的最终中枢。adapter 必须保留两个
完整数组，不得压扁结果或只返回 Phase B。

adapter 负责 HTTP DTO、日期解析、source 选择、TypeORM K/Security 查询、升序与有限值校验、
library input mapping、HTTP VO/OpenAPI 和错误映射。ChanCore 不访问数据库、Redis、HTTP、环境变量
或 Nest controller，不写入 Chan persistence。

这不建立公共统一 K API，也不复用 StrategyMarketDataPort。`chan-api` 如何复用或独立持有当前
TypeORM K read adapter，必须在 source move 前单独确认。

### 3. 先固定现有行为，再移动算法

现有 K merge、Fenxing、Bi Phase A/Phase B 和 Channel Phase A/Phase B fixtures 是初始基线。
实施前还需增加完整 raw K → merged K → Fenxing/Bi/Channel fingerprint，明确结构/枚举/顺序/日期
精确比较和浮点规则。

已归档的 `fix-chan-wide-bi-distance` 是本 change 的前置算法修复，不再属于待移动的旧行为。抽取前后的
Bi characterization 必须固定以下语义：宽笔起止端点在当前候选 `originData` 中各自唯一出现；两端之间
的独立 K 数量按该有序数组的位置差计算，与 MySQL 全局自增 K ID 是否连续无关。端点缺失或重复属于
算法不变量破坏，必须继续失败，不能回退到 ID 算术或静默猜测。

后续发现的其他算法修复仍必须另开 change，不能夹带进 source move。

### 4. 不预先发明新的 Chan identity 或时间字段

本 change 尚未批准把当前 `id/time/mergedIds/originIds` 改成 `reference/timestampMs/ordinal` 等新模型。
先盘点每个现有字段究竟由算法还是 HTTP 输出消费，再以行为保持为目标定义 library-owned types。
未来 Realtime Chan 若需要临时 ordinal，必须在对应 focused change 中重新评审。

### 5. `chan-api` 是 Chan 公共路由的长期唯一 owner

生产 gateway、frontend 和 monitoring 已经把独立部署的 `chan-api:8008` 作为正式 Chan runtime，
因此 `/v1/chan/*` 的长期唯一 owner 固定为 `apps/chan`。算法单独部署是产品边界，不要求
`mist-backend` 参与 Chan 请求执行。

本 change 只抽取 core 并建立 `apps/chan` 自有 adapter，不把内部重构与公共 route deletion 合并。
`apps/mist` 当前重复注册的 `/v1/chan/*` 在本 change 中保持兼容，后续独立 route migration 必须完成
consumer audit、OpenAPI/gateway contract 和回滚评审后再删除。

仍需在 source move 前确认 `chan-api` 当前 `/v1/indicators/k` 前端链路如何保持，以及 TypeORM K read
adapter、Controller、VO mapping 和 Nest module 在 `apps/chan` 内的具体落位。

### 6. 空 K 是合法零结果，不是 invalid input

pure ChanCore 对空的已批准 K 序列固定返回：

```ts
mergeK([])          // []
findFenxings([])    // []
createBi([])        // { phaseA: [], phaseB: [] }
createChannels([])  // { phaseA: [], phaseB: [] }
```

非空但不足以形成某级 Chan 图形时同样返回算法自然产生的空数组或未完成笔，不抛出“数据不足”异常。
空 MySQL 查询是成功结果，不能伪装成数据库失败或请求结构错误。

当前 `/v1/chan/channel` 在 K 查询为空后把内部空 Bi Phase B 传给 `ChannelService`，最终向只提交了
查询条件的调用方暴露 `400 Invalid input: bi array cannot be empty`。该信息既误判成功空查询，也泄漏
内部 Bi 实现。本 change 明确批准修正这一处：保留 HTTP `200` 和既有 envelope/VO shape，在 data 中
返回 `{ phaseA: [], phaseB: [] }`。adapter 不再为了兼容旧错误而制造空 Bi 异常。

这是本 change 唯一批准的 HTTP 行为修正；其他响应、错误、URL 和 OpenAPI contract 仍按行为保持
门禁执行。

## Risks / Trade-offs

- [只移动算法但保留 app import] → route/adapter owner 先于 source move 审批，guard test 最终删除精确
  legacy allowlist。
- [误删 `chan-api` 上的 K route] → 用 frontend/gateway consumer inventory 固定当前实际入口。
- [DTO/VO/HttpException 泄漏入 core] → library-owned contract 与 adapter mapping tests。
- [抽取改变 Phase B 或对象引用行为] → 完整 fingerprint、mutation test 和 differential evidence。
- [重新把 Strategy indicators 并入 Chan base] → active Strategy changes 明确改为 evaluator-owned calculation。
- [把空历史误判为非法请求] → core/HTTP 空结果 fixtures 与 error-governance contract test。

## Migration Plan

1. 同步已归档的 `fix-chan-wide-bi-distance`，固定 current routes、consumers、full-output fixtures 和
   app import baseline。
2. 逐项确认 library、types、error/numeric/mutation/version contracts。
3. 按已确认的 `chan-api` route owner，确认 K read adapter 和现有 Indicator K compatibility。
4. 将 K merge、Fenxing、Bi、Channel 算法移动到 pure ChanCore。
5. 按 owner 结论重接 HTTP/TypeORM adapters，删除 app-to-app import allowlist。
6. 运行 differential、HTTP/OpenAPI、build、full backend 与 strict OpenSpec gates。
7. 路由迁移、公共 Indicator 重构或算法修复作为 residual change，不混入本次抽取。

## Open Questions

- `chan-api` TypeORM K read adapter 与 `/v1/indicators/k` 兼容链路如何落位。
- 各 ChanCore 输出类型的最小现有字段集合，以及 HTTP adapter 如何恢复当前 VO。
- 非法有限值、mutation、算法版本和 numeric comparison 规则。
