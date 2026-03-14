# Chan Theory Center (中枢) Bug Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix two critical bugs in the Chan Theory center (中枢) algorithm that cause incorrect channel detection and infinite extension.

**Architecture:** The center algorithm consists of two main phases: (1) detectChannel - detects 5-bi minimum channels using sliding window, (2) extendChannel - extends channels with additional bis when conditions are met. The bugs were in both phases: detectChannel was using all passed bis instead of just the first 5, and extendChannel lacked proper breakthrough detection, causing all channels to extend to data end and merge into one.

**Tech Stack:** NestJS, TypeScript, Jest, node-talib

---

## Task 1: Understand the Problem and Reproduce Bugs

**Files:**
- Read: `CHAN_FIX_SUMMARY.md`
- Read: `apps/mist/src/chan/services/channel.service.ts`
- Test: `apps/mist/src/chan/services/channel.service.spec.ts`

**Step 1: Read the bug summary**

Read the documentation file that describes the three user-reported problems and their root causes.

**Step 2: Examine the current implementation**

Read the `detectChannel` method (lines 138-189) and `extendChannel` method (lines 267-377) to understand the buggy behavior.

**Step 3: Run existing tests to see current state**

Run: `pnpm run test:chan:shanghai-2024-2025`

Expected: Tests pass but produce incorrect results (only 1 channel instead of 5)

---

## Task 2: Fix Bug 1 - detectChannel Using All Bis Instead of First 5

**Files:**
- Modify: `apps/mist/src/chan/services/channel.service.ts:168-187`
- Test: `apps/mist/src/chan/services/channel.service.spec.ts`

**Step 1: Write failing test to verify bug**

Add to `channel.service.spec.ts`:

```typescript
describe('Bug 1: detectChannel should only use first 5 bis', () => {
  it('should create channel with exactly 5 bis even when more are passed', () => {
    // Create 8 bis (alternating trends)
    const eightBis = [
      createTestBi({ highest: 3200, lowest: 3100, trend: TrendDirection.Up }),
      createTestBi({ highest: 3150, lowest: 3050, trend: TrendDirection.Down }),
      createTestBi({ highest: 3250, lowest: 3150, trend: TrendDirection.Up }),
      createTestBi({ highest: 3200, lowest: 3100, trend: TrendDirection.Down }),
      createTestBi({ highest: 3300, lowest: 3200, trend: TrendDirection.Up }),
      // These should NOT be included in the initial channel
      createTestBi({ highest: 3250, lowest: 3150, trend: TrendDirection.Down }),
      createTestBi({ highest: 3350, lowest: 3250, trend: TrendDirection.Up }),
      createTestBi({ highest: 3300, lowest: 3200, trend: TrendDirection.Down }),
    ];

    const result = service.createChannel({ bi: eightBis });

    // Should create at least one channel
    expect(result.length).toBeGreaterThan(0);

    // First channel should have exactly 5 bis (not 8)
    expect(result[0].bis.length).toBe(5);

    // Verify it's the first 5 bis, not any others
    expect(result[0].bis[0].highest).toBe(3200);
    expect(result[0].bis[4].highest).toBe(3300);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm run test channel.service.spec.ts --testNamePattern="should create channel with exactly 5 bis"`

Expected: FAIL - The bug causes it to use all 8 bis instead of just 5

**Step 3: Fix the detectChannel method**

In `channel.service.ts` line 168-171, change:

```typescript
// BUGGY CODE - uses all passed bis
const gg = Math.max(...fiveBis.map((bi) => bi.highest));
const dd = Math.min(...fiveBis.map((bi) => bi.lowest));

return {
  bis: [...fiveBis],  // WRONG: uses all passed bis
  // ...
};
```

To:

```typescript
// FIXED CODE - only use first 5 bis
const initialFiveBis = fiveBis.slice(0, 5);
const gg = Math.max(...initialFiveBis.map((bi) => bi.highest));
const dd = Math.min(...initialFiveBis.map((bi) => bi.lowest));

return {
  bis: [...initialFiveBis],  // CORRECT: only uses first 5 bis
  // ...
};
```

**Step 4: Run test to verify it passes**

Run: `pnpm run test channel.service.spec.ts --testNamePattern="should create channel with exactly 5 bis"`

Expected: PASS

**Step 5: Commit**

