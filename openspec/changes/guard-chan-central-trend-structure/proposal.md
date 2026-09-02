# Proposal: guard-chan-central-trend-structure

## Why

在缠论中枢识别与震荡延伸生命周期的实际演化中，存在两个影响中枢划分准确性的关键边界问题：
1. **进入笔与离开笔的内外端点约束错误**：
   - 之前在 5 笔基础中枢几何验证中，错误地将进入笔最低点与离开笔最高点与全局极值 $DD, GG$ 进行了比较（`firstBi.low >= dd || lastBi.high <= gg`），导致端点重合时合法中枢被错误丢弃（例如 2026-01-07 见顶回落时，前 2 笔被漏判跳过）。
   - 正统缠论拓扑规则要求：
     - **上升中枢（Up）**：进入笔最低点必须在 $ZD$ 之下（$firstBi.low < zd$），离开笔最高点必须突破 $ZG$（$lastBi.high > zg$）；进入笔最高点与离开笔最低点允许与 $ZG, ZD$ 端点重合；
     - **下跌中枢（Down）**：进入笔最高点必须在 $ZG$ 之上（$firstBi.high > zg$），离开笔最低点必须跌破 $ZD$（$lastBi.low < zd$）；进入笔最低点与离开笔最高点允许与 $ZD, ZG$ 端点重合。
2. **中枢震荡延伸缺少趋势结构极值破坏守卫（Trend Structure Guard）**：
   - 当中枢建立后进入延伸状态机时，仅检查了数学重叠交集是否存在（$allHighMinMax.min > allLowMinMax.max$），缺少了走势方向结构保护；
   - 导致向下中枢在后续反弹笔创出高于中枢起始顶 $GG$ 的历史新高（V 型反转新生向上走势）时，仍被错误当成原向下中枢的内部延伸（例如 2026-01-13 14:50 见底 4126.23 后的暴涨笔 4190.87 > 4179.70 被错误吸纳）。

## What Changes

1. **修正首末笔进出边界几何约束**：
   - 在 `channel.ts` 中，规范化进入笔与离开笔的边界条件：外端点必须在 $[ZD, ZG]$ 之外，内端点允许与边界重合。
2. **增加趋势结构极值破坏守卫（Trend Structure Guard）**：
   - 在中枢成对延伸循环中，加入极值破坏检查：
     - **向下中枢**：延伸笔最高点不得突破中枢起始顶 $GG$（$b.high \le GG$），一旦突破则立即在破坏前密封终结；
     - **向上中枢**：延伸笔最低点不得跌破中枢起始底 $DD$（$b.low \ge DD$），一旦跌破则立即在破坏前密封终结。
3. **升级测试套件与 Characterization 门禁**：
   - 固化 2026-01-07 首个笔中枢与 2026-01-13 第 2 个笔中枢的精确边界用例。

## 范围

| 文件/模块 | 说明 |
|---|---|
| `libs/chancore/src/internal/channel.ts` | 规范化 `validateChannelGeometry` 进出边界与延伸循环中的趋势极值破坏守卫 |
| `libs/chancore/src/internal/channel.spec.ts` | 补充进入/离开端点重合及反向极值破坏测试用例 |
| `libs/chancore/src/chan-full-output.characterization.spec.ts` | 锁定最新中枢输出快照 |
