# 实施计划 — 双请求可视化对齐修复（fix-dual-request-visual-alignment）

配套 OpenSpec change：`openspec/changes/fix-dual-request-visual-alignment/`（proposal / design / tasks / specs delta 已就绪）与 `mist-fe/openspec/changes/fix-dual-request-visual-alignment/` 镜像。本计划提供**代码级落地细节**——覆盖 **P0～P2 全量缺陷**的文件级改动、函数签名、测试矩阵与验证命令，**并补充「其他级别（日线及以上）的实时对齐」实时计划**，**待用户确认后才进入落地编码**。

> 只读确认：P0 均基于当前 `master d5c13a84 fix(sources): disable fill_data on QMT and TDX historical bar queries` 只读观察得出，未做任何代码修改。工作区 `git status --porcelain` 为空，`git diff --stat HEAD` 与 `git diff --cached --stat` 均为 0，仅此一棵 worktree。P1/P2 为同一链路同仓延伸排查。

---

## 0. 问题复述（覆盖 P0～P2）

| 级别 | 缺陷 | 定位 |
|---|---|---|
| **P0-1** | **价格投射分叉**：`apps/mist/src/visual/visual.controller.ts:projectToChanK` 以 `KPriceProjector` 严格校验失败即整根 drop（仅 `logger.warn`），而 `apps/mist/src/indicator/indicator.controller.ts:k()` 直接透传，同窗口 `fetchK` vs `fetchVisualCommands` 长度分叉，中枢起点错位 | 已确认 |
| **P0-2** | **窗口分叉**：`apps/backtest/src/backtest-run.executor.ts:511 replayStartFor` 对 `period<1440` 且消费 `k.volume/k.amount` 的 plan 将 `replayStart` 前置到当日上海 `T01:30:00.000Z` 并 `loadReplayWindow+readReplayPage` 分轨，而 `visual.controller:getCommands` 直接 `Between(start,end)` 无历史 budget，缠论状态机初始条件不一致 | 已确认 |
| **P1-1** | **索引零伪造**：`libs/visual-command/src/adapters/chan-visual.adapter.ts:getKIndex(time,id)` 优先 time 未命中回退 id；`fromIdx=getKIndex(first.startTime, zs.startId)` 的 time 与 id 可能指不同下标；`originIds/display*Id` 与 DB id 语义混淆，导致 `fromIndex/toIndex` 与 `fromTime/toTime` 不自洽，overlay 横向错位 | 已确认 |
| **P1-2** | **图表压线**：`mist-fe/app/components/tv-chart/TradingViewChart.tsx` 用 `Map<time,price> biSeen/duanSeen` 去重后单 `LineSeries` 压线，拐点覆盖、笔被连成连续折线 | 已确认 |
| **P1-3** | **中枢几何三阶段口径不一致**：`libs/chancore/src/internal/channel.ts:validateChannelGeometry`（5笔非对称 `zg/zd+首末突破`）vs `extendChannel/buildChannelFromBis`（全量交集 `zg=min(high)`）vs `mergeTwoChannels/central-expansion:isCentralExpansion`（波动区间 `gg/dd` 重叠），`Band top=zg bottom=zd` 过窄易误判为画错 | 已确认 |
| **P2** | **量柱回退污染**：`TradingViewChart.tsx` 中 `volume ?? amount` 用 `amount` 充数，直方图失真 | 已确认 |
| 横向 | **其他级别（日线及以上）实时对齐**：`DAY/WEEK/MONTH/... (>=1440)` 的回测/视觉/实时窗口同样需对齐，`StrategySeriesImputer` 的 `Asia/Shanghai 00:00` 交易日与 `KBoundaryCalculator` 日线边界需一致 | 已补充 |

---

## 1. 目标/非目标

**目标**
1. 双请求同参同源：`fetchK` / `fetchVisualCommands` 同 `code/period/source/startDate/endDate` 且后端 `findKData WHERE/ORDER` 等价。
2. 价格投射一致且可观测：两端点同以 `KPriceProjector` 为准，不可投射 bar 的丢弃进契约+日志。
3. 索引零伪造：`ChanVisualAdapter.getKIndex` 未命中→`null`→丢弃该 command，废弃 `displayStartId/EndId` 歧义。
4. 窗口对齐：视觉轨复用与回测一致的 `hydrate(历史 budget)+append(窗口)` 的 `StrategySeriesImputer` 语义。
5. 图表不连线：笔/段从单 `LineSeries` 压线改为分段渲染。
6. **P1-3 可观测收敛**：中枢几何三阶段 `zg/zd` 收缩比可观测+回归门禁，不改算法口径（另起 change 再统一）。
7. **P2 去回退**：量柱缺失时留空，不回退 `amount`。
8. **其他级别实时对齐**：`DAY/WEEK/...` 复用同一语义（分钟级额外 `loadVisualHistory`，日线及以上跳过但 `00:00` 边界一致）。

