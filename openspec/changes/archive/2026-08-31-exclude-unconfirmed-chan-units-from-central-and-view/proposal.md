# Proposal: exclude-unconfirmed-chan-units-from-central-and-view

## Why

用户对"未确认结构"拍板的规则：**未确认的笔/段在数据层可以保留，但不能进入中枢统计，
也不能画在界面上**（买卖点暂缓）。实证（全量 2832 根 K，master `algorithmVersion=5`）：

| 链路 | 现状 | 差距 |
|------|------|------|
| 数据层 | `createBi` phaseB 输出未确认尾笔与 `invalid` 笔（qmt 1 根 / tdx 4 根）；`createDuan` 输出 `endBi=null` 尾段 | ✅ 保留（符合规则） |
| 笔级中枢 | 全量 vs 剔除 invalid/未确认 → 输出一致（尾/边笔构不成三笔重叠） | ✅ 已等价于规则 |
| **段级中枢** | 全量=4 vs 剔除尾段=4，**输出不一致** | ❌ **未完成尾段真实参与了中枢**（Phase A/延伸/合并） |
| 笔级买卖点 | `chan-bsp.pipeline` `units='bi'` 分支直接消费 `phaseB`（含 invalid + unknown 尾笔） | ❌ 宽笔失败候选进入买卖点输入（回测 28 的 08-27 14:05~14:15 笔即此类） |
| 可视化 | `chan-visual.adapter.ts` 画全部笔与段（无 status 过滤 + `endBi ?? originBis[last]` 实线兜底） | ❌ invalid 笔、未完成尾笔/段都被画（用户看到"14:05~14:15 曾有笔"） |

缠论依据：
- **72 课**：只有"符合被破坏标准"的段才是"不可更改"、可进入结构统计的；"最后一段还没形成"
  （如 08-19 14:45 底所在的 `Dn[147..157]` 尾段）的边界是待定的，用其参与中枢几何会给出
  **无客观性的区间**。保留其作为数据输出，但统计与绘制只认确认单元。
- **18 课**（中枢定义）："次级别的前三个走势类型**都是完成的**才构成该级别的缠中说禅走势中枢"——
  **中枢的构成单元必须是"完成的"走势类型**；未完成笔/未完成段（走势类型未完成）不得进入中枢计算。
- **62 课**（笔定义）：不满足笔定义（"顶和底之间都至少有一 K 线"等）的划分**"这不算一笔"**——
  原文没有"无效笔"概念：宽笔校验失败的候选**不是笔**，不进入任何结构。
- **可视化与中枢**：中枢是"参与计算"的已确认结构；由未确认/无效单元构成的中枢**不得渲染**
  （画出来即暗示其已被确认计算，与上述语义矛盾）——界面只显示确认且有效的单元与其构成的中枢。

## What Changes

1. **段级中枢统计过滤（chancore）**：`createDuanChannels` 输入剔除 `endBi === null` 的未确认尾段
   （在入口对 duans 过滤，Phase A/延伸/合并天然只消费确认段）。数据层 `createDuan` 输出不变。
2. **可视化过滤（visual-command）**：`chan-visual.adapter.ts` 不生成**非确认且有效**单元的画线命令：
   `status !== Valid` 的笔（含 `invalid` 宽笔失败候选与 `unknown` 未完成尾笔）、`endBi === null` 的段
   （删除现有 `endBi ?? originBis[last]` 实线兜底——这是"08-19 14:45 / 08-27 14:05 笔被画出来"观感的
   直接来源）。
3. **买卖点 bi 级输入过滤（signal）**：`chan-bsp.pipeline.ts` 的 `units='bi'` 分支消费 `phaseB` 前过滤
   `status === Valid`（当前 4 根 invalid + 1 根 unknown 尾笔会进入 bi 级买卖点）；
   `units='duan'` 分支的 units 为段（段未被 invalid 笔污染，实测），其 zhongshus 经第 1 条已干净。
4. **版本与快照**：`ChanCore.algorithmVersion` 5 → 6（段中枢口径为行为变化）；
   `chan-core.spec.ts` 断言同步；characterization 两处 fingerprint payload `algorithmVersion` 5→6 重算 SHA。
5. **单测**：`duan-channel.spec.ts` 新增"未确认尾段不参与段中枢"用例；`chan-bi-width-validation` 回归
   （宽笔校验不变）；既有用例（全 Complete 输入）回归不受影响。

## 范围与边界

| 项 | 说明 |
|----|------|
| `libs/chancore/src/internal/duan-channel.ts` | `createDuanChannels` 入口过滤未确认段（最小改动） |
| `libs/visual-command/src/adapters/chan-visual.adapter.ts` | 不画 `status !== Valid` 的笔、`endBi === null` 的段（含删实线兜底） |
| `libs/signal/src/runtime/chan-bsp/chan-bsp.pipeline.ts` | `units='bi'` 分支：构造 units 前过滤 `status === Valid` |
| `libs/chancore/src/chan-core.ts` | `algorithmVersion` 5 → 6 |
| `libs/chancore/src/chan-core.spec.ts` / `chan-full-output.characterization.spec.ts` | 断言与 payload/SHA 同步 |
| `libs/chancore/src/internal/duan-channel.spec.ts` | 新增尾段过滤用例；`chan-bi-width-validation` 回归（宽笔校验不变） |
| 买卖点（duan 分支） | 代码不改（units 为段、实测无 invalid 污染；zhongshus 经段中枢过滤后已干净） |
| 笔级中枢 | `createChannels` 入口显式过滤 `status === Valid`（实测输出与现状一致——invalid/未确认笔当前恰好构不成三笔重叠——显式化以防御未来形态变化） |
| 数据层 | 不改（invalid/未确认单元继续作为 first-class 数据输出） |