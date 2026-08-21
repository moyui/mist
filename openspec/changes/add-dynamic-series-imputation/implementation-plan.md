# 实施计划 — add-dynamic-series-imputation

依据：本 change 的 proposal / design / tasks / delta specs（2026-08-21 用户确认定稿：
D1 删旧、D2 DSL 切 effective、D3 兼容口径接受、D4 backtest 两段式、D5 交易日边界、
D6 指标切 effective、D7 raw 口径=四元组全部有限否则 null）。

## 0. 改动文件总览

| 操作 | 文件 |
|---|---|
| 新增 | `libs/strategy/src/projection/strategy-series-imputer.ts`（主实现） |
| 新增 | `libs/strategy/src/projection/strategy-series-imputer.spec.ts` |
| 删除 | `libs/strategy/src/projection/quantity-forward-fill.projector.ts` |
| 删除 | `libs/strategy/src/projection/quantity-forward-fill.projector.spec.ts` |
| 修改 | `libs/strategy/src/index.ts`（导出切换） |
| 修改 | `libs/strategy/src/evaluation/strategy-context.builder.ts`（k.*/指标切 effective） |
| 修改 | `libs/strategy/src/evaluation/strategy-evaluation.types.ts`（import 换源） |
| 修改 | `libs/strategy/src/evaluation/strategy-evaluation.spec.ts`（新用例） |
| 修改 | `libs/strategy/src/market-data/strategy-market-data.port.ts`（+loadReplayWindow） |
| 修改 | `libs/signal/src/runtime/shared-strategy-window.store.ts`（切新补齐器） |
| 修改 | `libs/signal/src/runtime/shared-strategy-window.store.spec.ts`（回归+新用例） |
| 修改 | `apps/backtest/src/backtest-market-data.adapter.ts`（+loadReplayWindow） |
| 修改 | `apps/backtest/src/backtest-run.executor.ts`（两段式迁移） |
| 新增 | `apps/backtest/src/backtest-market-data.adapter.spec.ts` |
| 新增 | `apps/backtest/src/backtest-run.executor.spec.ts`（mock 依赖） |

`libs/chancore`、`libs/indicators`、`apps/signal`、`apps/mist`、DB、部署：零改动。

## 1. 补齐器实现（libs/strategy/src/projection/strategy-series-imputer.ts）

### 1.1 类型（对外契约，替代旧 projector 的类型）

```ts
export type StrategyImputationResolution =
  | 'observed' | 'forwardFilled' | 'backfilled' | 'unavailable';

export type StrategyOhlcTuple = { open: number; high: number; low: number; close: number };

export interface ProjectedStrategyOhlc {
  readonly raw: StrategyOhlcTuple | null;        // D7：四元组全部 finite → 原值；任一非 finite → null
  readonly effective: StrategyOhlcTuple | null;  // 补齐后值；unavailable → null
  readonly resolution: StrategyImputationResolution;
}

export interface ProjectedStrategyQuantity {
  readonly raw: string | null;
  readonly effective: string | null;
  readonly resolution: StrategyImputationResolution;  // 枚举从三值扩到四值
}

export interface ProjectedStrategyBar {
  readonly rawBar: StrategyBar;
  readonly tradingDay: string;
  readonly ohlc: ProjectedStrategyOhlc;   // 新增
  readonly volume: ProjectedStrategyQuantity;
  readonly amount: ProjectedStrategyQuantity;
}
```

说明：旧 `StrategyQuantityResolution` 三值枚举**不保留别名**，统一为
`StrategyImputationResolution` 四值；`ProjectedStrategyQuantity` 形状不变。

### 1.2 纯函数 imputeSeries（窗口整体双向补齐）

```ts
export function imputeSeries(bars: readonly StrategyBar[]): readonly ProjectedStrategyBar[]
```

算法（每根 bar 独立处理 OHLC / volume / amount 三个维度）：

1. 校验：timestamp 有限；securityId/period 正整数（沿用旧 projector 的校验口径）；
   **严格递增** timestamp（否则 RangeError，与旧 projector 一致）。
2. 按上海交易日分组（`toShanghaiTradingDay`，helper 从旧文件搬入）——**补齐不跨日**
   （D5：OHLC 与量价一致）。
