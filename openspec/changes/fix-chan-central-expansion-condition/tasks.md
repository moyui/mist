# Tasks: fix-chan-central-expansion-condition

> 前置：audit-chancore-algorithms 已归档证据（`evidence/chan-textbook-excerpts.md` 第 20 课
> 中心定理二原文、`evidence/audit-report.md` §6）。

## 1. 核心判定修正

- [ ] 1.1 `CentralRangeItem` 接口增加 `zd`/`zg` 字段（笔级/段级共用，required）
- [ ] 1.2 `isCentralExpansion` 判定改为：中枢区间严格分离 + 波动区间重叠（含相切）
      （`max(prev.zd,next.zd) > min(prev.zg,next.zg) && max(prev.dd,next.dd) <= min(prev.gg,next.gg)`）
- [ ] 1.3 更新函数 docstring：引用第 20 课中心定理二原文，注明严格性口径
- [ ] 1.4 确认 `resolveCentralExpansions`/两个 merge 函数无需改动（最小接口扩展不破坏调用方）

## 2. 单测改造

- [ ] 2.1 `central-expansion.spec.ts` 的 `isCentralExpansion` 用例重造：
      - 区间分离 + 波动重叠 → true（教材正例）
      - 区间分离 + 波动相切 → true（保持 D1 相切算扩张）
      - 区间重叠 + 波动重叠 → false（600519 情形回归）
      - 区间相切 + 波动重叠 → false（后ZG<前ZD 严格）
      - 波动分离 → false
      - 段级同构用例同步（DuanChannel 最小接口）
- [ ] 2.2 `mergeBiCentralExpansion`/`mergeDuanCentralExpansion`/`resolveCentralExpansions`
      现有用例核对：真扩张对（区间分离）应保持合并结果不变
- [ ] 2.3 channel.spec.ts / duan-channel.spec.ts 集成用例核对（若有依赖旧判定的用例则更新）

## 3. 算法版本与 characterization

- [ ] 3.1 `ChanCore.algorithmVersion` 2 → 3，注释说明输出语义变化
- [ ] 3.2 重新生成 `chan-full-output.characterization.fixture.ts`（笔级输出变化），
      change 内说明 fixture 变化原因（区间重叠对拆分为普通中枢）
- [ ] 3.3 `chan-full-output.characterization.spec.ts` 确认段级扩张 fixture（区间分离）
      输出不变

## 4. 消费端表述同步

- [ ] 4.1 `divergence.ts:31-33` 注释：从"phaseB 相邻波动区间严格不重叠"改为
      "phaseB 不存在扩张对（区间重叠对允许保留，趋势链靠位置递进断链）"
- [ ] 4.2 确认 `buy-sell-point.ts` 无相邻严格分离依赖（代码审查，预期不改）

## 5. 真实数据验证

- [ ] 5.1 修复前后跑 4 个审计数据集（TDX 600519/300059/600030、QMT 600519）：
      - 笔级：600519 巨型 → 2 个普通中枢；其余数据集记录 count/expanded 变化
      - 段级：不再产出全区间巨型；记录暴露的重复中枢（已知风险，数量/形态存档）
- [ ] 5.2 消费端对比：`detectDivergences`/`detectBuySellPoints` 修复前后输出差异记录
      （预期变化合理，无异常）
- [ ] 5.3 验证结果写入 change evidence 或审计报告附录

## 6. 全仓校验

- [ ] 6.1 `libs/chancore` 全量单测通过（`--forceExit`）
- [ ] 6.2 `openspec validate --changes` 通过
- [ ] 6.3 涉及消费端/契约的仓库（mist-fe 若消费 expanded 语义）确认无破坏
