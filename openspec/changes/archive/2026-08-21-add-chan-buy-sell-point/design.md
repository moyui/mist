# Design — add-chan-buy-sell-point

## 1. 背景与基线

- 缠论链：笔/段/段级中枢/背驰/力度管线全部就绪。买卖点是最后一环（策略信号入口）。
- 用户定调（08-21）：**一/二/三类买卖点全做**（买卖对称）；**共享纯函数**（笔/段复用，
  仿 `detectDivergences` 最小结构接口模式）；**纯库能力放 `libs/chancore`，不提供 HTTP
  端点**（与背驰先例一致，策略模块后续 owning change 消费）。
- 三类判定规则（用户原话）：
  - 1 类 = **趋势背驰 or 中枢背驰**（背驰点本身）；
  - 2 类 = **中枢盘整的买卖点，不一定有背离背驰**（结构性判定，不依赖力度）；
  - 3 类 = **回踩中枢上下沿**（几何判定）；
  - 买和卖一样（对称）。
- 治理约束（chan-analysis-core）：ChanCore 不得 import 公共 IndicatorService、不得提供
  Strategy KDJ/MACD → 力度计算必须走纯库（`@app/indicators`），chancore 保持纯函数
  （forces 由调用方传入）。本 change 不新增指标计算。
- 纯增量：不改 `mergeK/findFenxings/createBi/createChannels/createDuan/
  createDuanChannels/detectDivergences` 的输入/契约语义；`algorithmVersion` **保持 2**
  （跟随 chan-central-extension 基线；背驰先例纯增量不 bump）。无持久化。

## 2. 缠论买卖点语义（原典考证 + 用户定调）

- **一类买卖点**：缠论 24/25 课的背驰点。**仅标准背驰（趋势背驰）**（≥2 同向中枢的链末
  中枢 B，A vs C 力度衰竭；第24课"用MACD判断背驰，首先要有两段同向的趋势……C段的走势
  类型完成时对应的MACD柱子面积比A段对应的面积要小，这时候就构成标准的背弛"）确认后，
  买卖点落在**离开段末端**。第21课："只有在下跌确立后的中枢下方才可能出现买点。这就是
  第一类买点。"下跌背驰 → 一买；上涨背驰 → 一卖。**盘整背驰不产一类点**（用户定调
  "中枢内部都 2 买或者 2 卖，不出"；第24课"背驰与盘整背驰的两种情况中，背驰是最重要的"）。
- **二类买卖点**：缠论第21课——"第二类买点是和第一类买点紧密相连的……第一买点出现后的
  第二段次级别走势低点就构成第二类买点"。用户定调："二买要求前置一买；不一定有背离背驰，
  指中枢内部的比较"——即二买 = **一买/一卖之后的次级别回抽结构比较**（中枢内部不破
  前低/前高），**不检查背驰/力度**，但**必须有前置一类点**（三元组第一段必须是一买/一卖
  确认段）。二买与一买"前后出现，不可能产生重合"（第21课）。
- **三类买卖点**：缠论第20课第三类买卖点定理——"一个次级别走势类型向上离开缠中说禅
  走势中枢，然后以一个次级别走势类型回试，其低点不跌破ZG，则构成第三类买点；一个次级别
  走势类型向下离开缠中说禅走势中枢，然后以一个次级别走势类型回抽，其高点不升破ZD，则
  构成第三类卖点"。**比较口径定案：严格 `>` / `<`（贴边等于不算）**——原典存在两种表述
  的张力，用户拍板取严格口径：
  - 定理字面"不跌破/不升破"含等于；但**同课**的"缠中说禅走势中枢中心定理一"定义
    "走势中枢的延伸等价于任意区间[dn，gn]与[ZD，ZG]有重叠……若有Zn，使得dn>ZG或gn<ZD，
    则必然产生高级别的走势中枢或趋势"——回抽段与中枢区间**端点相接即有重叠**= 中枢
    延伸；只有严格离开（dn>ZG / gn<ZD）才算回抽不回中枢。
  - 第53课"第三类买卖点，其意义就是对付中枢结束"——触及 ZG 时中枢处于延伸状态、
    尚未结束，不构成三买。
  - 结论：严格 `>` / `<`（贴边触及 = 回到中枢 = 不算三买）。
  第20课并强调"并不是任何回调回抽都是第三类买卖点，**必须是第一次**"（本 change 取
  离开段后第一个相邻回抽段，天然满足）。第24课补充的"盘整背驰 + 回跌不重新跌回构成
  第三类买点"（万科例）是**几何判定的构成情形之一**——回跌不回中枢本身即几何条件，
  本 change 的几何三买判定已覆盖，无需另行依赖盘整背驰力度；三买**不依赖二买**
  （第21课"一个上涨趋势确定后，不可能再有第一类与第二类买点，只可能有第三类买点"；
  二买与三买只"可能产生重合"，非依赖）。