3. 对每个交易日组：
   - **锚点判定**：
     - OHLC 锚点：open/high/low/close **全部 finite**（任一 NaN/Infinity → 非锚点，
       该 bar 自身也待补齐）；不检查 low<=high、不检查非负（spec 口径 = finite，实施
       时在注释中标注该边界）。
     - 量价锚点：raw !== null；非 null 时 `Decimal8.parseCanonical(raw)` **fail closed**
       （非法字符串直接抛错，不静默补零，沿用旧 projector 行为）。
   - 每个缺失位置 i：存在 `j > i` 且 j 为锚点（同日内）→ 取**最近** j 回填，
     resolution=`backfilled`；否则存在 `j < i` 锚点（同日内）→ 取最近 j 前填，
     resolution=`forwardFilled`；否则 effective=null，resolution=`unavailable`。
   - OHLC 与量价**各自独立**判定（某 bar 是 OHLC 锚点不代表 volume 有值）。
4. 返回与输入同序的 `ProjectedStrategyBar[]`；无插值/无平均，只复制最近锚点原值。

### 1.3 增量类 StrategySeriesImputer（值单调不可变的载体）

```ts
export class StrategySeriesImputer {
  private bars: ProjectedStrategyBar[] = [];
  private lastTradingDay: string | null = null;
  private lastOhlc: StrategyOhlcTuple | null = null;   // 段内最后一个有效 OHLC 锚点
  private lastVolume: string | null = null;            // 段内最后一个有效量锚点
  private lastAmount: string | null = null;

  hydrate(bars: readonly StrategyBar[]): void;         // 整段 imputeSeries 后定死
  append(bar: StrategyBar): ProjectedStrategyBar;      // 只 forward-fill，定死
  trim(): void;                                        // 丢最老，不重算
  read(): readonly ProjectedStrategyBar[];             // frozen 拷贝
  reset(): void;
}
```

- `hydrate`：`this.bars = [...imputeSeries(bars)]`；从段尾回溯设置三个 last 锚点
  （该段的最后锚点，供后续 append 使用）；`lastTradingDay` = 段末 bar 的交易日。
  之后任何 append **不改写**已定死值。
- `append(bar)`：
  - 交易日变化 → lastOhlc/lastVolume/lastAmount 全部置 null（不跨日），
    `lastTradingDay` 更新；
  - 校验 timestamp > 上一根（严格递增，RangeError）；
  - bar 自身是锚点 → observed 并更新对应 last 锚点；
    否则 → 用 last 锚点 forward-fill（`forwardFilled`），无锚点 → `unavailable`；
  - **绝不 backfill、绝不重算旧 bar**；push 后冻结返回。
- `trim()`：`this.bars.shift()`；不重算剩余值。
- `read()`：`Object.freeze([...this.bars])`。
- `reset()`：全部清空。

### 1.4 导出

`libs/strategy/src/index.ts`：
- 删除 `QuantityForwardFillProjector`、`StrategyQuantityResolution`（随旧文件删除）；
- 新增导出 `imputeSeries`、`StrategySeriesImputer`、`StrategyImputationResolution`、
  `ProjectedStrategyOhlc`、`StrategyOhlcTuple`；
- `ProjectedStrategyBar` / `ProjectedStrategyQuantity` 改从新文件导出（名称不变）。

## 2. 消费者切换（strategy-context.builder.ts）

### 2.1 k.open/high/low/close → effective（D2）

`materializeField` 的 `k.open|k.high|k.low|k.close` 分支（现 :178-193）：

```ts
const property = demand.field.slice(2) as 'open' | 'high' | 'low' | 'close';
const currentEffective = current.ohlc.effective?.[property] ?? null;
if (currentEffective === null) return null;            // field_unavailable
const previousEffective = demand.needsPrevious
  ? previous?.ohlc.effective?.[property] ?? null
  : undefined;
if (demand.needsPrevious && previousEffective === null) return null;
return observation(currentEffective, previousEffective, demand.needsPrevious);
```

语义：bar 四元组不完整 → effective=null → 该字段（包括本就有限的 close）
**一律不可用**（spec："四缺一不算锚点，且它自身必须被补齐"）。

### 2.2 指标字段 → effective（D6）

- `StrategyAnalysisObservationCache.kdj()/macd()` 内部：把 `rawBars()` 替换为
  `effectiveBars()`（构造 `{...rawBar, open/high/low/close: ohlc.effective 值}`）；
  任一 bar `ohlc.effective === null` → 返回 `null`（不再抛 guard 错）。
- 返回类型改为 `StrategyKdjObservation | null` / `StrategyMacdObservation | null`
  （`??=` 对 null 同样缓存，确定性不变）。
- `materializeField` 指标分支：`analysis.kdj(bars, false)` 为 null → `return null`
  （field_unavailable），不再 `[property]` 直接取。

### 2.3 其他

