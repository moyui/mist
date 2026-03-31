# Channel Visualization Optimization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Improve channel visualization with enhanced colors for dark mode and accurate x-axis range calculation.

**Architecture:** Backend adds displayStartId/displayEndId fields to ChannelVo, frontend uses these fields for rendering and updates color scheme with higher saturation colors.

**Tech Stack:** NestJS (backend), Next.js/React (frontend), TypeScript, Jest

---

## Task 1: Update Backend ChannelVo with Display Fields

**Files:**
- Modify: `mist/apps/mist/src/chan/vo/channel.vo.ts`

**Step 1: Read current ChannelVo structure**

Read: `mist/apps/mist/src/chan/vo/channel.vo.ts`

**Step 2: Add displayStartId and displayEndId fields**

Add two new fields to the ChannelVo class:

```typescript
export class ChannelVo {
  bis: BiVo[];
  zg: number; // 中枢上沿
  zd: number; // 中枢下沿
  gg: number; // 中枢最高
  dd: number; // 中枢最低
  level: ChannelLevel; // 中枢级别
  type: ChannelType; // 中枢类型
  startId: number; // 起始的k线索引
  endId: number; // 结束的k线索引
  trend: TrendDirection; // 趋势

  // 新增字段：用于前端显示的起始和结束K线索引
  displayStartId: number; // 第一笔的中间位置K线ID
  displayEndId: number;   // 最后一笔的中间位置K线ID
}
```

**Step 3: Run build to verify TypeScript compiles**

Run: `cd mist && pnpm run build`

Expected: No TypeScript errors

**Step 4: Commit**

```bash
git add mist/apps/mist/src/chan/vo/channel.vo.ts
git commit -m "feat: add displayStartId and displayEndId to ChannelVo

Adds display range fields for frontend visualization.
- displayStartId: K-line ID at middle of first bi
- displayEndId: K-line ID at middle of last bi

These fields will be used to render channels with accurate x-axis range."
```

---

## Task 2: Update detectChannel to Calculate Display Fields

**Files:**
- Modify: `mist/apps/mist/src/chan/services/channel.service.ts`
- Test: `mist/apps/mist/src/chan/services/channel.service.spec.ts`

**Step 1: Locate detectChannel method**

Read: `mist/apps/mist/src/chan/services/channel.service.ts` (lines ~138-251)

Find the `detectChannel` method that creates and returns the ChannelVo object.

**Step 2: Write test for display field calculation**

Add to `channel.service.spec.ts`:

```typescript
describe('detectChannel display fields', () => {
  it('should calculate displayStartId as middle of first bi', () => {
    // Create 5 bis where each has 3 originIds
    const fiveBis = [
      createTestBi({
        highest: 3200,
        lowest: 3100,
        trend: TrendDirection.Up,
        originIds: [1, 2, 3]  // First bi has 3 K-lines
      }),
      createTestBi({ highest: 3150, lowest: 3050, trend: TrendDirection.Down }),
      createTestBi({ highest: 3250, lowest: 3150, trend: TrendDirection.Up }),
      createTestBi({ highest: 3200, lowest: 3100, trend: TrendDirection.Down }),
      createTestBi({ highest: 3300, lowest: 3200, trend: TrendDirection.Up }),
    ];

    const originalBis = fiveBis.map(bi => ({
      ...bi,
      originIds: [10, 11, 12]  // Mock originIds
    }));

    const result = service.detectChannel(fiveBis, originalBis, 0);

    expect(result).not.toBeNull();
    // displayStartId should be the middle ID (index 1) of first bi's originIds
    expect(result.displayStartId).toBe(11);
  });

  it('should calculate displayEndId as middle of last bi', () => {
    const fiveBis = [
      createTestBi({ highest: 3100, lowest: 3000, trend: TrendDirection.Up }),
      createTestBi({ highest: 3050, lowest: 2950, trend: TrendDirection.Down }),
      createTestBi({ highest: 3150, lowest: 3050, trend: TrendDirection.Up }),
      createTestBi({ highest: 3100, lowest: 3000, trend: TrendDirection.Down }),
      createTestBi({
        highest: 3200,
        lowest: 3100,
        trend: TrendDirection.Up,
        originIds: [20, 21, 22]  // Last bi has 3 K-lines
      }),
    ];

    const originalBis = fiveBis.map(bi => ({
      ...bi,
      originIds: [30, 31, 32]
    }));

    const result = service.detectChannel(fiveBis, originalBis, 0);

    expect(result).not.toBeNull();
    // displayEndId should be the middle ID of last bi's originIds
    expect(result.displayEndId).toBe(31);
  });
});
```

