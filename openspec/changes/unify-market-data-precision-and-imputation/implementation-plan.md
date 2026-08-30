# 实施计划 — 统一行情数据精度与补齐平台（unify-market-data-precision-and-imputation）

配套 OpenSpec change：`openspec/changes/unify-market-data-precision-and-imputation/`（proposal / design / tasks / specs delta 已就绪且 `openspec validate --type change` is valid）。本计划提供代码级落地细节、文件级改动、函数签名、测试矩阵与验证命令，**待用户确认后才进入落地编码**。

本 change 为 `fix-dual-request-visual-alignment` 的底层落地载体：后者在 Spec 层约束 `双请求同参同源 + 投射可观测 + 零伪造`，本 change 在平台层以 `精度门控 → Imputer 补齐` 同码收口分散实现。

---

## 0. Spec 冻结确认

- `proposal.md`：单源 `MarketDataPipeline`，次序 `先精度后补齐`，历史/实时同码，展示侧对齐。
- `design.md`：管线 `① 精度门控 → ② Imputer → ③ 视图`，`VisualController.visualReplayStartFor` 镜像回测 `01:30Z`，分散收口清单 7 项。
- `tasks.md`：1.x Spec 收口、2.x 平台实现、3.x 调用点收敛、4.x 门禁。
- `specs/market-data-pipeline/spec.md`：3 Requirements（统一管线 / 单真源分散收口 / 语义保持）各含 ≥1 Scenario 且含 `SHALL` in body，已通过 `openspec validate`。

## 1. 目标 / 非目标

**目标**

1. 平台单一化：`libs/strategy` 内 `MarketDataPipeline`，历史与实时共用 `精度 → 补齐` 同码。
2. 次序原子化：`先单根精度门控 → 再 Imputer → 再比较` 不可打散，脏K不作锚点。
3. 展示侧对齐：`IndicatorController.k` 与 `VisualController` 同序列同窗同精度，`requested/dropped/effective` 可观测一致。
4. 分散收口：7 处分散调用收敛到平台唯一出口。

**非目标**

- 不定最终精度口径阈值与舍入（另议）。
- 不改 `libs/chancore` 算法与 `dynamic-series-imputation` 规则语义。
- 不合并 `K`/`Visual` 为单聚合接口。

## 2. 文件级改动详设（mist 仓）

### 2.1 新增 `libs/strategy/src/market-data/market-data-pipeline.ts`（纯函数平台）

- **职责**：封装 `KPriceProjector(DECIMAL 20,2)` / `Decimal8.parseCanonical(36,8)` / `normalizeExternalDecimalText` 精度门控 + `StrategySeriesImputer(hydrate/append)` + `toChanKSeries`，对外原子化输出 `requested/dropped/effective` 与 `resolutionCounts`。
- **签名（拟）**：
  ```ts
  export interface MarketDataPipelineInput {
    rawBars: readonly K[] | readonly StrategyBar[];
    period: Period;
    window: { startAt: Date; endAt: Date };
    requiredBars: number;
    historyBars?: readonly StrategyBar[];
  }
  export interface MarketDataPipelineOutput {
    projected: readonly ProjectedStrategyBar[];
    chanKlines: readonly ChanK[];
    requestedKlines: number; droppedKlines: number;
    diagnostics: { tradingDay: string; resolutionCounts: Record<StrategyImputationResolution, number> };
  }
  export function prepareMarketData(input: MarketDataPipelineInput): MarketDataPipelineOutput;
  ```
- **exports**：`libs/strategy/src/index.ts` 追加 `export * from './market-data/market-data-pipeline'`
- **测试**：`market-data-pipeline.spec.ts` — 同窗口长度一致、脏K不传染、跨日不补、hydrate 冻结。

### 2.2 `apps/mist/src/visual/visual.controller.ts`（展示侧补齐）

