# libs/market-data — 全局行情数据管线（精度门控 → 补齐）

`libs/market-data` 是 Mist 的全局行情数据唯一出口，负责 **历史/实时同一份代码** 的 `先确定精度 → 再数据补全` 原子化管线，历史、实时、展示、指标、回测、信号 6 条链路全部统一经由它。

> 返回：[顶层 README](../../README.zh-CN.md) · [文档编写指南](../../docs/governance/documentation-guide.md)

---

## 🎯 模块职责

- **精度门控**：`KPriceProjector` 对 `DECIMAL(20,2)` 的 `OHLC` 做 `Number(v).toFixed(2)` 归一，多零不算脏（`1.200` → `1.20`），超 `999999999999999999.99` clamp，`toFixed` 不等极少见已兜住；`volume/amount` `DECIMAL(36,8)` 走 `canonicalDecimalTransformer` → `string` 无损。
- **数据补全**：`StrategySeriesImputer`（`imputeSeries` / `hydrate + append + trim`，`backfilled/forwardFilled/unavailable`）跨日不补、`0` 是有效锚点、`null/NaN` 才补，`hydrate` 冻结后 `append` 仅 `forwardFill`。
- **一口气统一**：`prepareMarketData({rawBars: K[]|StrategyBar[], period, requiredBars, historyBars?})` 内部先精度后补齐，原子化输出 `{projected, requestedKlines, droppedKlines, effectiveKlines, diagnostics}`；非法数据修复 + 数据补全一次完成，不留过渡。
- **TypeORM 走 string 已确认**：`K` 实体的 `DECIMAL` 均经 `canonicalDecimalTransformer` 读为 `string`，再 `toFixed(2)` 基本不丢精度，只有超最大整数才 clamp。

---

## 🔌 核心导出品与 API

```typescript
import {
  KPriceProjector,
  mapKToStrategyBar,
  prepareMarketData,
  StrategySeriesImputer,
  imputeSeries,
} from '@app/market-data';

// 单一管线：先精度后补齐
const pipeline = prepareMarketData({
  rawBars: kEntities, // K[] 走 string→toFixed(2)，StrategyBar[] 走 finite 校验
  period: 5,
  requiredBars: window.length,
  historyBars, // 仅历史分钟级，前置 window
});

pipeline.projected.forEach(bar => {
  bar.ohlc.effective; // 补全后视图
  bar.ohlc.resolution; // observed | backfilled | forwardFilled | unavailable
});

pipeline.droppedKlines; // 精度门控丢弃数（不作补齐锚点）
```

---

## 📂 关键文件速查

- `src/k-price-projector.ts`：`DECIMAL(20,2)` 投影，多零归一，上限 clamp。
- `src/k-strategy-bar-mapper.ts`：`K → StrategyBar` 唯一真源（`libs/shared-data` 的旧 `mappers` 已直删，无过渡）。
- `src/strategy-bar.ts` / `src/strategy-market-data.port.ts`：`StrategyBar` / `StrategyMarketDataPort` 领域类型（原 `libs/strategy` 已薄 shimed 到 `@app/market-data`）。
- `src/projection/strategy-series-imputer.ts`：从 `libs/strategy/projection` 一口气搬入，补全不再单飞。
- `src/market-data-pipeline.ts`：`prepareMarketData` 全局管线，`TS6133` 已清，`detectKEntity` 单一判断。

---

## 🛠️ 专属测试

```bash
pnpm run test -- libs/market-data
# 定向：visual / indicator 已切至 pipeline
pnpm exec jest --runInBand --watchman=false --testPathPattern="visual|indicator"
pnpm exec tsc --noEmit
```

---

## 🔗 上下游边界

- **依赖**：`libs/decimal`（`Decimal8`）、`libs/shared-data`（`K` 实体）、`@app/shared-data` 的 `DataSource`。
- **被依赖**：`apps/mist` 的 `VisualController` / `IndicatorController`（展示）、`apps/backtest` / `apps/signal`（回测/实时）、`libs/strategy`（薄 shimed，仅 re-export）。
- **单一性保障**：
  - `libs/shared-data/src/mappers` 已删除，`apps/mist/src/strategy/adapters/k-strategy-bar.mapper.ts` 已删除。
  - `libs/strategy/src/market-data/*` 与 `projection/strategy-series-imputer.ts` 已薄 shimed 到 `@app/market-data`，不再有 `A→B→A` 重复转换。
  - 历史数据链路 `BacktestMarketDataAdapter` / `SignalStrategyMarketDataAdapter` 已切 `mapKToStrategyBar from @app/market-data`，同一 `K→StrategyBar` 投影。

---

## 🚨 治理约束

遵循 `docs/project-quality-governance-guide.md §6.5/#10` 与 `governance/contract-and-data-governance-guide.md`：
- 缺失值不静默补 `0`，`null/NaN` 才经 Imputer `backfilled/forwardFilled`，跨日不补。
- `0` 是有效锚点（你的规则），`DECIMAL(36,8)` 的 `0` 量额由 Imputer 保留，不作异常。
- 无调用方链路与重复 `Number()` 二次转换已清，`pnpm exec tsc --noEmit` 零错。
