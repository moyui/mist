# 中枢内部笔范围验证设计

**日期**: 2025-03-13
**目标**: 修复中枢检测算法，添加内部笔范围验证条件

## 问题概述

当前算法生成了不应该存在的中枢1（2024-03-28 -> 2024-07-09），因为它的内部笔超出了首笔和结束笔的有效范围：

- 笔2: highest=3174.27 > 首笔.highest=3090.05 ✗
- 笔3: highest=3174.27 > 首笔.highest=3090.05 ✗
- 笔3: lowest=2933.33 < 首笔.lowest=2984.12 ✗
- 笔4: lowest=2933.33 < 首笔.lowest=2984.12 ✗

## 需求定义

### 1. 有效范围定义

**下降中枢**：
- 内部笔应该在 `[结束笔.lowest, 首笔.highest]` 范围内
- 即：内部笔的 highest 不超过首笔的 highest
- 且：内部笔的 lowest 不低于结束笔的 lowest

**上升中枢**：
- 内部笔应该在 `[首笔.lowest, 结束笔.highest]` 范围内
- 即：内部笔的 lowest 不低于首笔的 lowest
- 且：内部笔的 highest 不超过结束笔的 highest

### 2. 检查时机

- 在 `getChannel` 方法中，延伸后统一验证
- **不在** `detectChannel` 中调用范围验证

### 3. 违反条件处理

- 直接丢弃该中枢，从下一笔继续检测

## 设计方案

### 架构重构：封装验证函数

将所有检测算法封装成独立的验证函数，提高代码可维护性和可重用性。

#### 新增验证函数

```typescript
/**
 * 验证笔的趋势是否交替
 */
private validateTrendAlternating(bis: BiVo[]): boolean {
  for (let i = 0; i < bis.length - 1; i++) {
    if (bis[i].trend === bis[i + 1].trend) {
      return false;
    }
  }
  return true;
}

/**
 * 验证前3笔是否有重叠区域（zg > zd）
 * @returns { valid: boolean, zg?: number, zd?: number }
 */
private validateZgZdOverlap(bis: BiVo[]): { valid: boolean; zg?: number; zd?: number } {
  if (bis.length < 3) {
    return { valid: false };
  }

  const zg = Math.min(bis[0].highest, bis[1].highest, bis[2].highest);
  const zd = Math.max(bis[0].lowest, bis[1].lowest, bis[2].lowest);

  if (zg <= zd) {
    return { valid: false };
  }

  return { valid: true, zg, zd };
}

/**
 * 验证笔是否与中枢区间重叠
 */
private validateBiOverlap(bi: BiVo, zg: number, zd: number): boolean {
  return bi.lowest <= zg && bi.highest >= zd;
}

/**
 * 验证第4、5笔是否与zg-zd重叠
 */
private validateFiveBiOverlap(fiveBis: BiVo[], zg: number, zd: number): boolean {
  return this.validateBiOverlap(fiveBis[3], zg, zd) &&
         this.validateBiOverlap(fiveBis[4], zg, zd);
}

/**
 * 验证中枢内部笔是否在有效范围内
 *
 * 下降中枢：内部笔应该在 [结束笔.lowest, 首笔.highest] 范围内
 * 上升中枢：内部笔应该在 [首笔.lowest, 结束笔.highest] 范围内
 *
 * @param channel 中枢对象
 * @returns 是否满足范围条件
 */
private validateChannelRange(channel: ChannelVo): boolean {
  if (channel.bis.length < 3) {
    return false;
  }

  const firstBi = channel.bis[0];
  const lastBi = channel.bis[channel.bis.length - 1];

  // 检查所有内部笔（第2笔到倒数第2笔）
  for (let i = 1; i < channel.bis.length - 1; i++) {
    const bi = channel.bis[i];

    if (channel.trend === TrendDirection.Down) {
      // 下降中枢：内部笔应该在 [结束笔.lowest, 首笔.highest] 范围内
      if (bi.highest > firstBi.highest || bi.lowest < lastBi.lowest) {
        return false;
      }
    } else {
      // 上升中枢：内部笔应该在 [首笔.lowest, 结束笔.highest] 范围内
      if (bi.highest > lastBi.highest || bi.lowest < firstBi.lowest) {
        return false;
      }
    }
  }

  return true;
}

/**
 * 验证起笔和结束笔的极值关系
 *
 * 上升中枢：结束笔.highest > 起笔.highest 且 结束笔.lowest > 起笔.lowest
 * 下降中枢：结束笔.highest < 起笔.highest 且 结束笔.lowest < 起笔.lowest
 *
 * @param channel 中枢对象
 * @returns 是否满足极值条件
 */
private validateExtremeCondition(channel: ChannelVo): boolean {
  const firstBi = channel.bis[0];
  const lastBi = channel.bis[channel.bis.length - 1];

  if (channel.trend === TrendDirection.Up) {
    // 上升中枢：结束笔的极值应该大于起笔的极值
    return lastBi.highest > firstBi.highest && lastBi.lowest > firstBi.lowest;
  } else {
    // 下降中枢：结束笔的极值应该小于起笔的极值
    return lastBi.highest < firstBi.highest && lastBi.lowest < firstBi.lowest;
  }
}
```

