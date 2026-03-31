# Chan Theory Channel (笔中枢) Refactor Design

> **Context**: This is a complete architectural redesign of the channel detection system to align with correct Chan Theory definitions.
>
> **Previous Issues**: The initial implementation used 3-bi minimum instead of 5-bi, lacked 进入段/离开段 tracking, and had incorrect extension logic.
>
> **User Requirements**:
> - 5-bi minimum for channel formation
> - Track 进入段 (entering segment) and 离开段 (leaving segment) for each bi
> - Only odd-numbered bis (7th, 9th, etc.) can extend the channel
> - Extension only if leaving segment height exceeds previous extreme
> - 刺穿笔 (piercing bi) should not extend channel

---

## Architecture Overview

### Core Chan Theory Concepts

#### 1. Channel Formation (5-bi minimum)

A **Zhongshu (中枢)** requires **5 alternating bis** to form:

```
Bi1 (up) → Bi2 (down) → Bi3 (up) → Bi4 (down) → Bi5 (up)
```

**Key Terms**:
- **zg (中枢高)**: Minimum of the highest prices among the first 3 bis
- **zd (中枢低)**: Maximum of the lowest prices among the first 3 bis
- **gg (高高点)**: Maximum of all highest prices in the channel
- **dd (低低点)**: Minimum of all lowest prices in the channel

**Critical**: zg > zd must be true for a valid channel (overlap exists)

#### 2. Entering and Leaving Segments (进入段/离开段)

For each bi that overlaps with the zg-zd range:

**进入段 (Entering Segment)**:
- The portion of the bi where it **enters** the zg-zd range
- For an up-trend bi: From its lowest point to zd (if lowest < zd)
- For a down-trend bi: From its highest point to zg (if highest > zg)

**离开段 (Leaving Segment)**:
- The portion of the bi where it **leaves** the zg-zd range
- For an up-trend bi: From zg to its highest point (if highest > zg)
- For a down-trend bi: From zd to its lowest point (if lowest < zd)

**刺穿笔 (Piercing Bi)**:
- A bi where `lowest < zd AND highest > zg`
- This bi "pierces through" the channel completely
- Should NOT be counted as extending the channel

#### 3. Channel Extension Rules

After the initial 5-bi channel forms:

**Extension Conditions** (all must be true):
1. The bi is an **odd-numbered bi** (7th, 9th, 11th, etc.)
2. The bi has overlap with zg-zd (not a piercing bi)
3. The **leaving segment height** exceeds the **previous extreme leaving segment height**

**Leaving Segment Height Calculation**:
- Up-trend bi: `leavingHeight = highest - zg`
- Down-trend bi: `leavingHeight = zd - lowest`

**Extreme Leaving Segment Height**:
- For up-trend channel (Bi1 is up): Maximum leaving segment height among all up-trend bis
- For down-trend channel (Bi1 is down): Maximum leaving segment height among all down-trend bis

**Termination**:
- Channel extension stops when:
  - A bi has no overlap with zg-zd (gap appears)
  - An odd-numbered bi fails the leaving segment height condition

---

## Data Structures

### BiVo Extensions

```typescript
export class BiVo {
  // ... existing fields ...

  // NEW: Entering and leaving segment tracking
  enteringSegment: {
    startPrice: number;  // Where the bi enters zg-zd
    endPrice: number;    // zg or zd
    exists: boolean;     // Whether an entering segment exists
  };

  leavingSegment: {
    startPrice: number;  // zg or zd
    endPrice: number;    // Where the bi leaves to
    height: number;      // Leaving segment height
    exists: boolean;     // Whether a leaving segment exists
  };

  // NEW: Piercing bi detection
  isPiercing: boolean;  // true if bi pierces through zg-zd
}
```

### ChannelVo (保持不变)

```typescript
export class ChannelVo {
  bis: BiVo[];          // All bis in the channel (5+)
  zg: number;           // Unchanged after formation
  zd: number;           // Unchanged after formation
  gg: number;           // Updated on extension
  dd: number;           // Updated on extension
  level: ChannelLevel;
  type: ChannelType;
  startId: number;
  endId: number;
  trend: TrendDirection;
}
```

---

## Algorithm Design

### Phase 1: Channel Formation (5-bi minimum)

```typescript
private detectChannel(bis: BiVo[], startIndex: number): ChannelVo | null {
  // Step 1: Check if we have at least 5 bis
  if (startIndex + 5 > bis.length) {
    return null;
  }

  const fiveBis = bis.slice(startIndex, startIndex + 5);

  // Step 2: Verify trend alternation
  if (!this.isTrendAlternating(fiveBis)) {
    return null;
  }

  // Step 3: Calculate zg-zd from first 3 bis
  const firstThree = fiveBis.slice(0, 3);
  const overlapRange = this.calculateOverlapRange(firstThree);

  if (!overlapRange) {
    return null;  // No overlap, no channel
  }

  const [zg, zd] = overlapRange;

  // Step 4: Verify bis 4 and 5 overlap with zg-zd
  const bis4 = fiveBis[3];
  const bis5 = fiveBis[4];

  if (!this.hasOverlapWithChannel(bis4, zg, zd) ||
      !this.hasOverlapWithChannel(bis5, zg, zd)) {
    return null;
  }

  // Step 5: Create initial channel
  return this.createChannel(fiveBis, zg, zd);
}
```

