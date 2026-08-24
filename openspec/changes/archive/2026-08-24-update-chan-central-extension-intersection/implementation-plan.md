# Implementation Plan: update-chan-central-extension-intersection

## 1. 目标与范围

将 `channel.ts` 与 `duan-channel.ts` 中的笔级与段级中枢延伸（`extendChannel`）与重合合并（`mergeTwoChannels`）从“冻结初始区间”升级为“全量公共重叠交集”算法（$zd = \max(\text{所有低点}), zg = \min(\text{所有高点})$）。`ChanCore.algorithmVersion` 升级为 4。

---

## 2. 文件改动与逻辑细节

### 2.1 `libs/chancore/src/internal/channel.ts`
- **函数 1：`extendChannel(channel: ChanChannel, data: readonly ChanBi[]): ChanChannel`**
  - 尾部与头部延伸时，取全量窗口计算全量极值，计算公共交集：`zg = allHighMinMax.min`, `zd = allLowMinMax.max`。
  - **门禁条件**：若 `zg > zd`，更新中枢的 `zg, zd, gg, dd`，推进窗口，继续延伸；若交集为空则停止延伸。
- **函数 2：`mergeTwoChannels(head: ChanChannel, tail: ChanChannel): ChanChannel`**
  - 合并后全部笔 `mergedBis`：
    `zg = allHighMinMax ? allHighMinMax.min : Math.min(head.zg, tail.zg)`
    `zd = allLowMinMax ? allLowMinMax.max : Math.max(head.zd, tail.zd)`
    `gg = allHighMinMax ? allHighMinMax.max : Math.max(head.gg, tail.gg)`
    `dd = allLowMinMax ? allLowMinMax.min : Math.min(head.dd, tail.dd)`

### 2.2 `libs/chancore/src/internal/duan-channel.ts`
- **函数 1：`extendChannel(channel: ChanDuanChannel, duans: readonly ChanDuan[]): ChanDuanChannel`**
  - 尾部与头部延伸时，取全量窗口计算全量极值，计算公共交集：`zg = allHighMinMax.min`, `zd = allLowMinMax.max`。
  - **门禁条件**：若 `zg > zd`，更新中枢，推进窗口；若交集为空则停止延伸。
- **函数 2：`mergeTwoChannels(head: ChanDuanChannel, tail: ChanDuanChannel): ChanDuanChannel`**
  - 合并后全部段 `mergedDuans`：
    `zg = allHighMinMax ? allHighMinMax.min : Math.min(head.zg, tail.zg)`
    `zd = allLowMinMax ? allLowMinMax.max : Math.max(head.zd, tail.zd)`
    `gg = allHighMinMax ? allHighMinMax.max : Math.max(head.gg, tail.gg)`
    `dd = allLowMinMax ? allLowMinMax.min : Math.min(head.dd, tail.dd)`

### 2.3 `libs/chancore/src/chan-core.ts`
- `static readonly algorithmVersion = 4 as const;`
- 更新注释说明。

---

## 3. 测试用例适配与验证方案

1. **单元测试（`channel.spec.ts` & `duan-channel.spec.ts`）**：
   - 笔级 7 笔/9 笔延伸多笔中枢公共交集计算断言与耗尽截断断言通过。
   - 段级 5 段延伸测试，验证 $zg/zd$ 正确收敛为所有 5 段的公共重叠区间 $[4, 7]$ 与耗尽截断断言通过。
2. **特征指纹快照更新（Characterization）**：
   - `chan-full-output.characterization.spec.ts` 验证通过。
3. **全量回归验证**：
   - `libs/chancore` 全量 15 个套件、174 个用例全部通过。
