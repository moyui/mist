# Implementation Plan: update-chan-central-extension-intersection (Bi-level Focus)

## 1. 目标与范围

仅改动**笔级中枢（Bi-level Channel）**：将 `channel.ts` 中的笔级中枢延伸（`extendChannel`）与重合合并（`mergeTwoChannels`）从“冻结初始 5 笔区间”升级为“全量公共重叠交集”算法（$zd = \max(\text{所有低点}), zg = \min(\text{所有高点})$）。段级中枢（`duan-channel.ts`）保持现状不变。`ChanCore.algorithmVersion` 升级为 4。

---

## 2. 文件改动与逻辑细节

### 2.1 `libs/chancore/src/internal/channel.ts`
- **函数 1：`extendChannel(channel: ChanChannel, data: readonly ChanBi[]): ChanChannel`**
  - 尾部延伸（`curEnd + 2 < data.length`）：
    取全量窗口 `tailWindow = data.slice(curStart, curEnd + 3)`，计算全量高低点极值 `allLowMinMax` 和 `allHighMinMax`。
    计算公共交集：`zg = allHighMinMax.min`, `zd = allLowMinMax.max`。
    **门禁条件**：若 `zg > zd`，更新中枢的 `zg, zd, gg, dd`，推进 `curEnd += 2`，标记 `changed = true`。
  - 头部延伸（`curStart - 2 >= 0`）：
    取全量窗口 `headWindow = data.slice(curStart - 2, curEnd + 1)`，计算全量高低点极值。
    计算公共交集：`zg = allHighMinMax.min`, `zd = allLowMinMax.max`。
    **门禁条件**：若 `zg > zd`，更新中枢，推进 `curStart -= 2`，标记 `changed = true`。
- **函数 2：`mergeTwoChannels(head: ChanChannel, tail: ChanChannel): ChanChannel`**
  - 合并后全部笔 `mergedBis`：
    `zg = allHighMinMax ? allHighMinMax.min : Math.min(head.zg, tail.zg)`
    `zd = allLowMinMax ? allLowMinMax.max : Math.max(head.zd, tail.zd)`
    `gg = allHighMinMax ? allHighMinMax.max : Math.max(head.gg, tail.gg)`
    `dd = allLowMinMax ? allLowMinMax.min : Math.min(head.dd, tail.dd)`

### 2.2 `libs/chancore/src/internal/duan-channel.ts`
- **保持现状，不作任何改动**。

### 2.3 `libs/chancore/src/chan-core.ts`
- `static readonly algorithmVersion = 4 as const;`
- 更新注释说明。

---

## 3. 测试用例适配与验证方案

1. **单元测试（`channel.spec.ts`）**：
   - 补充 7 笔/9 笔向上/向下延伸多笔中枢公共交集计算单测。
   - 验证延伸过程中 `zg/zd` 正确收敛为所有内部笔的重叠区间。
2. **特征指纹快照更新（Characterization）**：
   - 重新生成 `chan-full-output.characterization.fixture.ts` 快照。
   - 运行 `chan-full-output.characterization.spec.ts` 验证通过。
3. **全量回归验证**：
   - 跑全量 chancore 测试套件（`npx jest libs/chancore --watchman=false --forceExit`）。
   - 跑真实数据集确保无异常。