**Step 3: Run test to verify it fails**

Run: `cd mist && pnpm run test channel.service.spec.ts --testNamePattern="display fields"`

Expected: FAIL - displayStartId and displayEndId are not being calculated

**Step 4: Implement display field calculation in detectChannel**

In `detectChannel` method, before returning the ChannelVo object, add:

```typescript
// 计算显示范围：使用第一笔和最后一笔的中间位置
const firstBi = originalBis[startIndex];
const firstBiMiddleIndex = Math.floor(firstBi.originIds.length / 2);
const displayStartId = firstBi.originIds[firstBiMiddleIndex];

const lastBiIndex = startIndex + 4;
const lastBi = originalBis[lastBiIndex];
const lastBiMiddleIndex = Math.floor(lastBi.originIds.length / 2);
const displayEndId = lastBi.originIds[lastBiMiddleIndex];

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
  endId: originalBis[startIndex + 4].originIds[originalBis[startIndex + 4].originIds.length - 1],
  trend: fiveBis[0].trend,
  displayStartId,
  displayEndId,
};
```

**Step 5: Run test to verify it passes**

Run: `cd mist && pnpm run test channel.service.spec.ts --testNamePattern="display fields"`

Expected: PASS

**Step 6: Commit**

```bash
git add mist/apps/mist/src/chan/services/channel.service.ts mist/apps/mist/src/chan/services/channel.service.spec.ts
git commit -m "feat: calculate displayStartId and displayEndId in detectChannel

- displayStartId: middle K-line ID of first bi
- displayEndId: middle K-line ID of fifth bi
- Uses Math.floor to get middle index for odd/even length arrays"
```

---

## Task 3: Update extendChannel to Preserve Display Fields

**Files:**
- Modify: `mist/apps/mist/src/chan/services/channel.service.ts`
- Test: `mist/apps/mist/src/chan/services/channel.service.spec.ts`

**Step 1: Locate extendChannel method**

Read: `mist/apps/mist/src/chan/services/channel.service.ts` (lines ~267-433)

Find where extendChannel returns the extended channel.

**Step 2: Write test for display field updates during extension**

Add to `channel.service.spec.ts`:

```typescript
describe('extendChannel display fields', () => {
  it('should update displayEndId when extending channel', () => {
    const baseChannel = {
      bis: [
        createTestBi({ highest: 3100, lowest: 3000, trend: TrendDirection.Up }),
        createTestBi({ highest: 3050, lowest: 2950, trend: TrendDirection.Down }),
        createTestBi({ highest: 3150, lowest: 3050, trend: TrendDirection.Up }),
        createTestBi({ highest: 3100, lowest: 3000, trend: TrendDirection.Down }),
        createTestBi({ highest: 3200, lowest: 3100, trend: TrendDirection.Up }),
      ],
      zg: 3100,
      zd: 3050,
      gg: 3200,
      dd: 2950,
      level: ChannelLevel.Bi,
      type: ChannelType.Complete,
      startId: 1,
      endId: 15,
      trend: TrendDirection.Up,
      displayStartId: 3,
      displayEndId: 13,
    };

    // Sixth bi that extends the channel
    const sixthBi = createTestBi({
      highest: 3150,
      lowest: 3050,
      trend: TrendDirection.Down,
      originIds: [16, 17, 18]
    });

    const result = service.extendChannel(baseChannel, [sixthBi]);

    expect(result.channel.displayEndId).not.toBe(baseChannel.displayEndId);
    // Should be middle of sixth bi (17)
    expect(result.channel.displayEndId).toBe(17);
    // displayStartId should remain unchanged
    expect(result.channel.displayStartId).toBe(baseChannel.displayStartId);
  });
});
```

**Step 3: Run test to verify it fails**

Run: `cd mist && pnpm run test channel.service.spec.ts --testNamePattern="extendChannel display"`

Expected: FAIL - displayEndId is not being updated during extension

**Step 4: Implement display field update in extendChannel**

In `extendChannel` method, when returning the extended channel (around line 420-429), add:

