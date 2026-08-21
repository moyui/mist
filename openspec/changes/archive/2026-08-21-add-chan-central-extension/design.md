# Design — add-chan-central-extension（笔级 + 段级中枢扩张）

## 1. 背景与基线

- **笔级中枢**（`internal/channel.ts` `ChannelCalculator`）与**段级中枢**（`internal/duan-channel.ts`
  `DuanChannelCalculator`）均落地 master：
  - 笔级：Phase A 固定 5 笔滑窗 + Phase B 延伸（±2 笔）+ `mergeSpans` 重合合并；**方向性几何**
    （`validateChannelGeometry`：上/下方向公式 `zg/zd/gg/dd` + 首末笔突破约束），有 `trend` 字段，
    是**已定型、被 full-output fingerprint 锁定**的 shipped 算法。
  - 段级：Phase A 固定 3 段滑窗 + Phase B 延伸（±2 段）+ `mergeSpans` 重合合并；**对称重叠无方向**
    （`zg=min 段高点`、`zd=max 段低点`、`gg/dd` 极值），无 `trend`，处于能力定型期。
- **两者同一结构性空档**：`canMergeTwoChannels`/`canMergeTwo`（笔/段）只按**中枢区间（zg/zd）+ 时间**
  判重叠 → 波动区间（gg/dd）重叠但中枢区间不重叠的相邻同级中枢**同时残留在 phaseB**，即缠论**中枢扩张**
  ，本 change 在**两个级别**处理。
- 主线程背驰 change（`add-chan-divergence`，未落地）趋势链需"非扩张（区间不重叠）+ 位置递进"，其中
  **非扩张判据**（design §2.1：向上链 `后.dd >= 前.gg`、向下链 `后.gg <= 前.zd`）与本 change 语义同源
  → 下沉到中枢输出后，背驰直接消费严格分离序列。
- **解除笔级冻结**：用户 08-20 拍板笔级同样要处理 → 本 change 修改 `channel.ts`（**仅纯增量 Phase C
  后置 pass + `expanded` 字段**；Phase A 枚举、既有延伸/合并不动）。

## 2. 缠论原文考证（29 课《转折的力度与级别》）

关键原文（`/tmp/chan-29.md`）：

> "缠中说禅背驰-转折定理：某级别趋势的背驰将导致该趋势最后一个中枢的**级别扩展**……"

> "该反弹一定触及最后一个中枢的 `DD=min(dn)`……这种只触及最后一个中枢 `DD` 的反弹，就是背弛后
> **最弱的反弹**，这种反弹，**将把最后一个中枢变成一个级别上的扩展**，例如，把5分钟的中枢扩展成
> 30分钟甚至更大的中枢。"（评论区："最弱就是刚触及边沿。"）

结论（与用户 08-20 定调对齐）：
- **扩张**：次级别走势离开中枢后，回抽**触及但未穿越**原中枢的波动区间（向上看 GG、向下看 DD），
  两个相邻同级中枢波动发生重叠 → 级别升级。操作化（已建中枢视角）：**相邻同级中枢波动区间重叠/相切
  即扩张**。笔级、段级同判。
- **新生（趋势延续）**：新中枢与前一中枢波动区间**完全不重叠**且方向一致 + 位置递进 → 同级别趋势链
  （背驰所要）。
- 29 课强调"下跌+盘整"（两**已完成**走势类型连接）与"中枢扩展"（**同一未完成**走势类型延续）区别——
  扩张不改写级别序列，而是把重叠的同级中枢并成一个更高级别中枢（`a~+A~`）。本 change 落"归并"环节。

### 2.1 几何判定（gg/dd 波动区间，共享最小接口）

对相邻两个同级别中枢 `prev`、`next`（时间有序）：

