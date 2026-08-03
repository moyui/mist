## Context

当前 `apps/mist` 同时加载 realtime ingress、Indicator、Chan 和 Strategy；`apps/chan` 作为独立进程
却直接导入 `apps/mist` 的业务模块；`apps/schedule` 也直接导入 collector 与 strategy core。
生产 Compose 部署 `mist-backend` 和 `chan-api`，明确不部署 `schedule`。现有
`build-realtime-strategy-signal-pipeline` 又把 candle、规则 schema、分析、worker 和部署揉成一个
change，与 stable roadmap 的 focused child-change 原则冲突。

## Goals / Non-Goals

**Goals:**

- 为 market data、analysis、strategy control plane、strategy compute plane 和 notification
  delivery 指定唯一 owner。
- 用同仓 libraries 和独立 app entrypoints 建立可渐进拆分的依赖方向。
- 为公共 HTTP 与所有内部 NestJS request-response 调用建立共同 transport 前置边界。
- 建立 child-change 依赖图和逐项评审门禁。
- 消除 `apps/schedule` 在 realtime strategy 与 notification 中的隐含所有权。

**Non-Goals:**

- 不移动代码、不新增 app、不修改路由、不改数据库或部署。
- 本父 change 不实现 queue、容量、notification channel、migration 或兼容代码；它只固定唯一 owner、
  依赖顺序和运行时隔离。已经逐项确认的具体产品契约仍由对应 child change 持有并验收。
- 不恢复 Chan persistence 或延期的 post-close schedule。

## Decisions

### 1. 先拆模块，再拆进程，暂不拆仓库

纯 domain/analysis 逻辑进入 `libs/*`，公共 API 继续由 `apps/mist` 持有；需要独立故障域时使用同仓
Nest app entrypoint。相比立即拆仓库，这保留原子构建、类型共享和 migration 单一所有权。

### 2. 依赖方向固定

```text
market producer/state
        ↓
bounded market context port
        ↓
quantity projection + indicator kernels
        ↓
strategy evaluator
        ↓
Signal + PENDING AlertEvent
        ↓
notification worker
```

ChanCore 是同一 market context 旁路上的纯计算能力，当前只服务现有 Chan API；它不进入 V1 strategy
field catalog 或上述 realtime/backtest hot path。未来 `chan.*` 策略字段必须另开 focused change。

低层 market/analysis 不得依赖 strategy；notification 不得执行 strategy rule；strategy 不得调用
provider-native API。

#### 2.1 策略市场数据使用统一契约、按 app 装配能力

`evolve-strategy-evaluation-contract` 在共享 strategy domain library 中单一持有内部
`StrategyMarketDataPort` 契约、canonical `StrategyBar` 及其 criteria/result types，同时表达：

- `readReplayPage(StrategyReplayPageCriteria)`：供 `apps/backtest` 按单一
  `(securityId, source, period)` 和时间范围有界回放 MySQL historical K；
- `loadRealtimeWindow(StrategyRealtimeWindowCriteria)`：供 `apps/signal` 在冷启动、compiled
  `requiredBarCount` 扩大时按 trigger 的精确 source 有界组合同源 MySQL historical K、
  Redis current-day sealed 1m K；高周期 current-day context 由 Signal period builder 从 1m 重建；
- `resolveRealtimeObservation(StrategyTrigger)`：供 `apps/signal` 热路径解析单次 sealed-bar
  reference；V1 不在该 capability 中保留 `snapshot_update` 或 provisional observation 分支。

这些是进程内 domain/application 类型，不是公共 HTTP、OpenAPI DTO/VO 或 RPC payload。
`*QueryDto` 只用于 HTTP query string；内部只读选择条件使用 `*Criteria`，返回值按
`*Page`、`*Window`、`*Observation` 的领域职责命名。

契约统一不代表 runtime change 之间存在依赖：`extract-backtest-runtime` 只实现和装配 MySQL replay
adapter，
不得要求 `apps/backtest` 连接 market Redis；`run-realtime-strategy-evaluation` 实现 realtime
window/observation adapters，组合 MySQL、Redis 和 signal-owned memory window。两个 child change
复用同一 canonical bar、identity、排序、decimal 和缺口语义，不分别建立第二套 K 查询规则。
其中 `complete-current-day-realtime-candles` 持有共享 scale=8 `Decimal8(bigint)` primitive；backtest、
signal context、strategy evaluator 和 realtime period builder 只消费该 capability，边界继续使用
canonical decimal string/null，不得分别实现 parser/comparator 或序列化 raw bigint。

