# 中枢内部笔范围验证实施计划

> **For Claude:** REQUIRED SUBSKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**目标:** 修复中枢检测算法，添加内部笔范围验证条件，过滤掉不符合条件的中枢

**架构:** 在 ChannelService 中封装所有验证函数，在 getChannel 中统一验证基础中枢和延伸中枢

**技术栈:** NestJS, TypeScript, Jest

---

## Task 1: 创建验证函数骨架

**Files:**
- Modify: `apps/mist/src/chan/services/channel.service.ts`

**Step 1: 添加 validateTrendAlternating 验证函数**

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
```

**Step 2: 添加 validateZgZdOverlap 验证函数**

```typescript
/**
 * 验证前3笔是否有重叠区域（zg > zd）
 * @returns { valid: boolean, zg?: number; zd?: number }
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
```

**Step 3: 添加 validateBiOverlap 验证函数**

```typescript
/**
 * 验证笔是否与中枢区间重叠
 */
private validateBiOverlap(bi: BiVo, zg: number, zd: number): boolean {
  return bi.lowest <= zg && bi.highest >= zd;
}
```

**Step 4: 添加 validateFiveBiOverlap 验证函数**

```typescript
/**
 * 验证第4、5笔是否与zg-zd重叠
 */
private validateFiveBiOverlap(fiveBis: BiVo[], zg: number, zd: number): boolean {
  return this.validateBiOverlap(fiveBis[3], zg, zd) &&
         this.validateBiOverlap(fiveBis[4], zg, zd);
}
```

**Step 5: 运行测试确保编译通过**

```bash
cd mist
pnpm run build
```

**Step 6: 提交**

```bash
git add apps/mist/src/chan/services/channel.service.ts
git commit -m "refactor: add validation function skeletons for channel detection

- Add validateTrendAlternating
- Add validateZgZdOverlap
- Add validateBiOverlap
- Add validateFiveBiOverlap

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 2: 实现核心范围验证函数

**Files:**
- Modify: `apps/mist/src/chan/services/channel.service.ts`

**Step 1: 添加 validateChannelRange 函数**

```typescript
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
```

**Step 2: 添加 validateExtremeCondition 函数**

```typescript
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

**Step 3: 运行测试确保编译通过**

```bash
pnpm run build
```

**Step 4: 提交**

```bash
git add apps/mist/src/chan/services/channel.service.ts
git commit -m feat: add validateChannelRange and validateExtremeCondition functions

- validateChannelRange: check internal bi against first/last bi bounds
- validateExtremeCondition: check first/last bi extreme value relationship

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 3: 重构 detectChannel 方法使用验证函数

**Files:**
- Modify: `apps/mist/src/chan/services/channel.service.ts`

**Step 1: 修改 detectChannel 使用新的验证函数**

找到 `detectChannel` 方法，将现有逻辑替换为：

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

  // 创建中枢对象
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

**Step 2: 运行测试确保现有功能未破坏**

```bash
pnpm run test:chan:shanghai-2024-2025
```

**Expected:** 测试应该通过（因为逻辑没有改变，只是重构）

**Step 3: 提交**

