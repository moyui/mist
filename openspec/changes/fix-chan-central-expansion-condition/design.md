# Design: fix-chan-central-expansion-condition

## 1. 核心判定修正（central-expansion.ts）

### 1.1 接口扩展

```typescript
export interface CentralRangeItem {
  readonly dd: number; // 波动区间最低
  readonly gg: number; // 波动区间最高
  readonly zd: number; // 中枢区间下沿（新增）
  readonly zg: number; // 中枢区间上沿（新增）
}
```

`ChanChannel` / `ChanDuanChannel` 均已携带 `zg`/`zd` 字段，最小接口从 `{dd,gg}` 扩到
`{dd,gg,zd,zg}`，笔级/段级通吃、无方向认知的设计不变。`resolveCentralExpansions` 与
两个 merge 函数不受影响（入参本就是全字段 Channel）。

### 1.2 判定公式（缠论 20 课中心定理二的直接翻译）

```typescript
export function isCentralExpansion(
  prev: CentralRangeItem,
  next: CentralRangeItem,
): boolean {
  // 中枢区间严格分离（后ZG<前ZD 或 后ZD>前ZG；相切不算，贴边不算扩张）
  const centralSeparated =
    Math.max(prev.zd, next.zd) > Math.min(prev.zg, next.zg);
  // 波动区间重叠或相切（后GG>=前DD 或 后DD<=前GG；触边即扩张，保持 D1 定案）
  const waveOverlap =
    Math.max(prev.dd, next.dd) <= Math.min(prev.gg, next.gg);
  return centralSeparated && waveOverlap;
}
```

- **严格性**：中枢区间分离用严格 `>`（原文 `后ZG<前ZD` 为严格）；波动重叠用非严格 `<=`
  （原文 `后GG>=前DD`，相切算）。与代码库"三类贴边不算、无 epsilon"口径一致。
- 600519 案例：B0 区间 [1310.47, 1393.49] vs B1 区间 [1385.34, 1438.16] →
  `max(1310.47, 1385.34)=1385.34 > min(1393.49, 1438.16)=1393.49` 为假 → **不扩张** ✓

## 2. 语义变化：Phase B 输出的保证条款

### 2.1 旧保证（spec 现状）

> Phase B 输出中**任意相邻对**波动区间严格分离：`max(prev.dd, next.dd) > min(prev.gg, next.gg)`

### 2.2 新保证

修正后，区间重叠（但波动重叠）的相邻中枢**不再合并**，因此 Phase B 输出**允许**存在
"波动重叠但区间重叠"的相邻对。新保证为：

> Phase B 输出中**不存在扩张对**：任意相邻对 `isCentralExpansion(prev, next)` 为假，
> 即要么波动区间分离，要么中枢区间重叠（= 同一区间延伸/重叠，不构成高级别中枢）。

### 2.3 消费端影响（已验证无需改逻辑）

- `DivergenceDetector.buildChains`（divergence.ts:161-207）：趋势链靠 `progressesInTrend`
  位置递进（up: `later.gg>earlier.gg && later.dd>earlier.dd`）断链。区间重叠的相邻中枢
  波动重叠 → 不满足递进 → 断链，**不会误入趋势链**（符合原文"趋势里同级别前后中枢
  不能有任何重叠"）。仅需更新 divergence.ts:31-33 的注释假设。
- `BuySellPointDetector`：三类点只查离开段/回抽段与中枢区间的几何关系，二类点只查
  前置一类点 + 三元组，均不依赖相邻严格分离。
- `chan-divergence` spec 第 66-72 行"上游保证相邻波动严格分离"表述需同步更新。

## 3. 合并几何保持不变

`mergeBiCentralExpansion` / `mergeDuanCentralExpansion` 的合并几何不动：
`zd = max(prev.dd, next.dd)`、`zg = min(prev.gg, next.gg)`（波动重叠区），
`dd/gg` = 并集极值，`expanded: true`。这符合原文 29 课"B+c 发生中枢扩展用 A~ 表示"
（扩展后中枢的区间即波动重叠区）与现有 spec"expanded 几何豁免同级不变式"。

## 4. 算法版本与 characterization

- `ChanCore.algorithmVersion`：2 → 3（`createChannels`/`createDuanChannels` 输出语义
  再次变化，同 add-chan-central-extension 的先例：输出语义变化必须升版 + 更新
  full-output fingerprint 并说明）
- `chan-full-output.characterization.fixture.ts` 重新生成：
  - 笔级 fixture 中若存在"区间重叠 + 波动重叠"的合并对 → 拆分为两个普通中枢，快照更新
  - 段级 fixture（区间 [7,9] vs [2,4]，区间分离 + 波动重叠）是真扩张 → 输出不变
- 新 fixture 变化说明写在 change 内（同上次先例）

## 5. 单测改造（central-expansion.spec.ts）

现有 `isCentralExpansion` 用例用默认 `zg=7/zd=2`（两中枢区间重叠）→ 修正后全变 false，
需按原文条件重造：

| 用例 | 构造 | 期望 |
|------|------|------|
| 区间分离 + 波动重叠 | prev 区间[7,9]波动[4,11]，next 区间[2,4]波动[1,8] | true（真扩张，教材正例） |
| 区间分离 + 波动相切 | prev 区间[8,10]波动[4,10]，next 区间[2,6]波动[6,12] | true（波动相切算扩张） |
| 区间重叠 + 波动重叠 | prev 区间[6,9]波动[4,11]，next 区间[7,10]波动[1,8] | **false（600519 情形）** |
| 区间相切 + 波动重叠 | prev 区间[5,9]波动[4,11]，next 区间[9,12]波动[1,8] | false（后ZG<前ZD 严格） |
| 波动分离 | 区间任意分离、波动 [0,5] vs [6,9] | false |
| 段级同构 | 同上结构用 DuanChannel | 与笔级一致 |

`mergeBiCentralExpansion`/`mergeDuanCentralExpansion`/`resolveCentralExpansions` 现有用例
保持（真扩张对仍应合并）；characterization 集成用例中的段级扩张 fixture（区间分离）
不受影响。

## 6. 真实数据验证（实施阶段）

- 修复前后对比跑 4 个审计数据集（TDX 600519/300059/600030、QMT 600519）：
  - 笔级：600519 应从 1 个巨型 → 2 个普通中枢；其余数据集记录 count/expanded 变化
  - 段级：应不再产出 2024-01~2026-08 全区间巨型；记录修复后暴露的重复中枢问题（已知风险）
- 消费端验证：`detectDivergences` / `detectBuySellPoints` 在修复前后输出差异记录（预期
  趋势背驰/买卖点数量变化合理，无异常爆炸）

## 7. 已知风险（本次不处理）

**段级 Phase B 重复中枢**：600519 段级真实数据下，`mergeSpans`（duan-channel.ts Phase B）
对 7 个时间+价格都重叠的段中枢无法归并（14 段 union 后 `zg<zd` 几何失效），Phase C 旧逻辑
把 7 个全并成 1 个巨型，掩盖了该问题。修复后段级 Phase B 输出 7 个互相重叠的宽段中枢
（宽度达 2 年）会暴露。属段级 Phase B 的独立缺陷，另立 change 处理。