- **三类买卖点**：缠论 20 课——离开中枢的次级别走势，其回抽不回到中枢区间。用户定调
  "回踩中枢上下沿"：离开段（e+1）后相邻回抽段（e+2），回抽段低点 > 中枢上沿 zg → 三买；
  回抽段高点 < 中枢下沿 zd → 三卖（严格比较，贴边等于不算）。

## 3. 输入契约（chancore，调用方传入力度）

```ts
/** 买卖点单元（笔或段皆可，最小结构接口）——背驰 unit 超集：价格比较需要 high/low。 */
export interface ChanBspUnit {
  readonly startTime: Date;
  readonly endTime: Date;
  readonly high: number;   // 段内最高价
  readonly low: number;    // 段内最低价
  readonly trend: TrendDirection;
}

/** 买卖点判定入参：units 与 forces 按索引一一对齐。 */
export interface ChanBspInput {
  readonly units: readonly ChanBspUnit[];
  readonly zhongshus: readonly ChanDivergenceZhongshu[]; // 复用（firstUnitTime/lastUnitTime/zg/zd/gg/dd）
  readonly forces: readonly ChanUnitForce[];              // 复用（area/peak）；空数组 → 一类不输出
}
```

> - `ChanBspUnit` 是 `ChanDivergenceUnit` 的**结构超集** → `ChanBspInput.units` 可直接
>   构造 `ChanDivergenceInput`（TS 结构类型赋值成立，无需映射函数）。
> - `ChanDivergenceZhongshu` 已含 `firstUnitTime/lastUnitTime/zg/zd/gg/dd`，完全满足中枢
>   定位（一类/三类共用）与 zg/zd 比较（三类），**复用不新增 `ChanBspZhongshu`**。
> - 调用方把 `ChanBi[]`/`ChanDuan[]`、`ChanChannel[]`/`ChanDuanChannel[]` 映射为最小结构
>   接口（字段天然满足，仅需类型适配；`expanded=true` 扩张产物同规则透传——**不特殊处理**，
>   与背驰一致）；力度值由调用方经 `@app/indicators` 计算（area = `computeUnitDirectionalAreas`，
>   peak = `computeUnitLinePeaks` 输出按方向取绝对值）。

## 4. 输出契约

```ts
export enum ChanBspType {
  FirstBuy = 'first_buy',
  FirstSell = 'first_sell',
  SecondBuy = 'second_buy',
  SecondSell = 'second_sell',
  ThirdBuy = 'third_buy',
  ThirdSell = 'third_sell',
}

export interface ChanBuySellPoint {
  readonly type: ChanBspType;
  readonly zhongshuIndex: number | null;  // 一类/三类：相关中枢在 zhongshus 中的下标；二类：恒 null
  readonly unitIndex: number;             // 确认段下标（一类=离开段 leaveIndex；二三类=回抽段）；点位于该段末端
  readonly price: number;                 // 点价格：买=确认段 low、卖=确认段 high
  readonly firstTypeIndex: number | null; // 同向最近前置一类点在结果数组中的下标；无 → null
}
```

- `zhongshuIndex`：一类/三类绑定中枢（引用 zhongshus 下标）；二类不绑定中枢（结构性
  判定），恒 `null`。策略层如需把二买锚到附近中枢，自行关联，不塞进核心规则。
- `firstTypeIndex`：最终排序后回填——对每个二/三类点，在同向（buy/sell）一类点中找
  `unitIndex` 最大的前置者，取其结果数组下标；无 → `null`。一趟扫描，低成本，供策略
  消费（如二买关联前置一买）。
- 本 change **不新增** `divergenceType` 字段（一类区分趋势/盘整背驰留给策略层通过
  再调 `detectDivergences` 获得；保持输出契约最小）。

## 5. 算法