canonical `StrategyBar` 必填 `type: 'complete' | 'incomplete'`，而不是为 incomplete K 建立第二套
对象或 `isComplete`。historical replay 与有效 sealed 1m 映射为 `complete`；realtime derived period
在缺少组成 1m 但仍可形成 K 时映射为 `incomplete`。两种 type 均为同形、可消费的 bar；具体周期
合成、规则筛选与 contextSnapshot 由对应 child changes 持有。

canonical raw quantity 继续保留 decimal string/null。策略消费层可通过共享纯函数
`QuantityForwardFillProjector` 在同 `(securityId,source,period,tradingDay)` 内生成 effective view：
只使用更早值、量额独立、不读 future、不跨日且不改写 raw bar/persistence。realtime/backtest 如何
准备当日 seed 由各 runtime child change 持有，但不得把 preparation replay 伪装成用户 lookback。
量额 evidence 的持久化 shape 与 serializer 由 `evolve-strategy-evaluation-contract` 单一持有；live
Signal 与 Backtest result 虽分属不同 runtime/table，也不得各自发明 contextSnapshot 结构。

canonical `StrategyBar` 继续使用单一 `timestamp`，不预先增加
`intervalStart/intervalEnd/sourceTimestamp`。MySQL replay 保留 provider native historical bar
time 写入的 `K.timestamp`；realtime sealed bar 使用由 provider native snapshot `eventTime`
截断得到的 `bucketStartMs`。二者是否能直接作为同一逻辑 K 的时间身份，必须由
`run-realtime-strategy-evaluation` 对 TDX/QMT 的 1/5/15/30/60 分钟 native 时间标签完成 HIL
后确认；在此之前不得猜测 start/end label、增加固定时间偏移或启用 realtime `on`。

realtime window 的两类持久化输入按 trigger 的上海时区交易日互斥分区：MySQL 只提供
`tradingDay < triggerTradingDay` 的 historical K，market Redis 只提供
`tradingDay = triggerTradingDay` 且早于 current trigger 的 sealed 1m K。current trigger 由
observation capability 单独处理一次，5/15/30/60m 当日 bar 只从这些 1m 重建。旧日 Redis retention
不得补历史，MySQL 中即使
提前存在触发当日数据也不得加入该次 realtime window；内存只是这两类输入形成的运行时窗口，
不是第三份权威数据。

V1 realtime contract 只包含 sealed-bar observation，不定义 `snapshot_update` queue/evaluator 或
provisional observation branch。未来若需要未封 K 信号，必须另建 focused change 从头定义；不得把
snapshot 冒充 closed K，也不要求 backtest 回放 snapshot。

### 3. HTTP 与内部 RPC 使用共同 transport library 的不同边界

`standardize-service-boundary-contracts` 是所有新内部 runtime 的共同前置 change。它建立
`libs/transport/http` 与 `libs/transport/rpc`：

- `http` 持有公共 `ApiResponse/ApiError`、真实 HTTP `statusCode` 镜像、必填 error `code`、显式
  success/business message、typed error data 和单一 server request id；expected business rejection
  使用实际 HTTP 200 + `success=false/code`，protocol/dependency/internal failure 使用真实 4xx/5xx；
- `rpc` 持有 `RpcRequestV1<T>`、`RpcResultV1<T, TCode>` 和必填 `correlationId`；
- HTTP request 触发 RPC 时，同一个 server request id 传播为 correlation id；
- RPC pattern 固定使用 `domain.resource.action.vN`，业务 payload/error code 留在 domain library；
- `apps/mist`、`apps/chan`、`apps/backtest` 与 `apps/signal` 不得互相导入 transport implementation。

HTTP 与 RPC 不共享 `success/statusCode/message` 等 wire 字段。内部 request-response 也不得为每个
runtime 自行发明一套 envelope。未来单向 `EventPattern()` 不属于 RPC，必须另行评审。

### 4. 控制面与计算面分离

`apps/mist` 持有策略 CRUD、查询和 backtest command acceptance。独立 Nest application 使用项目名
`signal`、目录 `apps/signal`、根模块 `SignalAppModule`；它只持有 realtime trigger consumption、
window、evaluation、episode，以及 realtime live Signal/PENDING AlertEvent 的持久化 orchestration，
并复用同一 strategy domain library。

`apps/signal` 固定为一个单实例 Hybrid Nest application：同一个 `SignalAppModule` module graph 同时
承载仅供内部使用的 HTTP health/diagnostics、NestJS TCP request-response microservice 和 BullMQ
`sealed_bar` worker。三者共享同一 immutable registry、window、Indicator derived state、quantity
projection state 和
persistence orchestration；不得为了分别启动 HTTP、TCP 或 BullMQ 而复制成多个 Signal 进程或多个
内存状态 owner。