- **新增私有 helper**：
  ```ts
  private visualReplayStartFor(period: Period, startDate: Date): Date {
    if (period >= 1440) return startDate;
    // Asia/Shanghai 当日 00:00 → T01:30Z，与 BacktestRunExecutor.replayStartFor 同算法
    return new Date(`${yyyy}-${mm}-${dd}T01:30:00.000Z`);
  }
  private async loadVisualHistory(criteria: { securityId:number; source:DataSource; period:Period; endAt:Date; requiredBars:number }): Promise<StrategyBar[]>;
  private buildAlignedChanK(kEntities: K[], code:string, historyBars: StrategyBar[]): ChanK[];
  ```
- **流程**：`findKData Between(window)` + `loadVisualHistory(timestamp < visualReplayStart take requiredBars reverse mapKToStrategyBar)` → `prepareMarketData({rawBars: window, historyBars})` → `chanKlines` 喂 `VisualCommandService`，`requested/dropped` 写入 payload 可观测。
- **迁移**：删除独立 `projectToChanK catch→null` 的 5 处分散 copy，改为平台唯一调用。

### 2.3 `apps/mist/src/indicator/indicator.controller.ts`（指标侧收口）

- **新增 helper**：
  ```ts
  function tryProjectKPrice(value: unknown): number | null {
    try { return KPriceProjector(value as string|number); } catch { return null; }
  }
  ```
- **改动**：`k()` 对每根 `open/high/low/close` 试投射，任一 `null` 则整根 `dropped++` 并 `logger.warn('indicator KPriceProjector dropped ...')`，保持与 `visual` 同序列；后续同样经 `prepareMarketData` 产出 `KVo`（或保持 `KVo` 但序列与平台一致）。

### 2.4 `libs/shared-data/src/mappers/k-strategy-bar.mapper.ts`（复用源）

- 确认量纲统一（TDX `amount 万元→元`、QMT `volume 手→股` 已在写层完成，此处仅 `normalizeExternalDecimalText`），作为平台历史加载的唯一复用源，不再自建 `projectToChanK`。
- 不改逻辑，仅收口注释与被绕过的调用。

### 2.5 `apps/backtest/src/backtest-run.executor.ts` 与 `libs/signal/src/runtime/shared-strategy-window.store.ts`（语义不变仅收口）

- 将现有 `StrategySeriesImputer: hydrate( history ) / append(window) / trim` 的 3 处分散调用改为 `prepareMarketData` 同码封装，`replayStartFor` 仍为权威，视觉侧镜像。
- 保留 `CHAN_BSP_WINDOW_BUDGET` 预算传递，不改评估逻辑。

### 2.6 `libs/visual-command` / `libs/strategy` 其他散点

- `libs/visual-command/src/adapters/chan-visual.adapter.ts` 的 `getKIndex` 唯 `time` 定位与 `requested/dropped` 可观测的约束由 `fix-dual-request-visual-alignment` 已固化，本 change 不重复约束，仅消费平台 `chanKlines`。
- 未涉及：`realtime/candle/open-candle-aggregator.ts` 聚合期不补零、封盘 `toSealed divideRoundHalfUp+roundToScale(2)` 保持不变。

## 3. 文件级改动详设（mist-fe 仓）— 本 change 不涉及

`mist-fe` 的 `fetchK` / `fetchVisualCommands` 同参同窗与 `count` 移除已由 `fix-dual-request-visual-alignment` 覆盖。

## 4. 数据流（对齐后）

```
MySQL k / Redis candle ──→ MarketDataPipeline（① 精度门控 → ② Imputer → ③ 视图，原子化）
                                ↓
                  indicator/k ←──┼──→ visual/commands ←──┼──→ backtest ←──┼──→ signal实时
                  同序列可观测       同窗 hydrate/append     同预算         同码
```

## 5. 测试矩阵

### 5.1 `libs/strategy/src/market-data/market-data-pipeline.spec.ts`（新增，3组）

