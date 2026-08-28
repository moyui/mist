# libs/indicators — 技术指标计算共享库

`libs/indicators` 提供标准化的金融技术指标计算纯函数与向量化工具，供主后端 API、策略引擎与回测运行时共享使用。


> 返回：[顶层 README](../../README.zh-CN.md) · [文档编写指南](../../docs/governance/documentation-guide.md)

---

## 🎯 模块职责

- **核心技术指标实现**：提供 MACD（平滑异同移动平均）、RSI（相对强弱）、KDJ（随机指标）、ATR（真实波幅）、ADX（平均趋向）、Dual MA（双均线）及 Force 指标计算。
- **序列运算工具**：提供高性能滑动窗口、指数加权移动平均（EMA）与数组安全计算。

---

## 🔌 核心导出品与 API

```typescript
import {
  calculateMacd,
  calculateRsi,
  calculateKdj,
  calculateAtr,
  calculateAdx,
  calculateDualMa,
} from '@app/indicators';

// 示例：计算 MACD
const macdResult = calculateMacd(closePrices, { fast: 12, slow: 26, signal: 9 });
```

---

## 📂 关键文件速查

- `src/macd.ts`：MACD 指标计算。
- `src/kdj.ts`：KDJ 指标计算。
- `src/rsi.ts`：RSI 指标计算。
- `src/adx.ts` / `src/atr.ts`：趋向与波幅指标。

---

## 🛠️ 专属测试

```bash
pnpm run test -- libs/indicators
```

---

## 🔗 上下游边界

- **下游消费方**：`apps/mist`（指标 API）、`apps/signal`（实时策略指标计算）、`apps/backtest`（回测指标预计算）。
