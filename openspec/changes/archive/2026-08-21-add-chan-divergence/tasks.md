## 1. 范围与契约门禁

- [ ] 1.1 确认本 change 交付：背驰判定共享纯函数（趋势+盘整，含同向中枢链构造）；**不提供 HTTP 端点**
  （背驰是策略模块的一部分，作为库能力消费）；共享指标库 `libs/indicators`
  （computeMacdSeries + **computeUnitDirectionalAreas 方向面积** + **computeUnitLinePeaks DIF 极值**）
  与 runMACD 薄包装由 `extract-shared-indicators-library` 交付/增补（本 change 只消费）；中枢扩张由
  `chan-central-extension`（Phase C，已落地）保证 phaseB 不重叠、expanded 当普通中枢；不做买卖点/
  持久化/migration/改现有算法/回测与实时接入。
- [ ] 1.2 逐条确认 design.md 门禁点 D1–D9（形态、力度数据源、趋势背驰对比基准、复用方式、
  HTTP 端点、algorithmVersion、indicators 边界、三块接入范围、中枢扩张依赖），确认后才进实施计划。
- [ ] 1.3 确认力度数据 = **方向柱面积 + 黄白线极值绝对值**（双分量，用户定调：24课"向上看红柱/
  向下看绿柱"面积 + 25课黄白线不创新高；均正向力度标量），来源 = `@app/indicators`
  （extract-shared-indicators-library 交付与增补；调用方计算传入 forces，chancore 不算 MACD）。
- [ ] 1.4 确认背驰为无状态纯函数（请求时实时派生）；不恢复 Chan persistence。

## 2. Contracts（chancore library-owned 类型）

- [ ] 2.1 新增 `ChanDivergenceUnit`、`ChanDivergenceZhongshu`（含 zg/zd/gg/dd）、`ChanUnitForce`
  （area + peak 双分量）、`ChanDivergenceInput`、`ChanDivergenceType`、`ChanDivergence`
  （enterForce/leaveForce 为 ChanUnitForce）（按 design §4/§5）。
- [ ] 2.2 barrel `src/index.ts` 导出新枚举/类型；不导出 internal 实现。

## 3. 背驰判定算法（共享纯函数）

- [ ] 3.1 新增 `internal/divergence.ts` `detectDivergences(input: ChanDivergenceInput): ChanDivergence[]`。
- [ ] 3.2 中枢定位：按 firstUnitTime/lastUnitTime 在 units 中精确匹配首/末单元下标（找不到则跳过）。
- [ ] 3.3 进入/离开段识别：进入段 = 中枢前最近一段（s-1）、离开段 = 中枢后最近一段（e+1）；
  边界（s-1<0 或 e+1>=length）跳过。
- [ ] 3.4 盘整背驰：双口径判定——leave.area < enter.area **且** leave.peak < enter.peak
  （均严格 <，无 epsilon）→ Consolidation。
- [ ] 3.5 **同向中枢链构造**：按中枢时间序扫描，中枢方向 = 离开段 trend（units[e+1].trend）；
  连续两个同样的中枢 + 离开段方向一致 → 候选链；相邻中枢满足**位置递进**（向上 后.gg>前.gg 且
  后.dd>前.dd / 向下对称）→ 链成立，不满足即断链；**非扩张不做**（chan-central-extension Phase C
  已保证输入相邻波动区间严格不重叠；expanded 当普通中枢）；只依赖 units/zhongshus 时间、方向与
  几何（不依赖 MACD）；链长 ≥2 才构成趋势。
- [ ] 3.6 趋势背驰：每条链**最后一个中枢（B）**比较其**进入段（A，units[s-1]）vs 离开段（C，
  units[e+1]）**（同向）：双口径均衰竭（leave.area < enter.area 且 leave.peak < enter.peak）→
  Trend；同一条链只输出一条趋势背驰。
- [ ] 3.7 输出按 zhongshuIndex 排序；确定性、不变异。
- [ ] 3.7 输出按 zhongshuIndex 排序；确定性、不变异。

## 4. Facade

- [ ] 4.1 `ChanCore.detectDivergences(input: ChanDivergenceInput): readonly ChanDivergence[]`。
- [ ] 4.2 空输入：`[]`，非错误。
- [ ] 4.3 不导出 internal；`algorithmVersion` 保持 2（跟随 chan-central-extension 基线）。

## 6. indicators 增补依赖（extract-shared-indicators-library）

- [ ] 6.1 声明并随依赖落地 `computeUnitDirectionalAreas`（方向柱面积：up=红柱 / down=绿柱）+ 
  `computeUnitLinePeaks`（DIF 区间 max/min）+ barrel + spec（indicators-core delta）。
- [ ] 6.2 单测：方向面积（up 只算正柱、down 只算负柱）、begIndex 截断、边界单元、空输入；
  DIF 极值（max/min、begIndex、边界、空）。确定性、不变异。

## 7. 验证与交付

- [ ] 7.1 背驰 pure 单测：进入/离开段定位（含边界）、盘整背驰（双分量严格 < 口径、单一分量不构成）、
  趋势链构造（同向归链/异向断链/位置递进断链/孤立中枢/链长1/expanded 当普通中枢）、趋势背驰
  （末中枢 A vs C）、空输入、确定性、不变异。
- [ ] 7.2 经典 case fixture：盘整背驰 / 趋势背驰样例指纹固化。
- [ ] 7.3 真实数据验证（scratch 脚本，node 直连 `@app/chancore` + `@app/indicators`）：600519 +
  方向柱面积 + 黄白线极值绝对值 → 背驰结果人工核对（不固化到仓库、不依赖 HTTP）。
- [ ] 7.4 仓库基线全绿：lint / typecheck / test:ci / ci:contracts / build:docker /
  openspec validate --all --strict。
- [ ] 7.5 检索 `libs/chancore`、`libs/indicators` 无 TypeORM/Redis/HTTP/Nest/env/persistence import；
  未恢复 Chan persistence；`POST /v1/indicators/macd` 等 HTTP 契约无变化；`algorithmVersion` 保持 2。
- [ ] 7.6 向项目负责人审阅 validation evidence 后才归档。
