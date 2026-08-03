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
- 保持当前 Chan 算法、HTTP URL、响应和无 persistence 行为。
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

core 使用标准 `high/low`；现有 HTTP VO 的 `highest/lowest` 由 adapter 显式映射。以后若 Chan 用
MACD 判断笔力度，focused change 应从 `close` 派生 Chan-owned calculation 并固定参数、版本和输出；
它不能直接导入公共 IndicatorService 或 Strategy evaluator，也不能在本次 source move 中顺手加入。

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

## Risks / Trade-offs

- [只移动算法但保留 app import] → route/adapter owner 先于 source move 审批，guard test 最终删除精确
  legacy allowlist。
- [误删 `chan-api` 上的 K route] → 用 frontend/gateway consumer inventory 固定当前实际入口。
- [DTO/VO/HttpException 泄漏入 core] → library-owned contract 与 adapter mapping tests。
- [抽取改变 Phase B 或对象引用行为] → 完整 fingerprint、mutation test 和 differential evidence。
- [重新把 Strategy indicators 并入 Chan base] → active Strategy changes 明确改为 evaluator-owned calculation。

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
- 空输入、非法有限值、当前 Channel HTTP error、mutation、算法版本和 numeric comparison 规则。