```typescript
// 只返回确认的笔（暂存区中的笔被丢弃）
if (confirmedBis.length > 0) {
  const newBis = [...channel.bis, ...confirmedBis];
  const newGg = Math.max(channel.gg, ...confirmedBis.map((b) => b.highest));
  const newDd = Math.min(channel.dd, ...confirmedBis.map((b) => b.lowest));

  // 更新 displayEndId：使用最后一个确认笔的中间位置
  const lastConfirmedBi = confirmedBis[confirmedBis.length - 1];
  const lastBiMiddleIndex = Math.floor(lastConfirmedBi.originIds.length / 2);
  const newDisplayEndId = lastConfirmedBi.originIds[lastBiMiddleIndex];

  return {
    channel: {
      ...channel,
      bis: newBis,
      gg: newGg,
      dd: newDd,
      endId: confirmedBis[confirmedBis.length - 1].originIds[0],
      displayEndId: newDisplayEndId,  // 更新显示结束位置
    },
    usedCount: confirmedBis.length,
  };
}
```

**Step 5: Run test to verify it passes**

Run: `cd mist && pnpm run test channel.service.spec.ts --testNamePattern="extendChannel display"`

Expected: PASS

**Step 6: Run full channel service tests**

Run: `cd mist && pnpm run test:chan:shanghai-2024-2025`

Expected: All tests pass with new display fields in output

**Step 7: Commit**

```bash
git add mist/apps/mist/src/chan/services/channel.service.ts mist/apps/mist/src/chan/services/channel.service.spec.ts
git commit -m "feat: update displayEndId during channel extension

- Calculates new displayEndId from middle of last confirmed bi
- Preserves displayStartId from initial channel
- Ensures display range stays accurate when channels extend"
```

---

## Task 4: Update Frontend Chart Colors

**Files:**
- Modify: `mist-fe/app/components/k-panel/config/chartColors.ts`
- Test: `mist-fe/app/components/k-panel/__tests__/channel.test.ts`

**Step 1: Read current color configuration**

Read: `mist-fe/app/components/k-panel/config/chartColors.ts`

**Step 2: Write test for new color values**

Add to `channel.test.ts`:

```typescript
describe('Channel color updates for dark mode', () => {
  it('should return bright green (#00e676) for Complete channels', () => {
    const color = getChannelColor(ChannelType.Complete);
    expect(color).toBe('#00e676');
  });

  it('should return bright orange (#ffab00) for UnComplete channels', () => {
    const color = getChannelColor(ChannelType.UnComplete);
    expect(color).toBe('#ffab00');
  });

  it('should have higher opacity for better visibility', () => {
    const completeColor = hexToRgba('#00e676', 0.20);
    const uncompleteColor = hexToRgba('#ffab00', 0.12);

    expect(completeColor).toBe('rgba(0, 230, 118, 0.2)');
    expect(uncompleteColor).toBe('rgba(255, 171, 0, 0.12)');
  });
});
```

**Step 3: Run test to verify it fails**

Run: `cd mist-fe && pnpm test -- channel.test.ts --testNamePattern="Channel color updates"`

Expected: FAIL - colors are still old values

**Step 4: Update color values in chartColors.ts**

Replace the `getChannelColor` function:

```typescript
// 根据 ChannelType 获取颜色
export const getChannelColor = (type: ChannelType): string => {
  switch (type) {
    case ChannelType.Complete:
      return "#00e676"; // 亮绿色 - 更高饱和度和亮度，适合夜间模式
    case ChannelType.UnComplete:
      return "#ffab00"; // 亮橙色 - 温暖醒目，夜间模式对比度高
    default:
      return "#666"; // 默认灰色
  }
};
```

**Step 5: Update opacity values in useChartConfig.ts**

Read: `mist-fe/app/components/k-panel/hooks/useChartConfig.ts` (around line 292-295)

Update the fillColor calculation:

```typescript
const color = getChannelColor(channel.type);
const fillColor = hexToRgba(
  color,
  channel.type === "complete" ? 0.20 : 0.12  // 从 0.15/0.08 提升到 0.20/0.12
);
```

**Step 6: Run test to verify it passes**

Run: `cd mist-fe && pnpm test -- channel.test.ts --testNamePattern="Channel color updates"`

Expected: PASS

**Step 7: Commit**

```bash
git add mist-fe/app/components/k-panel/config/chartColors.ts \
        mist-fe/app/components/k-panel/hooks/useChartConfig.ts \
        mist-fe/app/components/k-panel/__tests__/channel.test.ts
git commit -m "feat: enhance channel colors for dark mode visibility

- Complete: #4caf50 → #00e676 (bright green)
- UnComplete: #ff9800 → #ffab00 (bright orange)
- Opacity: 0.15/0.08 → 0.20/0.12 for better contrast"
```