```bash
git add apps/mist/src/chan/services/channel.service.ts
git commit -m refactor: restructure detectChannel to use validation functions

- Replace isTrendAlternating with validateTrendAlternating
- Replace calculateZgZd with validateZgZdOverlap
- Replace hasOverlap with validateBiOverlap in validateFiveBiOverlap
- Keep same logic, just better encapsulation

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 4: 重构 getChannel 方法添加范围和极值验证

**Files:**
- Modify: `apps/mist/src/chan/services/channel.service.ts`

**Step 1: 修改 getChannel 使用验证函数**

找到 `getChannel` 方法，将现有的 for 循环改为 while 循环，并添加验证：

```typescript
private getChannel(data: BiVo[]) {
  const channels: ChannelVo[] = [];
  const biCount = data.length;

  if (biCount < 5) {
    return { channels, offsetIndex: 0 };
  }

  // 使用 while 循环代替滑动窗口
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

    // 验证：检查内部笔范围
    if (!this.validateChannelRange(extendedChannel)) {
      i++;
      continue;
    }

    // 验证：检查起笔和结束笔的极值关系
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

**Step 2: 删除不再需要的方法**

删除以下方法（已被验证函数替代）：
- 保留：`isTrendAlternating` → `validateTrendAlternating`
- 删除：`calculateZgZd` → `validateZgZdOverlap`（已在新任务中实现）
- 保留：`hasOverlap` → `validateBiOverlap`（已在新任务中实现）
- 删除：`mergeOverlappingChannels`
- 删除：`hasTimeOverlap`

**Step 3: 运行测试验证功能**

```bash
pnpm run test:chan:shanghai-2024-2025
```

**Expected:** 中枢数量从4个减少到3个（中枢1被正确过滤）

**Step 4: 运行集成测试**

```bash
pnpm run test
```

**Expected:** 所有测试通过

**Step 5: 提交**

```bash
git add apps/mist/src/chan/services/channel.service.ts
git commit -m "feat: add channel range validation and refactor getChannel

- Add while loop instead of sliding window to skip used bis
- Call validateChannelRange after extending channel
- Call validateExtremeCondition after extending channel
- Remove mergeOverlappingChannels and hasTimeOverlap methods
- Filter out invalid channels like channel 1 (2024-03-28)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 5: 更新集成测试

**Files:**
- Modify: `apps/mist/src/chan/test/zhongshu.integration.spec.ts`

**Step 1: 添加验证内部笔范围的测试用例**

```typescript
describe('Channel Range Validation', () => {
  it('应该拒绝内部笔超出范围的中枢', () => {
    const mockBi: BiVo[] = [
      createMockBi(100, 120, TrendDirection.Up),    // 第1笔
      createMockBi(105, 130, TrendDirection.Down),  // 第2笔: highest=130 > 120 ✗
      createMockBi(105, 115, TrendDirection.Up),    // 第3笔
      createMockBi(110, 115, TrendDirection.Down),  // 第4笔
      createMockBi(110, 125, TrendDirection.Up),    // 第5笔: highest=125 > 120 ✗
    ];

    const result = service.createChannel({ bi: mockBi });

    // 第2笔的highest(130)超过首笔的highest(120)，应该被拒绝
    expect(result).toHaveLength(0);
  });

  it('应该接受内部笔在范围内的有效中枢', () => {
    const mockBi: BiVo[] = [
      createMockBi(100, 120, TrendDirection.Up),    // 第1笔
      createMockBi(105, 115, TrendDirection.Down),  // 第2笔: 在范围内 ✓
      createMockBi(105, 110, TrendDirection.Up),    // 第3笔: 在范围内 ✓
      createMockBi(108, 110, TrendDirection.Down),  // 第4笔: 在范围内 ✓
      createMockBi(108, 125, TrendDirection.Up),    // 第5笔: highest=125 > 120 ✓
    ];

    const result = service.createChannel({ bi: mockBi });

    expect(result).toHaveLength(1);
    expect(result[0].trend).toBe(TrendDirection.Up);
  });
});
```

**Step 2: 运行测试确保新测试通过**

```bash
pnpm run test -- apps/mist/src/chan/test/zhongshu.integration.spec.ts
```

**Expected:** 新测试通过

**Step 3: 提交**

```bash
git add apps/mist/src/chan/test/zhongshu.integration.spec.ts
git commit -m "test: add channel range validation tests

- Add test for rejecting channels with internal bis exceeding range
- Add test for accepting valid channels with internal bis in range
- Ensure validateChannelRange works correctly

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 6: 同步测试数据并验证结果

**Files:**
- Run: `pnpm run test:sync` (if test data needs updating)

**Step 1: 运行完整测试并同步**

```bash
cd mist
pnpm run test:chan:shanghai-2024-2025
pnpm run test:sync
```

**Step 2: 验证修复结果**

检查输出中的中枢数量，应该从修复前的4个减少到3个。

**Step 3: 验证具体中枢被过滤**

```bash
node -e "
const fs = require('fs');
const data = JSON.parse(fs.readFileSync('/Users/xiyugao/code/mist/mist/test-results/shanghai-index-2024-2025-results.json', 'utf8'));
const channels = data.channels || data.data?.channels || [];
console.log('总中枢数:', channels.length);
console.log();
channels.forEach((ch, idx) => {
  const start = ch.bis[0].endTime.split('T')[0];
  const end = ch.bis[ch.bis.length-1].endTime.split('T')[0];
  console.log(\`中枢\${idx+1}: \${start} -> \${end}, \${ch.trend}\`);
});
"
```

**Expected:**
- 修复前：4个中枢
- 修复后：3个中枢（2024-03-28的中枢1被过滤掉）

**Step 4: 提交更新的测试数据**

```bash
git add test-results/
git commit -m "test: update test data after channel range validation fix

- Channel count reduced from 4 to 3
- Invalid channel 1 (2024-03-28) correctly filtered out
- All test data synced to frontend

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 7: 清理和文档更新

**Files:**
- Update: `CLAUDE.md`, `README.md` (if needed)

**Step 1: 运行完整测试套件确保无回归**

```bash
pnpm run test
pnpm run lint
```

**Step 2: 检查代码质量**

```bash
pnpm run build
```

**Step 3: 最终提交**

```bash
git add .
git commit -m "chore: complete channel range validation implementation

- Encapsulate all validation functions for maintainability
- Add validateChannelRange to filter invalid channels
- Remove mergeOverlappingChannels in favor of while loop skip logic
- All tests passing with 3 valid channels (down from 4)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## 验证清单

完成以下检查确保实现正确：

- [ ] 所有验证函数已实现
- [ ] detectChannel 使用新的验证函数
- ] getChannel 使用 while 循环和验证函数
- ] 中枢1被正确过滤（4个→3个）
- [ ] 所有集成测试通过
- ] 测试数据已同步
- [ ] 代码通过 lint 和 build
- [ ] 设计文档已保存到 docs/plans/

## 预期结果

修复前：
- 4个中枢，包含不应该生成的中枢1（2024-03-28 -> 2024-07-09）

修复后：
- 3个中枢，中枢1被正确过滤
- 所有验证函数封装良好，易于维护
- 代码结构清晰，逻辑分离