- **扩张判定谓词（D1 拍板 = 相切也算）**：`isCentralExpansion := max(prev.dd, next.dd) <= min(prev.gg,
  next.gg)`——经最小结构接口 `{ dd: number; gg: number }`（中心 infers），**笔级/段级通吃**、无方向
  认知。相切（`max(dd) == min(gg)`）算扩张（29 课"触及边沿即最弱扩展"）。
- **位置递进（不属于本 change）**：向上链 `后.gg > 前.gg 且 后.dd > 前.dd`（向下对称）——是
  `add-chan-divergence` 趋势链判据；本 change 只保证"严格分离"，不强制递进。

### 2.2 关键几何发现：union 重算在扩张场景下**必然无效**（两个级别同理）

"上中枢 Z1 与下中枢 Z2 波动重叠、中枢区间不重叠"的典型扩张：

```
Z1: 波动 [10,20]、中枢 [12,18]   Z2: 波动 [5,15]、中枢 [8,11]
→ 波动重叠区 [max(10,5)=10, min(20,15)=15] 正宽度 ✓
→ 段级 union 对称重叠 zg'=min(18,11)=11, zd'=max(12,8)=12 → zg' < zd' 无效 ✗
→ 笔级 union 方向性公式（首末笔突破+方向）同样无法在 union 上成立 ✗
```

即：**合并产物不能沿用各级不变式重算**（段级对称重叠 / 笔级方向性首末突破），必须用**波动重叠区**
作为其"中枢体"：`zd' = max(dd₁, dd₂)`、`zg' = min(gg₁, gg₂)`、`dd' = min(dd₁, dd₂)`、
`gg' = max(gg₁, gg₂)`。这正是"两个相邻同级中枢波动重叠区域 = 更高级别中枢体"（29 课 A~ 几何）。
⇒ 合并产物是**新语义中枢**，**豁免**各级有效性约束（D2），靠显式 `expanded: true` 标记区分（D3）。
> 相切扩张（D1：`max(dd) == min(gg)`）时重叠区退化为单点 `zg == zd`：扩展单元不要求 `zg > zd`。

## 3. 算法（Phase C：中枢扩张归并，后置于 Phase B，级级复用同一驱动）

```
createChannels(bis):      // 笔级
  phaseA = enumerateChannels(bis)                    // 不变
  merged = extendAndMerge(phaseA, bis)               // 不变：延伸 + mergeSpans 重合合并（仅保留 Valid）
  phaseB = resolveCentralExpansions(merged, mergeBiCentralExpansion)   // 新增 Phase C
  return { phaseA, phaseB }

createDuanChannels(duans):  // 段级（同构）
  phaseA = enumerateChannels(duans)                  // 不变
  merged = extendAndMerge(phaseA, duans)             // 不变
  phaseB = resolveCentralExpansions(merged, mergeDuanCentralExpansion) // 新增 Phase C
  return { phaseA, phaseB }
```

`resolveCentralExpansions(channels, mergeTwo)`（internal 泛型驱动，相邻对固定点）：

```
loop:
  merged = false
  for i in 0 .. channels.length-2:            // 只扫相邻对（扩张只发生在相邻同级中枢）
    if isCentralExpansion(channels[i], channels[i+1]):
      channels[i] = mergeTwo(channels[i], channels[i+1])
      channels.splice(i+1, 1)
      merged = true; break                    // 回起点重扫（不动点）
  until merged == false
return channels
```

- **只处理相邻对**：扩张语义是"相邻同级中枢"；`mergeSpans` 是"任意 span + envelope"多段合并（Bi/Channel
  共用驱动），不匹配相邻对归并 → **不复用 mergeSpans**（D4），但沿用其"共享驱动 + 注入领域谓词"哲学
  （`SpanMergeOperations<T>` 同款）。
- 固定点必然收敛（每次合并缩短数组）；最左优先 → 确定性。
- 合并后与新的相邻中枢再扩张 → 继续归并（迭代升级）。每个 `expanded` 产物 `status = Valid`。

