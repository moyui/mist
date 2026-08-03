## Why

当前 Chan 的 Trend、K merge、Fenxing、Bi Phase A/Phase B 和 Channel Phase A/Phase B 算法混在
Nest service、HTTP DTO/VO 与应用代码中，Backtest、Realtime、Signal/Alert 等后续计算链路无法在不
依赖现有 API 实现的情况下复用它们。

原 `extract-market-analysis-kernels` 又把 Chan、公共 Indicator API 和 Strategy 指标计算视为同一个
共享 analysis base。这个边界不成立：Chan 应是独立 pure calculation library；KDJ/MACD 等其他计算
可以由各自 library 直接提供，或按同样模式增加薄 wrapper，不需要被合并进 ChanCore。

## What Changes

- 以本 change 取代未实施的 `extract-market-analysis-kernels`，只抽取 `libs/chancore`；Nest project key
  固定为 `chancore`，import path 固定为 `@app/chancore`。
- 从当前实现中迁移 Trend、K merge、Fenxing、Bi Phase A/Phase B、Channel Phase A/Phase B 与实际
  使用的 pure helpers/enums/types，形成无 I/O、无 persistence、无 Nest/HTTP/TypeORM/env 依赖的
  ChanCore。
- public API 只暴露无状态 `ChanCore.mergeK/findFenxings/createBi/createChannels`、签名所需
  algorithm-owned types/enums、`ChanInputError/ChanInvariantError` 和只读 `algorithmVersion=1`；不导出
  内部 services/helpers/Nest module，也不预建统一 `analyze()`。
- `ChanK` 使用完整 `id/symbol/time/open/high/low/close/volume/amount`；量额保持精确十进制字符串或
  `null`，为未来 Chan-owned 力度/MACD/量价算法保留输入，但本 change 不启用新算法。
- 以已归档 `fix-chan-wide-bi-distance` 作为算法基线；宽笔距离按候选 K 序列位置计算，不得恢复为
  数据库 K ID 差值。
- 固定已逐项批准的 output、empty result、invalid input、number comparison、readonly mutation 和
  algorithm-version contract，并以 full-output differential fingerprint 防止纯抽取改变行为。
- 现有 Chan service 作为调用 `@app/chancore` 的薄 HTTP wrapper，不得复制算法实现；Mist-owned K 与
  Chan HTTP 输出统一使用 `high/low`，删除 `highest/lowest` 旧字段且不提供双字段兼容。
- 同步修正 `/v1/indicators/k`、`/v1/chan/merge-k`、`/v1/chan/fenxing`、`/v1/chan/bi` 和
  `/v1/chan/channel` 的 VO、OpenAPI 与递归嵌套输出；数据库 `k.high/k.low`、算法语义和 route 不变。
- Backtest、Realtime、Signal/Alert 或其他计算单元未来可直接调用 `@app/chancore`，也可在自己的
  bounded context 增加薄 wrapper；只有对应 owning change 明确采用时才形成依赖。
- 当前 active Backtest/Realtime V1 仍不开放 `chan.*`，因此本 change 不把 ChanCore 反向加入它们的
  prerequisite gate，也不修改其运行时、field catalog 或 Signal/Alert contract。

## Capabilities

### New Capabilities

- `chan-analysis-core`: 定义可被同仓计算单元直接复用的 pure ChanCore 边界。
- `chan-analysis-http-contract`: 统一现有 K/Chan HTTP 价格区间字段及 OpenAPI 契约。

### Modified Capabilities

- `strategy-runtime-architecture`: 明确 ChanCore 与 Strategy-owned Indicator calculation 是独立 owner，
  未来 runtime 只有显式采用 Chan field 时才依赖 ChanCore。
- `strategy-platform-roadmap`: 删除当前 Backtest/Realtime V1 对 ChanCore 的伪前置依赖，同时保留未来
  focused adoption change 的入口。
- `chan-derived-analysis-lifecycle`: 允许经批准的 `highest/lowest → high/low` HTTP 字段迁移，同时保持
  请求时派生、无 Chan persistence 和算法结果不变。
- `chan-bi-algorithm-hygiene`: 区分算法值稳定与经批准的公共字段命名调整。

## Impact

- **`mist`**：新增 `libs/chancore`、`@app/chancore` 和 pure tests；现有 Chan 算法 service 改成薄
  wrapper，并将 K/Chan HTTP 输出统一为 `high/low`，不能保留第二份算法或旧字段 alias。
- **Backtest/Realtime/Signal/Alert**：获得可直接调用的 pure library；本 change 不修改当前 active V1
  specs、runtime 或部署依赖。
- **算法基线**：依赖已归档 `fix-chan-wide-bi-distance`；differential fixture 覆盖非连续 K ID 与序列
  位置计数。
- **消费者发布门禁**：`mist-fe` 与 `mist-skills` 的字段迁移由各自后续批次完成；匹配版本完成前不得部署
  本 breaking backend contract，也不增加 `highest/lowest` 兼容字段。
- **明确不包含**：现有 route ownership、TypeORM K reader、除 `/v1/indicators/k` 外的 Indicator API、
  gateway/frontend/skills 实现、跨 app import 清理、统一 K API、数据库 migration、Chan persistence、
  买卖点、力度/MACD 新算法及部署拓扑。