```
detectBuySellPoints(input: ChanBspInput): ChanBuySellPoint[]
  0. 前置：units 为空 → 返回 []。
  1. 【一类】内部构造 ChanDivergenceInput（units 直接结构赋值；zhongshus/forces 透传），
     调 DivergenceDetector().detectDivergences(...)：
     - 只消费 type === Trend 的结果（盘整背驰/中枢内部不产一类点）。
     - 每条趋势背驰 → 一个一类点：
       leaveTrend = units[div.leaveIndex].trend
       type = leaveTrend === 'down' ? FirstBuy : FirstSell   （None 不计）
       zhongshuIndex = div.zhongshuIndex
       unitIndex = div.leaveIndex
       price = (买) ? units[leaveIndex].low : units[leaveIndex].high
  2. 【二类】扫描相邻三元组（i 从 0 到 units.length-3），**要求前置一类点**：
     a=units[i]; b=units[i+1]; c=units[i+2]
     - 前置：a 段必须是一个一类点确认段（存在 FirstBuy/FirstSell 点，unitIndex === i）
     - a.down && b.up && c.down && c.low > a.low   → { SecondBuy,  null, i+2, c.low }
     - a.up   && b.down && c.up   && c.high < a.high → { SecondSell, null, i+2, c.high }
     （方向条件已隐含交替校验；严格比较无 epsilon；不检查背驰/力度——中枢内部比较）
  3. 【三类】对每个已定位中枢 span（按 firstUnitTime/lastUnitTime 精确匹配 units，
     找不到跳过；s/e 为首/末单元下标）：
     leave = e+1; pull = e+2
     - leave >= units.length 或 pull >= units.length → 跳过（无离开段/无回抽段）
     - L=units[leave]; P=units[pull]
     - L.up && P.down && P.low > span.zg  → { ThirdBuy,  span.zhongshuIndex, pull, P.low }
     - L.down && P.up && P.high < span.zd → { ThirdSell, span.zhongshuIndex, pull, P.high }
     （严格口径：回抽段贴边等于 zg/zd 算触及中枢 = 中枢延伸，不构成三买——用户定案，
     依据中心定理一"端点相接即有重叠"；见 §2）
  4. 汇总排序：unitIndex 升序 → type（枚举声明序）升序 → zhongshuIndex 升序（null 后置）。
  5. 回填 firstTypeIndex（同向最近前置一类点，见 §4）。
  6. 返回；输入不变异；确定性。
```

- 一类/三类共享同一套中枢定位（firstUnitTime/lastUnitTime 精确匹配，找不到跳过，
  不臆断）——与背驰 `locateSpans` 同法。
- 二类不经过中枢定位（纯段间结构）；forces 为空数组时一类不输出、二三类照常
  （对齐 `DivergenceDetector` 空 forces → `[]` 的行为）。
- 允许同一段同时出现多类点（如一段既是一买确认段又是三买回抽段），不互斥。

## 6. Facade

```ts
// chan-core.ts（与 detectDivergences 并列）
static detectBuySellPoints(input: ChanBspInput): readonly ChanBuySellPoint[] {
  return new BuySellPointDetector().detectBuySellPoints(input);
}
```

- 命名：`detectBuySellPoints`（与 `detectDivergences` 风格一致，显式）。
- 空输入（无 units）→ `[]`，非错误。
- `algorithmVersion` **保持 2**（纯增量，跟随 chan-central-extension 基线）。
- `internal/buy-sell-point.ts` 类名 `BuySellPointDetector`，**不导出 internal**；
  `index.ts` barrel 新增导出：`ChanBspType`（枚举）+ `ChanBspInput`/`ChanBspUnit`/
  `ChanBuySellPoint`（类型）。
- ⚠️ `chan-core.spec.ts` 第一个测试断言公共 API 精确 key 列表，新增导出后**必须同步更新**
  该断言（tasks 5.4）。

## 7. 消费方式（无 HTTP 端点）

- 买卖点是策略模块的一部分——消费方是策略评估/扫描（按用户定调），**本 change 不提供
  REST 端点**。交付形态：`ChanCore.detectBuySellPoints` 为库能力（`@app/chancore` 导出），
  策略模块后续 owning change 调用：传入 units（笔/段）+ zhongshus（笔级/段级中枢）+
  forces（经 `@app/indicators` 计算），得到三类买卖点用于信号判定。符合
  `chan-analysis-core` "运行时不得依赖公共 Indicator HTTP API"。
- 力度计算编排（`computeMacdSeries` → `computeUnitDirectionalAreas` +
  `computeUnitLinePeaks`）不封装进 chancore（Chancore 不计算指标），由策略模块消费时
  自行组装。
- **真实数据验证走 scratch 脚本**（node 直连 `@app/chancore` + `@app/indicators` 打表
  核对），不依赖 HTTP、不固化到仓库。
- 不新增 `BspVo`/DTO/mapper/controller 代码。

## 8. 确认门禁点