#### 修改 detectChannel 方法

```typescript
private detectChannel(
  fiveBis: BiVo[],
  originalBis: BiVo[],
  startIndex: number,
): ChannelVo | null {
  if (fiveBis.length < 5) {
    return null;
  }

  // 验证1：检查趋势是否交替
  if (!this.validateTrendAlternating(fiveBis)) {
    return null;
  }

  // 验证2：从前3笔计算zg-zd
  const zgZdResult = this.validateZgZdOverlap(fiveBis);
  if (!zgZdResult.valid) {
    return null;
  }
  const { zg, zd } = zgZdResult;

  // 验证3：检查第4、5笔是否与zg-zd重叠
  if (!this.validateFiveBiOverlap(fiveBis, zg, zd)) {
    return null;
  }

  // 计算gg-dd并创建中枢对象
  const initialFiveBis = fiveBis.slice(0, 5);
  const gg = Math.max(...initialFiveBis.map((bi) => bi.highest));
  const dd = Math.min(...initialFiveBis.map((bi) => bi.lowest));

  // 创建中枢对象（不在detectChannel中调用validateChannelRange）
  return {
    bis: [...initialFiveBis],
    zg: zg,
    zd: zd,
    gg: gg,
    dd: dd,
    level: ChannelLevel.Bi,
    type: ChannelType.Complete,
    startId: originalBis[startIndex].originIds[0],
    endId: originalBis[startIndex + 4].originIds[
      originalBis[startIndex + 4].originIds.length - 1
    ],
    trend: fiveBis[0].trend,
  };
}
```

#### 修改 getChannel 方法

```typescript
private getChannel(data: BiVo[]) {
  const channels: ChannelVo[] = [];
  const biCount = data.length;

  if (biCount < 5) {
    return { channels, offsetIndex: 0 };
  }

  // 使用 while 循环代替滑动窗口，避免重复检测已被前一个中枢覆盖的笔
  let i = 0;
  while (i <= biCount - 5) {
    const channel = this.detectChannel(data.slice(i), data, i);

    if (!channel) {
      i++;
      continue;
    }

    // 尝试延伸中枢
    const remainingBis = data.slice(i + 5);
    const { channel: extendedChannel, usedCount } = this.extendChannel(
      channel,
      remainingBis,
    );

    // 统一验证位置：检查范围条件和极值条件

    // 验证4：检查内部笔范围（新增）
    if (!this.validateChannelRange(extendedChannel)) {
      i++;
      continue;
    }

    // 验证5：检查起笔和结束笔的极值关系（现有）
    if (!this.validateExtremeCondition(extendedChannel)) {
      i++;
      continue;
    }

    // 所有验证通过，添加到列表
    channels.push(extendedChannel);
    // 跳过已使用的笔（基础5笔 + 延伸的笔）
    i += 5 + usedCount;
  }

  return { channels, offsetIndex: biCount };
}
```

### 删除的方法

以下方法将被验证函数替代：

- `isTrendAlternating` → `validateTrendAlternating`
- `calculateZgZd` → `validateZgZdOverlap`（返回值格式不同）
- `hasOverlap` → `validateBiOverlap`（保留，但重命名）
- `calculateInitialExtreme` → 保留（用于延伸逻辑）
- `exceedsExtreme` → 保留（用于延伸逻辑）
- `updateExtreme` → 保留（用于延伸逻辑）

- `mergeOverlappingChannels` → **删除**（通过滑动窗口跳过逻辑替代）
- `hasTimeOverlap` → **删除**（不再需要）

## 验证流程图

```
getChannel (while循环检测)
  ↓
detectChannel (检测5笔基础中枢)
  ├─ validateTrendAlternating ✓
  ├─ validateZgZdOverlap ✓
  └─ validateFiveBiOverlap ✓
  ↓
extendChannel (延伸中枢)
  ↓
统一验证位置：
  ├─ validateChannelRange ✓ (新增：内部笔范围)
  └─ validateExtremeCondition ✓ (现有：极值条件)
  ↓
通过验证 → 添加到channels列表
```

## 预期结果

修复前：4个中枢（包含不应该生成的中枢1）
修复后：3个中枢（中枢1被正确过滤）

## 实现要点

1. **函数命名**：所有验证函数以 `validate` 开头，保持一致性
2. **返回值**：`validateZgZdOverlap` 返回对象 `{valid, zg?, zd?}`，其他返回 `boolean`
3. **检查顺序**：范围检查和极值检查在 `getChannel` 中统一进行
4. **错误处理**：不满足条件的直接 `i++` 继续，不抛出异常
