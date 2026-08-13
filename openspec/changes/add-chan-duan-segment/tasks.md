## 1. 范围与契约门禁

- [ ] 1.1 确认本 change 只交付段(Duan)算法（标准特征序列法 + 特征序列/分型预览）；不交付段级中枢、
  背驰、买卖点、严格笔/config、持久化、数据库 migration、现有算法语义修改。
- [ ] 1.2 逐条确认 design.md 门禁点 D1–D6（段算法标准解法、段级中枢延后、输出形态、algorithmVersion、
  capability 拆分、笔定义保持宽笔），确认后才进入实施计划。
- [ ] 1.3 确认段消费 `createBi` 的 Phase B 笔序列（与 `createChannels` 同源宽笔），不复算、不改笔算法。
- [ ] 1.4 确认段为请求时实时派生、persistence-free（governance §6.6），不恢复任何已删除 Chan persistence。
- [ ] 1.5 确认本 change **不接线 `ChannelLevel.Duan`**（留给段级中枢独立 change），保持其为死值。
- [ ] 1.6 建立段 characterization fixture 与 full-output fingerprint（特征序列、包含处理、分型、第一种/
  第二种情况、末端未确认尾段），以第67课/社区公认标准段划分样例为基线。

## 2. Contracts（library-owned 类型）

- [ ] 2.1 在 `libs/chancore/src/contracts.ts` 新增 `DuanType`、`DuanStatus`、`ChanDuan`、`ChanDuanTwoPhaseResult`
  （按 design §4，`ChanDuan` 镜像 `ChanBi`、`ChanDuanTwoPhaseResult` ≡ `ChanBiTwoPhaseResult`）。
- [ ] 2.2 `ChanDuan` 字段：`startTime/endTime/high/low/trend/type/status/independentCount/originIds/
  originBis/startBi/endBi`（≡ ChanBi，端点/构成单元升一层）；`originIds` = 构成段所有笔 `originIds` 有序去重。
- [ ] 2.3 返回结果对齐笔：`createDuan` 返回 `{ phaseA, phaseB }`；phaseA=特征序列分型候选段、phaseB=回溯确认成品。
- [ ] 2.4 barrel `src/index.ts` 导出新枚举/类型；不导出 internal calculator。

## 3. 段算法（标准特征序列法）

- [ ] 3.1 新增 `internal/duan.ts` `DuanCalculator.createDuan(bis: readonly ChanBi[]): ChanDuanResult`。
- [ ] 3.2 特征序列构造：向上段收集向下笔、向下段收集向上笔为特征序列元素（元素 high/low = 笔高低点）。
- [ ] 3.3 特征序列包含处理：相邻元素有重合区间时按方向合并（向下序列取高点最高/低点较高；向上序列取
  低点最低/高点较高），口径与现有 K 线包含一致；得到标准特征序列。
- [ ] 3.4 分型识别：标准特征序列上识别顶/底分型（向上段只看顶分型、向下段只看底分型）。
- [ ] 3.5 缺口判定：特征序列相邻元素区间是否重合（不重合 = 缺口）。
- [ ] 3.6 第一种情况（无缺口）：分型第一第二元素间无缺口 → 直接确认段在分型极值处结束。
- [ ] 3.7 第二种情况（有缺口）回溯状态机：分型第一第二元素间有缺口 → 段进入「待确认」；继续喂反向笔
  构造新特征序列，新特征序列也出分型 → 倒推确认原段结束；否则撤销、段继续延伸。
- [ ] 3.8 末端未确认：序列耗尽时未落定的段作为 `UnComplete` 尾段 emit（`endBi=null`、`status=unknown`）。
- [ ] 3.9 几何/时间/ID 比较口径与现有一致（严格与非严格 JS number、Date 毫秒、ID 精确整数；不引入
  epsilon/rounding/Decimal）。

## 4. Facade

- [ ] 4.1 `ChanCore.createDuan(orderedK)`：`assertChanKSeries → mergeK → Bi(phaseB) → DuanCalculator`。
- [ ] 4.2 空输入：`{ phaseA: [], phaseB: [] }`（≡ 笔/中枢空输入契约），非错误。
- [ ] 4.3 不导出 internal calculator；`algorithmVersion` 保持 1。

## 5. HTTP 端点

- [ ] 5.1 `chan.controller.ts` 新增 `POST /v1/chan/duan`，返回 `{ phaseA, phaseB }`（≡ `/v1/chan/bi`）。
- [ ] 5.2 VO/mapper：`phaseA/phaseB` 的 `ChanDuan` 递归 `high/low`（含 `originBis` 递归），无 `highest/lowest`。
- [ ] 5.3 OpenAPI response schema 正确引用 VO（非 request DTO）；contract test 断言字段存在/旧字段缺失。

## 6. 验证与交付

- [ ] 6.1 段算法 pure 单测：特征序列、包含处理、分型、第一种（无缺口）、第二种（有缺口）回溯倒推、
  末端未确认尾段、空输入、缺口边界。
- [ ] 6.2 经典 case fingerprint：以第67课/社区公认标准段划分样例固化结构/值/枚举/顺序/null/Date。
- [ ] 6.3 HTTP contract test：`/v1/chan/duan` 递归 `high/low`、OpenAPI 正确、预览字段存在。
- [ ] 6.4 仓库基线全绿：`pnpm lint:check`、`typecheck`、`env TZ=UTC pnpm test:ci`、`ci:contracts`、
  `build:docker`、`openspec validate --all --strict`。
- [ ] 6.5 检索未引入 TypeORM/Redis/HTTP/Nest/env/persistence import 于 `libs/chancore`；未接线
  `ChannelLevel.Duan`；未恢复任何 Chan persistence entity 或 `highest/lowest` 字段。
- [ ] 6.6 向项目负责人审阅段 differential/fingerprint 与 validation evidence 后才归档。