---

## Task 5: Update Frontend Data Processing to Use Display Fields

**Files:**
- Modify: `mist-fe/app/components/k-panel/utils/dataProcessor.ts`
- Test: `mist-fe/app/components/k-panel/__tests__/channel.test.ts`

**Step 1: Locate calculateChannelData function**

Read: `mist-fe/app/components/k-panel/utils/dataProcessor.ts` (lines 156-216)

**Step 2: Write test for display field usage**

Add to `channel.test.ts`:

```typescript
describe('Channel display field mapping', () => {
  it('should use displayStartId and displayEndId for range calculation', () => {
    const mockK: IFetchK[] = [
      { id: 1, time: new Date('2024-01-01'), highest: 3100, lowest: 3000, open: 3050, close: 3020, amount: 1000, symbol: '000001' },
      { id: 2, time: new Date('2024-01-02'), highest: 3150, lowest: 3050, open: 3100, close: 3120, amount: 1000, symbol: '000001' },
      { id: 3, time: new Date('2024-01-03'), highest: 3200, lowest: 3100, open: 3150, close: 3180, amount: 1000, symbol: '000001' },
      { id: 10, time: new Date('2024-01-10'), highest: 3300, lowest: 3200, open: 3250, close: 3280, amount: 1000, symbol: '000001' },
      { id: 11, time: new Date('2024-01-11'), highest: 3350, lowest: 3250, open: 3300, close: 3320, amount: 1000, symbol: '000001' },
      { id: 12, time: new Date('2024-01-12'), highest: 3400, lowest: 3300, open: 3350, close: 3380, amount: 1000, symbol: '000001' },
    ];

    const mockChannel: IFetchChannel = {
      bis: [],
      zg: 3150,
      zd: 3100,
      gg: 3400,
      dd: 3050,
      level: ChannelLevel.Bi,
      type: ChannelType.Complete,
      startId: 1,
      endId: 12,
      trend: TrendDirection.Up,
      displayStartId: 2,  // Middle of first bi
      displayEndId: 11,   // Middle of last bi
    };

    const result = calculateChannelData(mockK, [mockChannel], []);

    expect(result).toHaveLength(1);
    expect(result[0].startIndex).toBe(1);  // Index of id=2 in mockK
    expect(result[0].endIndex).toBe(4);    // Index of id=11 in mockK
  });
});
```

**Step 3: Run test to verify it fails**

Run: `cd mist-fe && pnpm test -- channel.test.ts --testNamePattern="display field usage"`

Expected: FAIL - currently uses startId/endId instead of displayStartId/displayEndId

**Step 4: Update calculateChannelData to use display fields**

In the `calculateChannelData` function (around line 169-171), replace:

```typescript
// 修改前：使用 startId/endId 查找 K 线索引
const startIndex = k.findIndex((item) => item.id === channel.startId);
const endIndex = k.findIndex((item) => item.id === channel.endId);
```

With:

```typescript
// 修改后：使用 displayStartId/displayEndId 查找 K 线索引
const startIndex = k.findIndex((item) => item.id === channel.displayStartId);
const endIndex = k.findIndex((item) => item.id === channel.displayEndId);
```

**Step 5: Update console.warn message**

Also update the warning message (around line 175-177):

```typescript
if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
  console.warn(
    `Invalid channel display indices: ${startIndex}-${endIndex}, ` +
    `channel displayStartId: ${channel.displayStartId}, displayEndId: ${channel.displayEndId}`
  );
  return;
}
```

**Step 6: Run test to verify it passes**

Run: `cd mist-fe && pnpm test -- channel.test.ts --testNamePattern="display field usage"`

Expected: PASS

**Step 7: Commit**

```bash
git add mist-fe/app/components/k-panel/utils/dataProcessor.ts \
        mist-fe/app/components/k-panel/__tests__/channel.test.ts
git commit -m "feat: use displayStartId/displayEndId for channel rendering

- calculateChannelData now uses display fields instead of startId/endId
- Channel x-axis range now shows from middle of first bi to middle of last bi
- Prevents channels from extending beyond bi boundaries"
```

---

## Task 6: Sync Test Data and Verify

**Files:**
- Run: `pnpm run test:sync`

**Step 1: Run full backend test suite**