合并几何（按级注入）：
- `mergeBiCentralExpansion(prev: ChanChannel, next: ChanChannel)`：`bis` = union（startTime 去重）；
  `zg=min(gg)`、`zd=max(dd)`、`gg=max(gg)`、`dd=min(dd)`（波动重叠区 + 并集极值）；`trend = prev.trend`
  （首中枢方向，沿用 `mergeTwoChannels` 惯例）；`level=Bi`；`expanded=true`；边界 ID prev 首 / next 末。
- `mergeDuanCentralExpansion(prev: ChanDuanChannel, next: ChanDuanChannel)`：`duans` = union（startTime
  去重）；同款波动重叠区 + 并集极值几何；`expanded=true`；边界 ID prev 首 / next 末（无 trend）。

## 4. 确认门禁点（2026-08-20 已逐条与用户确认，D1–D9 定案如下）

| ID | 决策 | 定案 | 说明 |
|----|------|------|------|
| D1 | 扩张判定谓词口径 | ✅ **相切也算扩张**：`max(dd) <= min(gg)`（"触及即扩张"，29 课字面） | 用户拍板。经最小接口 `{dd,gg}` 笔/段通吃；相切合并产物 `zg==zd` 退化，扩展单元不要求 `zg>zd` |
| D2 | 合并形态 | ✅ **几何合并为单一更高级别中枢**（union 段/笔 + 波动重叠区 zd/zg + 并集 dd/gg） | 用户拍板。union 重算在扩张下必无效（§2.2，笔/段同理）→ 波动重叠区 |
| D3 | `expanded` 标记字段 | ✅ **`ChanChannel` 与 `ChanDuanChannel` 都加 `readonly expanded: boolean`**（普通 false / 扩张合并 true） | 用户拍板。合并产物几何 ≠ 各级不变式，需显式区分"级别升级单元"；app VO/mapper 同步 |
| D4 | 与 mergeChannels/mergeSpans 关系 | ✅ **新增后置独立归并 pass（Phase C）**，共用 `resolveCentralExpansions(channels, mergeTwo)` 相邻对固定点循环 | mergeSpans 多段+envelope 语义不匹配相邻对扩张；不改现有合并谓词、不改 phaseA |
| D5 | 范围 | ✅ **笔级 + 段级**都要（用户拍板）；解除 channel.ts 冻结（仅纯增量 Phase C + expanded） | 笔级是 shipped+指纹锁定 → 触发 D6 升版本 |
| D6 | `algorithmVersion` | ✅ **升为 2** | 用户拍板。笔级 `createChannels` 已定型、live spec 硬规则"facade 结果语义变化必须升版本"；同 change 更新并说明 fingerprint |
| D7 | change 命名 | ✅ `add-chan-central-extension` | 与 `add-chan-*` 系列一致 |
| D8 | capability 归属 | ✅ 新建 `chan-central-extension`（ADDED）+ `chan-analysis-core`（MODIFIED 场景+版本） | 模式同 `chan-duan-channel`/`chan-divergence`；与 `chan-analysis-http-contract` 无关（无 HTTP 端点） |
| D9 | 与 add-chan-divergence 耦合 | ✅ **本 change 只加交叉引用**；先于 divergence 落地，其 `hasExpansion` 判据**简化/移除**、改依赖本不重叠输出（仅剩位置递进） | 用户拍板。divergence 侧 design/tasks 的修改留待主线程在其恢复落地 |

## 5. Contracts（library-owned 类型）

