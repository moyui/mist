## 1. 范围与契约门禁

- [ ] 1.1 确认本 change 只交付段级中枢（以段为构成单元的中枢，**对称重叠无方向**）；不做背驰/买卖点/
  持久化/migration/改现有算法。
- [ ] 1.2 逐条确认 design.md 门禁点 D1–D7（结构同构+对称几何、P2 独立实现、无 trend 输出、facade 入参、
  输出形态、algorithmVersion、ChannelLevel.Duan 接线），确认后才进实施计划。
- [ ] 1.3 确认段级中枢消费 `createDuan` 返回值（`ChanDuan[]`，组合
  `createDuanChannels(createDuan(createBi(k).phaseB))`），与 `createDuan` 收 `createBi` 返回值的 `phaseB`（ChanBi[]）的模式一致。
- [ ] 1.4 确认段级中枢请求时实时派生、persistence-free；不恢复 Chan persistence。
- [ ] 1.5 建立段级中枢 characterization fixture（需含 ≥5 段能成中枢的真实走势：600519 日 K 加长窗口，
  或 30m/其他证券）与 full-output fingerprint。

## 2. Contracts（library-owned 类型）

- [ ] 2.1 新增 `ChanDuanChannel`（duans/zg/zd/gg/dd/level=Duan/type/status/startId/endId/
  displayStartId/displayEndId，**无 trend**）与 `ChanDuanChannelTwoPhaseResult`（按 design §4）。
- [ ] 2.2 barrel `src/index.ts` 导出新类型；不导出 internal calculator。

## 3. 段级中枢算法（结构同构笔级中枢，几何对称无方向）

- [ ] 3.1 新增 `internal/duan-channel.ts` `DuanChannelCalculator.createDuanChannels(
  duans: readonly ChanDuan[]): ChanDuanChannelTwoPhaseResult`（**P2 独立实现**，不触及笔级 ChannelCalculator）。
- [ ] 3.2 对称重叠几何：`zg = min(构成段高点)`、`zd = max(构成段低点)`、`gg = max(构成段高点)`、
  `dd = min(构成段低点)`；有效条件 `zg > zd` 且构成段 ≥ 3；**无首末段突破约束、无方向**。
- [ ] 3.3 Phase A：固定 3 段滑窗枚举（趋势交替 + 对称重叠有效 zg>zd），每个起点尝试，步进 1。
- [ ] 3.4 Phase B：延伸（首尾 ±2 段成对，重算对称重叠合法则延伸）+ `mergeSpans` 重合合并
  （时间+价格双重叠、短跨度优先 + 最左优先）。
- [ ] 3.5 尾段（UnComplete）自然消化：不足 3 段不成中枢、延伸受对称重叠约束。
- [ ] 3.6 `zg === zd` 判无效；display ID 为原始 K（段 originIds 中位）。

## 4. Facade

- [ ] 4.1 `ChanCore.createDuanChannels(duans: readonly ChanDuan[]): ChanDuanChannelTwoPhaseResult`。
- [ ] 4.2 空输入：`{ phaseA: [], phaseB: [] }`，非错误。
- [ ] 4.3 不导出 internal calculator；`algorithmVersion` 保持 1。

## 5. ChannelLevel.Duan 接线

- [ ] 5.1 段级中枢 `level = ChannelLevel.Duan`；更新 `add-chan-duan-segment` 的 "Duan-level Channel enum
  stays unwired" 约束（改由本 change 接线）。

## 6. HTTP 端点

- [ ] 6.1 `chan.controller.ts` 新增 `POST /v1/chan/duan-channel`（≡ `/v1/chan/channel` 模式），service 组合
  `createBi → createDuan → createDuanChannels`，返回 `{ phaseA, phaseB }`。
- [ ] 6.2 VO/mapper：`DuanChannelVo` 递归 `high/low`（duans → originBis → ...），无 `highest/lowest`；
  **无 trend 字段**。
- [ ] 6.3 OpenAPI response schema 正确；contract test 断言字段存在/旧字段缺失。

## 7. 验证与交付

- [ ] 7.1 段级中枢 pure 单测：3 段滑窗、对称重叠（zg=min 高点/zd=max 低点）、延伸、重合合并、
  `zg === zd` 无效、display ID、空输入、尾段消化、交替方向。
- [ ] 7.2 现有 5 方法 fingerprint 不变（`createDuanChannels` 为纯新增，不改任何现有方法）。
- [ ] 7.3 真实走势 fixture：含 ≥5 段能成段级中枢的走势上的指纹固化。
- [ ] 7.4 HTTP contract test：`/v1/chan/duan-channel` 递归 `high/low`、OpenAPI 正确。
- [ ] 7.5 仓库基线全绿：lint / typecheck / test:ci / ci:contracts / build:docker / openspec validate --all --strict。
- [ ] 7.6 检索无 TypeORM/Redis/HTTP/Nest/env/persistence import 于 `libs/chancore`；未恢复 Chan persistence。
- [ ] 7.7 向项目负责人审阅 validation evidence 后才归档。
