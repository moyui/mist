## Why

当前缠论能力停在 **笔(Bi) + 笔级别中枢(Channel)**，缺**段(Duan/线段)**。缠论的严格依赖链是
`笔 → 段 → 背驰 → 买卖点`，段是背驰与买卖点的前置。本 change **只做段**，为后续 ②背驰（独立
change，笔/段复用）、③买卖点（change）、以及段级中枢（独立 change）打地基。

段建在**现行宽笔**上（宽笔 = 缠论标准新笔，已锁定；权威来源确认段对笔的宽/严格模式鲁棒，故不做
严格笔/config，避免 YAGNI）。段是**纯增量**：新增 `ChanCore` facade 方法与类型，不修改
`mergeK/findFenxings/createBi/createChannels` 任何现有输出，不动数据库（governance §6.6：Chan 为
请求时实时派生，不写 MySQL）。

## What Changes

- `ChanCore` 新增 `createDuan(bis)`：**入参 = `createBi` 的返回值 `ChanBiTwoPhaseResult`**（段显式消费笔的
  两阶段结果，组合方式 `createDuan(createBi(k))`，非原始 K、非只传 phaseB）；**返回确认后的 `ChanDuan[]`
  单数组**（无 phaseA/phaseB envelope）。`ChanDuan` 镜像 `ChanBi` 字段（端点从分型升为笔、构成单元从 K 升为笔）。
- 段算法 = **标准特征序列法**（缠中说禅第67课原典），**不采用现有两阶段 / `mergeSpans` 范式**——
  特征序列法是"单遍递推 + 包含处理 + 分型 + 缺口两种情况（第二种带回溯倒推）"，与笔的栈式归约同类，
  不是中枢的"枚举候选 + 不动点合并"。
- 算法步骤（详见 design）：沿笔序列递推 → 维护当前段方向与特征序列（向上段取向下笔、向下段取向上笔）
  → 特征序列做包含处理（复用 K 线包含关系思想）→ 识别分型（向上段只看顶分型）→ 第一第二元素间有无
  缺口：无缺口（第一种）直接确认段结束；有缺口（第二种）暂存，等反方向新特征序列也出分型才倒推确认。
- 新增 library-owned 类型：`DuanType`、`DuanStatus`、`ChanDuan`（镜像 `ChanBi`）。特征序列/分型为算法内部
  中间态，不单独暴露（≡ 笔的 `findFenxings` 是独立 facade，不塞进 `createBi` 结果）。
- 新增 HTTP 端点 `POST /v1/chan/duan`，返回确认后的 `DuanVo[]`（单数组，无 phaseA/phaseB），递归遵守现有
  `high/low` 契约。
- `algorithmVersion` **保持 1**：段为纯增量，不改现有 4 个 facade 结果。
- **明确不包含**：段级中枢（`createDuanChannels`/`ChanDuanChannel`/泛化 `ChannelCalculator`，独立
  change）、背驰、买卖点、力度/MACD/量价、严格笔/config、Chan 持久化、数据库 migration、对现有
  笔/中枢/分型/K 合并算法的任何语义修改。
- **不接线 `ChannelLevel.Duan`**：该枚举只服务于段级中枢，段级中枢延后，故本 change 保持其为死值，
  `chan-analysis-core` 的 "Current Channel scope is preserved" 约束不动。

## Capabilities

### New Capabilities

- `chan-duan-segment`：定义段(Duan)算法（标准特征序列法）与 `ChanDuan`/`ChanDuanTwoPhaseResult` 契约
  （返回结果对齐笔）。

### Modified Capabilities

- `chan-analysis-core`：facade 增加 `createDuan` 与 `ChanDuan`/`ChanDuanTwoPhaseResult` 输出契约。**不**放宽
  Duan 级中枢禁令（段级中枢不在本 change 范围）。
- `chan-analysis-http-contract`：`/v1/chan/duan` 纳入 `high/low` 递归契约。
- `chan-derived-analysis-lifecycle`：段同样为请求时派生、persistence-free。

## Impact

- **`mist`**：`libs/chancore` 新增段算法（`internal/duan.ts`）、新类型与 barrel 导出、pure 单测；
  `apps/mist/src/chan` 增加 `/v1/chan/duan` 端点、VO/mapper、OpenAPI 与 contract test。
- **Backtest/Realtime/Signal/Alert**：不受影响——它们当前不依赖 `chan.*`，本 change 不把 ChanCore
  反向加入任何 prerequisite gate。
- **算法基线**：段消费 `createBi` 的 Phase B 笔序列（与 `createChannels` 同源宽笔）。特征序列的包含
  处理复用 K 线包含关系**思想**（不一定复用 `KMergeCalculator` 代码，作用对象不同）；分型识别复用
  顶底分型定义。
- **`mist-fe` / `mist-skills`**：新端点为**新增**路由（非破坏性字段迁移），不强制 matching-version
  门禁；段可视化由各自后续 change 决定。
- **数据库 / 部署**：无 migration、无新 Compose service、无部署拓扑变化。
- **后续依赖**：段级中枢、背驰、买卖点各自独立 change，本 change 落地后才具备前置。
