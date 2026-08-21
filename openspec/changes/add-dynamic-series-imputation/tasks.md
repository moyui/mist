# 执行任务

本文件只统计产品代码、测试、验证和证据。补齐规则（OHLCVA 统一、双向、值单调不可变、
窗口作用域）以本 change 的 `design.md` 与 delta specs 为准。

## 1. 前置与基线

- [ ] 1.1 记录 `mist` 的 branch、HEAD、dirty/worktree 基线；确认 `QuantityForwardFillProjector`
  现状（仅量价、单向 forward-fill、开头 unavailable）与 `SharedStrategyWindowStore` 消费点。
- [ ] 1.2 运行现有基线（lint/typecheck/test:ci + `openspec validate --changes`），区分
  自动化通过与环境阻塞。
- [ ] 1.3 只读确认 DSL `k.open/high/low/close` 字段目录消费 raw OHLC 的现状
  （`strategy-field.catalog.ts` / `strategy-context.builder.ts`），记录证据，供 §7 决策。

## 2. 补齐器实现（libs/strategy/src/projection/）

- [ ] 2.1 新建 `strategy-series-imputer.ts`：`imputeSeries(bars)` 纯函数（OHLCVA 统一、
  开头/中间 backfill + 末尾 forward-fill、锚点判定、unavailable 兜底）+ `StrategySeriesImputer`
  增量类（hydrate 定死 / append 只补新 bar / trim 不重算 / reset）。
- [ ] 2.2 `ProjectedStrategyBar` 增加 `ohlc` 视图（`ProjectedStrategyOhlc`：raw/effective/
  resolution）；`resolution` 枚举增加 `backfilled`（四值：
  `observed | forwardFilled | backfilled | unavailable`）。
- [ ] 2.3 **删除**旧 `QuantityForwardFillProjector`（先全仓检索调用点：signal 窗口层、
  evaluation、snapshot serializer、backtest，全部迁移后删除，不留适配层）。

## 3. signal 窗口层迁移

- [ ] 3.1 `shared-strategy-window.store.ts`：`buildGroup`/`prepare` 切到 `StrategySeriesImputer`
  （hydrate 双向定死 + append 只 forward-fill + trim）；`read()` 输出含 `ohlc` 字段。
- [ ] 3.2 迁移后窗口行为单测：hydration 双向补齐、append 值单调、trim 不重算、
  原有 duplicate/乱序/冲突断言回归。

## 4. backtest 两段式迁移（apps/backtest/src/backtest-run.executor.ts）

- [ ] 4.1 `replaySecurity` 改两段式：进入逐 bar 循环前加载初始窗口段（首个评估点前
  `requiredBarCount` 根）→ `imputer.hydrate` 双向补齐定死（无 look-ahead）；之后逐根
  `imputer.append(bar)` 推入 + 评估（≥ startDate 每根一次，窗口不满维持
  `insufficient_history`）；每标的一个 imputer；只 hydrate 初始段，后续 bar 仍分页流式读。
- [ ] 4.2 backtest 迁移单测：初始窗口段 hydrate 双向补齐、warm-up 缺口 backfill、
  逐根 append 评估时机不变、分页/超时/预算（ReplayBudget）行为回归。

## 5. 消费者语义切换（已确认 2026-08-21）

- [ ] 5.1 `strategy-context.builder.ts`：`k.open/high/low/close` 切为消费
  `ohlc.effective`（`effective === null` → `field_unavailable`）。
- [ ] 5.2 `indicator.kdj.*` / `indicator.macd.*` 基于 effective OHLC 计算
  （`calculateStrategyKdj/Macd` 入参形态调整）。
- [ ] 5.3 确认 `serializeStrategyContextSnapshot` 序列化路径无需改动（字段值即
  effective）。

## 6. 测试

- [ ] 6.1 `strategy-series-imputer.spec.ts`：开头/中间 backfill、末尾 forward-fill、
  全空 unavailable、混合场景、OHLC 四元组锚点判定（四缺一不算锚点）、量价锚点判定、
  确定性（两次调用全等）。
- [ ] 6.2 imputer 增量单测：hydrate 定死不重算、append 只补新 bar、末尾缺失不被 append
  改写、trim 不重算、交易日 reset。
- [ ] 6.3 context builder 单测（更新）：k.* 切 effective（补齐值 / unavailable →
  field_unavailable）、指标基于 effective 计算。
- [ ] 6.4 兼容回归：`strategy-evaluation-contract` / `strategy-market-context` 相关现有
  单测全量回归。

## 7. 验证与收尾

- [ ] 7.1 完整基线：lint/typecheck/test:ci（`--forceExit`）/ci:contracts/
  `openspec validate --all --strict`/`git diff --check`。
- [ ] 7.2 shadow 观察：量价补齐行为变化（unavailable→backfilled）对存量 DSL 策略
  触发频率的影响，记录 evidence。
- [ ] 7.3 与项目负责人确认后：`add-chan-bsp-realtime-evaluation` 基于本 change 的
  补齐视图接入 detector；回测 hydration 深度校准（如需）由 `extract-backtest-runtime`
  另行承接。