```ts
// contracts.ts —— 两个中枢接口都增补
export interface ChanChannel {
  readonly bis: readonly ChanBi[];
  readonly zg: number; // 普通=方向性公式；扩张合并=min(prev.gg,next.gg)【波动重叠区】
  readonly zd: number; // 普通=方向性公式；扩张合并=max(prev.dd,next.dd)【波动重叠区】
  readonly gg: number; // 扩张产物=并集极值
  readonly dd: number; // 扩张产物=并集极值
  readonly level: ChannelLevel;
  readonly type: ChannelType;
  readonly status: ChannelStatus;
  readonly trend: TrendDirection;   // 笔级专有；扩张产物继承首中枢
  readonly expanded: boolean;       // 新增（必需）：扩张合并=true / 普通=false
  readonly startId: number;
  readonly endId: number;
  readonly displayStartId: number;
  readonly displayEndId: number;
}

export interface ChanDuanChannel {
  readonly duans: readonly ChanDuan[];
  readonly zg: number; // 普通=min(段高点)；扩张合并=min(prev.gg,next.gg)【波动重叠区】
  readonly zd: number; // 普通=max(段低点)；扩张合并=max(prev.dd,next.dd)【波动重叠区】
  readonly gg: number;
  readonly dd: number;
  readonly level: ChannelLevel;
  readonly type: ChannelType;
  readonly status: ChannelStatus;
  readonly expanded: boolean;       // 新增（必需）
  readonly startId: number;
  readonly endId: number;
  readonly displayStartId: number;
  readonly displayEndId: number;
}
```

- `barrel src/index.ts` 无需改动（两个接口均已导出）。
- 新增 internal 纯函数（不导出 barrel）见 §3；`isCentralExpansion` 经最小接口 `{dd, gg}`。

## 6. Facade

无新增 facade 方法。`createChannels` 与 `createDuanChannels` 内部在 Phase B 后追加 Phase C
（§3）；输出结构 `{ phaseA, phaseB }` 不变，两个 phaseB 都保证相邻严格分离。
`ChanCore.algorithmVersion` 1 → 2。

## 7. 边界与非目标

- **不做**：买卖点、背驰判定、持久化、migration、新增 HTTP 端点、改 `mergeK/findFenxings/createBi/
  createDuan`、改 Phase A 枚举、恢复 Chan persistence。
- 背驰 change 的"位置递进"不下沉到本 change（严格分离 ≠ 递进）。
- 扩张合并产物**不引入高级别枚举**，以 `expanded: true` 标记替代。
- 笔级 `channel.ts` 的修改**仅限于** Phase C 后置 pass + 3 处构造点 `expanded:false`；方向性几何、
  Phase A 枚举、既有延伸/合并不动。

## 8. 验证策略

- **pure 单测**（笔级 + 段级）：
  - 扩张识别边界：重叠（正宽度）、相切（扩张，zg==zd 退化）、穿越、不重叠；
  - 合并几何：笔级（union bis + 波动重叠区 + trend 继承 + level=Bi）与段级（union duans + 波动重叠区）；
  - 不动点：链式三中枢 → 归并为 1；扩张对 + 独立中枢 → 2（1 expanded + 1 普通 expanded:false）；
  - **严格分离不变式**：任意输入输出全部相邻对 `max(dd) > min(gg)`；
  - **位置递进保持**：不相交且递进的两中枢不被误并；
  - 非扩张输入 phaseB 不变回归（笔/段各自既有 5 笔/3 段样例）。
- **characterization re-baseline（专项评审，不静默）**：`chan-full-output.characterization.spec.ts`
  的 SHA 随 `algorithmVersion`(1→2，在 fingerprint payload 内) 而变化；**扩展一个笔级扩张 case**
  固化（两相邻波动重叠中枢 → 归并为一个 expanded）并解释。现有 45-K fixture 的 counts
  （channels phaseA/phaseB=1）不受影响（单中枢无相邻对）。
- **app VO/mapper**：`ChannelVo`/`DuanChannelVo` 加 `expanded`、`toChannelVo`/`toDuanChannelVo` 透出 +
  mapper.spec 断言更新。
- **真实数据（scratch，不固化）**：600519 日 K → 笔级/段级两条链各自人工核对扩张归并（对照价格走势
  与波动区间）。
- **仓库基线**：lint / typecheck / test:ci / ci:contracts / build:docker /
  `openspec validate --all --strict` 全绿。
