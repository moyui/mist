# Design: restore-chan-duan-three-bi-axiom

## 架构与算法设计

### 1. 缠论第 65 课线段公理的约束机制

在 `DuanCalculator.findSegmentEnd` 中：
线段从 `segStartIdx` 开始，方向为 `direction`。
任何合法的线段终止点 `endIdx`，必须满足：
```typescript
endIdx >= segStartIdx + 2 // 确保 segStartIdx 到 endIdx 至少包含 3 根笔
```

若 `endIdx < segStartIdx + 2`：
- 说明从 `segStartIdx` 到该候选转折点不足 3 笔（如仅 1 笔或 2 笔）；
- 按照第 65 课，该走势根本不足以构成独立线段，前段未被破坏，或者该候选点不能作为合法线段端点；
- 该候选点必须被并入当前扫描流程继续向后延伸，等待走出完整的 $\ge 3$ 笔结构。

### 2. 缠论第 71 课「第一笔破坏」的正确作用域

当 `first === null`（即当前段刚开始，遇到第一根反向笔 `prev`）时：
- `prev` 的终点与起点参与破位竞争（`firstBiBreak`）；
- 若后续走势先破转笔终点（形成破坏）：
  - 只有当假设转折点前的前段笔数累计满足 `endIdx >= segStartIdx + 2` 时，才允许在该转折点处确认前段结束；
  - 若 `endIdx < segStartIdx + 2`（即当前段本身只有 1 笔），则绝不能将这 1 笔强行输出为 Complete 线段，必须继续延伸！

### 3. 线段与笔中枢的级别嵌套收敛

纠正后的线段输出：
- 2026-01-05 至 2026-01-13 形成一整根向上大线段 Duan #01（3992.78 $\to$ 4179.70，共 15 笔）；
- 第一个 9 笔上升中枢（Bi #05 $\sim$ Bi #13，4056.87 $\to$ 4121.70）完整嵌套在 Duan #01 内部；
- 彻底实现“一段内包含同向笔中枢”的纯粹级别递归体系。
