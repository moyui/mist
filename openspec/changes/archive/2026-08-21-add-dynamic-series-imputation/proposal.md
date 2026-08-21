# Proposal — add-dynamic-series-imputation

## Why

策略引擎（DSL + chan_bsp）消费的序列视图存在三个缺口：

1. **范围**：现有 `QuantityForwardFillProjector`（`libs/strategy/src/projection/quantity-forward-fill.projector.ts`）
   只补 volume/amount，**OHLC 完全不补**；
2. **方向**：量价只有单向 forward-fill（用前值填后面的缺失），**序列开头/中间的缺失直接
   unavailable，不补**；
3. **语义**：用户已拍板（2026-08-21 讨论）：OHLC 与量价必须用**同一套补齐规则**，且
   "动态"补齐——序列开头/中间缺失用后向有效锚点回填（backfill），末尾缺失用前向锚点
   前填（forward-fill）；**任何 bar 的 effective 值一旦确定就不可变**（已 emit 的策略
   信号不会因补齐改写而消失）；补齐是 evaluation-only 投影视图（raw 永不变化）。

同时该能力必须**抽离为共享纯函数**（libs/strategy projection 域），供实时窗口层、
chan_bsp 检测器（`add-chan-bsp-realtime-evaluation` 依赖本 change）与回测引擎
（`extract-backtest-runtime` 后续）复用同一语义，避免三处各写一套。

## What Changes

- **统一补齐纯函数**（替换/升级 `QuantityForwardFillProjector`，仍在
  `libs/strategy/src/projection/`）：对"当前评估窗口"（截至当前点的有序 bar 序列）做
  **OHLCVA 统一**的确定性补齐。
- **补齐规则**（用户定稿）：
  - 有效锚点：OHLC 补齐要求**四元组都存在且都有效**；量价补齐要求对应字段有效；
  - 序列**开头/中间**缺失（其后存在有效锚点）→ 用后向最近有效锚点**回填**（backfill）；
  - 序列**末尾**缺失（其后无有效锚点）→ 用前向最近有效锚点**前填**（forward-fill）；
  - 窗口内无任何锚点 → unavailable（不虚构）。
- **值单调不可变**：hydration（段加载：历史页/当日已封存/回测分页）对该段做双向补齐并
  定死；增量 append 只对新 bar 做 forward-fill；窗口容量滑动只丢最老不重算。任何 bar 的
  effective 一旦确定不再变化。
- **作用域 = 当前评估窗口**（末端 = 当前点）：窗口内 backfill 使用的"后值"不晚于当前点，
  实时与回测语义一致，**无 look-ahead**。
- **输出标记扩展**：`resolution` 增加 `backfilled`；`observed | forwardFilled | backfilled |
  unavailable` 四值；OHLC 与量价各自独立标记。
- **DSL 消费切换（用户定稿）**：DSL 字段目录 `k.open/high/low/close` 切为消费 effective
  OHLC；指标字段（`indicator.kdj.*` / `indicator.macd.*`）基于 effective OHLC 计算；
  `k.volume/k.amount` 路径不变。
- **消费者迁移**：signal 窗口层（`SharedStrategyWindowStore`）切换到新补齐器；
  backtest 引擎（`backtest-run.executor.ts`）同步迁移（**先 hydrate 初始窗口段，再逐根
  append**，见下）；chan_bsp detector 消费补齐后的投影视图（`add-chan-bsp-realtime-evaluation`
  落地时接入）。
- **backtest 两段式（用户定稿）**：`replaySecurity` 先加载首个评估点前的初始窗口段
  （startDate 前 warm-up 段）`imputer.hydrate` 双向补齐定死；之后逐根 `imputer.append`
  推入并评估（评估时机不变，≥ startDate 每根一次）。只 hydrate 初始窗口段，不整段
  load 全量（后续 bar 仍分页流式读，`BACKTEST_MAX_BARS_PER_RUN` 上限千万级）。

## Capabilities

### New Capabilities

- `dynamic-series-imputation`：OHLCVA 统一双向补齐的共享纯函数契约（规则、有效锚点、
  值单调不可变、窗口作用域、resolution 标记）。

### Modified Capabilities

- `strategy-market-context`：投影视图语义扩展——OHLC 也进入 effective 视图、resolution
  增加 `backfilled`、值单调不可变。
- `strategy-evaluation-contract`：量价 forward-fill 投影升级为统一补齐器（同窗口作用域、
  同单调语义），供实时评估上下文消费。

## Impact

- **`mist`**：
  - `libs/strategy/src/projection/`：新补齐器（**替换并删除** `QuantityForwardFillProjector`）+
    单测；
  - `libs/strategy/src/evaluation/`：`strategy-context.builder.ts` 的 k.*/指标字段切
    effective OHLC（`strategy-field.catalog.ts` 语义不变，读取路径在 builder 内切换）；
  - `libs/signal/src/runtime/shared-strategy-window.store.ts`：切到新补齐器；
  - `apps/backtest/src/backtest-run.executor.ts`：`replaySecurity` 两段式迁移
    （hydrate 初始窗口段 + 逐根 append）；
  - `libs/chancore`：零改动；
  - `apps/signal`：无直接改动（窗口层消费），chan_bsp detector 由
    `add-chan-bsp-realtime-evaluation` 接入；
  - `apps/mist`：本 change 不改。
- **数据库 / 部署**：无 migration、无部署拓扑变化。
- **兼容性**：量价语义升级点 = 开头/中间缺失从 unavailable 变为 backfilled；OHLC 缺口
  从 raw 非有限值（DSL 比较抛错）变为 effective 补齐值；backtest warm-up 段缺口从不补
  变 backfill——评估结果对存量 DSL 策略可能有行为变化（值从不补到补），由 shadow 观察
  确认。
- **后续依赖**：`add-chan-bsp-realtime-evaluation`（detector 消费补齐视图）；
  回测 hydration 语义深度校准（如需）由 `extract-backtest-runtime` 承接。