```bash
git add apps/mist/src/chan/services/channel.service.ts apps/mist/src/chan/services/channel.service.spec.ts
git commit -m "fix: detectChannel should only use first 5 bis for initial channel creation

Bug: When detectChannel received more than 5 bis, it used all of them
instead of just the first 5 to create the initial channel.

Fix: Use fiveBis.slice(0, 5) to explicitly take only the first 5 bis.

This ensures channels are created with exactly 5 bis as designed,
with extension handled separately by extendChannel."
```

---

## Task 3: Fix Bug 2 - extendChannel Lacks Breakthrough Detection

**Files:**
- Modify: `apps/mist/src/chan/services/channel.service.ts:279-333`
- Test: `apps/mist/src/chan/services/channel.service.spec.ts`

**Step 1: Write failing test to verify infinite extension**

Add to `channel.service.spec.ts`:

```typescript
describe('Bug 2: extendChannel should stop on breakthrough', () => {
  it('should stop extending when price breaks through zg-zd range', () => {
    // Create a channel and then a bi that clearly breaks through
    const bis = [
      // First 5 bis form the initial channel (upward trend)
      createTestBi({ highest: 3100, lowest: 3000, trend: TrendDirection.Up }),
      createTestBi({ highest: 3050, lowest: 2950, trend: TrendDirection.Down }),
      createTestBi({ highest: 3150, lowest: 3050, trend: TrendDirection.Up }),
      createTestBi({ highest: 3100, lowest: 3000, trend: TrendDirection.Down }),
      createTestBi({ highest: 3200, lowest: 3100, trend: TrendDirection.Up }),
      // This bi breaks through (lowest > zg)
      createTestBi({ highest: 3400, lowest: 3350, trend: TrendDirection.Down }),
    ];

    const result = service.createChannel({ bi: bis });

    // Should create a channel
    expect(result.length).toBeGreaterThan(0);

    // Channel should have only 5 bis (not extended due to breakthrough)
    expect(result[0].bis.length).toBe(5);
  });

  it('should stop extending on downward breakthrough', () => {
    const bis = [
      // 5 bis forming downward channel
      createTestBi({ highest: 2900, lowest: 2800, trend: TrendDirection.Down }),
      createTestBi({ highest: 2850, lowest: 2750, trend: TrendDirection.Up }),
      createTestBi({ highest: 2950, lowest: 2850, trend: TrendDirection.Down }),
      createTestBi({ highest: 2900, lowest: 2800, trend: TrendDirection.Up }),
      createTestBi({ highest: 3000, lowest: 2900, trend: TrendDirection.Down }),
      // This bi breaks through (highest < zd)
      createTestBi({ highest: 2650, lowest: 2600, trend: TrendDirection.Up }),
    ];

    const result = service.createChannel({ bi: bis });

    expect(result.length).toBeGreaterThan(0);
    expect(result[0].bis.length).toBe(5);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm run test channel.service.spec.ts --testNamePattern="should stop extending"`

Expected: FAIL - Channels extend infinitely without breakthrough detection

**Step 3: Add price breakthrough detection (Layer 1)**

In `extendChannel` method, after line 280, add:

```typescript
// Layer 1: Price breakthrough detection
// Breakthrough conditions:
// - Upward breakthrough: bi.lowest > channel.zg (entire range above zg)
// - Downward breakthrough: bi.highest < channel.zd (entire range below zd)
if (bi.lowest > channel.zg || bi.highest < channel.zd) {
  break; // Price breakthrough, channel ends
}
```

**Step 4: Add trend-based breakthrough detection (Layer 2)**

After the price breakthrough check, add:

```typescript
// Layer 2: Trend-based breakthrough with threshold
const breakoutThreshold = Math.max(1, (channel.zg - channel.zd) * 0.01);

if (channel.trend === TrendDirection.Up) {
  // Up channel breakdown conditions:
  if (bi.trend === TrendDirection.Up) {
    // Up bi: low breaks below zd by more than threshold
    if (channel.zd - bi.lowest > breakoutThreshold) {
      break;
    }
  } else {
    // Down bi: high breaks below zg by more than threshold
    if (channel.zg - bi.highest > breakoutThreshold) {
      break;
    }
  }
} else {
  // Down channel breakdown conditions:
  if (bi.trend === TrendDirection.Down) {
    // Down bi: high breaks above zg by more than threshold
    if (bi.highest - channel.zg > breakoutThreshold) {
      break;
    }
  } else {
    // Up bi: low breaks above zd by more than threshold
    if (bi.lowest - channel.zd < -breakoutThreshold) {
      break;
    }
  }
}
```

