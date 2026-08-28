# libs/chancore — 缠论纯算法核心库

`libs/chancore` 是严谨遵循缠论原典算法的纯 TypeScript 算法库，无框架依赖，提供高性能、高精度的缠论几何结构与买卖点计算。


> 返回：[顶层 README](../../README.zh-CN.md) · [文档编写指南](../../docs/governance/documentation-guide.md)

---

## 🎯 模块职责

- **K 线包含关系处理**：按上升/下降趋势前向包含合并连续 K 线。
- **宽笔（标准新笔）识别**：顶底分型严格交替，极值点间至少包含 3 根独立原始 K 线。
- **特征序列分段**：实现缠论 67 课特征序列法，精准处理第一种与第二种（缺口）线段破坏情况。
- **对称无方向中枢**：计算次级别走势重叠区域，无多空方向属性；支持 Phase A 滑窗候选与 Phase B 定点归约。
- **第一/二/三类买卖点 (BSP)**：
  - **一买/一卖**：由趋势背驰（链末中枢 A 与 C 力度衰竭，第 24 课）产生。
  - **二买/二卖**：要求前置一类点，次级别回抽不创新低/新高（第 21 课）。
  - **三买/三卖**：中枢破坏后次回抽不触及中枢区间（第 20 课定理，严格贴边不算）。

---

## 🔌 核心导出品与 API

```typescript
import { ChanCore } from '@app/chancore';

// 全量几何与买卖点分析
const result = ChanCore.analyze(bars, options);

// 单项计算函数
ChanCore.mergeK(bars);
ChanCore.detectFenXing(mergedK);
ChanCore.detectBi(mergedK);
ChanCore.detectDuan(biList);
ChanCore.detectZhongShu(duanList);
ChanCore.detectBeiChi(zhongshuList, duanList);
ChanCore.detectBuySellPoints(analysisContext);
```

---

## 📂 关键文件速查

- `src/chan-core.ts`：对外统一入口门面。
- `src/internal/bi.ts`：笔状态机与宽笔过滤。
- `src/internal/duan.ts`：特征序列分段算法。
- `src/internal/zhongshu.ts`：两阶段中枢识别与不动点合并。
- `src/internal/buy-sell-point.ts`：一/二/三类买卖点判定。

---

## 🛠️ 专属测试

```bash
pnpm run test -- libs/chancore
```

---

## 🔗 上下游边界

- **下游消费方**：`apps/chan`（HTTP API）、`apps/signal`（实时策略扫描）、`apps/backtest`（回测运行时）。
