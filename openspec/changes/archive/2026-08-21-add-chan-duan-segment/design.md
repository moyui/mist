# Design — add-chan-duan-segment

## 1. 背景与基线

段建在现行宽笔上。`createBi` 产出严格交替的笔序列（Phase B），段消费该序列。关键事实：
- 现有笔是**缠论标准新笔（宽笔）**：不共用 K + 极值 K 间(不含两端) ≥3 原始 K（不考虑包含）。
  权威来源（知乎·缠中狩猎、博客园）确认这是标准新笔；且段对笔的宽/严格模式鲁棒，故不做严格笔/config。
- 段是**纯增量**，不改 `mergeK/findFenxings/createBi/createChannels`。
- 特征序列法**不复用 `mergeSpans`**（那是中枢/笔 Phase B 的不动点合并范式，特征序列法用不上）。
- **段与笔同构**：段是"笔的上一层"——都是有向线段（起止端点 + high/low + trend + type/status + origin）。
  故段的**返回结果对齐笔**：`ChanDuan` 镜像 `ChanBi` 字段，`createDuan` 返回 `ChanDuanTwoPhaseResult { phaseA, phaseB }`
  （≡ `createBi` 的 `ChanBiTwoPhaseResult`）。**对齐的是返回结果，不是算法内容**——算法仍用标准特征序列法。

## 2. 标准特征序列法（缠中说禅第67课原典）

> 用 S 代表向上笔，X 代表向下笔。以向上笔开始的线段，笔序列为 `S1X1S2X2S3X3…SnXn`。
> 序列 `X1X2…Xn` 称为以向上笔开始线段的**特征序列**。

### 2.1 特征序列定义
- **向上段**：特征序列 = 所有**向下笔 X**；每个元素 = 一根向下笔，其 `high/low` = 该笔高低点。
- **向下段**：特征序列 = 所有**向上笔 S**；每个元素 = 一根向上笔，其 `high/low` = 该笔高低点。
- **缺口**：特征序列两相邻元素间没有重合区间（区间不交集），称为一个缺口。

### 2.2 标准特征序列（包含处理）
> 把每一元素看成一根 K 线，如同一般 K 线找分型，存在包含关系，可做非包含处理。处理后称标准特征序列。

- 对特征序列元素做与 **K 线包含关系合并同构**的处理：相邻元素有重合区间时按方向合并
  （向下特征序列取高点最高/低点较高；向上特征序列取低点最低/高点较低——与现有 K 线包含口径一致）。
- **复用方式**：复用 K 线包含关系的**判定与合并口径**（思想与现有 `KMergeCalculator` 一致），但作用对象是
  "笔区间（high/low）"；是否直接复用 `KMergeCalculator` 代码留到实施计划评估（笔区间只有 high/low 两字段，
  可能比 K 线更简，独立小函数更清晰）。

### 2.3 分型
- 参照一般 K 线分型定义，在标准特征序列上识别顶/底分型。
- **向上段只考察顶分型**；**向下段只考察底分型**。

### 2.4 第一、第二元素（第71课）
- 第一元素 = 该假设转折点前线段的**最后一个特征元素**。
- 第二元素 = 从该转折点开始的**第一笔**（与第一元素同方向）。

### 2.5 线段结束的两种情况
- **第一种（无缺口）**：顶分型的第一、第二元素间**无缺口** → 线段在该顶分型**高点处结束**。
- **第二种（有缺口）**：第一、第二元素间**有缺口** → 必须**从该高点向下一笔开始的新特征序列也出现底分型**，
  才能倒推原线段在该高点结束（"第三线段成立倒推第二线段成立"）。
- 核心结论：特征序列出现分型是线段结束的**必要条件**；线段破坏的充要条件 = 被另一线段破坏。

## 3. 算法结构：单遍递推 + 受限回溯（非两阶段合并）

