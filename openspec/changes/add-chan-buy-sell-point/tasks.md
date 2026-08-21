# Tasks — add-chan-buy-sell-point

## 1. 范围与契约门禁

- [ ] 1.1 确认本 change 交付：一/二/三类买卖点全做（买卖对称）；共享纯函数
  `ChanCore.detectBuySellPoints`（笔/段经最小结构接口复用）；**不提供 HTTP 端点**
  （买卖点是策略模块的一部分，作为库能力消费）；不动既有算法/契约；
  `algorithmVersion` 保持 2；不做持久化/migration/策略接入。
- [ ] 1.2 逐条确认 design.md 门禁点 D1–D14（范围、一类耦合、一类粒度、位置方向、
  二类独立性/三段关系/比较口径、三类结构/比较口径、输出契约、forces 语义、中枢类型、
  HTTP 端点、algorithmVersion），确认后才进实施计划。
- [ ] 1.3 确认一类点 = 内部调用 DivergenceDetector（forces 由调用方传入；空 forces →
  一类不输出）；**仅消费 Trend 背驰**，盘整背驰（中枢内部）不产一类点（D3）。
- [ ] 1.4 确认二类点**要求前置一类点**（三元组第一段必须是一买/一卖确认段）、不检查
  背驰/力度（中枢内部纯结构比较）、严格相邻三元组、严格比较；三类点离开段/回抽段相邻、
  无回抽跳过、严格比较（D5–D9）。

## 2. Contracts（chancore library-owned 类型）

- [ ] 2.1 新增 `ChanBspUnit`（startTime/endTime/high/low/trend）、`ChanBspInput`
  （复用 `ChanDivergenceZhongshu` + `ChanUnitForce`）、`ChanBspType`（6 值枚举）、
  `ChanBuySellPoint`（type/zhongshuIndex/unitIndex/price/firstTypeIndex）
  （按 design §3/§4）。
- [ ] 2.2 barrel `src/index.ts` 导出新枚举/类型；不导出 internal 实现。

## 3. 买卖点判定算法（共享纯函数，internal/buy-sell-point.ts）

- [ ] 3.1 新增 `BuySellPointDetector.detectBuySellPoints(input: ChanBspInput):
  ChanBuySellPoint[]`。
- [ ] 3.2 【一类】内部构造 `ChanDivergenceInput`（units 结构赋值 + zhongshus/forces
  透传）调 `DivergenceDetector().detectDivergences(...)`；**只消费 type === Trend 的
  结果**（盘整背驰不产一类点）；离开段 trend 定买/卖（down→FirstBuy / up→FirstSell /
  None 不计）；`unitIndex = leaveIndex`；`price` = 买 low / 卖 high。
- [ ] 3.3 【二类】扫描相邻三元组，**要求前置一类点**（a 段必须存在 FirstBuy/FirstSell
  点，unitIndex === i）：`down→up→down` 且 `c.low > a.low`（严格）→ SecondBuy；
  `up→down→up` 且 `c.high < a.high`（严格）→ SecondSell；`zhongshuIndex = null`；
  不检查背驰/力度（中枢内部比较）。
- [ ] 3.4 【三类】对每个已定位中枢（firstUnitTime/lastUnitTime 精确匹配 units，
  找不到跳过）：离开段 = e+1、回抽段 = e+2；无离开段或无回抽段跳过；
  三买 `leave.up && pull.down && pull.low > zg`（严格，贴边不算）；三卖
  `leave.down && pull.up && pull.high < zd`（严格）；expanded 中枢当普通中枢。
- [ ] 3.5 汇总排序：unitIndex 升序 → type 升序 → zhongshuIndex 升序（null 后置）；
  回填 `firstTypeIndex`（同向最近前置一类点下标，无 → null）；确定性、不变异、
  空输入（无 units）→ `[]`。

## 4. Facade

- [ ] 4.1 `ChanCore.detectBuySellPoints(input: ChanBspInput): readonly ChanBuySellPoint[]`。
- [ ] 4.2 空输入：`[]`，非错误。
- [ ] 4.3 不导出 internal；`algorithmVersion` 保持 2（跟随 chan-central-extension 基线）。

## 5. 单测

- [ ] 5.1 一类：趋势背驰 → 一买/一卖方向映射；**盘整背驰不产一类点**；forces 为空 →
  无一类点；None 方向不计。
- [ ] 5.2 二类：标准二买/二卖样例（前置一买 + 三元组）；**无前置一类点 → 不产二类**
  （即使三元组结构满足）；严格口径（`==` 不算）；不检查力度（无 forces 也有二类，但有
  一类前置）；非相邻三元组不输出；方向组合校验（方向不交替不产点）。
- [ ] 5.3 三类：标准三买/三卖样例；无回抽段/无离开段跳过；**严格口径（`== zg/zd`
  贴边不算，触及 = 中枢延伸）**；离开段反向组合（down+up 不产三买）；
  expanded 中枢当普通中枢；中枢定位失败跳过。
- [ ] 5.4 汇总：排序（unitIndex → type → zhongshuIndex null 后置）、firstTypeIndex
  回填（同向最近前置、无 → null）、确定性、不变异、空输入 → `[]`；更新
  `chan-core.spec.ts` 公共 API 精确 key 断言（新增 `ChanBspType` 导出）。

## 6. 验证与交付

- [ ] 6.1 经典 case fixture：一类/二类/三类各买与卖样例指纹固化。
- [ ] 6.2 真实数据验证（scratch 脚本，node 直连 `@app/chancore` + `@app/indicators`）：
  600519 日 K → createBi/createDuan → createDuanChannels → computeMacdSeries + 方向
  面积/DIF 极值 → detectDivergences → detectBuySellPoints → 人工核对（不固化到仓库、
  不依赖 HTTP）。
- [ ] 6.3 仓库基线全绿：lint / typecheck / test:ci / ci:contracts / build:docker /
  openspec validate --all --strict。
- [ ] 6.4 检索 `libs/chancore` 无 TypeORM/Redis/HTTP/Nest/env/persistence import；
  未恢复 Chan persistence；HTTP 契约无变化；`algorithmVersion` 保持 2；既有
  detectDivergences 契约无变化。
- [ ] 6.5 向项目负责人审阅 validation evidence 后才归档。