**Step 5: Run tests to verify they pass**

Run: `pnpm run test channel.service.spec.ts --testNamePattern="should stop extending"`

Expected: PASS

**Step 6: Commit**

```bash
git add apps/mist/src/chan/services/channel.service.ts apps/mist/src/chan/services/channel.service.spec.ts
git commit -m "fix: add three-layer breakthrough detection to extendChannel

Bug: extendChannel had no stopping conditions except lack of overlap,
causing all channels to extend to data end and merge into one.

Fix: Added three-layer breakthrough detection:
1. Price breakthrough: bi.lowest > zg or bi.highest < zd
2. Trend-based breakthrough: 1% threshold based on zg-zd range
3. First-last extreme condition: checked in getChannel after extension

This prevents infinite extension and allows multiple distinct channels
to be detected correctly."
```

---

## Task 4: Add First-Last Extreme Value Condition

**Files:**
- Modify: `apps/miyugao/code/mist/mist/apps/mist/src/chan/services/channel.service.ts:458-476`
- Test: `apps/mist/src/chan/services/channel.service.spec.ts`

**Step 1: Write test for first-last extreme condition**

Add to `channel.service.spec.ts`:

```typescript
describe('First-Last Extreme Condition', () => {
  it('should reject up channel where first.highest >= last.highest', () => {
    const bis = [
      // Up channel where first bi has higher high than last
      createTestBi({ highest: 3300, lowest: 3200, trend: TrendDirection.Up }),
      createTestBi({ highest: 3250, lowest: 3150, trend: TrendDirection.Down }),
      createTestBi({ highest: 3200, lowest: 3100, trend: TrendDirection.Up }),
      createTestBi({ highest: 3150, lowest: 3050, trend: TrendDirection.Down }),
      createTestBi({ highest: 3100, lowest: 3000, trend: TrendDirection.Up }),
    ];

    const result = service.createChannel({ bi: bis });

    // Should be rejected because first.highest (3300) >= last.highest (3100)
    expect(result.length).toBe(0);
  });

  it('should accept up channel where first.highest < last.highest', () => {
    const bis = [
      createTestBi({ highest: 3000, lowest: 2900, trend: TrendDirection.Up }),
      createTestBi({ highest: 3050, lowest: 2950, trend: TrendDirection.Down }),
      createTestBi({ highest: 3100, lowest: 3000, trend: TrendDirection.Up }),
      createTestBi({ highest: 3150, lowest: 3050, trend: TrendDirection.Down }),
      createTestBi({ highest: 3200, lowest: 3100, trend: TrendDirection.Up }),
    ];

    const result = service.createChannel({ bi: bis });

    // Should be accepted because first.highest (3000) < last.highest (3200)
    expect(result.length).toBeGreaterThan(0);
  });

  it('should reject down channel where first.lowest <= last.lowest', () => {
    const bis = [
      createTestBi({ highest: 3000, lowest: 2900, trend: TrendDirection.Down }),
      createTestBi({ highest: 3050, lowest: 2950, trend: TrendDirection.Up }),
      createTestBi({ highest: 3100, lowest: 3000, trend: TrendDirection.Down }),
      createTestBi({ highest: 3150, lowest: 3050, trend: TrendDirection.Up }),
      createTestBi({ highest: 3200, lowest: 3100, trend: TrendDirection.Down }),
    ];

    const result = service.createChannel({ bi: bis });

    // Should be rejected because first.lowest (2900) <= last.lowest (3100)
    expect(result.length).toBe(0);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm run test channel.service.spec.ts --testNamePattern="First-Last"`

Expected: FAIL - No first-last extreme condition check exists yet

**Step 3: Add first-last extreme condition check in getChannel**

In `getChannel` method, after the `extendChannel` call (around line 456), add:

```typescript
// 尝试延伸中枢
const remainingBis = data.slice(i + 5);
const { channel: extendedChannel } = this.extendChannel(
  channel,
  remainingBis,
);

// 检查第一笔和最后一笔的极值关系
// 向上中枢：第一笔的highest < 最后一笔的highest
// 向下中枢：第一笔的lowest > 最后一笔的lowest
const firstBi = extendedChannel.bis[0];
const lastBi = extendedChannel.bis[extendedChannel.bis.length - 1];

let satisfiesExtremeCondition = false;
if (extendedChannel.trend === TrendDirection.Up) {
  satisfiesExtremeCondition = firstBi.highest < lastBi.highest;
} else {
  satisfiesExtremeCondition = firstBi.lowest > lastBi.lowest;
}

// 只有满足极值条件的中枢才添加到列表
if (satisfiesExtremeCondition) {
  channels.push(extendedChannel);
}
// 如果不满足条件，丢弃这个中枢，继续从下一笔开始检测
```

