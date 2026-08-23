# Tasks: fix-chan-central-expansion-condition

> 前置：audit-chancore-algorithms 已归档证据（`evidence/chan-textbook-excerpts.md` 第 20 课
> 中心定理二原文、`evidence/problem-analysis.md`、`evidence/root-cause-mechanism.md`）。

## 1. 中枢延伸语义修正（区间固定）

- [x] 1.1 `duan-channel.ts` `extendChannel` 修正为区间固定语义：保持基础 3 段确立的 `zd/zg` 不变，延伸时仅检查新增段是否触及 `zd/zg`，并更新 `gg/dd` 与时间边界
- [x] 1.2 `channel.ts` `extendChannel` 修正为区间固定语义：保持基础 5 笔确立的 `zd/zg` 不变，成对延伸时仅检查新增笔是否触及 `zd/zg`，并更新 `gg/dd` 与时间边界

## 2. 核心判定修正（central-expansion.ts）

- [x] 2.1 `CentralRangeItem` 接口增加 `zd`/`zg` 字段（笔级/段级共用，required）
- [x] 2.2 `isCentralExpansion` 判定改为：中枢区间严格分离 + 波动区间重叠（含相切）
      （`max(prev.zd,next.zd) > min(prev.zg,next.zg) && max(prev.dd,next.dd) <= min(prev.gg,next.gg)`）
- [x] 2.3 更新函数 docstring：引用第 20 课中心定理二原文，注明严格性口径

## 3. 单测改造

- [x] 3.1 `duan-channel.spec.ts` 与 `channel.spec.ts` 补充延伸过程中 `zd/zg` 保持不变的断言用例
- [x] 3.2 `central-expansion.spec.ts` 的 `isCentralExpansion` 用例重造：
      - 区间分离 + 波动重叠 → true（教材正例）
      - 区间分离 + 波动相切 → true（保持相切算扩张）
      - 区间重叠 + 波动重叠 → false（600519 笔级回归）
      - 区间相切 + 波动重叠 → false（严格大于/小于）
      - 波动分离 → false
      - 段级同构用例同步
- [x] 3.3 `mergeBiCentralExpansion`/`mergeDuanCentralExpansion`/`resolveCentralExpansions` 现有用例核对：真扩张对保持合并结果不变

## 4. 算法版本与 characterization

- [x] 4.1 `ChanCore.algorithmVersion` 2 → 3，注释说明输出语义变化
- [x] 4.2 重新生成 `chan-full-output.characterization.fixture.ts` 快照，说明变化原因
- [x] 4.3 `chan-full-output.characterization.spec.ts` 验证通过

## 5. 消费端表述同步

- [x] 5.1 `divergence.ts:31-33` 注释更新（说明 Phase B 不存在扩张对，允许区间重叠对保留）
- [x] 5.2 确认 `buy-sell-point.ts` 无相邻严格分离依赖

## 6. 真实数据验证

- [x] 6.1 修复前后跑 4 个审计数据集（TDX 600519/300059/600030、QMT 600519）：
      - 笔级：600519 巨型 → 2 个普通中枢
      - 段级：600519 巨型消除，收敛为合理延伸中枢
      - 600030 1m：合法扩张保留
- [x] 6.2 消费端对比：`detectDivergences`/`detectBuySellPoints` 修复前后输出差异合理
- [x] 6.3 验证结果写入 change evidence

## 7. 全仓校验

- [x] 7.1 `libs/chancore` 全量单测通过
- [x] 7.2 `openspec validate --changes` 通过