`apps/signal` 不注册公共策略业务 API，只暴露内部 health/diagnostics。它与 `apps/mist` 不得互相
导入应用源码，二者只能依赖 `libs/*` 的共享 contract 和实现。web gateway 不得为 signal HTTP
listener 增加公共 `/api/signal` route。Signal 复用现有 Nest/TypeORM 初始化模式，通过
`TypeOrmModule.forRootAsync()` 建立自己的进程内连接池；不建立自定义 MySQL connect manager、
`mysqlReady` 状态机。TypeORM/bootstrap 成功后才开始监听，初始配置或数据库
初始化失败直接停在应用启动边界。HTTP/TCP 端口和 shutdown 顺序由 realtime child change 继续
评审。

现有 `apps/mist` 的 `POST /v1/strategy-scans/run`、`StrategyScanService` 与对应 frontend action 是
legacy live-scan 链路，必须由 realtime child change 删除，不得迁移成 Signal RPC、BullMQ job 或
第二套人工 run lifecycle。人工执行策略只进入下述 backtest boundary；Signal TCP microservice 只
承载 registry refresh 等已批准的控制面 request-response，不提供人工策略执行 command。

signal-level backtest 使用项目名 `backtest`、目录 `apps/backtest`、根模块 `BacktestAppModule` 的
独立 Nest application。`apps/mist` 保留公共 backtest API，`apps/backtest` 持有历史读取、bounded
context、执行、run lifecycle 和结果写入。V1 以 MySQL `BacktestRun` 作为权威任务登记，不增加
Redis/BullMQ backtest queue；采用单实例、PENDING 条件原子领取和中断后 FAILED/不自动重试。
正常路径使用 NestJS Microservices TCP request-response 触发，两端只在启动时补偿一次且不做周期
轮询。本地最大等待数量由 `libs/config` 的 `BACKTEST_QUEUE_CAPACITY` 统一校验和注入，默认 `8`，
仅接受 `1–64` 的整数。`backtest` 启动时按 cutoff 与稳定顺序最多恢复 capacity 个旧 PENDING，
超量条件标记 `BACKTEST_STARTUP_QUEUE_FULL`，自身 reconciliation 完成后才
`backtest.ready=true`。`apps/mist` 启动补偿只执行一次 3 秒 health 检查，不等待、不轮询、不重试；
只有 contract-valid `ready=true` 才逐项补发一次，unreachable、timeout、非 200、非法 contract 或
`ready=false` 时按 Backtest change 的 cutoff 条件失败规则处理旧 PENDING。该补偿不得阻塞
`apps/mist` 其他公共 API、market ingress 或 realtime Signal 启动。公共 POST 只提交 command，TCP accepted 后返回
`202 + runId + PENDING + Location`，当前进度和结果通过 GET 查询；TCP timeout/失败映射和部分结果
中，`queue_full` 返回 `429`，未就绪/连接失败/仍 PENDING 的 timeout 返回 `503`，timeout readback
已 RUNNING/COMPLETED 返回 `202`。唯一端到端 `BACKTEST_COMMAND_TIMEOUT_MS` 由
`mistEnvSchema` 校验和注入，默认 `3000ms`、范围 `500–30000ms`，覆盖连接与 response 且不自动
重发。Backtest pattern、payload、result/error code 由 `extract-backtest-runtime` 逐项评审，但必须
使用 `libs/transport/rpc`；查询状态和部分结果语义仍留给该 change。

### 5. Schedule 不参与新链路

现有 schedule 代码和 stable spec 只作为待处理遗留，不视为生产 notification 或 realtime owner。
本架构不删除 app；任何未来职责必须重新创建 focused change。

### 6. Child changes 按门禁推进

依赖顺序为：

1. `standardize-service-boundary-contracts`；
2. `complete-current-day-realtime-candles`；
3. `extract-market-analysis-kernels`；
4. `evolve-strategy-evaluation-contract`；
5. `extract-backtest-runtime`；
6. `run-realtime-strategy-evaluation`；
7. `deliver-strategy-notifications`。

第 2、3、4 项可在不修改同一文件或 schema 的前提下并行设计。backtest 与 realtime runtime 都必须
等待第 1 项以及共同 analysis/evaluation contract 验收，之后可独立推进；realtime evaluation 还
必须等待 current-day candle 验收，notification 必须等待 realtime evaluation。