**Step 4: Run tests to verify they pass**

Run: `pnpm run test channel.service.spec.ts --testNamePattern="First-Last"`

Expected: PASS

**Step 5: Commit**

```bash
git add apps/mist/src/chan/services/channel.service.ts apps/mist/src/chan/services/channel.service.spec.ts
git commit -m "feat: add first-last extreme value condition for channel validation

Adds validation to ensure channels represent meaningful price movement:
- Up channels: first.highest < last.highest (ending higher)
- Down channels: first.lowest > last.lowest (ending lower)

Channels not satisfying this condition are discarded, and detection
continues from the next bi. This filters out invalid channel formations."
```

---

## Task 5: Verify Fixes with Full Test Suite

**Files:**
- Test: `apps/mist/src/chan/services/channel.service.spec.ts`
- Test data: `test-data/fixtures/k-line/shanghai-index-2024-2025.json`

**Step 1: Run full test suite**

Run: `pnpm run test:chan:shanghai-2024-2025`

Expected: All tests pass, producing 5 valid channels instead of 1

**Step 2: Verify channel counts and properties**

Check test output shows:
- 5 channels detected (not 1)
- Each channel has valid zg > zd
- Channels cover different time periods without excessive overlap

**Step 3: Sync test results to frontend**

Run: `pnpm run test:sync`

Expected: Test results synced to `mist-fe/test-data/`

**Step 4: Run all tests**

Run: `pnpm run test`

Expected: All tests pass (30/30)

**Step 5: Commit**

```bash
git add test-data/test-results/raw/shanghai-index-2024-2025-results.json
git commit -m "test: update test results after channel bug fixes

Test results now show 5 valid channels instead of 1:
- Channel 1: 2024-02-05 to 2024-07-02
- Channel 2: 2024-09-18 to 2024-12-10
- Channel 3: 2024-12-19 to 2025-02-19
- Channel 4: 2025-02-25 to 2025-06-10
- Channel 5: 2025-08-01 to 2025-11-26

All user-reported problems resolved."
```

---

## Task 6: Create Documentation

**Files:**
- Create: `CHAN_FIX_SUMMARY.md`

**Step 1: Write comprehensive bug fix summary**

Create documentation file describing:
1. The three user-reported problems
2. Root cause analysis for each bug
3. Detailed explanation of fixes
4. Before/after comparison
5. Test results

**Step 2: Commit documentation**

```bash
git add CHAN_FIX_SUMMARY.md
git commit -m "docs: add comprehensive Chan Theory bug fix summary

Documents the three user-reported problems and their fixes:
- Bug 1: detectChannel using all bis instead of first 5
- Bug 2: extendChannel lacking breakthrough detection
- Enhancement: first-last extreme value condition

Includes detailed analysis, fix explanations, and test results."
```

---

## Task 7: Final Verification and Cleanup

**Files:**
- Modify: `apps/mist/src/chan/services/channel.service.ts`
- Test: `apps/mist/src/chan/services/channel.service.spec.ts`

**Step 1: Run linting**

Run: `pnpm run lint`

Expected: No linting errors

**Step 2: Format code**

Run: `pnpm run format`

**Step 3: Run final test suite**

Run: `pnpm run test:cov`

Expected: High coverage, all tests pass

**Step 4: Commit**

```bash
git add .
git commit -m "style: format code and ensure consistent style

Applied prettier formatting and verified ESLint compliance."
```

---

## Summary of Changes

**Files Modified:**
- `apps/mist/src/chan/services/channel.service.ts` - Core bug fixes
- `apps/mist/src/chan/services/channel.service.spec.ts` - Test coverage
- `CHAN_FIX_SUMMARY.md` - Documentation
- `test-data/test-results/raw/shanghai-index-2024-2025-results.json` - Updated results

**Key Fixes:**
1. **detectChannel**: Now only uses first 5 bis via `slice(0, 5)`
2. **extendChannel**: Three-layer breakthrough detection prevents infinite extension
3. **getChannel**: First-last extreme condition validates channel quality

**Results:**
- Before: 1 invalid channel extending to data end
- After: 5 valid channels covering different time periods
- All three user-reported problems resolved