- `strategy-evaluation.types.ts:2` import 换到 `../projection/strategy-series-imputer`。
- `serializeStrategyContextSnapshot` **不改**（字段值即 effective，序列化路径天然生效）；
  tasks 5.3 验证项。
- `strategy-rule.evaluator.ts` 不改（只 import 类型，换源）。

## 3. signal 窗口层迁移（libs/signal/src/runtime/shared-strategy-window.store.ts）

- `WindowGroup` 变为 `{ capacity: number; imputer: StrategySeriesImputer }`。
- `buildGroup(bars, capacity)`：`imputer.hydrate(ordered)`；`while (read().length > capacity) imputer.trim()`；
  返回 `{ capacity, imputer }`。去重/冲突校验保留在 hydrate 前（现有逻辑）。
- `prepare`：
  - group 不存在 / `requiredBars > capacity` → 重新 buildGroup（与现有一致）；
  - duplicate / 乱序校验改对 `imputer.read()` 做（原 `group.projectedBars`）；
  - `imputer.append(bar)` 替代 `projector.project(bar)`；超容量 → `imputer.trim()`。
- `read()`：返回 `imputer.read()`（已 frozen 拷贝）。
- `diagnostics()`：改用 `imputer.read()` 计数。
- `reset()` / `retainGroups()`：不变（clear map / 按 key 保留）。

## 4. backtest 两段式迁移（apps/backtest + port）

### 4.1 port 扩展（libs/strategy/src/market-data/strategy-market-data.port.ts）

```ts
export interface StrategyReplayWindowCriteria {
  readonly securityId: number;
  readonly source: StrategyRealtimeSource;   // tdx | qmt
  readonly period: number;
  readonly endAt: Date;                      // 排他上界：取 timestamp < endAt 的 bar
  readonly requiredBars: number;             // 正安全整数
}

export interface StrategyReplayWindow {
  readonly bars: readonly StrategyBar[];
}

// StrategyReplayMarketDataPort 增加：
loadReplayWindow(criteria: StrategyReplayWindowCriteria): Promise<StrategyReplayWindow>;
```

### 4.2 adapter 实现（apps/backtest/src/backtest-market-data.adapter.ts）

- `loadReplayWindow`：校验 criteria（沿用 `assertCriteria` 口径 + requiredBars 正安全
  整数）；查询 `k.timestamp < endAt`，`orderBy timestamp DESC`，`take requiredBars`，
  reverse 后 `mapKToStrategyBar`；返回 `{ bars }`。
- 保持 `readReplayPage` 不动。

### 4.3 executor 两段式（apps/backtest/src/backtest-run.executor.ts `replaySecurity`）

```ts
const imputer = new StrategySeriesImputer();
// ① 准备阶段：首个评估点前的初始窗口段
const initial = await this.marketData.loadReplayWindow({
  securityId, source: run.source, period: run.period,
  endAt: run.startDate,                        // 排他：不含 startDate 当根
  requiredBars: plan.requiredBarCount,
});
for (const bar of initial.bars) budget.consume();   // 计入预算（量小，<= requiredBarCount）
imputer.hydrate(initial.bars);

// ② 计算阶段：原分页循环，project 换 append
for (const bar of page.bars) {
  budget.consume();
  if (bar.timestamp >= run.startDate) hasPublicBars = true;
  imputer.append(bar);
  if (imputer.read().length > plan.requiredBarCount) imputer.trim();
  if (bar.timestamp >= run.startDate) {
    const evaluation = evaluateStrategyPlan(plan, imputer.read());
    // ... 原有结果收集/flush 逻辑不变
  }
}
```

- 删除 `const projector = new QuantityForwardFillProjector()` 与 `windows` 数组；
  import 换 `StrategySeriesImputer`（`@app/strategy`）。
- 语义核对：初始段锚点全部 < startDate ≤ 首个评估点 → 无 look-ahead；评估时机不变
  （每根 ≥ startDate 一次）；窗口不满 → `insufficient_history`（builder 现有逻辑）；
  `BACKTEST_QUANTITY_PROFILE_UNAVAILABLE` 门禁（:147-150）不动。
- 分页 / 超时 / ReplayBudget / flush / failAndCleanup 全不动。

## 5. 测试计划

### 5.1 strategy-series-imputer.spec.ts（新增）

