# Design: fix-chan-central-expansion-condition

## 1. 中枢延伸语义修正（区间固定）

### 1.1 核心原则
缠论第 20 课中枢指标定义与中心定理一明确指出：
- 中枢核心区间 `[ZD, ZG]` 由前 3 个次级别走势（或基础结构）重叠确定，**在延伸过程中不可改变**；
- 延伸发生时，只有波动极值 `GG = max(gn)` 与 `DD = min(dn)` 以及时间边界会更新；
- 延伸的充分必要条件是新增走势与固定的 `[ZD, ZG]` 存在重叠。

### 1.2 段级延伸修正（`duan-channel.ts`）
- **原逻辑**：每次延伸尝试首尾追加段后，调用 `validateChannelGeometry(延伸后所有段)` 重新计算 `zg/zd`，导致区间漂移。
- **新逻辑**：
  1. 基础 3 段确定 `baseChannel.zd` 与 `baseChannel.zg`；
  2. 向后/向前延伸扫描时，每引入一段 `D_k`（区间 `[low, high]`），检查是否与基础区间重叠：
     `Math.max(D_k.low, baseChannel.zd) <= Math.min(D_k.high, baseChannel.zg)`；
  3. 若重叠则纳入延伸，更新 `gg = Math.max(gg, D_k.high)`、`dd = Math.min(dd, D_k.low)` 与边界 IDs/时间；
  4. **保持 `zd` 与 `zg` 不变**，绝不重新求全部段的公共交集。

### 1.3 笔级延伸修正（`channel.ts`）
- **原逻辑**：每次延伸首尾追加成对笔（+2 笔）后，调用 `validateChannelGeometry` 重算 `zg/zd`。
- **新逻辑**：
  1. 基础 5 笔确定 `baseChannel.zd` 与 `baseChannel.zg`；
  2. 成对延伸检查新增笔是否触及 `baseChannel.zd/zg`，延伸后保持 `zd/zg` 不变，仅更新 `gg/dd` 与边界；
  3. **保持 `zd` 与 `zg` 不变**。

---

## 2. 核心判定修正（`central-expansion.ts`）

### 2.1 接口扩展

```typescript
export interface CentralRangeItem {
  readonly dd: number; // 波动区间最低
  readonly gg: number; // 波动区间最高
  readonly zd: number; // 中枢区间下沿（新增）
  readonly zg: number; // 中枢区间上沿（新增）
}
```

`ChanChannel` / `ChanDuanChannel` 均已携带 `zg`/`zd` 字段，最小接口从 `{dd,gg}` 扩到
`{dd,gg,zd,zg}`，笔级/段级通吃、无方向认知的设计不变。

### 2.2 判定公式（缠论 20 课中心定理二的直接翻译）

```typescript
export function isCentralExpansion(
  prev: CentralRangeItem,
  next: CentralRangeItem,
): boolean {
  // 1. 中枢区间严格分离（后ZG<前ZD 或 后ZD>前ZG；严格大于/小于，贴边不算扩张）
  const centralSeparated =
    Math.max(prev.zd, next.zd) > Math.min(prev.zg, next.zg);
  // 2. 波动区间重叠或相切（后GG>=前DD 或 后DD<=前GG；触边即扩张）
  const waveOverlap =
    Math.max(prev.dd, next.dd) <= Math.min(prev.gg, next.gg);
  return centralSeparated && waveOverlap;
}
```

- **严格性口径**：中枢区间分离用严格 `>`（原文 `后ZG<前ZD` 为严格）；波动重叠用非严格 `<=`
  （原文 `后GG>=前DD`，相切算）。与代码库"三类贴边不算、无 epsilon"口径一致。

---

## 3. 语义变化：Phase B 输出的保证条款

### 3.1 旧保证（spec 现状）
> Phase B 输出中**任意相邻对**波动区间严格分离：`max(prev.dd, next.dd) > min(prev.gg, next.gg)`

### 3.2 新保证
修正后，区间重叠（但波动重叠）的相邻中枢**不再合并**，因此 Phase B 输出**允许**存在
"波动重叠但中枢区间重叠"的相邻对（同一价位区间的反复震荡）。新保证为：
> Phase B 输出中**不存在扩张对**：任意相邻对 `isCentralExpansion(prev, next)` 为假，
> 即要么波动区间分离，要么中枢区间重叠（= 同一区间延伸/重叠，不构成高级别中枢）。

### 3.3 消费端影响（已验证无需改逻辑）
- `DivergenceDetector.buildChains`（divergence.ts:161-207）：趋势链靠 `progressesInTrend`
  位置递进（up: `later.gg>earlier.gg && later.dd>earlier.dd`）断链。区间重叠的相邻中枢
  波动重叠 → 不满足递进 → 断链，**不会误入趋势链**。仅需更新 divergence.ts:31-33 的注释假设。
- `BuySellPointDetector`：三类点只查离开段/回抽段与中枢区间的几何关系，区间固定后基准线更稳定。

---

## 4. 合并几何保持不变

`mergeBiCentralExpansion` / `mergeDuanCentralExpansion` 的合并几何不动：
`zd = max(prev.dd, next.dd)`、`zg = min(prev.gg, next.gg)`（波动重叠区），
`dd/gg` = 并集极值，`expanded: true`。这符合原文 29 课"B+c 发生中枢扩展用 A~ 表示"
（扩展后中枢的区间即波动重叠区）与现有 spec"expanded 几何豁免同级不变式"。

---

## 5. 算法版本与 characterization

- `ChanCore.algorithmVersion`：2 → 3（`createChannels`/`createDuanChannels` 输出语义变化，必须升版 + 更新 full-output fingerprint 并说明）
- `chan-full-output.characterization.fixture.ts` 重新生成快照并说明变化。

---

## 6. 单测与数据验证改造

1. `central-expansion.spec.ts`：正反例按中心定理二完整覆盖（区间分离+波动重叠/相切、区间重叠+波动重叠、区间相切等）；
2. `channel.spec.ts` / `duan-channel.spec.ts`：补充延伸过程中 `zd/zg` 不变的单元测试；
3. 真实数据集验证（600519/300059/600030 TDX + 600519 QMT），确认 600519 笔级与段级巨型中枢彻底消除，600030 1m 合法扩张保留。
