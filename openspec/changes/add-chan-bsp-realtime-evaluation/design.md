# Design — add-chan-bsp-realtime-evaluation

## 1. 目标与范围

实时策略引擎接入缠论三类买卖点（一/二/三类 × 买/卖）作为 `chan_bsp` 策略 kind：
策略配置大集合（`kind` 区分），缠论是独立于 `rule_dsl` 的一种配置；引擎按 kind
编译与求值；产出复用现有 `ShadowStrategyCandidate` → persist → delivery 链路。

**前置依赖**：`add-dynamic-series-imputation`（OHLCVA 统一双向补齐 + 值单调不可变 +
窗口作用域）——detector 消费的投影窗口以该 change 的补齐视图为准（OHLC effective +
量价 effective + `backfilled` resolution）。该 change 未完成前，detector 的
`toChanKSeries` 先按现有 `ProjectedStrategyBar` 形态实现，补齐语义随后对齐。

**In scope**：kind 字段、chan_bsp 配置 schema 与校验、registry 编译分派、evaluation
求值分派、`ChanBspDetector`（无状态编排器 + 力度 + 增量游标）、管理面 DTO、migration、
单测与基线、shadow 验证。

**Out of scope**（用户拍板后置）：
- 区间套/多级别递归（ChanCore 接口零改动；API 演进方向记录在案）；
- "信号是否推入消息队列"的投递决策（未来独立"计算引擎"）；
- 冷却窗口/信号分级/投递抑制（同上，属计算引擎）；
- 日线（1440）及以上的实时档（当日日 K 无法 sealed）；
- 回测复用 detector（backtest owning change）；
- `chan-bsp` 的 HTTP 端点（与 `add-chan-buy-sell-point` 先例一致：库能力，策略模块消费）。

## 2. 配置 schema

```
rule JSON（kind='chan_bsp' 时）:
{
  "units": "bi" | "duan",
  "points": { "first"?: boolean, "second"?: boolean, "third"?: boolean },
  "direction": "buy" | "sell" | "both"
}
```

- `level` 复用 `StrategyDefinition.periods`，**单值**（数组长度 = 1，∈ {1,5,15,30,60}）。
- `points` 至少一项为 true（空 = 无效配置）。
- `units`、`direction` 必填。
- 无 minBars：窗口长度是检测器内部常量（见 §5），产出语义 = "是不是一买/二买/三买 × 买卖"。
- `ruleSchemaVersion` 复用 V1（rule 仍是 JSON 对象；schema 由 kind 区分，不加新版本号）。

## 3. 实体与 migration

- `libs/shared-data/src/entities/strategy-definition.entity.ts`：新增列
  `kind: StrategyKind = StrategyKind.RULE_DSL`（枚举 `StrategyKind { RULE_DSL = 'rule_dsl', CHAN_BSP = 'chan_bsp' }`，
  新枚举文件 `libs/shared-data/src/enums/strategy-kind.enum.ts`）。
- migration（下一个 real 号）：`ALTER TABLE strategy_definitions ADD COLUMN kind
  ENUM('rule_dsl','chan_bsp') NOT NULL DEFAULT 'rule_dsl'`。**forward-only，绝不 reuse 已有号**；
  现有存量行 default `rule_dsl` 语义不变。

## 4. registry 编译分派

`apps/signal/src/signal-registry.service.ts`：

- `compileRegistryDefinition` 读 `definition.kind` 分派：
  - `rule_dsl`：现有路径 `compileStoredStrategyRuleWithNormalized`（不动）。
  - `chan_bsp`：新 `compileChanBspConfig(version.rule, version.signalKind, definition.periods)`
    → `ChanBspPlan`。校验：units ∈ {bi,duan}、direction ∈ {buy,sell,both}、points 非空、
    periods 单值且 ∈ REALTIME 档；非法抛 `ChanBspConfigError`（编译失败 → registry 拒绝，
    与现有 rule 编译失败行为一致）。
- `SignalRegistryDefinition`（`apps/signal/src/signal-registry.types.ts`）：
  `executionPlan` 改为 union：
  ```
  type RealtimeStrategyExecutionPlan = (
    { kind: 'rule_dsl', plan: CompiledStrategyExecutionPlan }
  | { kind: 'chan_bsp', plan: ChanBspPlan }
  ) & { definitionId, versionId, source, period, ruleSnapshot }
  ```
  （`RealtimeStrategyExecutionPlan` 现定义在 `libs/signal/src/runtime/realtime-strategy-evaluation.service.ts`，
  本 change 移到 `libs/signal/src/runtime/` 类型文件或原地扩展为 union——实施时定。）

`ChanBspPlan`（新，放 `libs/signal/src/runtime/` 或 `apps/signal/src/realtime/chan/` 契约文件）：
```
interface ChanBspPlan {
  readonly units: 'bi' | 'duan';
  readonly points: { first: boolean; second: boolean; third: boolean };
  readonly direction: 'buy' | 'sell' | 'both';
  readonly requiredBarCount: number;   // 内部常量，按 level 预算（§5）
}
```

