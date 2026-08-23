# Proposal: fix-chan-central-expansion-condition

## 背景

`audit-chancore-algorithms`（2026-08-23）用真实 TDX/QMT 数据审计 chancore 全链路，§6 发现
**中枢扩张判定缺陷**：`libs/chancore/src/internal/central-expansion.ts` 的 `isCentralExpansion`
只检查两个中枢的**波动区间**（`dd..gg`）重叠，漏掉了缠论第 20 课中心定理二的**中枢区间**
（`zd..zg`）严格分离条件。

真实数据复现（600519 TDX 日线 2024-01~2026-08）：
- Phase C 输入为两个中枢：B0（2024-05-06~09-18，区间 [1310.47, 1393.49]）、B1（2024-11-07~2025-02-05，区间 [1385.34, 1438.16]）
- 两中枢**中枢区间重叠** [1385.34, 1393.49]（同一价位区间被 round trip 重新访问），波动区间重叠
- 现行判定：波动重叠 → 扩张 → 错误合并为 1 个 12 笔 expanded 巨型中枢（用户肉眼判断"太夸张"）
- 按原文中心定理二：`后ZG < 前ZD`（1393.49 < 1385.34）不成立 → **不构成扩张**

段级（`createDuanChannels`）同缺陷：600519 段级 Phase A 7 个中枢被链式合并为 1 个
2024-01~2026-08 全区间巨型中枢。

## 目标

修正 `isCentralExpansion` 判定为**原文精确条件**：中枢区间严格分离 + 波动区间重叠（含相切），
笔级/段级通修。**保留现有合并架构**（Phase C `resolveCentralExpansions` + `expanded` 高级别
中枢产物 + 背驰趋势链消费方式均不变），只改判定条件。

## 范围

| 项 | 说明 |
|----|------|
| `central-expansion.ts` | `isCentralExpansion` 判定 + `CentralRangeItem` 接口扩展（增加 `zd`/`zg`） |
| `central-expansion.spec.ts` | 判定正例/负例重造（按原文条件），合并/归并测试保留 |
| `chan-full-output.characterization*` | 笔级 fixture 输出变化 → 重新生成快照并说明；`algorithmVersion` 2 → 3 |
| `divergence.ts` 注释 | "phaseB 相邻波动区间严格不重叠"假设表述更新（逻辑不改） |
| spec delta | `chan-central-extension`（判定条件 + 保证条款）、`chan-divergence`（上游保证表述） |

## 非目标

- **不加"相邻性"阈值**（笔数/时间 gap）：原文无此概念，真实趋势中相邻中枢连接段可达 3~11 笔，
  阈值会误杀真扩张；如以后真实数据出现误合并，拿具体 case 回来迭代
- **不处理段级 Phase B 重复中枢**（真实数据下 mergeSpans 产 7 个互相重叠的宽段中枢）：
  修复后会被暴露为已知风险，本次仅记录，不修
- 不改 `mergeBiCentralExpansion`/`mergeDuanCentralExpansion` 的合并几何
  （`zd/zg` = 波动重叠区，符合 29 课 A~ 高级别中枢语义）
- 不改 `mergeK/findFenxings/createBi/createDuan` 输出
- 不修改消费端 `DivergenceDetector`/`BuySellPointDetector` 逻辑
  （趋势链靠位置递进断链，已验证不依赖"相邻严格分离"保证）

## 依据

缠论第 20 课中心定理二原文（`audit-chancore-algorithms/evidence/chan-textbook-excerpts.md`，
逐字引自 `stockServ/chzhshch-108-plus`）：

> 前后同级别的两个缠中说禅走势中枢，后GG〈前DD等价于下跌及其延续；后DD〉前GG等价于上涨及其延续。
> **后ZG<前ZD且后GG〉=前DD，或后ZD〉前ZG且后DD=<前GG，则等价于形成高级别的走势中枢。**
