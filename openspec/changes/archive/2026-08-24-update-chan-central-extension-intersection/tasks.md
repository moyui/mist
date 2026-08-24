# Tasks: update-chan-central-extension-intersection

## 1. 核心算法改造

- [x] 1.1 `channel.ts`: `extendChannel` 改造为全量笔公共交集（$zd = \max(\text{低点}), zg = \min(\text{高点})$，有效性检验 $zg > zd$）
- [x] 1.2 `channel.ts`: `mergeTwoChannels` 改造为合并后全量笔公共交集
- [x] 1.3 `duan-channel.ts`: `extendChannel` 改造为全量段公共交集（$zd = \max(\text{低点}), zg = \min(\text{高点})$，有效性检验 $zg > zd$）
- [x] 1.4 `duan-channel.ts`: `mergeTwoChannels` 改造为合并后全量段公共交集

## 2. 算法版本与契约

- [x] 2.1 `ChanCore.algorithmVersion` 3 → 4
- [x] 2.2 更新 `chan-central-extension` live spec delta（修改 Scenario 描述为动态公共交集）

## 3. 单测适配与用例补充

- [x] 3.1 `channel.spec.ts`: 补充 7 笔/9 笔延伸多笔中枢的公共交集计算断言与耗尽截断断言
- [x] 3.2 `duan-channel.spec.ts`: 更新 5 段延伸测试，验证 $zg/zd$ 正确收敛为所有 5 段的公共重叠区间 $[4, 7]$ 与耗尽截断断言
- [x] 3.3 `chan-core.spec.ts`: 验证 algorithmVersion = 4
- [x] 3.4 `central-expansion.spec.ts`: 确认扩张判定与合并回归测试全部通过
- [x] 3.5 `chan-full-output.characterization.spec.ts` 验证通过

## 4. 全量验证与门禁

- [x] 4.1 `libs/chancore` 全量测试 100% 通过（15/15 test suites, 174/174 tests pass）
- [x] 4.2 `pnpm typecheck` 全绿通过
- [x] 4.3 `pnpm lint:check` 全绿通过