| ID | 决策 | 定案 | 说明 |
|----|------|------|------|
| D1 | 范围 | **一/二/三类全做，买卖对称；无 HTTP 端点** | 用户定调 |
| D2 | 一类与背驰耦合 | **内部调用 DivergenceDetector**（`ChanBspInput` 含 forces，调用方一次调用） | 弃"外部传入 ChanDivergence[]"：调用方一次调用、一类/三类共享中枢定位、zhongshuIndex 天然一致 |
| D3 | 一类点粒度 | **仅趋势背驰产出一类点**（链末中枢）；**盘整背驰（中枢内部）不产一类点**——中枢内部的买卖点归二类 | 用户定调："中枢内部都 2 买或者 2 卖，不出（一类）"；原"每次背驰对应一个点 + 同中枢 Trend/Consolidation 去重"方案废弃 |
| D4 | 一类点位置/方向 | 位置 = 离开段末端（leaveIndex）；方向 = 离开段 trend（down → 一买 / up → 一卖）；price = 买 low / 卖 high | 背驰点即买卖点 |
| D5 | 二类独立性 | **二买/二卖要求前置一类点**（三元组第一段必须是一买/一卖确认段）；**不检查背驰/力度**——确认是中枢内部的纯结构比较（回抽不破前低/前高） | 用户定调："二买要求前置一买，我指的不一定有背离背驰 是指的中枢内部的比较"；原"独立三元组判定"废弃 |
| D6 | 二类三段关系 | **严格相邻连续三元组** | 与"次级别反弹 + 次级别回抽"一致；避免跨段产生重叠信号 |
| D7 | 二类比较口径 | **严格**（`c.low > a.low` / `c.high < a.high`，无 epsilon） | 对齐全库"严格 < / >，无 epsilon"惯例 |
| D8 | 三类结构 | 离开段 e+1 与回抽段 e+2 **必须相邻**；无离开/回抽段跳过 | 离开后隔多段才回抽不产三买（强结构信号，可接受） |
| D9 | 三类比较口径 | **严格**（买 `pullback.low > zg`、卖 `pullback.high < zd`；贴边等于不算） | 用户定案（贴边不算）：原典定理字面"不跌破/不升破"含等于，但**同课中心定理一**"区间端点相接即有重叠 = 中枢延伸"支持严格口径；第53课"三买对付中枢结束"（触及 ZG 时中枢未结束）；两次调整（`>`→`>=`→`>`）最终定案 |
| D10 | 输出契约 | 6 值枚举 + `zhongshuIndex`(二类 null) + `unitIndex` + `price` + `firstTypeIndex`(可空)；**不加** `divergenceType` 字段 | 保持最小；策略层自行再调 detectDivergences 区分趋势/盘整 |
| D11 | forces 语义 | 必填但可空数组；空 → 一类不输出、二三类照常 | 对齐 DivergenceDetector 空 forces → `[]` |
| D12 | 中枢类型 | **复用 `ChanDivergenceZhongshu`**，不新增 `ChanBspZhongshu` | 结构字段完全够用；避免两份永远同构的类型 |
| D13 | HTTP 端点 | **不提供**；库能力由策略模块后续 owning change 消费；真实数据验证走 scratch 脚本 | 与背驰先例一致 |
| D14 | algorithmVersion | **保持 2** | 纯增量，跟随 chan-central-extension 基线 |

## 9. 边界与非目标

- **不做**：策略接入（回测/实时信号归策略 owning change）、持久化、migration、改现有
  算法/契约、REST 端点、指标计算（归 `@app/indicators`）、`divergenceType` 输出字段
  （策略层自行消费 detectDivergences）、二类与中枢的绑定关系。
- 买卖点为**请求时实时派生**（无状态纯函数）；不新增 Compose service。
- 扩张中枢（`expanded=true`）当普通中枢看待（用户定调，与背驰一致），不特殊处理。

## 10. 验证策略

- 买卖点 pure 单测：
  - 一类：趋势背驰 → 一买/一卖方向映射；**盘整背驰不产一类点**（仅 Trend 消费）；
    forces 为空 → 无一类点；None 方向不计。
  - 二类：标准二买/二卖样例（前置一买 + 三元组）；**无前置一类点 → 不产二类**（即使
    三元组结构满足）；严格口径（`==` 不算）；不检查力度（无 forces 也有二类，但有一类
    前置）；非相邻三元组不输出；方向组合校验。
  - 三类：标准三买/三卖样例；无回抽段/无离开段跳过；**严格口径（`== zg/zd` 贴边不算，
    触及 = 中枢延伸——用户定案）**；离开段反向组合（down+up 不产三买）；expanded 中枢当
    普通中枢；中枢定位失败跳过。
  - 汇总：排序（unitIndex → type → zhongshuIndex null 后置）、firstTypeIndex 回填
    （同向最近前置、无 → null）、确定性、不变异、空输入 → `[]`。
- 经典 case fixture：一类/二类/三类各买与卖样例指纹固化。
- 真实数据验证（scratch 脚本，node 直连 `@app/chancore` + `@app/indicators`）：600519
  日 K → createBi/createDuan → createDuanChannels → computeMacdSeries + 方向面积/DIF
  极值 → detectDivergences → detectBuySellPoints → 人工核对（不固化到仓库、不依赖 HTTP）。
- 仓库基线：lint / typecheck / test:ci / ci:contracts / build:docker /
  openspec validate --all --strict。
