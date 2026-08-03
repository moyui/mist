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

- 抽取只包含当前 Chan 算法的 pure ChanCore。
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

adapter 负责 HTTP DTO、日期解析、source 选择、TypeORM K/Security 查询、升序与有限值校验、
library input mapping、HTTP VO/OpenAPI 和错误映射。ChanCore 不访问数据库、Redis、HTTP、环境变量
或 Nest controller，不写入 Chan persistence。

这不建立公共统一 K API，也不复用 StrategyMarketDataPort。`chan-api` 如何复用或独立持有当前
TypeORM K read adapter，必须在 source move 前单独确认。

### 3. 先固定现有行为，再移动算法

现有 K merge、Fenxing、Bi Phase A/Phase B 和 Channel Phase A/Phase B fixtures 是初始基线。
实施前还需增加完整 raw K → merged K → Fenxing/Bi/Channel fingerprint，明确结构/枚举/顺序/日期
精确比较和浮点规则。任何算法修复必须另开 change。

### 4. 不预先发明新的 Chan identity 或时间字段

本 change 尚未批准把当前 `id/time/mergedIds/originIds` 改成 `reference/timestampMs/ordinal` 等新模型。
先盘点每个现有字段究竟由算法还是 HTTP 输出消费，再以行为保持为目标定义 library-owned types。
未来 Realtime Chan 若需要临时 ordinal，必须在对应 focused change 中重新评审。

### 5. HTTP adapter owner 是 source move 前置门禁

仅抽取 pure functions 不能自动消除 app-to-app import。必须先确认：

- `/v1/chan/*` 长期由 `chan-api`、`mist-backend` 或经过独立迁移期持有；
- 当前两个 app 的 route 是否都必须暂时保留；
- `chan-api` 当前 `/v1/indicators/k` 前端链路如何保持；
- Controller、TypeORM read adapter、VO mapping 和 Nest module 分别落在哪个非 app-internal owner。

本 change 不根据文件名猜测答案，也不在 owner 未确认时移动 controller/module。

## Risks / Trade-offs

- [只移动算法但保留 app import] → route/adapter owner 先于 source move 审批，guard test 最终删除精确
  legacy allowlist。
- [误删 `chan-api` 上的 K route] → 用 frontend/gateway consumer inventory 固定当前实际入口。
- [DTO/VO/HttpException 泄漏入 core] → library-owned contract 与 adapter mapping tests。
- [抽取改变 Phase B 或对象引用行为] → 完整 fingerprint、mutation test 和 differential evidence。
- [重新把 Strategy indicators 并入 Chan base] → active Strategy changes 明确改为 evaluator-owned calculation。

## Migration Plan

1. 固定 current routes、consumers、full-output fixtures 和 app import baseline。
2. 逐项确认 library、types、error/numeric/mutation/version contracts。
3. 确认 Chan route owner、K read adapter 和现有 Indicator K compatibility。
4. 将 K merge、Fenxing、Bi、Channel 算法移动到 pure ChanCore。
5. 按 owner 结论重接 HTTP/TypeORM adapters，删除 app-to-app import allowlist。
6. 运行 differential、HTTP/OpenAPI、build、full backend 与 strict OpenSpec gates。
7. 路由迁移、公共 Indicator 重构或算法修复作为 residual change，不混入本次抽取。

## Open Questions

- pure Chan library 的最终目录、Nest project key 和 import path。
- `/v1/chan/*` 的长期唯一 owner，以及当前双入口是否需要独立迁移 change。
- `chan-api` TypeORM K read adapter 与 `/v1/indicators/k` 兼容链路如何落位。
- library-owned input/output 的最小现有字段集合。
- 空输入、非法有限值、当前 Channel HTTP error、mutation、算法版本和 numeric comparison 规则。
