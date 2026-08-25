# libs/strategy — 量化策略模型与规则求值库

`libs/strategy` 封装了量化策略的核心领域模型、多周期条件规则语法解析器、指标/缠论过滤器及求值引擎。

---

## 🎯 模块职责

- **策略规则解析**：解析基于 JSON/DSL 的策略规则结构（指标数值比较、金叉死叉、缠论笔/中枢/买卖点形态条件）。
- **多周期走势投影**：提供行情 Bar 序列向目标周期（1m/5m/15m/30m/60m/日线）的聚合与对齐。
- **纯规则求值器**：在给定行情切片与指标上下文中无状态计算是否满足开仓/平仓/告警触发条件。

---

## 🔌 核心导出品与 API

```typescript
import { evaluateStrategyRule, projectBarsToPeriod } from '@app/strategy';

// 策略规则求值
const isTriggered = evaluateStrategyRule(ruleDefinition, barSeries, indicatorContext);
```

---

## 📂 关键文件速查

- `src/evaluation/`：策略规则求值执行器。
- `src/rules/`：条件节点定义（指标条件、缠论形态条件、逻辑组合运算）。
- `src/market-data/` / `src/projection/`：多周期行情投影与切片。

---

## 🛠️ 专属测试

```bash
pnpm run test -- libs/strategy
```

---

## 🔗 上下游边界

- **依赖**：`libs/chancore`、`libs/indicators`。
- **消费方**：`apps/signal`（实时策略扫描）、`apps/backtest`（历史回测计算）。
