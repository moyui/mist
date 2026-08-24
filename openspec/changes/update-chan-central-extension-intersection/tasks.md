# Tasks: update-chan-central-extension-intersection

## 1. 核心算法改造

- [ ] 1.1 `duan-channel.ts`: `extendChannel` 改造为全量段公共交集（$zd = \max(\text{低点}), zg = \min(\text{高点})$，有效性检验 $zg > zd$）
- [ ] 1.2 `duan-channel.ts`: `mergeTwoChannels` 改造为合并后全量段公共交集
- [ ] 1.3 `channel.ts`: `extendChannel` 改造为全量笔公共交集（$zd = \max(\text{低点}), zg = \min(\text{高点})$，有效性检验 $zg > zd$）
- [ ] 1.4 `channel.ts`: `mergeTwoChannels` 改造为合并后全量笔公共交集

## 2. 算法版本与契约

- [ ] 2.1 `ChanCore.algorithmVersion` 3 → 4
- [ ] 2.2 更新 `chan-central-extension` live spec delta（修改 Scenario 描述为动态公共交集）

## 3. 单测适配与用例补充

- [ ] 3.1 `duan-channel.spec.ts`: 更新 5 段延伸测试，验证 $zg/zd$ 正确收敛为所有 5 段的公共重叠区间 $[4, 7]$
- [ ] 3.2 `channel.spec.ts`: 补充 7 笔/9 笔延伸多笔中枢的公共交集计算断言
- [ ] 3.3 `central-expansion.spec.ts`: 确认扩张判定与合并回归测试全部通过
- [ ] 3.4 重新生成 `chan-full-output.characterization.fixture.ts` 快照，`chan-full-output.characterization.spec.ts` 验证通过

## 4. 全量验证与真实数据回归

- [ ] 4.1 `libs/chancore` 全量测试 100% 通过（`npx jest libs/chancore --watchman=false --forceExit`）
- [ ] 4.2 验证 TDX 600519、TDX 300059、TDX 600030 真实数据集无巨型中枢异常