**非目标**
- 不合并为单聚合接口；不引入 Redis 缓存。
- **P1-3 除外**不修改 `libs/chancore` 算法口径本身（仅加可观测断言/日志，见 §2.9），其余算法不变。
- 不引入新的分页/限流参数。

---

## 2. 文件级改动详设（mist 仓）

### 2.1 `apps/mist/src/indicator/indicator.controller.ts` — K 端投射收敛到 `KPriceProjector`（P0-1）

- **现状**：`k()` 直接 `data.map(item=>({id, high: item.high, ...}))`，透传脏数。
- **改动**：
  ```ts
  function tryProjectKPrice(value: unknown): number | null {
    try { return KPriceProjector(value as string | number); } catch { return null; }
  }
  // k() 内：对每根 K 的 open/high/low/close 试投射，任一 null 则整根 drop，dropped++
  // 若 dropped>0, logger.warn(`indicator KPriceProjector dropped ${dropped}/${total} ...`)
  ```

### 2.2 `apps/mist/src/visual/visual.controller.ts` — 可观测 + 历史对齐（P0-1 / P0-2）

- **改动点 A：可观测**
  ```ts
  // return 时带上：requestedKlines: kEntities.length, droppedKlines: dropped
  ```
- **改动点 B：窗口对齐（核心）**
  ```ts
  // visualReplayStartFor(period, startDate): Date
  //   if (period >= 1440) return startDate;
  //   // 否则按 Asia/Shanghai 当日 01:30Z 计算（与 backtest 510-532 完全一致）
  // loadVisualHistory(...): Promise<StrategyBar[]>
  //   where timestamp < visualReplayStart order DESC take requiredBars reverse mapKToStrategyBar
  // const imputer = new StrategySeriesImputer();
  // imputer.hydrate(historyBars);
  // 窗口内 bars 逐根 append + toChanKSeries(id=index+1)
  ```
- **签名**：
  ```ts
  private visualReplayStartFor(period: Period, startDate: Date): Date;
  private async loadVisualHistory(criteria: { securityId:number; source:DataSource; period:Period; endAt:Date; requiredBars:number }): Promise<StrategyBar[]>;
  private buildAlignedChanK(kEntities: K[], code:string, historyBars: StrategyBar[]): ChanK[];
  ```

### 2.3 `libs/visual-command/src/adapters/chan-visual.adapter.ts` — 索引零伪造（P1-1）

- **改动**：
  ```ts
  const getKIndex = (time: Date): number | null => {
    const byTime = timeToIndex.get(new Date(time).getTime());
    return byTime ?? null;
  };
  // 调用点改为 getKIndex(bi.startTime)/getKIndex(bi.endTime)
  // Band: getKIndex(first.startTime)/getKIndex(last.endTime)
  // 保留 idToIndex 仅日志诊断
  ```

### 2.4 `libs/visual-command/src/visual-command.types.ts` + `visual-command.service.ts`（P0-1）

- **types 新增**：
  ```ts
  export interface VisualCommandPayload {
    readonly code: string;
    readonly period: number;
    readonly source: string;
    readonly totalKlines: number; // = effectiveKlines
    readonly requestedKlines?: number;
    readonly droppedKlines?: number;
    readonly commands: readonly VisualCommand[];
  }
  ```

### 2.5 `apps/mist/src/visual/vo/visual-command.vo.ts`（P0-1）

- 同步增加 `requestedKlines` / `droppedKlines` 可选字段。

### 2.6 `libs/shared-data/src/mappers/k-strategy-bar.mapper.ts` — 复用源

- 不改逻辑，视觉历史加载复用 `mapKToStrategyBar`。

### 2.7 `apps/backtest/src/backtest-run.executor.ts` — 参照

- 不改，保持 `replayStartFor` 权威。

### 2.8 其他级别（日线及以上）的实时对齐 — 补丁范围一致

