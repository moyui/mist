# Proposal: remove-quantity-profile-gates

## 背景

`k.volume`/`k.amount` 字段在三处被硬编码 gate 阻止消费：

1. **回测 API gate**（`backtest-run-command.service.ts`）：`rule_dsl` 策略含 quantity 字段时抛 `BACKTEST_QUANTITY_PROFILE_UNAVAILABLE`
2. **实时注册 gate**（`strategy-execution-plan.service.ts`）：含 quantity 字段的策略无法注册到实时系统
3. **回测 executor gate**（`backtest-run.executor.ts`）：executor 层二次拒绝 quantity plan

Gate 存在的原因是 TDX/QMT quantity profile 未经 HIL 人工验证。

## 前置条件已满足

| 前置 | 状态 | 证据 |
|------|------|------|
| TDX 历史 K amount ×10000 | ✅ | migration 019 |
| TDX write-layer canonicalization | ✅ | `normalizeTdxBarQuantity` |
| QMT volume 手→股 ×100 | ✅ | migration 022 |
| QMT write-layer canonicalization | ✅ | `normalizeQmtVolume` |
| QMT 分钟级数据补齐 | ✅ | 1m/3m/5m/15m/30m/60m 全部补齐 |
| TDX/QMT 日线交叉对照 | ✅ | volume 差 0.00%，amount 差 0.0000% |

## 目标

- 移除三处 quantity profile gate
- 补齐 QMT 分钟级历史数据
- 用 `k.volume` 回测验证端到端可用

## 范围

- mist 仓：`backtest-run-command.service.ts`、`strategy-execution-plan.service.ts`、`backtest-run.executor.ts`
- mist 仓：相关 spec 测试
- 数据：QMT 分钟级数据采集（通过 collector API）

## 非目标

- 不改实时链路的 quantity 校验（`RealtimeQuantityValidationError` 保留）
- 不改 chan_bsp 的 quantity 行为（chan_bsp 不消费量价，已跳过 gate）