### 7. 逐项评审是实施门禁

每个 child change 必须把未决项列为 tasks，并在用户确认后把结论写回 design/spec，再开始对应代码。
OpenSpec artifact 完整只表示“可评审”，不自动授权执行尚未确认的细节。

### 8. 旧一体化 change 的迁移映射

`build-realtime-strategy-signal-pipeline` 由以下 change 取代：

| 旧 capability / 设计内容 | 新 owner |
|---|---|
| `current-day-realtime-candle-foundation` | `complete-current-day-realtime-candles` |
| realtime quantity、ingress sink、TDX/QMT quantity | `complete-current-day-realtime-candles` |
| market Redis、candle monitoring/HIL | `complete-current-day-realtime-candles` |
| Indicator/Chan pure reuse；V1 strategy 仅消费 Indicator | `extract-market-analysis-kernels` |
| field catalog、requiredBarCount、evaluability、单一 rule + 必填 signal kind、strategy migration | `evolve-strategy-evaluation-contract` |
| canonical `StrategyBar`、`StrategyMarketDataPort` contract、criteria/result domain types | `evolve-strategy-evaluation-contract` |
| MySQL historical replay adapter 和 Backtest run/result lifecycle | `extract-backtest-runtime` |
| realtime window/observation capability、MySQL/Redis seam、trigger、worker、period、episode | `run-realtime-strategy-evaluation` |
| Signal/PENDING AlertEvent realtime transaction | `run-realtime-strategy-evaluation` |
| proactive delivery | `deliver-strategy-notifications` |
| roadmap、schedule 和 runtime owner | `define-strategy-runtime-architecture` |
| 公共 HTTP / 内部 RPC envelope 与 correlation | `standardize-service-boundary-contracts` |

旧设计中的“单一 change”“禁止 MySQL bounded warmup”“BullMQ 已定案”“migration 014 已定案”和
“无产品语义待定项”不迁移为既定结论，分别回到对应 child change 的逐项评审门禁。

## Risks / Trade-offs

- [同仓 app 仍共享发布版本] → 先获得模块与进程隔离；只有出现独立发布/扩缩容需求再评审拆仓。
- [每个新 runtime 自行定义 transport] → 先验收 `libs/transport/http|rpc`，业务 change 只定义
  domain payload/error code。
- [多个 child change 修改相邻 stable specs] → 用显式依赖和单一 migration owner 避免并行争用。
- [公共 market-data contract 由某个 runtime change 持有] → contract 归前置 evaluation change；Backtest
  与 Signal 只实现各自 adapter，因此可在共同前置完成后独立推进。
- [旧 schedule spec 暂时与生产部署冲突] → 本 change 明确移除其新链路所有权并在归档时更新 stable spec。

### 8.1 最终 owner matrix

| 边界 / 状态 | 唯一 owner |
|---|---|
| 公共 HTTP / 内部 RPC envelope | `standardize-service-boundary-contracts` / `libs/transport` |
| realtime ingress sink、sealed candle、market Redis、共享 `Decimal8` | `complete-current-day-realtime-candles` |
| Indicator / Chan pure kernels | `extract-market-analysis-kernels` |
| canonical `StrategyBar`、`StrategyMarketDataPort`、criteria/result、field/evaluator/context contract | `evolve-strategy-evaluation-contract` |
| MySQL historical replay adapter、Backtest run/result lifecycle | `extract-backtest-runtime` / `apps/backtest` |
| realtime MySQL/Redis/memory adapters、trigger/window/episode、live Signal/PENDING AlertEvent transaction | `run-realtime-strategy-evaluation` / `apps/signal` |
| PENDING AlertEvent delivery | `deliver-strategy-notifications` / dedicated notification worker |
| 延期的 post-close orchestration | 无新链路 owner；`apps/schedule` 保持禁用 |

## Migration Plan

1. 审核并归档本架构 change，只改变 OpenSpec。
2. 先完成 service-boundary child change，再按依赖逐个评审其余 child change，不从旧一体化
   change 直接执行任务。
3. 每个 child change 独立验证、提交、发布和归档。
4. 若拆分结论被否决，回滚本 change 文档即可，不影响运行时。

## Open Questions

- `apps/chan` 与 `apps/mist` 的 Chan 公共路由最终保留哪一个 owner，留给 analysis-kernel change 评审。
- notification app 的最终名称、channel adapter 与部署方式，留给 notification change 评审。
- 真实 MySQL migration inventory、Windows Compose 和交易时段 TDX/QMT HIL 仍属于实施前环境证据，
  不能由文档 strict validation 代替。