### Phase 2: Calculate Entering/Leaving Segments

```typescript
private calculateSegments(
  bi: BiVo,
  zg: number,
  zd: number
): { entering: SegmentInfo; leaving: SegmentInfo; isPiercing: boolean } {

  const isUp = bi.trend === TrendDirection.Up;
  const { highest, lowest } = bi;

  // Check for piercing bi
  const isPiercing = lowest < zd && highest > zg;

  // Initialize segments
  let enteringSegment = { startPrice: 0, endPrice: 0, exists: false };
  let leavingSegment = { startPrice: 0, endPrice: 0, height: 0, exists: false };

  if (isPiercing) {
    // Piercing bi - no valid segments
    return { entering: enteringSegment, leaving: leavingSegment, isPiercing };
  }

  if (isUp) {
    // Up-trend bi: lowest → highest
    if (lowest < zd) {
      // Has entering segment: lowest → zd
      enteringSegment = {
        startPrice: lowest,
        endPrice: zd,
        exists: true
      };
    }

    if (highest > zg) {
      // Has leaving segment: zg → highest
      const height = highest - zg;
      leavingSegment = {
        startPrice: zg,
        endPrice: highest,
        height: height,
        exists: true
      };
    }
  } else {
    // Down-trend bi: highest → lowest
    if (highest > zg) {
      // Has entering segment: highest → zg
      enteringSegment = {
        startPrice: highest,
        endPrice: zg,
        exists: true
      };
    }

    if (lowest < zd) {
      // Has leaving segment: zd → lowest
      const height = zd - lowest;
      leavingSegment = {
        startPrice: zd,
        endPrice: lowest,
        height: height,
        exists: true
      };
    }
  }

  return { entering: enteringSegment, leaving: leavingSegment, isPiercing };
}
```

### Phase 3: Channel Extension Logic

```typescript
private extendChannel(
  channel: ChannelVo,
  remainingBis: BiVo[]
): { channel: ChannelVo; offsetIndex: number } {

  let extendedBis: BiVo[] = [];
  let maxLeavingHeight = this.calculateInitialExtremeLeavingHeight(channel);

  // Start checking from the 6th bi (index 5 in 0-based)
  // Only odd-numbered bis (7th, 9th, 11th...) can extend
  for (let i = 0; i < remainingBis.length; i++) {
    const bi = remainingBis[i];
    const biNumber = channel.bis.length + extendedBis.length + 1;  // 1-based

    // Check for overlap
    if (!this.hasOverlapWithChannel(bi, channel.zg, channel.zd)) {
      break;  // Gap - channel ends
    }

    // Calculate segments
    const segments = this.calculateSegments(bi, channel.zg, channel.zd);

    // Skip piercing bis
    if (segments.isPiercing) {
      break;  // Piercing bi ends the channel
    }

    // Only odd-numbered bis (7th, 9th, etc.) can extend
    const isOddNumbered = biNumber >= 7 && biNumber % 2 === 1;

    if (isOddNumbered) {
      // Check leaving segment height condition
      if (segments.leaving.exists) {
        if (segments.leaving.height > maxLeavingHeight) {
          // Valid extension
          maxLeavingHeight = segments.leaving.height;
          extendedBis.push(bi);
        } else {
          // Leaving segment not high enough - channel ends
          break;
        }
      } else {
        // No leaving segment - channel ends
        break;
      }
    } else {
      // Even-numbered bi - extend without height check
      extendedBis.push(bi);
    }
  }

  // Recalculate channel with extended bis
  if (extendedBis.length > 0) {
    const newBis = [...channel.bis, ...extendedBis];
    const newGg = Math.max(channel.gg, ...extendedBis.map(b => b.highest));
    const newDd = Math.min(channel.dd, ...extendedBis.map(b => b.lowest));

    return {
      channel: {
        ...channel,
        bis: newBis,
        gg: newGg,
        dd: newDd,
        endId: extendedBis[extendedBis.length - 1].originIds[0]
      },
      offsetIndex: extendedBis.length
    };
  }

  return { channel, offsetIndex: 0 };
}

private calculateInitialExtremeLeavingHeight(channel: ChannelVo): number {
  // Find the maximum leaving segment height from the initial 5 bis
  const channelTrend = channel.trend;  // From Bi1

  let maxHeight = 0;

  for (const bi of channel.bis) {
    if (bi.leavingSegment && bi.leavingSegment.exists) {
      // Only consider bis with same trend as channel
      if (bi.trend === channelTrend) {
        maxHeight = Math.max(maxHeight, bi.leavingSegment.height);
      }
    }
  }

  return maxHeight;
}
```