```
沿笔序列递推
  ├─ 维护「当前段方向」+「当前特征序列」（向上段收集向下笔，向下段收集向上笔）
  ├─ 每进一根反向笔 → 追加为特征序列元素 → 做包含处理 → 在标准特征序列上找分型
  ├─ 命中分型 → 取第一/第二元素，判断缺口
  │    ├─ 第一种（无缺口）→ 确认当前段在分型极值处结束；翻转方向，开新段
  │    └─ 第二种（有缺口）→ 当前段进入「待确认」状态，暂存假设终点
  └─ 处于「待确认」时，继续喂反向笔构造新特征序列
       └─ 新特征序列也出分型 → 倒推确认原段结束（落定）；否则原段继续延伸
```

### 3.1 状态机（实现核心）
- `direction`：当前段方向（up/down）。
- `featureSequence`：当前标准特征序列（含处理后元素）。
- `pending`：第二种情况下的「待确认段」候选（假设终点 + 暂存反向特征序列）。

转移：正常延伸 / 第一种直接确认 emit / 第二种进入 pending 后倒推 emit 或撤销延伸 / 末端未确认 emit 为 `UnComplete` 尾段。

### 3.2 为什么不复用两阶段 / mergeSpans
特征序列法是**顺序依赖 + 有回溯**的：第二种情况依赖"未来"反向特征序列确认，无法先枚举后合并。硬套两阶段
会破坏标准语义，故段用独立状态机递推实现（不复用 `mergeSpans`）。

### 3.3 phaseA / phaseB 语义（对齐笔的返回形态）
段的算法虽非"枚举+合并"两阶段，但返回结果对齐笔的 `{ phaseA, phaseB }` 形态，语义定义为：
- **phaseA**：特征序列分型识别出的**候选段**——每个段方向内由标准特征序列分型直接推出的段边界
  （未经缺口第二种情况回溯确认的"乐观"结果）。
- **phaseB**：经缺口两种情况（含第二种回溯倒推）**确认后的最终段**——phaseA 的候选经回溯落定/撤销后的成品。
- 这与笔的"phaseA 局部归约候选 / phaseB 全局确认成品"是同构的返回语义，便于消费者用同一套两阶段消费模式。

> phaseA/phaseB 的精确切分（如 pending 段在 phaseA 中如何表示）在实施计划阶段细化；本 spec 锁定
> "返回 `{ phaseA, phaseB }` 对齐笔、phaseA=特征序列分型候选、phaseB=回溯确认成品"。

### 3.4 复用点
- **包含关系判定/合并口径**：复用 K 线包含思想（§2.2）。
- **分型定义**：复用顶/底分型（中间元素极值）。
- **不变量与校验**：复用 `ChanK` 序列校验、`ChanInputError/ChanInvariantError`、价格比较口径（严格/非严格
  JS number、Date 毫秒、ID 精确整数；不引入 epsilon/rounding/Decimal）。

## 4. Contracts（library-owned 类型，对齐 ChanBi）

段与笔同构，`ChanDuan` 镜像 `ChanBi` 字段（端点从分型升为笔、构成单元从 K 升为笔）。新增于
`libs/chancore/src/contracts.ts`：

```ts
export enum DuanType { UnComplete = 'uncomplete', Complete = 'complete' }   // ≡ BiType
export enum DuanStatus { Unknown = 0, Valid = 1, Invalid = 2 }              // ≡ BiStatus

export interface ChanDuan {
  readonly startTime: Date;            // ≡ ChanBi.startTime（起点笔端点时间）
  readonly endTime: Date;              // ≡ ChanBi.endTime（终点笔端点时间）
  readonly high: number;               // ≡ ChanBi.high（段覆盖最高）
  readonly low: number;                // ≡ ChanBi.low（段覆盖最低）
  readonly trend: TrendDirection;      // ≡ ChanBi.trend
  readonly type: DuanType;             // ≡ ChanBi.type（Complete / UnComplete 尾段）
  readonly status: DuanStatus;         // ≡ ChanBi.status
  readonly independentCount: number;   // ≡ ChanBi.independentCount（段覆盖独立 K 计数）
  readonly originIds: readonly number[];   // ≡ ChanBi.originIds（段覆盖的原始 K，笔 originIds 有序去重）
  readonly originBis: readonly ChanBi[];   // ≡ ChanBi.originData 的上一层（构成段的笔序列）
  readonly startBi: ChanBi | null;     // ≡ ChanBi.startFenxing 的上一层（起点笔）
  readonly endBi: ChanBi | null;       // ≡ ChanBi.endFenxing 的上一层（终点笔；Complete 非 null，尾段 null）
}

export interface ChanDuanTwoPhaseResult {       // ≡ ChanBiTwoPhaseResult
  readonly phaseA: readonly ChanDuan[];
  readonly phaseB: readonly ChanDuan[];
}
```