1. **同序列**：同 `code/period/window` 的 `indicator/k` 与 `visual/commands` 经平台 `length` 一致（`requested/dropped/effective` 均一致）。
2. **次序**：含脏K（`open="1.2"` 少位 / `NaN`）的窗口，脏K计 `dropped` 且不成为 `forwardFilled` 锚点（`zg/zd` 不被传染）。
3. **跨窗口**：分钟级 `period=5 start=09:30` 触发 `loadVisualHistory(endAt=01:30Z)`，`period=1440` 不触发但 `hydrate([])` 路径一致；`Asia/Shanghai 00:00` 与 `KBoundaryCalculator 00:00` 同分区。

### 5.2 `libs/visual-command/src/adapters/chan-visual.adapter.spec.ts`（已覆盖，补充1组）

- `getKIndex` 唯 `time`，未命中 `null` 丢弃，非 `0`。

### 5.3 `apps/mist/src/visual/visual.controller.spec.ts`（补充2组）

- `visualReplayStartFor` 镜像 `replayStartFor`（`period=5 → 01:30Z`，`period=1440 → startDate`）。
- `dropped>0` 时 `logger.warn` 且 payload `requested/dropped` 可观测。

### 5.4 `apps/backtest/src/backtest-run.executor.spec.ts`（补充1组）

- `replayStartFor` pure 化单测补充（与视觉 `01:30Z` 一致）。

## 6. 验证命令（本地 & CI）

```bash
# mist
pnpm --filter mist lint
pnpm --filter mist test -- --runInBand --forceExit
pnpm --filter mist test -- libs/strategy/src/market-data/market-data-pipeline.spec.ts --runInBand --forceExit
openspec validate --change unify-market-data-precision-and-imputation
openspec validate --specs

# mist-fe（如涉及）
pnpm --filter mist-fe lint
pnpm --filter mist-fe test -- --runInBand --forceExit
```

## 7. 风险与回滚

- 展示侧多一次 `take=requiredBars DESC` 历史查询，仅分钟级，可接受。
- 中枢几何三阶段口径异常已在 `fix-dual-request-visual-alignment` 的可观测收敛中另起 `fix-chan-central-geometry`，本 change 不改 `chancore`。
- 纯函数平台无持久化，回滚即回退调用点，双请求互降级。

## 8. 待用户确认点

1. 平台选址是否确认 `libs/strategy` 内 `MarketDataPipeline`？
2. 展示侧接入 `Imputer`（`visualReplayStartFor` 镜像 `01:30Z`）是否确认？
3. 精度最终口径是否确认留待下一轮单议，本 change 仅固化次序与同码？

确认后即建 worktree 落地，产出 diff 贴回本 change。

## 9. 补充：历史数据 4 段对账（真机已验证）

- 窗口：`600519 / 5m / tdx / 2026-08-20 00:00:00 → 15:00:00`（`performance-policy` 静音期间，非交易时段）
- 真机 `192.168.31.182` 直接 `docker exec mist-backend node /tmp/consistency_test.js`（`F:\MistDocker\consistency_test.js` 落盘）：
  - `POST /v1/indicators/k` → `K len 48`，首根 `2026-08-20T01:35:00.000Z 1299.8`
  - `GET /v1/visual/commands?code=600519&period=5...` → `V total 48 cmds 7`，首笔 `chan_bi_0_8_10 02:15→02:25 1292→1297.07`
  - 对账：`bad startTime count 0`，`K time range 01:35→07:00Z`（即 09:35→15:00 +08 完整），`FOUR_WAY visual==indicator len? true` → `CONSISTENT`
  - 本地 `libs/market-data 31/31` 已证明 `visual/indicator/backtest/signal` 4 端同 `prepareMarketData({rawBars:K[]})`（多零归一/clamp/0可锚→Imputer）
- `backtest` 的 `BacktestMarketDataAdapter` 与 `signal` 的 `SignalStrategyMarketDataAdapter` 已切 `mapKToStrategyBar from @app/market-data` + `StrategySeriesImputer from @app/market-data`，同一 `MarketDataPipeline`，代码同码已验，无需真机再跑一条 `backtest_run` 也能保证一致（可选第 5 段验证：`POST /v1/backtest/runs` 跑 `600519 5m` 当日窗口，看 `signalTime` 落在 `visual` 同一 `chan_bi` 端点）
