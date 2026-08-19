## 1. 范围与契约门禁

- [ ] 1.1 确认本 change 交付：背驰判定共享纯函数（趋势+盘整）、`POST /v1/chan/divergence` 端点；
  共享指标库 `libs/indicators`（computeMacd + computeUnitForces）与 runMACD 薄包装由
  `extract-shared-indicators-library` 交付（本 change 只消费）；不做买卖点/持久化/migration/
  改现有算法/回测与实时接入。
- [ ] 1.2 逐条确认 design.md 门禁点 D1–D8（形态、力度数据源、趋势背驰对比基准、复用方式、
  HTTP 端点、algorithmVersion、indicators 边界、三块接入范围），确认后才进实施计划。
- [ ] 1.3 确认力度数据 = MACD 柱面积，来源 = `@app/indicators`（extract-shared-indicators-library
  交付；调用方计算传入 forces，chancore 不算 MACD）。
- [ ] 1.4 确认背驰为无状态纯函数（请求时实时派生）；不恢复 Chan persistence。

## 2. Contracts（chancore library-owned 类型）

- [ ] 2.1 新增 `ChanDivergenceUnit`、`ChanDivergenceZhongshu`、`ChanDivergenceInput`、
  `ChanDivergenceType`、`ChanDivergence`（按 design §4/§5）。
- [ ] 2.2 barrel `src/index.ts` 导出新枚举/类型；不导出 internal 实现。

## 3. 背驰判定算法（共享纯函数）

- [ ] 3.1 新增 `internal/divergence.ts` `detectDivergences(input: ChanDivergenceInput): ChanDivergence[]`。
- [ ] 3.2 中枢定位：按 firstUnitTime/lastUnitTime 在 units 中精确匹配首/末单元下标（找不到则跳过）。
- [ ] 3.3 进入/离开段识别：进入段 = 中枢前最近一段（s-1）、离开段 = 中枢后最近一段（e+1）；
  边界（s-1<0 或 e+1>=length）跳过。
- [ ] 3.4 盘整背驰：leaveForce < enterForce（严格 <，无 epsilon）→ Consolidation。
- [ ] 3.5 趋势背驰：同向中枢链（≥2 同向、时间连续）判定；按门禁点 D3 基准（推荐：链首中枢进入段 vs
  链末中枢离开段，首尾对比）。
- [ ] 3.6 输出按 zhongshuIndex 排序；确定性、不变异。

## 4. Facade

- [ ] 4.1 `ChanCore.detectDivergences(input: ChanDivergenceInput): readonly ChanDivergence[]`。
- [ ] 4.2 空输入：`[]`，非错误。
- [ ] 4.3 不导出 internal；`algorithmVersion` 保持 1。

## 5. HTTP 端点 `POST /v1/chan/divergence`

- [ ] 5.1 编排（chan.service 或 controller，模式同 duan-channel）：findKData → createBi →
  createDuan → createDuanChannels → computeMacdSeries(closes).histogram + computeUnitForces →
  detectDivergences。
- [ ] 5.2 `DivergenceVo`（type/zhongshuIndex/enterIndex/leaveIndex/enterForce/leaveForce + 进入/离开
  段时间起止）与 `toDivergenceVo` mapper；throttle 与现有 chan 端点同档。
- [ ] 5.3 端点单测：DTO 校验、编排链路、VO 结构；controller OpenAPI spec 同步。

## 6. 验证与交付

- [ ] 6.1 背驰 pure 单测：进入/离开段定位（含边界）、盘整背驰（严格 <）、趋势背驰（首尾对比、
  同向链）、空输入、确定性、不变异。
- [ ] 6.2 经典 case fixture：盘整背驰 / 趋势背驰样例指纹固化。
- [ ] 6.3 真实数据验证（scratch）：600519 + `@app/indicators` MACD 面积 → 背驰结果人工核对
  （不固化到仓库）。
- [ ] 6.4 仓库基线全绿：lint / typecheck / test:ci / ci:contracts / build:docker /
  openspec validate --all --strict。
- [ ] 6.5 检索 `libs/chancore` 无 TypeORM/Redis/HTTP/Nest/env/persistence import；
  未恢复 Chan persistence；`POST /v1/indicators/macd` HTTP 契约无变化。
- [ ] 6.6 向项目负责人审阅 validation evidence 后才归档。