## 5. ChanBspDetector（无状态编排器）

新目录 `apps/signal/src/realtime/chan/`：

```
chan-bsp.detector.ts        ChanBspDetector：evaluate(window, plan) → ChanBspEvent[]（纯函数）
chan-bsp.types.ts           ChanBspEvent / 内部中间类型
chan-bsp.pipeline.ts        8 步 pipeline 串联（mergeK → fenxing → bi → [duan] → 中枢 → 力度 → detectBuySellPoints）
chan-bsp.k-mapper.ts        StrategyBar[] → ChanK[]（toChanK）
chan-bsp.force.ts           力度计算（computeMacdSeries + computeUnitDirectionalAreas + computeUnitLinePeaks 的编排）
chan-bsp.episode.ts         增量游标（§7）
chan-bsp.detector.spec.ts   单测
```

**Pipeline 数据流**（`units='duan'` 为例；`units='bi'` 分支不建段/段级中枢）：

```
ProjectedStrategyBar[]（主级别窗口，windows.read() 的投影后形态：
  当日 Redis + MySQL 补历史经 loadRealtimeWindow → SharedStrategyWindowStore 内
  QuantityForwardFillProjector 补齐 volume/amount → read() 输出）
  → toChanK：id = 1..n（索引），symbol = String(securityId)，time = rawBar.timestamp，
            OHLC 直传（KPriceProjector 已投影，detector 只做 finite 校验 fail closed），
            volume/amount 取 projected.effective（forward-fill 已完成；
            resolution=unavailable 时才为 null，原样直传）
  → ChanCore.mergeK（去包含）
  → ChanCore.findFenxings → ChanCore.createBi → bis.phaseB
  → units='duan'：ChanCore.createDuan(bis.phaseB) → ChanCore.createDuanChannels(duans)
    units='bi'  ：ChanCore.createChannels(orderedK)（笔级中枢）
  → 力度：closes = k 序列 close
      macd = computeMacdSeries(closes)
      forces[i] = {
        area: computeUnitDirectionalAreas(macd.histogram, macd.begIndex, kTimes, units, directions)[i],
        peak: |方向极值|（computeUnitLinePeaks(macd.macd, ...)[i]，up→max / down→min 取绝对值）
      }
  → ChanCore.detectBuySellPoints({ units: ChanBspUnit[], zhongshus, forces })
  → ChanBuySellPoint[] → 映射 + 按 plan.points/direction 过滤 → ChanBspEvent[]
```

**ChanBspEvent**（新契约）：
```
interface ChanBspEvent {
  readonly type: 'first_buy'|'first_sell'|'second_buy'|'second_sell'|'third_buy'|'third_sell';
  readonly units: 'bi' | 'duan';
  readonly time: Date;            // units[unitIndex].endTime 反查（点确认时刻）
  readonly price: number;         // ChanBuySellPoint.price（买=段 low / 卖=段 high）
  readonly zhongshuIndex: number | null;
  readonly zg: number | null;     // 相关中枢上沿（通知上下文）
  readonly zd: number | null;     // 相关中枢下沿
  readonly unitIndex: number;     // 确认段下标（增量游标用）
}
```

**requiredBarCount 内部预算**（保证能容纳"上涨 2 中枢 + 下跌 1 中枢"的标准趋势结构；
不是判定阈值——产点与否由 chancore 结构判定自然决定）：

| level | 预算（bar） | 覆盖（约） |
|-------|-----------|-----------|
| 1m    | 800       | 3+ 个交易日 |
| 5m    | 500       | 10+ 个交易日 |
| 15m   | 300       | 15+ 个交易日 |
| 30m   | 200       | 25 个交易日 |
| 60m   | 120       | 30 个交易日 |

**性能**：detector 每次全量重算（无状态）；缠论策略按 level 注册，仅该 level bar
封存时求值（30m 一天 8 次/标的）；窗口复用现有 `SharedStrategyWindowStore` 分组缓存。

**数据前提**（tasks 验证，不阻塞实现）：MySQL `k` 表 5/15/30/60 历史覆盖
（`loadRealtimeWindow` 当日 Redis + MySQL 补历史）。TDX 1m 历史几乎无数据的已知缺口
不影响 5m+ 级别（若 schedule 收盘入库覆盖全级别）。

## 6. evaluation 求值分派

`libs/signal/src/runtime/realtime-strategy-evaluation.service.ts`：

- `evaluate(bar, plans)` 保持现有骨架：eligible 过滤（source+period）→
  requiredBars = max(...plans 的 requiredBarCount) → `windows.prepare` → `windows.read`。
- 对每个 execution 按 `plan.kind` 分派：
  - `rule_dsl`：现有 `evaluateStrategyPlan(plan, projected, analysis)`（不动）；
  - `chan_bsp`：`detector.evaluate(projected, chanBspPlan)` → 事件列表 →
    `chanBspEpisodes.advance(identity, events)` 增量过滤 → 0..n 个事件；
