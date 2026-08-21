# Design — add-dynamic-series-imputation

## 1. 目标与范围

把策略引擎消费的序列补齐能力升级为 **OHLCVA 统一、双向、值单调不可变、窗口作用域**
的共享纯函数，供实时窗口层 / chan_bsp detector / 回测复用。

**In scope**：统一补齐纯函数（libs/strategy projection 域）、signal 窗口层迁移、
单测与基线、resolution 扩展（`backfilled`）。

**Out of scope**：chan_bsp detector 接入（`add-chan-bsp-realtime-evaluation`）；
回测接入（backtest owning change）；HTTP/数据库/部署变化。

## 2. 用户定稿规则（本 change 的唯一事实来源）

1. OHLC 与量价用**同一套规则**（OHLCVA 统一）；
2. 有效锚点：OHLC 补齐要求四元组都存在且都有效；量价补齐要求对应字段有效；
3. 序列**开头/中间**缺失（其后存在有效锚点）→ 后向最近有效锚点**回填**（backfill）；
4. 序列**末尾**缺失（其后无有效锚点）→ 前向最近有效锚点**前填**（forward-fill）；
5. 窗口内无任何锚点 → `unavailable`（不虚构）；
6. **值单调不可变**：任何 bar 的 effective 一旦确定不再变化（已 emit 信号不消失）；
7. 补齐作用域 = 当前评估窗口（末端 = 当前点）→ 无 look-ahead；
8. **DSL 消费 effective**：`k.open/high/low/close` 与指标字段（kdj/macd）消费 effective
   OHLC（`k.volume/k.amount` 路径不变）；
9. **backtest 两段式**：先 hydrate 初始窗口段（首个评估点前 `requiredBarCount` 根），
   再逐根 append 评估；只 hydrate 初始段，不整段 load 全量。

## 3. 补齐器 API（libs/strategy/src/projection/）

保留 `ProjectedStrategyBar` / `ProjectedStrategyQuantity` 对外形态（消费者兼容），
升级实现与 resolution 枚举：

```
libs/strategy/src/projection/strategy-series-imputer.ts   （新，主实现）
libs/strategy/src/projection/quantity-forward-fill.projector.ts  （删除，不留适配层）
```

```ts
export type StrategyImputationResolution =
  | 'observed' | 'forwardFilled' | 'backfilled' | 'unavailable';

// OHLC 四元组补齐后的视图
export interface ProjectedStrategyOhlc {
  // raw 口径（已确认）：四元组全部有限 → 原值；任一非有限 → null
  readonly raw: { open: number; high: number; low: number; close: number } | null;
  readonly effective: { open: number; high: number; low: number; close: number } | null;
  readonly resolution: StrategyImputationResolution;
}

export interface ProjectedStrategyBar {
  readonly rawBar: StrategyBar;
  readonly tradingDay: string;
  readonly ohlc: ProjectedStrategyOhlc;              // 新增
  readonly volume: ProjectedStrategyQuantity;         // resolution 枚举扩展
  readonly amount: ProjectedStrategyQuantity;         // resolution 枚举扩展
}
```

**核心纯函数**（窗口整体补齐，一次一个完整序列）：

```ts
export function imputeSeries(
  bars: readonly StrategyBar[],
): readonly ProjectedStrategyBar[];
```

- 输入：有序 bar 序列（调用方保证有序）；
- 对序列整体一次性补齐（backfill 开头/中间 + forward-fill 末尾）；
- 确定性、无状态、不 I/O。

**增量适配**（窗口层用，值单调不可变的实现载体）：

```ts
export class StrategySeriesImputer {
  // 段加载：hydrate(bars) —— 对整段调用 imputeSeries，结果定死缓存
  // 增量：append(bar) —— 只对 bar 做 forward-fill（用段内最后一个有效锚点）
  //       新 bar 值一旦确定不再重算旧 bar
  // 滑动：trim() —— 只丢最老，不重算
  // reset() / 交易日切换语义与现有一致
}
```

## 4. 值单调不可变的机制

| 事件 | 行为 | 值是否变化 |
|---|---|---|
| hydrate 段（历史页/当日已封存/回测分页） | 整段 imputeSeries（双向）后定死 | 首次确定 |
| append 新 bar | 只对新 bar forward-fill | 旧 bar 不变 |
| 窗口容量滑动 | 丢最老 | 剩余不变 |
| 交易日切换 | 新组 reset（与现有一致，不跨日） | 前一日不变 |

- **不做**"每次 append 整体重算"（那会改写末尾缺失为 backfill，违反单调性）；
- 语义边界：当日第一根缺失 bar 在 hydrate 时若该段内其后已有值 → 该 bar 在 hydrate 时
  就被 backfill 定死（不跨 append 边界）；若 hydrate 时它确为段末尾 → forward-fill 定死，
  之后 append 的新 bar **不**改写它。

## 5. 有效锚点与方向选择

```
对窗口内每个缺失位置 i：
  存在 j > i 且 j 为有效锚点（后向锚点）？
    → 取最近 j，用 bars[j] 回填 i（backfilled）
  否则存在 j < i 且 j 为有效锚点（前向锚点）？
    → 取最近 j，用 bars[j] 前填 i（forwardFilled）
  否则 → unavailable

OHLC 锚点判定：open/high/low/close 全部 finite（四元组完整）
量价锚点判定：对应字段为有效 canonical DECIMAL 字符串（非 null）
```

