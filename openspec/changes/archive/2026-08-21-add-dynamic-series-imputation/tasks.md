# 执行任务

本文件只统计产品代码、测试、验证和证据。补齐规则（OHLCVA 统一、双向、值单调不可变、
窗口作用域）以本 change 的 `design.md` 与 delta specs 为准。

## 1. 前置与基线

- [x] 1.1 记录 `mist` 的 branch、HEAD、dirty/worktree 基线；确认 `QuantityForwardFillProjector`
  现状（仅量价、单向 forward-fill、开头 unavailable）与 `SharedStrategyWindowStore` 消费点。
  合入 commit `f62990b7`（merge `5357dfba`）承载迁移前后对照；旧 projector 仅量价、
  单向 forward-fill、开头 unavailable 的现状与窗口层消费点已确认。
- [x] 1.2 运行现有基线（lint/typecheck/test:ci + `openspec validate --changes`），区分
  自动化通过与环境阻塞。全绿：typecheck ✓、lint:check ✓、test:ci（`--forceExit`）✓
  185 suites / 1535 tests、`openspec validate --all --strict` ✓ 93 项。
- [x] 1.3 只读确认 DSL `k.open/high/low/close` 字段目录消费 raw OHLC 的现状
  （`strategy-field.catalog.ts` / `strategy-context.builder.ts`），记录证据，供 §7 决策。
  确认 `k.*` 读取路径在 `strategy-context.builder.ts`（catalog 只声明字段目录），
  迁移前后切换即 `effectiveBars` 引入（`f62990b7`）。

## 2. 补齐器实现（libs/strategy/src/projection/）

- [x] 2.1 新建 `strategy-series-imputer.ts`：`imputeSeries(bars)` 纯函数（OHLCVA 统一、
  开头/中间 backfill + 末尾 forward-fill、锚点判定、unavailable 兜底）+ `StrategySeriesImputer`
  增量类（hydrate 定死 / append 只补新 bar / trim 不重算 / reset）。已落地（407 行）。
- [x] 2.2 `ProjectedStrategyBar` 增加 `ohlc` 视图（`ProjectedStrategyOhlc`：raw/effective/
  resolution）；`resolution` 枚举增加 `backfilled`（四值：
  `observed | forwardFilled | backfilled | unavailable`）。`StrategyImputationResolution`
  四值 + `ProjectedStrategyOhlc` 已落地，`ProjectedStrategyBar.ohlc` 已暴露。
- [x] 2.3 **删除**旧 `QuantityForwardFillProjector`（先全仓检索调用点：signal 窗口层、
  evaluation、snapshot serializer、backtest，全部迁移后删除，不留适配层）。已删除
  （`f62990b7`），调用点全部迁移到 imputer，无适配层。

## 3. signal 窗口层迁移

- [x] 3.1 `shared-strategy-window.store.ts`：`buildGroup`/`prepare` 切到 `StrategySeriesImputer`
  （hydrate 双向定死 + append 只 forward-fill + trim）；`read()` 输出含 `ohlc` 字段。
  已迁移，`read()` 输出含 `ohlc` 视图。
- [x] 3.2 迁移后窗口行为单测：hydration 双向补齐、append 值单调、trim 不重算、
  原有 duplicate/乱序/冲突断言回归。store spec 覆盖 hydrate 双向（`backfilled`/
  `forwardFilled` 断言）与原有行为回归，全量 test:ci 通过。

## 4. backtest 两段式迁移（apps/backtest/src/backtest-run.executor.ts）

- [x] 4.1 `replaySecurity` 改两段式：进入逐 bar 循环前加载初始窗口段（首个评估点前
  `requiredBarCount` 根）→ `imputer.hydrate` 双向补齐定死（无 look-ahead）；之后逐根
  `imputer.append(bar)` 推入 + 评估（≥ startDate 每根一次，窗口不满维持
  `insufficient_history`）；每标的一个 imputer；只 hydrate 初始段，后续 bar 仍分页流式读。
  已落地（`backtest-run.executor.ts` + `backtest-market-data.adapter.ts` 初始段加载）。
- [x] 4.2 backtest 迁移单测：初始窗口段 hydrate 双向补齐、warm-up 缺口 backfill、
  逐根 append 评估时机不变、分页/超时/预算（ReplayBudget）行为回归。executor spec
  覆盖 hydrate 初始段 / warm-up 缺口 / `insufficient_history` / budget 计数，适配器
  spec 覆盖分页 load。

## 5. 消费者语义切换（已确认 2026-08-21）

- [x] 5.1 `strategy-context.builder.ts`：`k.open/high/low/close` 切为消费
  `ohlc.effective`（`effective === null` → `field_unavailable`）。已切换（`f62990b7`）。
- [x] 5.2 `indicator.kdj.*` / `indicator.macd.*` 基于 effective OHLC 计算
  （`calculateStrategyKdj/Macd` 入参形态调整）。已切换（`effectiveBars` 供入参）。
- [x] 5.3 确认 `serializeStrategyContextSnapshot` 序列化路径无需改动（字段值即
  effective）。确认：k 字段值在 context 构造时已是 effective，serializer 只透传
  quantityEvidence 等现有字段。

## 6. 测试

- [x] 6.1 `strategy-series-imputer.spec.ts`：开头/中间 backfill、末尾 forward-fill、
  全空 unavailable、混合场景、OHLC 四元组锚点判定（四缺一不算锚点）、量价锚点判定、
  确定性（两次调用全等）。全场景覆盖（含跨日不携带锚点、非法 quantity fail-closed）。
- [x] 6.2 imputer 增量单测：hydrate 定死不重算、append 只补新 bar、末尾缺失不被 append
  改写、trim 不重算、交易日 reset。全覆盖（含乱序 append 拒绝）。
- [x] 6.3 context builder 单测（更新）：k.* 切 effective（补齐值 / unavailable →
  field_unavailable）、指标基于 effective 计算。已更新：`k.close` 读 effective、
  `field_unavailable`、指标基于 effective（非 raw 非有限值）、raw/effective/resolution
  三件套断言。
- [x] 6.4 兼容回归：`strategy-evaluation-contract` / `strategy-market-context` 相关现有
  单测全量回归。test:ci 全量 1535 passed（含 strategy-evaluation / window store /
  backtest executor 等全部相关套件）。

## 7. 验证与收尾

- [x] 7.1 完整基线：lint/typecheck/test:ci（`--forceExit`）/ci:contracts/
  `openspec validate --all --strict`/`git diff --check`。全部通过：typecheck ✓、
  lint:check ✓、test:ci ✓（185 suites / 1535 tests）、ci:contracts ✓（mist 仓通过，
  monitoring 仓不在本地跳过）、`openspec validate --all --strict` ✓（93 项）、
  `git diff --check` ✓。
- [x] 7.2 ~~shadow 观察~~（2026-08-21 用户拍板不做）：补齐语义是对错问题，由设计与
  单测保证正确性，不做触发频率统计观察。
- [x] 7.3 与项目负责人确认后：`add-chan-bsp-realtime-evaluation` 基于本 change 的
  补齐视图接入 detector；回测 hydration 深度校准（如需）由 `extract-backtest-runtime`
  另行承接。前置已满足：chan-bsp change 已合入 master（merge `46fe0d73`），其
  `chan-bsp.k-mapper.ts` 已消费补齐后的投影视图。