- `Period.DAY/WEEK/MONTH/... (>=1440)` 视觉侧 `visualReplayStartFor` 直接 `return startDate`，不额外 history，但 `hydrate([])->append(window)` 路径一致
- 实时侧 `RealtimeStrategyEvaluationService: requiredBars = max(plan.requiredBarCount)` 同预算，`SharedStrategyWindowStore.prepare` 同款 `hydrate+append`
- 边界契约：`KBoundaryCalculator.calculateDailyPlusCandle(00:00)` 与 `StrategySeriesImputer.SHANGHAI_TRADING_DAY_FORMATTER(00:00)` 分区一致

### 2.9 P1-3 中枢几何三阶段口径 — 可观测收敛（不改算法口径）

- **问题**：`validateChannelGeometry` vs `extendChannel/buildChannelFromBis` vs `isCentralExpansion` 三阶段 `zg/zd` 口径不一致
- **改动（本 change）**：仅加可观测与回归门禁
  ```ts
  export function diagnoseChannelGeometry(bis: ChanBi[]): { zg:number; zd:number; gg:number; dd:number; phase:string }[]
  // VisualController/ChanVisualAdapter 记录三阶段收缩比
  // logger.debug(`chan geometry phase trace ...`)
  // 单测断言三阶段 zg/zd 不扩张
  ```
- **后续**：另起 `fix-chan-central-geometry` 再统一口径

### 2.10 P2 量柱 fallback 污染 — 已在 mist-fe 侧治理（见 §3.2 末）

- mist 仓不涉及量柱回退，P2 落点在 `mist-fe/app/components/tv-chart/TradingViewChart.tsx`（见 §3.2）

---

## 3. 文件级改动详设（mist-fe 仓）

### 3.1 `app/api/client.ts` — 同参同源（P0-1）

- 删除 `VisualCommandQuery.count` 及 `if (query.count) params.count = ...`

### 3.2 `app/components/tv-chart/TradingViewChart.tsx` — 分段渲染 + 去回退（P1-2 / P2）

- **P1-2 分段渲染**：
  ```ts
  for (const line of biLines) {
    const s = chart.addLineSeries({ color:'#FACC15', lineWidth:1, crosshairMarkerVisible:false });
    s.setData([{ time: toUTCTimestamp(line.startTime), value: line.startPrice }, { time: toUTCTimestamp(line.endTime), value: line.endPrice }]);
    strokeSeriesRef.current.set(line.id, s);
  }
  // duan 同理 lineWidth 2 #E879F9；移除 biSeen/duanSeen
  // Band overlay 增加 priceToCoordinate null 守卫
  ```
- **P2 去回退**：
  ```ts
  const volumeValue = item.volume !== null && item.volume !== undefined ? Number(item.volume) : null;
  if (volumeValue === null || !Number.isFinite(volumeValue)) continue; // 留空，不回退 amount
  volumeData.push({ time, value: volumeValue, color: ... })
  ```

### 3.3 `app/lib/time.ts` — 不改，已满足 `Asia/Shanghai` 精确到秒

### 3.4 `mist-fe/openspec/*` — 镜像已就绪

---

## 4. 数据流（对齐后）

```
FE: BacktestWorkspace / KLineLivePage
  └─ 同一 query {code, period, source, startDate, endDate} // Asia/Shanghai 精确到秒
     ├─ POST /v1/indicators/k ── findKData Between ── KPriceProjector 过滤（可观测）
     └─ GET /v1/visual/commands ── findKData 同参
           ├─ visualReplayStartFor(period, startDate) // 分钟级 01:30Z；日线及以上 return startDate
           ├─ loadVisualHistory(timestamp < visualReplayStart, take=CHAN_BSP_WINDOW_BUDGET) ── mapKToStrategyBar
           │   └─ 分钟级触发；日线跳过（hydrate([]) 路径一致）
           ├─ StrategySeriesImputer.hydrate(history) + append(window) // 分钟不跨日；日线按 00:00 分区
           ├─ toChanKSeries(imputer.read()) // id=index+1
           └─ ChanVisualAdapter.convert(alignedKlines) // getKIndex 唯 time
FE 合并: TradingViewChart { k, commands: 每笔独立LineSeries + Band overlay（量柱缺失留空） }

实时：RealtimeStrategyEvaluationService.evaluate(bar)
  └─ requiredBars = max(plan.requiredBarCount) // 分钟/日线统一
     └─ SharedStrategyWindowStore.prepare(...) 同款 hydrate+append，00:00 边界一致

诊断：中枢几何三阶段 trace（validate→extend→expansion）仅日志/断言，不改口径
```