Run: `cd mist && pnpm run test:chan:shanghai-2024-2025`

Expected: All tests pass, output includes displayStartId and displayEndId

**Step 2: Sync test results to frontend**

Run: `cd mist && pnpm run test:sync`

Expected: Test data copied to `mist-fe/test-data/`

**Step 3: Verify synced data includes display fields**

Run: `cat mist-fe/test-data/results/json/shanghai-index-2024-2025-results.json | grep -A 5 "displayStartId"`

Expected: JSON contains displayStartId and displayEndId fields

**Step 4: Run frontend tests**

Run: `cd mist-fe && pnpm test`

Expected: All tests pass

**Step 5: Commit**

```bash
git add mist/test-data/ mist-fe/test-data/
git commit -m "test: sync test data with new display fields

Backend test results now include displayStartId and displayEndId.
Frontend test data updated for consistent visualization."
```

---

## Task 7: Manual Verification in Browser

**Files:**
- None (manual testing)

**Step 1: Start backend server**

Run: `cd mist && pnpm run start:dev:chan`

Expected: Server starts on http://127.0.0.1:8008

**Step 2: Start frontend dev server**

Run: `cd mist-fe && pnpm dev`

Expected: Server starts on http://localhost:3000

**Step 3: Open browser and navigate**

Run: Open browser to http://localhost:3000/k

**Step 4: Verify color improvements**

Check:
- Complete channels are bright green (#00e676) with good contrast
- UnComplete channels are bright orange (#ffab00) with good contrast
- Colors are clearly visible against dark background
- Fill opacity is noticeable (20% / 12%)

**Step 5: Verify x-axis range**

Check:
- Channel rectangles start from middle of first bi (not beginning)
- Channel rectangles end at middle of last bi (not end)
- Channels don't extend beyond bi boundaries
- Multiple channels don't overlap excessively

**Step 6: Take screenshot for documentation**

Run: Take screenshot of improved visualization

**Step 7: Update documentation**

Add to `mist-fe/CLAUDE.md` in the Central Channels section:

```markdown
**Display Range**: Channels are rendered from the middle of the first bi to the middle of the last bi (using displayStartId/displayEndId), providing accurate x-axis positioning without extending beyond bi boundaries.

**Colors (Dark Mode Optimized)**:
- Complete: `#00e676` (bright green, 20% opacity)
- UnComplete: `#ffab00` (bright orange, 12% opacity)
```

**Step 8: Commit**

```bash
git add mist-fe/CLAUDE.md
git commit -m "docs: document channel color and range improvements

- Add display range explanation
- Update color values for dark mode
- Include opacity values"
```

---

## Task 8: Final Verification and Cleanup

**Files:**
- All modified files

**Step 1: Run linting**

Run: `cd mist && pnpm run lint && cd ../mist-fe && pnpm lint`

Expected: No linting errors

**Step 2: Run formatting**

Run: `cd mist && pnpm run format && cd ../mist-fe && pnpm format`

Expected: Code formatted with Prettier

**Step 3: Run all tests**

Run: `cd mist && pnpm run test && cd ../mist-fe && pnpm test`

Expected: All tests pass

**Step 4: Build both projects**

Run: `cd mist && pnpm run build && cd ../mist-fe && pnpm run build`

Expected: Both projects build successfully

**Step 5: Final commit**

```bash
git add .
git commit -m "chore: finalize channel visualization optimization

All changes complete:
- Backend: displayStartId/displayEndId calculation and propagation
- Frontend: enhanced colors for dark mode visibility
- Frontend: accurate x-axis range using display fields
- Tests: comprehensive coverage for new fields
- Docs: updated with new color values and display range

Visual improvements verified in browser."
```

---

## Summary of Changes

**Backend:**
- `ChannelVo`: Added displayStartId, displayEndId fields
- `detectChannel`: Calculate display fields from middle of first/last bi
- `extendChannel`: Update displayEndId when extending channels
- Tests: Added coverage for display field calculations

**Frontend:**
- `chartColors.ts`: Updated to #00e676 (bright green) and #ffab00 (bright orange)
- `useChartConfig.ts`: Increased opacity to 0.20/0.12
- `dataProcessor.ts`: Use displayStartId/displayEndId instead of startId/endId
- Tests: Added coverage for new color values and display field mapping

**Results:**
- Channels now have better contrast in dark mode
- X-axis range accurately reflects bi boundaries
- No more excessive channel overlap
- Consistent visualization across backend and frontend
