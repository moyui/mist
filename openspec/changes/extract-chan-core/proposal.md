## Why

独立 `chan-api` 当前直接导入 `apps/mist/src/chan/chan.module`。Chan 算法又依赖 HTTP DTO/VO、
`IndicatorService.findKData()` 和 Nest/HTTP 错误类型，导致独立 app 仍由另一个 app 的内部源码装配。

原 `extract-market-analysis-kernels` 把 Chan、公共 Indicator API 和 Strategy 指标计算视为同一个共享
analysis base。该边界不成立：Backtest/Realtime 已由 `StrategyMarketDataPort` 获取自己的
`StrategyBar`，KDJ/MACD 是共享 Strategy evaluator 内部的计算步骤；Chan 则是独立公共分析能力，
不进入 V1 Strategy hot path。

## What Changes

- 以本 change 取代未实施的 `extract-market-analysis-kernels`，范围收缩为 `libs/chancore` 中的 pure
  ChanCore 抽取；Nest project key 固定为 `chancore`，import path 固定为 `@app/chancore`。
- 从当前 K merge、Fenxing、Bi Phase A/Phase B 和 Channel Phase A/Phase B 代码中分离无 I/O、
  无 persistence、无 Nest/HTTP/TypeORM 依赖的 Chan 计算核心。
- 以已归档的 `fix-chan-wide-bi-distance` 作为算法抽取前置基线：宽笔距离按候选 K 序列位置计算，
  禁止在移动代码时恢复为全局数据库 K ID 差值。
- 迁移当前 Trend、K merge、Fenxing、Bi、Channel 和纯 helpers/enums/types；Controller、HTTP DTO/VO、
  OpenAPI、日期/source 解析和 K 数据库读取继续属于 application adapter。
- public API 只暴露无状态 `ChanCore` 的 `mergeK`、`findFenxings`、`createBi`、`createChannels`，以及
  方法签名实际需要的 algorithm-owned types/enums；内部 services/helpers 和 Nest module 不导出，也不
  预先增加统一 `analyze()`。
- `ChanK` 一次定义完整的 `id/symbol/time/open/high/low/close/volume/amount` 行情输入；量额保持规范
  十进制字符串或 `null`。本 change 不启用 MACD/力度等新算法，也不把 Strategy Indicator 实现引入
  ChanCore。
- 在移动代码前继续逐项确认输出字段、空值/非法输入、数值比较、mutation 和算法版本语义。
- `/v1/chan/*` 的长期唯一 runtime owner 固定为独立部署的 `chan-api`；当前 change 不顺手删除
  `mist-backend` 中的兼容路由，后续通过独立 route migration 清理双入口。
- 在移动 controller/module 前确认现有双入口兼容范围，以及 `chan-api` 的 TypeORM K read adapter 和
  `/v1/indicators/k` 兼容链路。
- 解除 `apps/chan → apps/mist` 业务源码 import；具体 adapter 布局按上述 owner 评审结论实施。
- 保留现有 Chan URL、HTTP envelope、OpenAPI 输出、Phase A/Phase B 算法和无持久化语义；任何路由
  删除或算法修订必须另开 change。
- Strategy KDJ(9,3,3)、MACD(12,26,9)、窗口和共享计算归
  `evolve-strategy-evaluation-contract`；本 change 不提供 Indicator base，也不是 Backtest/Realtime
  Strategy runtime 的前置依赖。
- 当前公共 `/v1/indicators/*` 与通用 K 查询重构不属于本 change，不因 ChanCore 抽取而改名或删除。
- 笔力度、背驰、量价分析以及 Chan-owned MACD 计算属于后续 focused change；届时从完整 `ChanK`
  输入派生并单独固定参数、版本和输出，不向本次迁移夹带算法变化。

## Capabilities

### New Capabilities

- `chan-analysis-core`: 定义可由现有 Chan HTTP adapter 调用的 pure ChanCore 边界。

### Modified Capabilities

- `chan-derived-analysis-lifecycle`: 明确 adapter 取数、ChanCore 请求时派生、无 persistence 和现有
  HTTP 行为保持边界。
- `strategy-runtime-architecture`: 明确 Strategy-owned Indicator 计算与 ChanCore 是两个独立 owner，
  不能重新合并成通用 analysis base。
- `strategy-platform-roadmap`: 删除 Backtest/Realtime 对 ChanCore 的伪前置依赖。

## Impact

- **`mist`**：新增 `libs/chancore` pure library 和 `@app/chancore` alias，重接经确认 owner 的 Chan
  adapters、tests 和 app import guard。
- **`apps/chan`**：停止导入 `apps/mist` 业务源码；作为 `/v1/chan/*` 的长期唯一 runtime owner，
  继续独立持有数据库连接与 HTTP 进程。
- **Strategy changes**：`evolve-strategy-evaluation-contract` 单一持有 Strategy KDJ/MACD；
  `extract-backtest-runtime` 与 `run-realtime-strategy-evaluation` 不依赖本 change。
- **算法基线**：依赖已归档的 `fix-chan-wide-bi-distance`；完整 differential fixture 必须覆盖 K ID
  非连续但序列位置连续的宽笔场景。
- **不包含**：公共 Indicator 重构、公共统一 K API、Strategy field 扩展、数据库 migration、
  Chan persistence、买卖点算法、前端修改、部署拓扑修改和路由删除。
