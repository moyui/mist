## 实施基线

记录时间：2026-08-03

### 仓库与工作区

- 仓库：`mist`
- 分支：`feat/extract-market-analysis-kernels`
- 基线：`master@fe56c6863cc498acbad0a6803da16c2615bb6997`
- worktree：`mist/.worktrees/extract-market-analysis-kernels`
- 初始状态：clean
- 数据库 migration：本 change 不新增、不修改
- 跨仓代码：本 change 不修改；只把现有消费者列为兼容性门禁

### Producer 到 Consumer 影响链

```text
MySQL K/Security
  -> IndicatorService.findKData TypeORM adapter
  -> ordered K/entity rows
  -> Indicator calculation methods / Chan input mapping
  -> IndicatorController or ChanController
  -> shared HTTP envelope
  -> chan-api / mist-backend routes
  -> mist-fe and mist-skills consumers
  -> mist-deploy gateway / mist-monitoring health
```

抽取后的目标链路保持外部边界不变：

```text
adapter-owned data retrieval and validation
  -> library-owned finite ordered input
  -> pure IndicatorCore / ChanCore
  -> adapter-owned VO and HTTP envelope mapping
```

pure library 不拥有 wire、decoder、persistence、deploy 或 monitoring；这些层只需要证明没有因内部抽取
发生行为或依赖变化。

### Indicator 现状盘点

| 范围 | 当前 owner | 发现 |
|---|---|---|
| HTTP routes | `IndicatorController` | `POST /v1/indicators/macd|kdj|rsi|k` |
| 数据读取 | `IndicatorService.findKData` | 读取 `Security`、`K`，选择 source，按 timestamp 升序 |
| 数学计算 | `IndicatorService` | MACD、RSI、KDJ、ADX、ATR、DualMA 与 TypeORM adapter 混在同一 service |
| HTTP 输入 | `IndicatorQueryDto` | code、period、start/end、source |
| HTTP 输出 | `MACDVo`、`KDJVo`、`RSIVo`、`KVo` | controller 负责时间对齐和 VO mapping |
| 内部 consumer | `ChanController` | 复用 `findKData`，不应把 HTTP VO 继续传入 pure Chan kernel |
| 外部 consumer | `mist-skills` | 固定消费 `/v1/indicators/macd|kdj|rsi|k` |

### Chan 现状盘点

| 范围 | 当前 owner | 发现 |
|---|---|---|
| HTTP routes | `ChanController` | `POST /v1/chan/merge-k|bi|fenxing|channel` |
| adapter | `ChanController` | 通过 `IndicatorService.findKData` 取数并把 `K` entity 映射为 `KVo` |
| orchestration | `ChanService` | K merge 后调用 Fenxing/Bi |
| pure-ish calculation | `KMergeService`、`BiService`、`ChannelService`、`TrendService` | 算法本身无 persistence，但仍依赖 Nest、HTTP exception、DTO/VO 和 app-local utils/constants |
| app coupling | `apps/chan/src/chan-app.module.ts` | 直接导入 `apps/mist/src/chan/chan.module`，是本 change 必须消除的 app-to-app import |
| persistence | 无 Chan entity/repository | Chan 请求时派生；只由 adapter 读取 `K`、`Security` |
| 外部 consumer | `mist-fe`、`mist-skills` | 固定消费 `/v1/chan/*`；前端通过 `chan-api:8008` gateway path 调用 |
| deploy/monitoring | `mist-deploy`、`mist-monitoring` | `chan-api` 是独立 Compose service，健康检查为 `/app/hello` |

### 当前 I/O 类型泄漏

- Chan domain interfaces、services 和 helpers 直接依赖 Indicator HTTP `KVo`。
- `ChannelService.createChannel` 直接接收 `CreateChannelDto`，并抛出 `HttpException`。
- `BiService`、`ChannelService` 返回带 Swagger decorator 的 `*Vo`。
- `KMergeService`、`TrendService` 带 Nest `@Injectable()`；装饰器本身不是 I/O，但不应成为 pure kernel
  的必要依赖。
- `ChannelService` 依赖 app-local `@app/utils` 与 `@app/constants`；抽取时需区分纯算法 helper 与 HTTP
  错误映射。

### Characterization fixtures 与输出 fingerprint

本 change 以现有精确断言为唯一抽取基线，不新增另一套可能漂移的算法期望值：

| 能力 | fixture / fingerprint |
|---|---|
| MACD(12,26,9) | 80 根确定性 close；`begIndex=33`、`nbElement=47`，首值 `4.010272 / 5.290475 / -1.280203`（6 位近似） |
| RSI(14) | 同一 close；`begIndex=14`、`nbElement=66`，首值 `67.95`（2 位近似） |
| HTTP KDJ(14,3,3) | 80 根确定性 OHLC；`begIndex=17`、`nbElement=63`，首个 K/D 为 `57.023495 / 48.972518`（6 位近似），J 使用同一结果的 `3K-2D` |
| ADX/ATR/DualMA | 固定输出长度 `53/66/68/21`，并固定各首值；所有输出必须 finite |
| Bi public result | `createMergedFixture()` 六个 merged K；固定 Phase A 的 complete invalid Bi 与 unfinished Bi 全部 public fields |
| Bi Phase A | 固定 top-three reduction、invalid residual、连续性、outer boundary 与 input immutability cases |
| Bi Phase B | 固定 shortest-span/leftmost/fixed-point、unmergeable boundary 与 input immutability cases |
| Channel Phase A/B | 固定 5-Bi enumeration、range/extreme status、time+price overlap merge、fixed-point 与 residual filtering cases |
| HTTP/OpenAPI | 固定 Bi/Channel 两阶段 envelope 与 public item fields |
| persistence boundary | 固定 Chan 运行代码不导入 TypeORM/entity/repository |

数值 fingerprint 当前采用既有 Jest `toBeCloseTo` 精度；结构、枚举、数组顺序、ID 和状态采用
`toEqual`/`toMatchObject` 精确比较。抽取后的 differential tests 必须沿用同一比较规则，不可通过放宽
tolerance 隐藏行为变化。

### 基线验证

```text
Test Suites: 9 passed, 9 total
Tests:       50 passed, 50 total
```

覆盖 Indicator service/controller、Bi Phase A/Phase B、Channel Phase A/Phase B、Chan OpenAPI、
Chan persistence boundary 和 `chan-api` module wiring。

### 待项目负责人确认后才能移动源文件

1. library 采用一个 `libs/analysis`，内部公开 `indicator` 与 `chan` 两个独立入口，还是两个 library；
2. library-owned input/output、invalid-input domain error 和 numeric comparison 的精确定义；
3. Chan 公共路由长期唯一 owner；本 change 无论结论如何都不删除现有 route。