### Phase 4: Main Detection Loop

```typescript
private getChannel(data: BiVo[]): { channels: ChannelVo[]; offsetIndex: number } {
  const channels: ChannelVo[] = [];
  const biCount = data.length;

  if (biCount < 5) {
    return { channels, offsetIndex: 0 };
  }

  // Sliding window to detect all channels
  for (let i = 0; i <= biCount - 5; i++) {
    // Try to form a channel starting at index i
    const channel = this.detectChannel(data, i);

    if (!channel) {
      continue;
    }

    // Try to extend the channel
    const remainingBis = data.slice(i + 5);
    const { channel: extendedChannel } = this.extendChannel(channel, remainingBis);

    channels.push(extendedChannel);
  }

  // Merge overlapping channels (keep the one with fewer bis)
  const mergedChannels = this.mergeOverlappingChannels(channels);

  return { channels: mergedChannels, offsetIndex: biCount };
}
```

---

## Test Strategy

### Unit Tests (to be rewritten)

1. **5-bi Channel Formation**
   - Valid 5-bi channel (all alternating, all overlapping)
   - Invalid: < 5 bis
   - Invalid: Non-alternating trends
   - Invalid: No overlap in first 3 bis
   - Invalid: Bi4 or Bi5 don't overlap

2. **Entering/Leaving Segment Calculation**
   - Up-trend bi with entering and leaving segments
   - Down-trend bi with entering and leaving segments
   - Bi fully inside zg-zd (no entering or leaving)
   - Bi starting outside and ending inside
   - Bi starting inside and ending outside
   - Piercing bi detection

3. **Channel Extension**
   - 7th bi extends (leaving height exceeds previous)
   - 7th bi doesn't extend (leaving height insufficient)
   - 9th bi extends
   - Even-numbered bis extend without height check
   - Piercing bi terminates channel
   - Gap terminates channel

4. **Edge Cases**
   - Bi exactly at zg or zd
   - Zero-height segments
   - All bis same direction (should fail)

### Integration Test

Use the Shanghai Index 2024-2025 data:
- 485 K-lines → 344 Merged K-lines → 37 Bis → Expected channels

**Validation**:
- All channels must have ≥ 5 bis
- All bis in channel must have valid segments calculated
- zg-zd must match overlap of first 3 bis
- Extension rules must be followed

---

## Frontend Changes

### Data Mapping Updates

The frontend already correctly maps `zg` and `zd` for rendering. No changes needed to visualization code.

However, we may want to display additional information:
- Number of bis in each channel
- Entering/leaving segment visualization (optional enhancement)

### API Compatibility

The API contract (`IFetchChannel`) remains unchanged:
```typescript
export interface IFetchChannel {
  zg: number;
  zd: number;
  gg: number;
  dd: number;
  bis: IFetchBi[];  // Will include segment data
  // ... other fields
}
```

The frontend will automatically receive the extended bi data with segments.

---

## Migration Plan

### Phase 1: Backend Refactor (Priority 1)
1. Update `BiVo` to include segment fields
2. Rewrite `detectChannel()` for 5-bi minimum
3. Implement `calculateSegments()`
4. Rewrite `extendChannel()` with new logic
5. Update `hasOverlapWithChannel()` to skip piercing bis

### Phase 2: Test Rewrite (Priority 1)
1. Delete all existing 51 unit tests
2. Write new tests for 5-bi formation
3. Write tests for segment calculation
4. Write tests for extension logic
5. Verify integration test with real data

### Phase 3: Verification (Priority 2)
1. Run tests and ensure 100% pass rate
2. Use Playwright to verify frontend visualization
3. Compare channel results with manual analysis
4. Check performance (< 100ms for 100 bi)

---

## Open Questions

1. **Extreme Leaving Segment Height**: Should we track this separately for up-trend and down-trend channels, or use a single maximum?

   **Answer**: Use separate tracking based on channel trend (Bi1's direction)

2. **Piercing Bi Handling**: Should a piercing bi completely terminate channel detection, or just be skipped?

   **Answer**: Piercing bi terminates the channel - no further bis can extend after a piercing bi

3. **Channel Merging**: After refactor, do we still need the `mergeOverlappingChannels()` function?

   **Answer**: Yes - to handle cases where multiple valid 5-bi channels are detected at different starting positions

---

## Success Criteria

1. ✅ All channels have exactly 5+ bis (minimum 5)
2. ✅ All bis in channels have valid segment data
3. ✅ Only odd-numbered bis (7th, 9th, etc.) trigger height checks
4. ✅ Piercing bis never extend channels
5. ✅ 100% test pass rate
6. ✅ Frontend correctly visualizes channels
7. ✅ Performance: < 100ms for 100 bi detection