- `DuanType/DuanStatus` 与 `BiType/BiStatus` 同构（是否合并为通用枚举留到实施计划评估；倾向独立命名以保清晰）。
- barrel `src/index.ts` 导出新枚举/类型；不导出 internal calculator。

## 5. Facade

```ts
static createDuan(orderedK: readonly ChanK[]): ChanDuanTwoPhaseResult {
  // assertChanKSeries → mergeK → Bi(phaseB) → DuanCalculator.createDuan(bis.phaseB)
}
```

- 段消费 `createBi` 的 Phase B（与 `createChannels` 同源宽笔），不复算笔。
- 空序列：`{ phaseA: [], phaseB: [] }`（≡ 笔/中枢空输入契约），非错误。
- `algorithmVersion` 保持 1（纯增量，不改现有结果）。

## 6. HTTP 端点

`apps/mist/src/chan/chan.controller.ts` 新增 `POST /v1/chan/duan` → `createDuan`，返回 `{ phaseA, phaseB }`
（≡ `/v1/chan/bi`）。VO/mapper 递归 `high/low`（含 `originBis` 递归），无 `highest/lowest`。新端点为**新增路由**，
非破坏性，不触发 `mist-fe`/`mist-skills` matching-version 门禁。

## 7. 边界与非目标

- **不做**：段级中枢、背驰、买卖点、力度/MACD/量价、严格笔/config、Chan 持久化、数据库 migration、
  现有算法语义修改。
- **不接线 `ChannelLevel.Duan`**：该枚举只服务于段级中枢，本 change 不做，保持其为死值，
  `chan-analysis-core` 的 "Current Channel scope is preserved" 约束不动。
- **不改**：现有 `mergeK/findFenxings/createBi/createChannels` 与 `/v1/chan/merge-k|fenxing|bi|channel`。
- 段为**请求时实时派生、persistence-free**（`chan-derived-analysis-lifecycle`）。

## 8. 验证策略（实施计划阶段细化）

- 段算法 pure 单测：特征序列构造、包含处理、分型、第一种（无缺口）确认、第二种（有缺口）回溯倒推、
  末端未确认尾段、空输入、乱序/重复 K（经 facade 前置校验拦截）。
- 经典 case fixture：用第67课/社区公认标准段划分样例固化 fingerprint（结构/值/枚举/顺序/null/Date）。
- phaseA/phaseB 切分单测：候选 vs 确认成品的对应关系。
- 段结果 fingerprint 固定，防止未来纯重构改变行为。
- HTTP contract test：`/v1/chan/duan` 返回 `{phaseA,phaseB}`、递归 `high/low`、无 `highest/lowest`、OpenAPI 正确。
- 仓库基线：`pnpm lint:check / typecheck / test:ci / ci:contracts / build:docker / openspec validate --all --strict`。

## 9. 确认门禁点

| ID | 决策 | 定案 |
|----|------|------|
| D1 | 段算法 | 标准特征序列法（第67课），单遍递推 + 第二种情况回溯状态机；不复用两阶段/mergeSpans |
| D2 | 段输出 | **对齐笔**：`ChanDuan` 镜像 `ChanBi`；`createDuan` 返回 `ChanDuanTwoPhaseResult { phaseA, phaseB }`；phaseA=特征序列分型候选，phaseB=回溯确认成品 |
| D3 | `algorithmVersion` | 保持 1 |
| D4 | capability 拆分 | 1 新（`chan-duan-segment`，段 only）+ 3 改（core/http/lifecycle） |
| D5 | 笔定义 | 保持现行宽笔（标准新笔），不做严格笔/config |
| ~~段级中枢~~ | 不在本 change 范围（spec 不提） | — |
