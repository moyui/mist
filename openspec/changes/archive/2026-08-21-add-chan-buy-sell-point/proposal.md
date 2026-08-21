# Proposal — add-chan-buy-sell-point

## Why

缠论依赖链 `笔 → 段 → 段级中枢 → 背驰 → 买卖点` 的**最后一环**。前置四环已全部在 master
落地并归档：

- `add-chan-duan-segment`（段，特征序列法/71课边界分型）
- `add-chan-duan-channel`（段级中枢，对称重叠几何）
- `add-chan-central-extension`（中枢扩张 Phase C，phaseB 严格不重叠）
- `add-chan-divergence`（背驰：趋势 + 盘整，双口径力度）
- `extract-shared-indicators-library`（力度管线：方向柱面积 + DIF 极值）

买卖点是策略消费的信号层入口，也是缠论体系面向交易的直接产出。用户已拍板三类判定规则：

- **一类** = 趋势背驰（链末中枢的背驰点本身）；**盘整背驰（中枢内部）不产一类点**，
  中枢内部的买卖点归二类；
- **二类** = 中枢盘整的结构性买卖点，**要求前置一类点**（一买/一卖后的次级别回抽
  确认），**不一定有背驰**（确认是中枢内部的纯结构比较，不检查力度）；
- **三类** = 回踩中枢上下沿（离开段后回抽不回中枢区间，几何判定）；
- 买/卖完全对称。

买卖点与背驰同构：笔级/段级判定规则一致 → **抽离为共享纯函数**（仿
`ChanCore.detectDivergences` 的最小结构接口模式），供策略模块（回测/实时信号）后续
owning change 消费。

## What Changes

- **共享纯函数** `ChanCore.detectBuySellPoints(input): readonly ChanBuySellPoint[]`：
  无状态、无 I/O，笔级/段级复用；一次输入输出三类买卖点。
- 新契约类型（`libs/chancore/src/contracts.ts` 新增，**不改既有类型**）：
  - `ChanBspUnit`：买卖点单元最小结构接口（= 背驰 unit + `high/low`，价格比较必需）；
  - `ChanBspInput`：入参（units + 复用 `ChanDivergenceZhongshu` + 复用 `ChanUnitForce`）；
  - `ChanBspType`：6 值枚举（first_buy / first_sell / second_buy / second_sell /
    third_buy / third_sell）；
  - `ChanBuySellPoint`：输出（type / zhongshuIndex / unitIndex / price / firstTypeIndex）。
- 判定规则：
  - **一类**：内部调用 `DivergenceDetector`，**仅趋势背驰**（≥2 同向中枢链末中枢
    A vs C 力度衰竭）→ 一个点；方向 = 离开段 trend（down → 一买 / up → 一卖）；
    位置 = 离开段末端。**盘整背驰（中枢内部）不产一类点**——中枢内部的买卖点
    归二类。
  - **二类**：**要求前置一类点**（一买/一卖之后的次级别回抽确认；三元组第一段必须是
    一类点确认段）：相邻三元组 `down→up→down` 且回抽段低点严格高于一买段低点
    （中枢内部比较，不破前低）→ 二买；`up→down→up` 且反抽段高点严格低于一卖段高点
    → 二卖。**不检查背驰/力度**（用户："不一定有背离背驰，指中枢内部的比较"）。
  - **三类**：中枢离开段（e+1）后相邻回抽段（e+2），回抽段不回到中枢区间：三买 =
    离开 up + 回抽 down 且 `pullback.low > zg`（**严格**，贴边触及 zg = 中枢延伸，不算）；
    三卖 = 离开 down + 回抽 up 且 `pullback.high < zd`（**严格**）。盘整背驰构成的三买
    （第24课万科例）是几何判定的构成情形，已由本判定覆盖。
  - 输出按 unitIndex（时间序）稳定排序；确定性；不变异；空输入返回 `[]`。
- **不提供 HTTP 端点**（与背驰先例一致：买卖点是策略模块的一部分，作为库能力消费；
  真实数据验证走 scratch 脚本直连纯函数）。
- `algorithmVersion` **保持 2**（纯增量，跟随 chan-central-extension 基线，不再 bump）。

## Capabilities

### New Capabilities

- `chan-buy-sell-point`：定义买卖点（一/二/三类）判定的共享纯函数契约、输入输出类型
  与判定规则。

### Modified Capabilities

- `chan-analysis-core`：facade 增加 `detectBuySellPoints`（该 spec 的 "future Chan
  strength algorithm" 占位场景的下一环正式落地）。

## Impact

- **`mist`**：
  - `libs/chancore`：`contracts.ts` 新增 4 个类型 + 新增 `internal/buy-sell-point.ts`
    纯函数实现 + `chan-core.ts` facade 增加 `detectBuySellPoints` + `index.ts` barrel
    导出 + 纯单测。
  - 不新增 HTTP 端点、不新增 DTO/VO/mapper/controller——买卖点作为库能力由策略模块
    后续接入。
- **Backtest/Realtime/Signal/Alert**：本 change 不接入运行时；策略消费由各自 owning
  change 接入（符合 `chan-analysis-core` "runtime MUST NOT depend on ChanCore or the
  public Indicator HTTP API"——策略经 `@app/indicators` 算 forces 传入）。
- **数据库 / 部署**：无 migration、无部署拓扑变化。
- **后续依赖**：策略模块（回测/实时信号）owning change 接入买卖点信号。
