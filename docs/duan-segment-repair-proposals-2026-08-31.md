# 线段划分算法修复方案设计 — 2026-08-31

> ⚠️ **状态：已废弃（仅供追溯）**。本方案（A/C）的设计前提是"极值语义/反扑淘汰"，
> 经原文考证（72/71/78 课）被推翻：`duan-segment-issue-2026-08-31.md` §8.7 终审
> 确认 71 课判据"命中即定案"是原文定性、4 个复查点全部合规，**不实施任何后续修复**。

> 设计记录（保留原文）：
> 状态：设计与技术预案文档（只读分析落地，不修改业务代码）。
> 对应问题文档：[`mist/docs/duan-segment-issue-2026-08-31.md`](file:///Users/moyui/sean/mist/mist/docs/duan-segment-issue-2026-08-31.md)
> 关联源码：[`libs/chancore/src/internal/duan.ts`](file:///Users/moyui/sean/mist/mist/libs/chancore/src/internal/duan.ts)
> 缠论原文：`chanlun-original/`（第 65、67、71、78 课）

---

## 1. 问题背景与理论根因

### 1.1 问题现象与根因总结
在 master 分支现行代码（`algorithmVersion = 5`）中，段划分存在**“假转折点被证伪后，特征序列残留污染导致真极值被跨过”**的问题（典型为 `07-27 15:00` 顶 3858.31 被段跨过，多延伸了约 2 天）：

1. **转折笔被过早并入 `stdSeq`**：当转折笔触发 71 课第一笔破坏判据被判为 `extended`（先破起点，假转折作废）时，代码无条件将该反向笔通过 `mergeFeatureInclusion` 合并进了 `stdSeq`。
2. **闭塞了真转折点的检验通道**：当走势随后突破假顶创出更高真顶（如 3858.31）时，由于 `stdSeq` 已经非空，算法不再进入 71 课第一笔破坏分支，而常规 67 课分型判定又被此前合入的脏特征序列包络压制判假，导致真顶被错误跨过。

### 1.2 缠论原文核心原则（第 71 课）
> *“线段的划分，都是可以当下完成的，无非是如下的程序：**假设某转折点是两线段的分界点，然后对此用线段划分的两种情况去考察是否满足，如果满足其中一种，那么这点就是真正的线段的分界点；如果不满足，那就不是，原来的线段依然延续，就这么简单。**”*

为解决这一问题，提出两种不同层级的修复方案：
- **方案 A（流式状态机重置法）**：在现有单循环框架下，增加极值创新高/新低时的状态重置机制。
- **方案 C（候选分界点纯函数检验器）**：将 71 课“假设-验证-淘汰”程序直译为两层解耦的无状态检验器。

---

## 2. 方案 A：极值刷新与转折点重置法

### 2.1 设计思想
在维护单重 `for` 循环性能优势的同时，引入段内运行极值跟踪（`currentExtremum`）：
- 当遇到段同向笔时，检查是否创出新极值；
- 一旦创出新极值（向上段创更高高点，或向下段创更低低点），说明此前所有转折假设被证伪、原段延续；
- 此时将此前积累的反向笔正规化合入 `stdSeq`，并将候选转折笔 `prev` 清空重置；
- 新极值点之后下来的反向笔，将作为新的待定转折第一笔重新开始检验。

### 2.2 流程图解
```
遍历笔序列 bis[i]
  │
  ├─► 若 bis[i] 是同向笔（段体）：
  │     └─ 是否破 currentExtremum？
  │          ├─ 是（创真新极值） ──► 更新 currentExtremum；
  │          │                      若有未定 prev，将其合入 stdSeq 后重置 prev = null；
  │          └─ 否 ───────────────► 保持现状继续。
  │
  └─► 若 bis[i] 是反向笔：
        └─ prev 是否存在？
             ├─ 是 ──► 以 (first, prev, rev) 执行分型/破坏检验：
             │          ├─ 检验通过 ──► 返回 endIdx，段结束！
             │          └─ 检验未通过 ─► stdSeq 合入 prev，更新 prev = rev。
             └─ 否 ──► prev = rev（新极值后的第一根待定转折笔）。
```

### 2.3 参考代码实现
```ts
private findSegmentEnd(
  bis: readonly ChanBi[],
  segStartIdx: number,
  direction: TrendDirection,
): SegmentEnd | null {
  let stdSeq: FeatureElement[] = [];
  let prev: FeatureElement | null = null;
  let currentExtremum = direction === TrendDirection.Up 
    ? bis[segStartIdx].high 
    : bis[segStartIdx].low;

  for (let i = segStartIdx; i < bis.length; i++) {
    const bi = bis[i];

    // 1. 段同向笔：检测是否创出新极值（原段延伸）
    if (bi.trend === direction) {
      const isNewExtremum = direction === TrendDirection.Up
        ? bi.high > currentExtremum
        : bi.low < currentExtremum;

      if (isNewExtremum) {
        currentExtremum = direction === TrendDirection.Up ? bi.high : bi.low;
        // 原假设转折点被证伪，将新极值点前的反向笔作为段内震荡并入 stdSeq
        if (prev !== null) {
          stdSeq = this.mergeFeatureInclusion(stdSeq, prev, direction);
          prev = null; // 重置候选转折点，等待新极值后的第一根反向笔
        }
      }
      continue;
    }

    // 2. 反向笔
    const rev: FeatureElement = {
      high: bi.high,
      low: bi.low,
      biIndex: i,
    };

    if (prev !== null) {
      const first = stdSeq.length > 0 ? stdSeq[stdSeq.length - 1] : null;

      // 2.1 67 课常规分型判定
      if (
        first !== null &&
        this.isDirectionalFenxing(first, prev, rev, direction)
      ) {
        const endIdx = prev.biIndex - 1;
        if (endIdx >= segStartIdx) {
          if (!this.hasGap(first, prev)) {
            return { endIdx, nextStart: prev.biIndex }; // Case 1: 无缺口直接确认
          }
          const extremum = direction === TrendDirection.Down ? prev.low : prev.high;
          if (this.case2Confirmed(bis, prev.biIndex, direction, extremum)) {
            return { endIdx, nextStart: prev.biIndex }; // Case 2: 缺口倒推确认
          }
        }
      } 
      // 2.2 71 课第一笔破坏判据
      else if (first === null) {
        if (this.firstBiBreak(bis, prev, direction) === 'confirmed') {
          return { endIdx: prev.biIndex - 1, nextStart: prev.biIndex };
        }
      }

      stdSeq = this.mergeFeatureInclusion(stdSeq, prev, direction);
    }

    prev = rev;
  }

  return null;
}
```

### 2.4 方案 A 评估
- **优势**：改动集中在 `findSegmentEnd` 内部（约 15 行改动），不改变函数接口与大体逻辑，性能开销极低。
- **注意点**：需要确保 `prev` 在创新极值被合入 `stdSeq` 时，包含合并方向与当前段方向保持严格一致。

---

## 3. 方案 C：候选分界点纯函数检验器

### 3.1 设计思想
彻底摆脱“单循环边走边维护全局状态”带来的隐式耦合，将段划分拆解为：
1. **外层候选选择**：段内每一个冲高回落的“顶”或探底回升的“底”（即反向笔的起点），都是一个候选转折点 $T$；
2. **内层纯函数判定**：对每一个候选点 $T$，提取其前序纯净特征序列 $stdSeq$，并前瞻观察后续走势是否满足 67 课分型或 71 课第一笔破坏；
3. **淘汰与定案**：若后续走势突破 $T$ 极值，直接判定 $T$ 无效并淘汰；若满足结束条件，则定案返回。

### 3.2 流程图解
```
外层：按时序遍历段内反向笔起点作为「候选转折点 T」
  │
  └─► 调用 evaluateCandidateTurningPoint(bis, segStartIdx, turningIdx, direction)
        │
        ├─ 1. 构造 T 之前的纯净 stdSeq（不含 T 及 T 之后任何数据）
        ├─ 2. 提取 first = stdSeq 末元素，prev = 从 T 开始的第一笔
        ├─ 3. 向后扫描验证：
        │     ├─ 若 first === null ──► 走 71 课 firstBiBreak 检验
        │     └─ 若 first !== null ──► 走 67 课 Case 1 / Case 2 检验
        │
        ├─► 判定有效 (true)  ──► 【定案】段在 T 处结束，返回 { endIdx: T - 1, nextStart: T }
        └─► 判定无效 (false) ──► 【淘汰 T】无需清理脏状态，直接检验下一个候选点
```

### 3.3 参考代码实现
```ts
/**
 * 方案 C：外层候选分界点调度
 */
private findSegmentEnd(
  bis: readonly ChanBi[],
  segStartIdx: number,
  direction: TrendDirection,
): SegmentEnd | null {
  // 遍历所有可能的转折笔（即反向笔）
  for (let revIdx = segStartIdx + 1; revIdx < bis.length; revIdx++) {
    if (bis[revIdx].trend === direction) {
      continue; // 过滤段同向笔
    }

    // 候选转折点 = bis[revIdx] 的起点（即 bis[revIdx - 1] 的终点）
    const isConfirmed = this.evaluateCandidateTurningPoint(
      bis,
      segStartIdx,
      revIdx,
      direction,
    );

    if (isConfirmed) {
      return {
        endIdx: revIdx - 1,
        nextStart: revIdx,
      };
    }
  }

  return null;
}

/**
 * 方案 C：独立的候选分界点纯函数检验
 */
private evaluateCandidateTurningPoint(
  bis: readonly ChanBi[],
  segStartIdx: number,
  turningBiIdx: number,
  direction: TrendDirection,
): boolean {
  // 1. 构建转折点之前的标准特征序列 stdSeq（完全隔离转折点后的数据）
  const stdSeq = this.buildStdSeqBefore(bis, segStartIdx, turningBiIdx, direction);
  const first = stdSeq.length > 0 ? stdSeq[stdSeq.length - 1] : null;
  const prev: FeatureElement = {
    high: bis[turningBiIdx].high,
    low: bis[turningBiIdx].low,
    biIndex: turningBiIdx,
  };

  // 2. 情况一：first === null，执行 71 课第一笔破坏检验
  if (first === null) {
    return this.firstBiBreak(bis, prev, direction) === 'confirmed';
  }

  // 3. 情况二：first !== null，向后扫描第三元素进行 67 课检验
  const extremum = direction === TrendDirection.Up ? bis[turningBiIdx - 1].high : bis[turningBiIdx - 1].low;
  
  for (let i = turningBiIdx + 1; i < bis.length; i++) {
    const bi = bis[i];
    
    // 突破转折点极值：分界点立即失效
    if (direction === TrendDirection.Up && bi.high > extremum) return false;
    if (direction === TrendDirection.Down && bi.low < extremum) return false;

    if (bi.trend === direction) continue;

    const rev: FeatureElement = { high: bi.high, low: bi.low, biIndex: i };
    if (this.isDirectionalFenxing(first, prev, rev, direction)) {
      if (!this.hasGap(first, prev)) {
        return true; // Case 1: 无缺口直接确认
      }
      return this.case2Confirmed(bis, prev.biIndex, direction, extremum); // Case 2: 倒推确认
    }

    // 若未成型，说明该候选转折点不满足特征序列分型定义
    break; 
  }

  return false;
}

/**
 * 辅助纯函数：提取指定转折点之前的标准特征序列
 */
private buildStdSeqBefore(
  bis: readonly ChanBi[],
  startIdx: number,
  endIdx: number,
  direction: TrendDirection,
): FeatureElement[] {
  let seq: FeatureElement[] = [];
  for (let i = startIdx; i < endIdx; i++) {
    if (bis[i].trend === direction) continue;
    const elem: FeatureElement = { high: bis[i].high, low: bis[i].low, biIndex: i };
    seq = this.mergeFeatureInclusion(seq, elem, direction);
  }
  return seq;
}
```

### 3.4 方案 C 评估
- **优势**：
  1. **零状态残留**：纯函数检验，不存在跨候选点的脏数据污染；
  2. **100% 忠实还原 71 课原文哲学**：“假设 $\rightarrow$ 检验 $\rightarrow$ 淘汰”字面映射；
  3. **可观测与可测试性极佳**：可对任意一个转折点单独编写单元测试与打桩日志。
- **注意点**：代码重构涉及函数拆分，需完整回归现有 178+ 单测用例。

---

## 4. 方案 A 与 方案 C 对比矩阵

| 对比维度 | 方案 A（极值重置状态机） | 方案 C（候选分界点检验器） |
| :--- | :--- | :--- |
| **理论纯粹度** | 良好（在流式循环中模拟假设重置） | **极致**（直接以“假设分界点”为一等公民） |
| **状态污染风险** | 低（通过极值刷新清理） | **无**（完全无状态纯函数） |
| **改动范围** | 仅改动 `findSegmentEnd` 约 15~20 行 | 重构 `findSegmentEnd` 并拆分子函数（约 50 行） |
| **回归测试成本** | 较低 | 中等（需确保子函数语义与原流程无缝对齐） |
| **可维护与可读性** | 维持现有代码风格 | **结构清晰、职责单一、极易阅读与调试** |

---

## 5. 实施与交付规范（待确认后执行）

无论选择方案 A 还是方案 C，后续落地均需严格遵守以下标准流：

1. **创建 OpenSpec 规范变更**：
   - 变更名称建议：`fix-duan-segment-turning-point-reset`
   - 规范 Requirements delta 中明确“冲高回落再创新高”下的分界点迁移行为。
2. **版本号升级（Forward-Only）**：
   - 修改 [`libs/chancore/src/chan-core.ts`](file:///Users/moyui/sean/mist/mist/libs/chancore/src/chan-core.ts)：`algorithmVersion = 6`。
3. **单测覆盖与快照更新**：
   - 补充点 2（07-27 15:00 顶 3858.31）最小复现用例；
   - 补充“确认后立即反扑破起点”用例；
   - 更新全量 characterization 快照测试；
4. **下游验证**：
   - 验证 `duan-channel`（段中枢）与 `buy-sell-point`（买卖点）在全量 2832 根 K 上的回归输出。
