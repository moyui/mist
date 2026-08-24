# Proposal: fix-chan-central-expansion-condition

## Why

`audit-chancore-algorithms`（2026-08-23）用真实 TDX/QMT 数据审计 chancore 全链路，§6 发现
**中枢扩张误判与区间漂移缺陷**：
1. **判定层缺陷**：`libs/chancore/src/internal/central-expansion.ts` 的 `isCentralExpansion`
   只检查两个中枢的**波动区间**（`dd..gg`）重叠，漏掉了缠论第 20 课中心定理二的**中枢区间**
   （`zd..zg`）严格分离条件（`后ZG < 前ZD` 或 `后ZD > 前ZG`）。
2. **延伸层语义缺陷**：`channel.ts` 与 `duan-channel.ts` 的 `extendChannel` 在同级别延伸时，
   使用 `validateChannelGeometry(延伸后所有单元)` **重算 `zd/zg`**。在缠论原典语义下，
   中枢核心区间由前 3 个次级别走势（或基础结构）重叠确定后**永久固定**，延伸只更新波动极值
   `gg/dd` 与时间边界（开源实现 czsc/chan-lun 均遵循此语义）。延伸重算区间导致区间随震荡漂移，
   在段级滑窗中人为制造出"区间分离但波动重叠"的假中枢对。

真实数据复现（600519 TDX 日线 2024-01~2026-08）：
- 笔级：B0（区间 [1310.47, 1393.49]）与 B1（区间 [1385.34, 1438.16]）中枢区间重叠，因旧判定只看波动重叠被错误合并为 1 个 12 笔 expanded 巨型中枢。
- 段级：同一段序列在滑窗步进 1 与延伸重算区间双重作用下产生区间漂移假对（M0 [1421.14, 1475.04] 与 M1 [1362.02, 1363.35]），因共享暴涨段撑大波动极值，被旧判定链式合并为 1 个覆盖 2024-01~2026-08 整整两年的全区间巨型中枢。

## What Changes

1. **修正中枢延伸语义（区间固定）**：基础中枢由前 3 段（段级）或基础结构（笔级）一次性确立 `[zd, zg]`，同级别延伸过程中严禁重算 `zd/zg`，仅更新波动极值 `gg/dd` 与边界，延伸合法性仅检验新增走势是否触及固定的 `[zd, zg]`。
2. **修正中枢扩张判定（中心定理二）**：`isCentralExpansion` 判定对齐原文精确条件：中枢区间严格分离（`max(prev.zd, next.zd) > min(prev.zg, next.zg)`）且波动区间重叠/相切（`max(prev.dd, next.dd) <= min(prev.gg, next.gg)`），笔级/段级通修。
3. **升级算法版本与快照**：`ChanCore.algorithmVersion` 2 → 3，重新生成 characterization fixture。

## 范围

| 项 | 说明 |
|----|------|
| `duan-channel.ts` | `extendChannel` 修正为区间固定语义（仅更新 `gg/dd` 与边界，不再重算 `zd/zg`） |
| `channel.ts` | `extendChannel` 修正为区间固定语义（仅更新 `gg/dd` 与边界，不再重算 `zd/zg`） |
| `central-expansion.ts` | `isCentralExpansion` 判定 + `CentralRangeItem` 接口扩展（增加 `zd`/`zg`） |
| 单测套件 | `channel.spec.ts`、`duan-channel.spec.ts`、`central-expansion.spec.ts` 适配与正反例重造 |
| `chan-full-output.characterization*` | fixture 快照重新生成并说明差异；`algorithmVersion` 2 → 3 |
| `divergence.ts` 注释 | "phaseB 相邻波动区间严格不重叠"假设表述更新（逻辑不改） |
| spec delta | `chan-central-extension`（延伸区间不变性 + 扩张判定精确条件 + 保证条款更新）、`chan-divergence` |

## 非目标

- **不加"相邻性"距离阈值**（笔数/时间 gap）：原文无此人工阈值，真实趋势中相邻中枢连接段跨度不一，由区间分离与走势结构自洽处理。
- 不改 `mergeBiCentralExpansion`/`mergeDuanCentralExpansion` 的合并几何（`zd/zg` = 波动重叠区，符合 29 课 A~ 高级别中枢语义）。
- 不改 `mergeK/findFenxings/createBi/createDuan` 输出。
- 不修改消费端 `DivergenceDetector`/`BuySellPointDetector` 核心逻辑（已验证趋势链靠位置递进断链，买卖点依赖固定区间反而更精准）。

## 依据

1. **缠论第 20 课《走势中枢级别扩张及第三类买卖点》**（`audit-chancore-algorithms/evidence/chan-textbook-excerpts.md`）：
   - 中枢指标定义：`ZG = min(g1, g2), ZD = max(d1, d2)`，`[ZD, ZG]` 为中枢区间；
   - 中心定理一（延伸）：走势中枢的延伸等价于任意区间 `[dn, gn]` 与 `[ZD, ZG]` 有重叠；
   - 中心定理二（扩张）：`后ZG < 前ZD 且 后GG >= 前DD`，或 `后ZD > 前ZG 且 后DD =< 前GG`，等价于形成高级别的走势中枢。
2. **开源实现先例**：`czsc` 与 `chan-lun` 均严格遵循“前三段确定 `[zd, zg]` 后固定，延伸仅更新 `gg/dd`”语义。