- 无 epsilon、无插值（不做平均/加权），只复制最近锚点原值；
- 量价保留现有 Decimal8 解析校验（非法字符串 fail closed，不静默补零）。

## 6. signal 窗口层迁移（libs/signal/src/runtime/shared-strategy-window.store.ts）

- `buildGroup` / `prepare` 从 `QuantityForwardFillProjector` 切到 `StrategySeriesImputer`；
  - hydrate（buildGroup）：`imputer.hydrate(orderedBars)`（双向补齐定死）；
  - append（prepare）：`imputer.append(bar)`（只 forward-fill 新 bar）；
  - splice 容量：`imputer.trim()`；
- `read()` 返回 `ProjectedStrategyBar[]`（含新增 `ohlc` 字段）；
- `retainGroups` / `reset` / 交易日语义不变。

## 6.1 backtest 两段式迁移（apps/backtest/src/backtest-run.executor.ts）

`replaySecurity` 改为**先准备数据、再逐根推入计算**（对齐 realtime 的 hydrate → append）：

- **准备阶段**：进入逐 bar 循环前，先加载首个评估点前的初始窗口段（`requiredBarCount`
  根，即 startDate 之前的历史段），`imputer.hydrate(bars)` 双向补齐定死；该段所有锚点
  ≤ 首个评估点 → 无 look-ahead；
- **计算阶段**：之后逐根 `imputer.append(bar)` 推入（只 forward-fill），每根评估一次
  （评估时机不变：≥ startDate 才评估，窗口不满 `requiredBarCount` 时维持
  `insufficient_history`）；
- 只 hydrate 初始窗口段，**不整段 load 全量**（`BACKTEST_MAX_BARS_PER_RUN` 上限千万级，
  后续 bar 仍按现有分页流式读）；每标的一个 imputer 实例（与现有一致的 per-security
  分组），`reset` 语义与交易日一致；
- 行为变化：warm-up 段缺口从"不补"（unavailable/forwardFilled）变 backfill——与
  realtime 语义对齐；OHLC 缺口从 raw 非有限值（DSL 比较抛错）变为 effective 补齐值。

## 7. 消费者兼容与行为变化（决策已定稿 2026-08-21）

- **DSL 字段目录消费切换**（`strategy-context.builder.ts`，`strategy-field.catalog.ts`
  字段路径不变）：
  - `k.open/high/low/close`：从 `current.rawBar[property]` 切为 `current.ohlc.effective`
    四元组对应值；`ohlc.effective === null`（unavailable）→ 该字段不可用 →
    context `field_unavailable`；
  - `indicator.kdj.*` / `indicator.macd.*`：分析计算输入从 raw 切为 effective OHLC
    （`calculateStrategyKdj/Macd` 入参形态调整，实施计划定）；顺带消除
    `strategy-analysis.guard` 对非有限 OHLC 的抛错路径（补齐后不再触发）；
  - `k.volume` / `k.amount`：路径不变（继续消费 effective 量价与 resolution）；
  - `serializeStrategyContextSnapshot` 序列化路径不变（字段值即 effective）。
- **行为变化**：
  - 量价开头/中间缺失从 `unavailable` → `backfilled`（值从不补到补）；
  - OHLC 缺口：raw 非有限值 → effective 补齐值（DSL 比较不再抛错）；
  - backtest warm-up 段缺口：从不补 → backfill；
  - 对存量 DSL 策略 shadow 观察确认无意外。

## 8. 测试清单

| 文件 | 用例 |
|---|---|
| `strategy-series-imputer.spec.ts` | 纯函数：开头缺失 backfill；中间缺失 backfill；末尾缺失 forward-fill；全空 unavailable；混合场景；OHLC 锚点四元组判定（四缺一不算锚点）；量价锚点判定；确定性（两次调用全等） |
| imputer 增量单测 | hydrate 定死不重算；append 只补新 bar；末尾缺失被 append 后不改写；trim 不重算；交易日 reset |
| `shared-strategy-window.store.spec.ts`（更新） | 迁移后窗口行为：hydration 双向补齐、append forward-fill、读取出 ohlc 字段、原有 duplicate/乱序/冲突断言回归 |
| `strategy-context.builder.spec.ts`（更新） | k.*/指标字段切 effective：补齐后读 effective、unavailable 时 `field_unavailable`、指标基于 effective 计算 |
| `backtest-run.executor.spec.ts`（更新） | 两段式：初始窗口段 hydrate 双向补齐、warm-up 缺口 backfill、逐根 append 评估、分页/超时/预算行为回归 |
| 兼容回归 | `strategy-evaluation-contract` / `strategy-market-context` 相关现有单测全量回归 |

## 9. 验证

- mist 仓完整基线：`pnpm run lint:check && pnpm run typecheck && env TZ=UTC pnpm run test:ci && pnpm run ci:contracts && openspec validate --all --strict && git diff --check`；
- shadow 观察：量价补齐行为变化对存量 DSL 策略触发频率的影响；
- 明确区分通过/跳过/环境阻塞。

## 10. 风险

| 风险 | 对策 |
|---|---|
| 值单调不可变与"动态"预期的张力 | 动态 = 新 bar 补齐，旧值不改写；用户已确认此口径 |
| OHLC 补齐被 DSL/回测误消费 | 默认 DSL k.* 与回测保持 raw 语义；effective OHLC 视图用途实施前确认 |
| 存量策略行为变化（unavailable→backfilled） | shadow 观察，必要时单独讨论 |
| 回测 look-ahead | 补齐作用域 = 评估窗口（末端=当前点），backfill 永不使用未来 |