---

## 5. 测试矩阵（必须新增/补齐，覆盖 P0～P2）

### 5.1 `apps/mist/src/visual/visual.controller.spec.ts`（P0-1 / P0-2 / 其他级别）

1. **同参同源**：同 query 调 `getCommands` 与 `IndicatorController.k`，`Between/ORDER` 等价；`YYYY-MM-DD` 与 `YYYY-MM-DD 00:00:00` 同 `+08:00`
2. **投射一致可观测（P0-1）**：5 根 K 含 2 根脏数 → `requested=5 dropped=2 total=3` + warn
3. **窗口对齐（P0-2）**：`period=5 start=09:30` 调 `loadVisualHistory(endAt=01:30Z take=500)`；`period=1440` 不调用
4. **日线跳过（其他级别）**：`period=DAY/WEEK` 不触发 history，但 `tradingDay 00:00` 分区一致

### 5.2 `libs/visual-command/src/adapters/chan-visual.adapter.spec.ts`（P1-1 / P1-3）

1. **零伪造（P1-1）**：伪造 `Bi.startTime` 不存在 + `originIds=9999` → 丢弃而非 `0`
2. **索引自洽（P1-1）**：`fromIndex/toIndex` 与 `fromTime/toTime` 一致
3. **几何收缩（P1-3）**：固定样本三阶段 `zg/zd` 不扩张，否则 fail

### 5.3 `apps/backtest/src/backtest-run.executor.spec.ts`（P0-2）

- `replayStartFor` pure 化：`period=5` → `01:30Z`，`period=1440` → 原 `startDate`

### 5.4 `mist-fe/app/components/tv-chart/__tests__/TradingViewChart.test.tsx`（P1-2）

- 2 笔共享拐点 → 2 个独立 `LineSeries`，非单 Series 覆盖

### 5.5 `mist-fe/app/api/__tests__/client.test.ts`（P0-1）

- `fetchVisualCommands({count:500})` URL 不含 `count`

### 5.6 其他级别补充（横向）

- `realtime-strategy-evaluation.service.spec` 补 `period=DAY` 的 `requiredBars` 聚合路径不跳过
- 回测/视觉日线一致性：同窗口 `replayStartFor` 与 `visualReplayStartFor` 同为 `startDate`

### 5.7 `mist-fe/app/components/tv-chart/__tests__/TradingViewChart.volume.test.tsx`（P2）

- `volume===null` 时 `volumeData` 不含该 time，不回退 `amount`

---

## 6. 验证命令（本地 & CI）

```bash
# mist 仓
pnpm --filter mist lint
pnpm --filter mist test -- --runInBand --forceExit
# 重点单测
pnpm --filter mist test -- apps/mist/src/visual/visual.controller.spec.ts --runInBand --forceExit
pnpm --filter mist test -- libs/visual-command/src/adapters/chan-visual.adapter.spec.ts --runInBand --forceExit
pnpm --filter mist test -- apps/backtest/src/backtest-run.executor.spec.ts --runInBand --forceExit
openspec validate --change fix-dual-request-visual-alignment
openspec validate --specs

# mist-fe 仓
pnpm --filter mist-fe lint
pnpm --filter mist-fe test -- --runInBand --forceExit
```

---

## 7. 风险与回滚

- **移除 count 后大窗口**：受 DB `Between` 限制，可接受；另起 `limit` change 限流
- **历史对齐额外查询**：仅分钟级 `take=500 DESC`，开销常数
- **P1-3 不改口径**：仅日志/断言，无线上几何突变风险
- **回滚**：K 与 commands 双请求互为降级

---

## 8. 待用户确认点

1. 价格投射以 **严格 `KPriceProjector`** 为准？
2. 视觉窗口按 **imputer hydrate+append** ？
3. 图表 **每笔独立 Series** ？
4. 其他级别 **分钟/日线复用同一语义（00:00 边界一致）** ？
5. **P1-3 仅可观测**（本 change 不改 `libs/chancore` 口径，另起 change 统一）与 **P2 量柱留空** 是否确认？

确认后即按本计划建 worktree 落地，产出 diff 贴回本 change。