纯函数 `imputeSeries`：
| 用例 | 断言 |
|---|---|
| 开头缺失，后有锚点 | 回填最近后向锚点，resolution=`backfilled` |
| 中间缺失（前后都有锚点） | **取后向**锚点（不是前向），`backfilled` |
| 末尾缺失 | 前向锚点前填，`forwardFilled` |
| 全段无锚点 | 全 `unavailable`，不虚构 0/空串 |
| 混合场景 | 开头 backfilled + 中间 backfilled + 末尾 forwardFilled 并存 |
| OHLC 四缺一（NaN open） | 不算锚点；自身被最近完整锚点补齐；四元组完整才 observed |
| 量价锚点 | non-null 才锚；非法字符串抛错（fail closed） |
| OHLC 与量价独立 | 同 bar 可 observed(OHLC) + unavailable(volume) |
| 跨交易日 | 前日锚点不补今日（D5，量价与 OHLC 均验证） |
| 确定性 | 两次调用 deep-equal |
| 乱序 | 非严格递增 → RangeError |

类 `StrategySeriesImputer`：
| 用例 | 断言 |
|---|---|
| hydrate 定死 | 之后 append 不改写任何旧 bar 值/resolution |
| append 只 forward-fill | 新 bar 缺失 → 用段内最后锚点 forwardFilled |
| hydrate 时末尾缺失 | 后续 append 到新锚点**不**把它改写为 backfilled |
| trim 不重算 | trim 后剩余 bar 值与 resolution 全等 |
| 交易日切换 | 新日首根缺失 → unavailable（锚点不跨日）；reset 后状态清空 |
| 严格递增 | append 乱序 → RangeError |

### 5.2 strategy-evaluation.spec.ts（更新/新增）

- k.close 读 effective：窗口内某 bar 被 backfill → `k.close` 为该补齐值；
- 当前 bar 四元组不完整且无可补锚点 → `field_unavailable`（不再用 raw close）；
- indicator.kdj/macd：窗口内含被补齐 OHLC → 结果为基于 effective 的有限值；
  窗口内含 `ohlc.effective === null` → `field_unavailable`（不抛错）；
- 回归：完整数据下 k.*/指标结果与改造前完全一致。

### 5.3 shared-strategy-window.store.spec.ts（更新）

- 现有 duplicate / 乱序 / 冲突 / 容量断言全量回归；
- 新增：hydration 后 read() 暴露 `ohlc` 视图（含 backfilled）；append 值单调。

### 5.4 backtest 测试（新增）

- `backtest-market-data.adapter.spec.ts`：loadReplayWindow 查询（< endAt、DESC take、
  reverse、空结果、requiredBars 校验抛错）。
- `backtest-run.executor.spec.ts`（mock repos/adapter/config/health）：
  - 两段式：`loadReplayWindow` 以 `{endAt: startDate, requiredBars: requiredBarCount}`
    调用一次；初始段 hydrate（warm-up 缺口 backfilled）；之后逐根 append；
  - 评估时机：仅 ≥ startDate 评估；窗口不满 → `insufficient_history` 不出信号；
  - 分页/预算：ReplayBudget 对 hydrate bar 也 consume；超时/超限仍抛
    `BACKTEST_EXECUTION_TIMEOUT` / `BACKTEST_BAR_LIMIT_EXCEEDED`。

## 6. 验证命令（mist 仓）

```bash
pnpm run lint:check
pnpm run typecheck
TZ=UTC pnpm run test:ci        # 脚本自带 --forceExit（AGENTS §7）
pnpm run ci:contracts
openspec validate --all --strict
git diff --check
```

- 本机 2018 Intel MBP：lint/typecheck/test 分批跑，避免长时间满载（VRM 降频约束）。
- worktree 无 node_modules：`cd mist/.worktrees/<name> && ln -s ../../node_modules node_modules`。
- shadow 观察（tasks 7.2）：合并部署后观察量价 unavailable→backfilled 对存量 DSL
  策略触发频率的影响，记录 evidence（属收尾阶段，非本计划代码范围）。

## 7. 风险与边界（实施时注意）

| 风险 | 对策 |
|---|---|
| OHLC 锚点只查 finite、不查非负/ low<=high | 按 spec 口径实施；`strategy-analysis.guard` 若被负值触发属数据异常，注释标注，不在本 change 扩展 |
| `??=` 缓存 null（指标 unavailable） | 语义确定（该窗口无有效 OHLC → 永远 field_unavailable）；不加旁路缓存 |
| backtest 首次 append 与初始段重叠 | `endAt` 排他（timestamp < startDate），首次 append 必为新 bar；hydrate 空段时 `imputer.hydrate([])` 合法，窗口自然填充 |
| DSL 行为变化（unavailable→backfilled / NaN 不再抛错） | 已确认（D3）；shadow 观察 |
| `strategy-boundary.guard.spec.ts` 等 libs 回归 | 全量 test:ci 兜底；port 增加方法属向后兼容（新增而非改签名） |
