# Design — add-chan-duan-channel

## 1. 背景与基线

- 段（Duan）已就绪：`createDuan(bis: ChanBiTwoPhaseResult): ChanDuan[]`，输出交替方向的确认段 +
  末尾未完成尾段。组合 `createDuan(createBi(k).phaseB)`。
- 笔级中枢（`internal/channel.ts` `ChannelCalculator`）是成熟的两阶段算法：
  Phase A 固定 5 笔滑窗枚举 + Phase B 延伸（±2 笔）+ 重合合并（`mergeSpans`）。
- **中枢无方向（缠论原典，17课）**：中枢 = "至少三个连续次级别走势类型所**重叠的部分**"——是区域；
  方向（上涨/下跌）属于**趋势**（2 个以上同向中枢的连接），不属于中枢本身。故段级中枢**无方向**、
  几何用**对称重叠**。
- `ChannelLevel.Duan` 目前是死枚举，本 change 接线（段级中枢 `level=Duan`）。
- 段级中枢是**纯增量**：不改 `mergeK/findFenxings/createBi/createChannels/createDuan` 输出；无持久化；
  `algorithmVersion` 保持 1。

## 2. 段级中枢算法（结构同构笔级中枢，几何对称无方向）

输入：段序列（`ChanDuan[]`，交替方向 + 尾段）。输出：`ChanDuanChannel[]`。

- **Phase A（枚举）**：固定 3 段滑窗枚举所有基础段级中枢——趋势交替 + **对称重叠有效**（zg > zd）。
  每个起点都尝试，步进 1。（原典：中枢 = "至少三个连续次级别走势类型所重叠的部分"——3 段即可，
  非 5 段窗口，无进入/离开段框架。）
- **Phase B（延伸 + 重合合并）**：对每个候选，首尾各延伸 2 段（成对，重算对称重叠合法则延伸）；
  再 `mergeSpans` 按时间+价格双重叠合并（短跨度优先 + 最左优先固定点）。
- **对称重叠几何（无方向）**：对构成中枢的段（枚举窗口/延伸后的段）：
  `zg = min(段高点)`、`zd = max(段低点)`、`gg = max(段高点)`、`dd = min(段低点)`；
  有效条件：`zg > zd`（存在重叠区间）且构成段 ≥ 3。
  **无首末段突破约束、无进入/离开方向**（原典：中枢=重叠区间本身）。
- **复用 `mergeSpans`**（`internal/span-merge.ts` 泛型不动点驱动器）——与笔级中枢同一驱动器。

> 段序列天然交替（`createDuan` 保证），尾段（UnComplete）由枚举/延伸逻辑自然消化
> （不足 5 段不成中枢、延伸受对称重叠有效性约束）。

## 3. 确认门禁点

| ID | 决策 | 定案/推荐 | 说明 |
|----|------|----------|------|
| D1 | 算法结构 | **3 段滑窗枚举**（原典：至少三个连续次级别走势类型重叠）+ 延伸 + 重合合并（复用 `mergeSpans`），**几何对称无方向** | 非 5 段窗口 |
| D2 | 实现路径 | **P2 独立 `DuanChannelCalculator`**（对称几何与笔级方向性几何不同，泛化收益低；笔级零风险、**无需 differential**） | 备选 P1 泛化：需注入几何函数，复杂度高 |

> **代码编排**（用户 08-14 指令）：`DuanChannelCalculator` 的方法组织**镜像笔级 `ChannelCalculator`**
> （`enumerateChannels → detectChannel → validateChannelGeometry → extendChannel → mergeChannels` +
> `mergeSpans` 谓词），仅输入为段、几何为对称重叠、窗口为 3 段、无 `trend`。若某处确实无法一致，
> 不强求（用户：实在不一样也无所谓）。
| D3 | 输出结构 | **独立 `ChanDuanChannel`，无 `trend` 字段**（中枢无方向） | 零破坏现有 `bis` 契约 |
| D4 | facade 入参 | `createDuanChannels(duans: readonly ChanDuan[])`（= `createDuan` 返回值，组合式） | — |
| D5 | 输出形态 | `{ phaseA, phaseB }`（中枢两阶段：枚举候选/合并成品，对齐 `createChannels`） | 单数组备选（待用户确认） |
| D6 | `algorithmVersion` | 保持 1（纯增量） | — |
| D7 | `ChannelLevel.Duan` 接线 | 段级中枢 `level=duan`；更新 "stays unwired" 约束 | — |

## 4. Contracts（library-owned 类型）

```ts
export interface ChanDuanChannel {
  readonly duans: readonly ChanDuan[];   // 构成中枢的段（含枚举窗口/延伸后的段）
  readonly zg: number;                   // 中枢上沿 = min(duans 高点)
  readonly zd: number;                   // 中枢下沿 = max(duans 低点)
  readonly gg: number;                   // 中枢最高 = max(duans 高点)
  readonly dd: number;                   // 中枢最低 = min(duans 低点)
  readonly level: ChannelLevel;          // = ChannelLevel.Duan（接线）
  readonly type: ChannelType;
  readonly status: ChannelStatus;
  readonly startId: number;              // 原始 K id（段覆盖起点）
  readonly endId: number;
  readonly displayStartId: number;       // 首段中间位置原始 K id
  readonly displayEndId: number;
}

export interface ChanDuanChannelTwoPhaseResult {
  readonly phaseA: readonly ChanDuanChannel[];
  readonly phaseB: readonly ChanDuanChannel[];
}
```

- `ChanDuanChannel` 镜像 `ChanChannel`（`bis` → `duans`、`level=Duan`），**无 `trend`**（中枢无方向）。
- barrel 导出新类型；不导出 internal calculator。

## 5. Facade

```ts
static createDuanChannels(duans: readonly ChanDuan[]): ChanDuanChannelTwoPhaseResult {
  // duans（createDuan 返回值）→ 5 段滑窗枚举（对称重叠）→ 延伸 → mergeSpans 重合合并
}
```

- 入参 = `createDuan` 返回值；组合 `createDuanChannels(createDuan(createBi(k).phaseB))`。
- 空输入：`{ phaseA: [], phaseB: [] }`，非错误。

## 6. HTTP 端点

`POST /v1/chan/duan-channel`（≡ `/v1/chan/channel` 模式）：service 组合
`createBi → createDuan → createDuanChannels`，返回 `{ phaseA, phaseB }`（`DuanChannelVo` 递归 `high/low`）。
新端点为**新增路由**，非破坏性。

## 7. 边界与非目标

- **不做**：背驰、买卖点、持久化、数据库 migration、改现有算法输出、恢复 Chan persistence、
  修改笔级中枢（含其方向性几何，冻结不动）。
- 段级中枢为请求时实时派生（`chan-derived-analysis-lifecycle`）；不新增 Compose service。
- 段级中枢消费**确认后的段**（含尾段）；不做多级别递归。

## 8. 验证策略

- 段级中枢 pure 单测：5 段滑窗枚举、对称重叠（zg=min 高点/zd=max 低点）、延伸、重合合并、
  `zg === zd` 无效、display ID 为原始 K、空输入、尾段消化、交替方向。
- characterization fixture：用真实数据构造含 ≥5 段（能成段级中枢）的走势（600519 日 K 需更长窗口，
  或 30m/其他证券）固化 fingerprint。
- HTTP contract test：`/v1/chan/duan-channel` 递归 `high/low`、OpenAPI 正确。
- 仓库基线：lint / typecheck / test:ci / ci:contracts / build:docker / openspec validate --all --strict。
- **无需 differential**（P2 独立实现，不触及笔级中枢）。