- 每个 emit 的缠论事件构造与现有同构的 `ShadowStrategyCandidate`：
  ```
  signalKind: 由事件推导（buy → 'entry'，sell → 'exit'）
  signalTime / triggerTime / triggerPrice / barType：锚定确认事件
  contextSnapshot：{ chanBsp: { type, units, zhongshuIndex, zg, zd } }
  ruleSnapshot：chan_bsp 配置原样
  ```
- `RealtimeEpisodeStore` 仍兜底（identity = definitionId+versionId+securityId+source+period+signalKind），
  缠论主去重由 chan_bsp 游标承担（§7）。
- `RealtimeStrategyExecutionPlan` 同步变 union（§4）。

## 7. 增量 emit（游标）

- `chan-bsp.episode.ts`：per `(definitionId, securityId, source, level, units)` 维护
  `lastEmittedUnitIndex: number`。
- `advance(identity, events)`：
  - 过滤 `unitIndex > lastEmittedUnitIndex` 的事件；
  - 更新游标 = max(事件 unitIndex)（仅当有新点）；
  - 结构演化（点消失/重现）不重报：unitIndex 不倒退。
- 游标生命周期：与 evaluation 的 windows/episodes 同生命周期（交易日切换 reset、
  `reconcileRegistry` 时按 registry scope 裁剪）。
- 同一确认段上的多个点类型（如一段同时确认二买+三买）各自独立 emit（不同 type）。

## 8. 管理面（apps/mist）

- `CreateStrategyDefinitionDto` 加 `kind: StrategyKind`（默认 `rule_dsl`，兼容现有调用）。
- `strategy-definition.service` 创建/更新时按 kind 校验 rule：
  - `rule_dsl`：现有校验（不动）；
  - `chan_bsp`：`validateChanBspConfig(rule, periods)`——units/direction/points 合法性、
    periods 单值 ∈ {1,5,15,30,60}（日线等长周期拒绝：实时档未支持）。
- 校验失败返回现有 `VALIDATION_ERROR` envelope。
- 不新增管理端 HTTP 端点（复用现有创建/更新路径，kind 只是新增字段）。

## 9. 事件日志与可观测性（用户偏好：指标导出必须配判断点日志）

- info 生命周期日志：chan_bsp plan 编译成功/失败（registry）、交易日切换游标重置；
- warn 判断点日志：`chan_bsp_config_invalid`（编译拒绝）、窗口不足/结构不足以产点
  （`insufficient_structure`，含 reason code）；
- 低基数 label：kind、units、level、direction；原始错误只进 `error=` 字段。
- 指标：复用现有 signal 观测框架，不新增 metric 命名空间（shadow 阶段先看日志与
  diagnostics；触发频率统计走 OpenObserve 查询）。

## 10. 验证

- **单测**：
  - `chan-bsp.pipeline.spec.ts`：用 `libs/chancore` characterization fixture 的 K 序列
    走完整 pipeline，断言产出的点类型/价格/时间与手标一致；
  - `chan-bsp.detector.spec.ts`：points/direction 过滤、空窗口返回 []、结构不足返回 []；
  - `chan-bsp.episode.spec.ts`：游标增量（新点 emit / 重现不报 / 交易日重置）；
  - `signal-registry.service.spec.ts` 增补：kind 分派编译、chan_bsp 配置非法拒绝；
  - `realtime-strategy-evaluation.service.spec.ts` 增补：chan_bsp plan 求值 + candidate 形态；
  - 管理面：dto 校验（kind 缺省兼容 / chan_bsp 非法配置 / 多 period 拒绝）。
- **基线**：mist 仓 lint/typecheck/test:ci/coverage 全绿；`openspec validate --changes`。
- **实盘验证（shadow 先行）**：配置 `REALTIME_PRODUCTIZATION_MODE=shadow`，建 1-2 个
  chan_bsp 策略定义（如 30m duan 三买），观察：触发频率、事件形态、结构演化推翻率
  （游标记录的重现情况）；确认后再评估 on 模式。

## 11. 数据库与部署影响

- migration：1 个 forward-only（§3）。
- 部署：signal app 镜像构建自动包含新 lib 依赖（monorepo workspace）；`build:docker`
  app 列表不变（signal 已在）；无 Compose 变化；无新 service。
- 回滚：kind 列 additive，回滚仅需保留列（列删除不回滚，forward-only 原则）。

## 12. 风险与对策

| 风险 | 对策 |
|------|------|
| 缠论点"吵"（事件过多） | 本 change 只做配置裁剪 + 游标；冷却/分级归计算引擎；shadow 校准触发频率 |
| 结构演化假信号（点被后续结构推翻） | 游标只进不退 + shadow 观察推翻率；推翻率数据支撑后续计算引擎设计 |
| 力度全开的一类点依赖 MACD 窗口 | 力度计算与检测器同窗口，begIndex 对齐校验（复用 indicators 现成对齐语义） |
| MySQL 5m+ 历史覆盖不足 | tasks 验证；不足时以 30m/60m 为 shadow 首选级别 |
| 多 plan 并发求值性能 | 每 bar 全量重算，但按 level 天然节流 + windows 分组缓存复用 |
