# Collector Time Handling Fix Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the fundamental time handling bug by separating manual collection (user-specified date range) from scheduled collection (previous completed K candle).

**Architecture:** Replace the shared `EastMoneyTimeWindowStrategy` with a stateless `KBoundaryCalculator` utility. Split `IDataCollectionStrategy` into two methods: `collectForSecurity` for manual and `collectScheduledCandle` for scheduled. Update `CollectDto` to require `startDate`/`endDate`. Update cron expressions and fire 1 minute after K candle close.

**Tech Stack:** NestJS, TypeScript, Jest, date-fns

**Spec:** `docs/superpowers/specs/2026-03-30-collector-time-handling-fix-design.md`

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `libs/utils/src/services/k-boundary-calculator.ts` | Pure utility: calculate previous completed K candle boundaries from trigger time + period |
| `libs/utils/src/services/k-boundary-calculator.spec.ts` | Unit tests for KBoundaryCalculator |

### Modified Files

| File | Change |
|------|--------|
| `apps/mist/src/collector/strategies/data-collection.strategy.interface.ts` | Rename `collectForSecurity` → `collectForSecurity(security, period, startDate, endDate)`, add optional `collectScheduledCandle?` and `collectForAllSecurities?` |
| `apps/mist/src/collector/strategies/east-money-collection.strategy.ts` | Remove time-window dependency, use KBoundaryCalculator, implement new interface methods |
| `apps/mist/src/collector/strategies/east-money-collection.strategy.spec.ts` | Rewrite tests for new interface |
| `apps/mist/src/collector/dto/collect.dto.ts` | Add required `startDate`/`endDate` fields |
| `apps/mist/src/collector/collector.controller.ts` | Pass DTO's startDate/endDate to strategy |
| `apps/mist/src/collector/collector.module.ts` | Remove time-window providers |
| `apps/schedule/src/schedulers/schedule.controller.ts` | Update cron expressions, call `collectForAllSecurities` with triggerTime |
| `libs/utils/src/index.ts` | Export KBoundaryCalculator |

### Deleted Files

| File | Reason |
|------|--------|
| `apps/mist/src/collector/time-window/time-window.strategy.interface.ts` | Replaced by KBoundaryCalculator |
| `apps/mist/src/collector/time-window/east-money-time-window.strategy.ts` | Replaced by KBoundaryCalculator |
| `apps/mist/src/collector/time-window/east-money-time-window.strategy.spec.ts` | Tests for deleted strategy |

---

## Task 1: Create KBoundaryCalculator

**Files:**
- Create: `libs/utils/src/services/k-boundary-calculator.ts`
- Create: `libs/utils/src/services/k-boundary-calculator.spec.ts`

This is a pure utility class with no dependencies. It calculates the previous completed K candle boundaries given a trigger time and period.

### Step 1.1: Write the failing test for minute-level calculation

- [ ] **Write the test file**

```typescript
// libs/utils/src/services/k-boundary-calculator.spec.ts
import { KBoundaryCalculator, KCandleBoundary } from './k-boundary-calculator';
import { Period } from '@app/shared-data';

describe('KBoundaryCalculator', () => {
  let calculator: KBoundaryCalculator;

  beforeEach(() => {
    calculator = new KBoundaryCalculator();
  });

  describe('calculateMinuteCandle', () => {
    it('should return 9:31-9:32 for 1min at 9:32', () => {
      const triggerTime = new Date('2026-03-30T09:32:00+08:00');
      const result = calculator.calculateMinuteCandle(Period.ONE_MIN, triggerTime);
      expect(result).not.toBeNull();
      expect(result!.startTime).toEqual(new Date('2026-03-30T09:31:00+08:00'));
      expect(result!.endTime).toEqual(new Date('2026-03-30T09:32:00+08:00'));
    });

    it('should return 9:30-9:35 for 5min at 9:36', () => {
      const triggerTime = new Date('2026-03-30T09:36:00+08:00');
      const result = calculator.calculateMinuteCandle(Period.FIVE_MIN, triggerTime);
      expect(result).not.toBeNull();
      expect(result!.startTime).toEqual(new Date('2026-03-30T09:30:00+08:00'));
      expect(result!.endTime).toEqual(new Date('2026-03-30T09:35:00+08:00'));
    });

    it('should return 9:30-9:45 for 15min at 9:46', () => {
      const triggerTime = new Date('2026-03-30T09:46:00+08:00');
      const result = calculator.calculateMinuteCandle(Period.FIFTEEN_MIN, triggerTime);
      expect(result).not.toBeNull();
      expect(result!.startTime).toEqual(new Date('2026-03-30T09:30:00+08:00'));
      expect(result!.endTime).toEqual(new Date('2026-03-30T09:45:00+08:00'));
    });

    it('should return 9:30-10:00 for 30min at 10:01', () => {
      const triggerTime = new Date('2026-03-30T10:01:00+08:00');
      const result = calculator.calculateMinuteCandle(Period.THIRTY_MIN, triggerTime);
      expect(result).not.toBeNull();
      expect(result!.startTime).toEqual(new Date('2026-03-30T09:30:00+08:00'));
      expect(result!.endTime).toEqual(new Date('2026-03-30T10:00:00+08:00'));
    });

    it('should return 9:30-10:30 for 60min at 10:31', () => {
      const triggerTime = new Date('2026-03-30T10:31:00+08:00');
      const result = calculator.calculateMinuteCandle(Period.SIXTY_MIN, triggerTime);
      expect(result).not.toBeNull();
      expect(result!.startTime).toEqual(new Date('2026-03-30T09:30:00+08:00'));
      expect(result!.endTime).toEqual(new Date('2026-03-30T10:30:00+08:00'));
    });

    it('should return 13:00-14:00 for 60min at 14:01 (afternoon session)', () => {
      const triggerTime = new Date('2026-03-30T14:01:00+08:00');
      const result = calculator.calculateMinuteCandle(Period.SIXTY_MIN, triggerTime);
      expect(result).not.toBeNull();
      expect(result!.startTime).toEqual(new Date('2026-03-30T13:00:00+08:00'));
      expect(result!.endTime).toEqual(new Date('2026-03-30T14:00:00+08:00'));
    });

    it('should return null for trigger time during lunch break (12:31)', () => {
      const triggerTime = new Date('2026-03-30T12:31:00+08:00');
      const result = calculator.calculateMinuteCandle(Period.FIVE_MIN, triggerTime);
      expect(result).toBeNull();
    });

    it('should return null for trigger time at night (23:31)', () => {
      const triggerTime = new Date('2026-03-30T23:31:00+08:00');
      const result = calculator.calculateMinuteCandle(Period.SIXTY_MIN, triggerTime);
      expect(result).toBeNull();
    });

    it('should return null for trigger time at early morning (8:00)', () => {
      const triggerTime = new Date('2026-03-30T08:00:00+08:00');
      const result = calculator.calculateMinuteCandle(Period.ONE_MIN, triggerTime);
      expect(result).toBeNull();
    });

    it('should return 13:00-13:05 for 5min at 13:06 (afternoon session start)', () => {
      const triggerTime = new Date('2026-03-30T13:06:00+08:00');
      const result = calculator.calculateMinuteCandle(Period.FIVE_MIN, triggerTime);
      expect(result).not.toBeNull();
      expect(result!.startTime).toEqual(new Date('2026-03-30T13:00:00+08:00'));
      expect(result!.endTime).toEqual(new Date('2026-03-30T13:05:00+08:00'));
    });

    it('should return 11:00-11:30 for 30min at 11:31 (near morning session end)', () => {
      const triggerTime = new Date('2026-03-30T11:31:00+08:00');
      const result = calculator.calculateMinuteCandle(Period.THIRTY_MIN, triggerTime);
      expect(result).not.toBeNull();
      expect(result!.startTime).toEqual(new Date('2026-03-30T11:00:00+08:00'));
      expect(result!.endTime).toEqual(new Date('2026-03-30T11:30:00+08:00'));
    });
  });

  describe('calculateDailyPlusCandle', () => {
    it('should return today 00:00 - next day 00:00 for daily', () => {
      const triggerTime = new Date('2026-03-30T18:00:00+08:00');
      const result = calculator.calculateDailyPlusCandle(Period.DAY, triggerTime);
      expect(result.startTime).toEqual(new Date('2026-03-30T00:00:00+08:00'));
      expect(result.endTime).toEqual(new Date('2026-03-31T00:00:00+08:00'));
    });

    it('should return Monday - next Monday for weekly (triggered on Friday)', () => {
      // 2026-03-27 is a Friday
      const triggerTime = new Date('2026-03-27T18:00:00+08:00');
      const result = calculator.calculateDailyPlusCandle(Period.WEEK, triggerTime);
      // Monday of that week is 2026-03-23
      expect(result.startTime.getDay()).toBe(1); // Monday
      expect(result.endTime.getDay()).toBe(1); // Next Monday
      expect(result.endTime.getTime() - result.startTime.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
    });

    it('should return March 1 - April 1 for monthly (triggered in March)', () => {
      const triggerTime = new Date('2026-03-30T18:00:00+08:00');
      const result = calculator.calculateDailyPlusCandle(Period.MONTH, triggerTime);
      expect(result.startTime).toEqual(new Date('2026-03-01T00:00:00+08:00'));
      expect(result.endTime).toEqual(new Date('2026-04-01T00:00:00+08:00'));
    });

    it('should return quarter start - next quarter start for quarterly', () => {
      // February is in Q1 (Jan-Mar)
      const triggerTime = new Date('2026-02-28T18:00:00+08:00');
      const result = calculator.calculateDailyPlusCandle(Period.QUARTER, triggerTime);
      expect(result.startTime).toEqual(new Date('2026-01-01T00:00:00+08:00'));
      expect(result.endTime).toEqual(new Date('2026-04-01T00:00:00+08:00'));
    });

    it('should return Jan 1 - next Jan 1 for yearly', () => {
      const triggerTime = new Date('2026-03-30T18:00:00+08:00');
      const result = calculator.calculateDailyPlusCandle(Period.YEAR, triggerTime);
      expect(result.startTime).toEqual(new Date('2026-01-01T00:00:00+08:00'));
      expect(result.endTime).toEqual(new Date('2027-01-01T00:00:00+08:00'));
    });
  });

  describe('calculate (dispatcher)', () => {
    it('should delegate to calculateMinuteCandle for minute periods', () => {
      const triggerTime = new Date('2026-03-30T09:36:00+08:00');
      const result = calculator.calculate(Period.FIVE_MIN, triggerTime);
      expect(result).not.toBeNull();
      expect(result!.startTime).toEqual(new Date('2026-03-30T09:30:00+08:00'));
      expect(result!.endTime).toEqual(new Date('2026-03-30T09:35:00+08:00'));
    });

    it('should delegate to calculateDailyPlusCandle for daily+ periods', () => {
      const triggerTime = new Date('2026-03-30T18:00:00+08:00');
      const result = calculator.calculate(Period.DAY, triggerTime);
      expect(result).not.toBeNull();
      expect(result!.startTime).toEqual(new Date('2026-03-30T00:00:00+08:00'));
    });

    it('should return null for minute period outside trading hours', () => {
      const triggerTime = new Date('2026-03-30T23:00:00+08:00');
      const result = calculator.calculate(Period.FIVE_MIN, triggerTime);
      expect(result).toBeNull();
    });
  });
});
```

- [ ] **Run tests to verify they fail**

Run: `npx jest --config jest.config.ts libs/utils/src/services/k-boundary-calculator.spec.ts --no-coverage`
Expected: FAIL (module not found)

- [ ] **Implement KBoundaryCalculator**

```typescript
// libs/utils/src/services/k-boundary-calculator.ts
import { Period } from '@app/shared-data';

export interface KCandleBoundary {
  startTime: Date;
  endTime: Date;
}

/**
 * Pure utility for calculating the previous completed K candle's time boundaries.
 *
 * A-share market sessions:
 * - Morning: 9:30 - 11:30
 * - Afternoon: 13:00 - 15:00
 *
 * K candle boundaries align to session start times, not natural time boundaries.
 * For example, 60min candles are: 9:30-10:30, 10:30-11:30, 13:00-14:00, 14:00-15:00.
 */
export class KBoundaryCalculator {
  /**
   * Calculate the previous completed K candle boundaries for a given period and trigger time.
   */
  calculate(period: Period, triggerTime: Date): KCandleBoundary | null {
    if (period >= Period.DAY) {
      return this.calculateDailyPlusCandle(period, triggerTime);
    }
    return this.calculateMinuteCandle(period, triggerTime);
  }

  /**
   * Calculate minute-level K candle boundaries.
   * Returns null if triggerTime is outside trading sessions.
   */
  calculateMinuteCandle(
    period: Period,
    triggerTime: Date,
  ): KCandleBoundary | null {
    const sessionStart = this.getSessionStart(triggerTime);
    if (!sessionStart) {
      return null;
    }

    const triggerMinutes =
      triggerTime.getHours() * 60 + triggerTime.getMinutes();
    const sessionStartMinutes =
      sessionStart.getHours() * 60 + sessionStart.getMinutes();
    const periodMinutes = period as number;

    const minutesSinceSessionStart = triggerMinutes - sessionStartMinutes;
    const candleEndOffset =
      Math.floor(minutesSinceSessionStart / periodMinutes) * periodMinutes;

    const endTime = new Date(sessionStart.getTime());
    endTime.setMinutes(endTime.getMinutes() + candleEndOffset);
    endTime.setSeconds(0, 0);

    const startTime = new Date(endTime.getTime());
    startTime.setMinutes(startTime.getMinutes() - periodMinutes);

    return { startTime, endTime };
  }

  /**
   * Calculate daily+ K candle boundaries using natural time boundaries.
   */
  calculateDailyPlusCandle(period: Period, triggerTime: Date): KCandleBoundary {
    const year = triggerTime.getFullYear();
    const month = triggerTime.getMonth();

    switch (period) {
      case Period.DAY: {
        const startTime = new Date(year, month, triggerTime.getDate(), 0, 0, 0, 0);
        const endTime = new Date(year, month, triggerTime.getDate() + 1, 0, 0, 0, 0);
        return { startTime, endTime };
      }
      case Period.WEEK: {
        const dayOfWeek = triggerTime.getDay();
        const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        const monday = new Date(triggerTime);
        monday.setDate(monday.getDate() - daysSinceMonday);
        monday.setHours(0, 0, 0, 0);

        const nextMonday = new Date(monday);
        nextMonday.setDate(nextMonday.getDate() + 7);

        return { startTime: monday, endTime: nextMonday };
      }
      case Period.MONTH: {
        const startTime = new Date(year, month, 1, 0, 0, 0, 0);
        const endTime = new Date(year, month + 1, 1, 0, 0, 0, 0);
        return { startTime, endTime };
      }
      case Period.QUARTER: {
        const quarterStartMonth = Math.floor(month / 3) * 3;
        const startTime = new Date(year, quarterStartMonth, 1, 0, 0, 0, 0);
        const endTime = new Date(year, quarterStartMonth + 3, 1, 0, 0, 0, 0);
        return { startTime, endTime };
      }
      case Period.YEAR: {
        const startTime = new Date(year, 0, 1, 0, 0, 0, 0);
        const endTime = new Date(year + 1, 0, 1, 0, 0, 0, 0);
        return { startTime, endTime };
      }
      default:
        throw new Error(`Unsupported period: ${period}`);
    }
  }

  /**
   * Determine which market session the trigger time falls into.
   * Returns the session start time, or null if outside trading sessions.
   */
  private getSessionStart(triggerTime: Date): Date | null {
    const hours = triggerTime.getHours();
    const minutes = triggerTime.getMinutes();
    const totalMinutes = hours * 60 + minutes;

    // Morning session: 9:30 - 11:30
    const morningStart = 9 * 60 + 30; // 570
    const morningEnd = 11 * 60 + 30; // 690
    if (totalMinutes >= morningStart && totalMinutes <= morningEnd) {
      return new Date(
        triggerTime.getFullYear(),
        triggerTime.getMonth(),
        triggerTime.getDate(),
        9, 30, 0, 0,
      );
    }

    // Afternoon session: 13:00 - 15:00
    const afternoonStart = 13 * 60; // 780
    const afternoonEnd = 15 * 60; // 900
    if (totalMinutes >= afternoonStart && totalMinutes <= afternoonEnd) {
      return new Date(
        triggerTime.getFullYear(),
        triggerTime.getMonth(),
        triggerTime.getDate(),
        13, 0, 0, 0,
      );
    }

    return null;
  }
}
```

- [ ] **Run tests to verify they pass**

Run: `npx jest --config jest.config.ts libs/utils/src/services/k-boundary-calculator.spec.ts --no-coverage`
Expected: PASS (all 20 tests)

- [ ] **Update `libs/utils/src/index.ts` to export KBoundaryCalculator**

Add the following line to the end of the file:
```typescript
export * from './services/k-boundary-calculator';
```

- [ ] **Commit**

```bash
git add libs/utils/src/services/k-boundary-calculator.ts libs/utils/src/services/k-boundary-calculator.spec.ts libs/utils/src/index.ts
git commit -m "feat: add KBoundaryCalculator for K candle boundary calculation"
```

---

## Task 2: Update IDataCollectionStrategy Interface

**Files:**
- Modify: `apps/mist/src/collector/strategies/data-collection.strategy.interface.ts`

This task only changes the interface. Tests will be written in Task 3 when the implementation is updated.

**Note:** After this task, the codebase will have a type mismatch between the interface and the existing `EastMoneyCollectionStrategy` implementation. This is resolved in Task 3.

### Step 2.1: Update the interface

- [ ] **Replace the entire file content with:**

**Replace** the entire file content with:

```typescript
// apps/mist/src/collector/strategies/data-collection.strategy.interface.ts
import { Security, Period, DataSource } from '@app/shared-data';

/**
 * Data collection mode.
 * - polling: Actively fetch data on schedule (East Money)
 * - streaming: Receive data via WebSocket push (TDX, miniQMT)
 */
export type CollectionMode = 'polling' | 'streaming';

/**
 * Data collection strategy interface.
 *
 * All data sources must implement this interface.
 * Each strategy encapsulates the collection logic for a specific data source.
 */
export interface IDataCollectionStrategy {
  /**
   * Data source type (e.g., EAST_MONEY, TDX, MINI_QMT)
   */
  readonly source: DataSource;

  /**
   * Collection mode.
   * - polling: Actively fetch data on schedule (East Money)
   * - streaming: Receive data via WebSocket push (TDX, miniQMT)
   */
  readonly mode: CollectionMode;

  /**
   * Manual collection: collect data for a specific time range.
   *
   * @param security - Security entity
   * @param period - K-line period
   * @param startDate - Start of the time range (inclusive)
   * @param endDate - End of the time range (exclusive)
   */
  collectForSecurity(
    security: Security,
    period: Period,
    startDate: Date,
    endDate: Date,
  ): Promise<void>;

  /**
   * Scheduled collection: collect the previous completed K candle.
   * Only available for polling strategies.
   *
   * @param security - Security entity
   * @param period - K-line period
   * @param triggerTime - The time when the collection is triggered (defaults to now)
   */
  collectScheduledCandle?(
    security: Security,
    period: Period,
    triggerTime?: Date,
  ): Promise<void>;

  /**
   * Batch scheduled collection for all active securities.
   * Only available for polling strategies.
   *
   * @param period - K-line period
   * @param triggerTime - The time when the collection is triggered (defaults to now)
   */
  collectForAllSecurities?(period: Period, triggerTime?: Date): Promise<void>;

  /**
   * Start the strategy (for streaming mode).
   */
  start?(): Promise<void>;

  /**
   * Stop the strategy (for streaming mode).
   */
  stop?(): Promise<void>;
}
```

- [ ] **Commit**

```bash
git add apps/mist/src/collector/strategies/data-collection.strategy.interface.ts
git commit -m "refactor: update IDataCollectionStrategy interface with separate manual and scheduled methods"
```

---

## Task 3: Update EastMoneyCollectionStrategy

**Files:**
- Modify: `apps/mist/src/collector/strategies/east-money-collection.strategy.ts`
- Modify: `apps/mist/src/collector/strategies/east-money-collection.strategy.spec.ts`

### Step 3.1: Write failing tests for the new interface

- [ ] **Write the updated test file**

```typescript
// apps/mist/src/collector/strategies/east-money-collection.strategy.spec.ts
import {
  Period,
  DataSource,
  SecurityType,
  SecurityStatus,
} from '@app/shared-data';
import { EastMoneyCollectionStrategy } from './east-money-collection.strategy';

describe('EastMoneyCollectionStrategy', () => {
  let strategy: EastMoneyCollectionStrategy;
  let mockCollectorService: any;
  let mockSecurityRepository: any;

  beforeEach(() => {
    mockCollectorService = {
      collectKLineForSource: jest.fn().mockResolvedValue(undefined),
    };

    mockSecurityRepository = {
      find: jest.fn(),
    };

    strategy = new EastMoneyCollectionStrategy(
      mockSecurityRepository as any,
      mockCollectorService,
    );
  });

  describe('strategy properties', () => {
    it('should have EAST_MONEY as source', () => {
      expect(strategy.source).toBe(DataSource.EAST_MONEY);
    });

    it('should have polling as mode', () => {
      expect(strategy.mode).toBe('polling');
    });
  });

  describe('collectForSecurity (manual)', () => {
    const createMockSecurity = (code: string) => ({
      id: 1,
      code,
      name: `Test ${code}`,
      type: SecurityType.STOCK,
      status: SecurityStatus.ACTIVE,
      sourceConfigs: [],
      ks: [],
      createTime: new Date(),
      updateTime: new Date(),
    });

    it('should pass startDate/endDate directly to collectorService', async () => {
      const security = createMockSecurity('000001.SH');
      const startDate = new Date('2026-03-30T09:30:00+08:00');
      const endDate = new Date('2026-03-30T11:30:00+08:00');

      await strategy.collectForSecurity(
        security,
        Period.FIVE_MIN,
        startDate,
        endDate,
      );

      expect(mockCollectorService.collectKLineForSource).toHaveBeenCalledWith(
        security.code,
        Period.FIVE_MIN,
        startDate,
        endDate,
        DataSource.EAST_MONEY,
      );
    });

    it('should handle collection errors', async () => {
      const security = createMockSecurity('000001.SH');
      const startDate = new Date('2026-03-30T09:30:00+08:00');
      const endDate = new Date('2026-03-30T11:30:00+08:00');

      mockCollectorService.collectKLineForSource.mockRejectedValue(
        new Error('Network error'),
      );

      await expect(
        strategy.collectForSecurity(security, Period.FIVE_MIN, startDate, endDate),
      ).rejects.toThrow('Network error');
    });
  });

  describe('collectScheduledCandle', () => {
    const createMockSecurity = (code: string) => ({
      id: 1,
      code,
      name: `Test ${code}`,
      type: SecurityType.STOCK,
      status: SecurityStatus.ACTIVE,
      sourceConfigs: [],
      ks: [],
      createTime: new Date(),
      updateTime: new Date(),
    });

    it('should calculate boundary and collect for minute period', async () => {
      const security = createMockSecurity('000001.SH');
      const triggerTime = new Date('2026-03-30T09:36:00+08:00');

      await strategy.collectScheduledCandle!(security, Period.FIVE_MIN, triggerTime);

      expect(mockCollectorService.collectKLineForSource).toHaveBeenCalledWith(
        security.code,
        Period.FIVE_MIN,
        expect.any(Date), // startTime = 9:30
        expect.any(Date), // endTime = 9:35
        DataSource.EAST_MONEY,
      );

      const call = mockCollectorService.collectKLineForSource.mock.calls[0];
      expect(call[2].getTime()).toBe(new Date('2026-03-30T09:30:00+08:00').getTime());
      expect(call[3].getTime()).toBe(new Date('2026-03-30T09:35:00+08:00').getTime());
    });

    it('should skip when triggerTime is outside trading session', async () => {
      const security = createMockSecurity('000001.SH');
      const triggerTime = new Date('2026-03-30T12:31:00+08:00'); // lunch break

      await strategy.collectScheduledCandle!(security, Period.FIVE_MIN, triggerTime);

      expect(mockCollectorService.collectKLineForSource).not.toHaveBeenCalled();
    });

    it('should use current time when triggerTime not provided', async () => {
      const security = createMockSecurity('000001.SH');

      await strategy.collectScheduledCandle!(security, Period.FIVE_MIN);

      // Should either call collectorService or skip depending on current time
      // Just verify it doesn't throw
    });
  });

  describe('collectForAllSecurities', () => {
    const createMockSecurity = (code: string) => ({
      id: 1,
      code,
      name: `Test ${code}`,
      type: SecurityType.STOCK,
      status: SecurityStatus.ACTIVE,
      sourceConfigs: [],
      ks: [],
      createTime: new Date(),
      updateTime: new Date(),
    });

    it('should query active securities and collect for each', async () => {
      const securities = [
        createMockSecurity('000001.SH'),
        createMockSecurity('399006.SZ'),
      ];

      mockSecurityRepository.find.mockResolvedValue(securities);

      const triggerTime = new Date('2026-03-30T09:36:00+08:00');
      await strategy.collectForAllSecurities!(Period.FIVE_MIN, triggerTime);

      expect(mockSecurityRepository.find).toHaveBeenCalledWith({
        where: { status: SecurityStatus.ACTIVE },
      });

      expect(mockCollectorService.collectKLineForSource).toHaveBeenCalledTimes(2);
    });

    it('should skip when no active securities', async () => {
      mockSecurityRepository.find.mockResolvedValue([]);

      await strategy.collectForAllSecurities!(Period.FIVE_MIN);

      expect(mockCollectorService.collectKLineForSource).not.toHaveBeenCalled();
    });

    it('should continue on individual security errors', async () => {
      const securities = [
        createMockSecurity('000001.SH'),
        createMockSecurity('399006.SZ'),
      ];

      mockSecurityRepository.find.mockResolvedValue(securities);
      mockCollectorService.collectKLineForSource
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(undefined);

      await strategy.collectForAllSecurities!(Period.FIVE_MIN);

      expect(mockCollectorService.collectKLineForSource).toHaveBeenCalledTimes(2);
    });
  });
});
```

- [ ] **Run tests to verify they fail**

Run: `npx jest --config jest.config.ts apps/mist/src/collector/strategies/east-money-collection.strategy.spec.ts --no-coverage`
Expected: FAIL (method signature mismatch)

- [ ] **Implement the updated EastMoneyCollectionStrategy**

```typescript
// apps/mist/src/collector/strategies/east-money-collection.strategy.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Security, SecurityStatus, Period, DataSource } from '@app/shared-data';
import { CollectorService } from '../collector.service';
import {
  IDataCollectionStrategy,
  CollectionMode,
} from './data-collection.strategy.interface';
import { KBoundaryCalculator } from '@app/utils';

@Injectable()
export class EastMoneyCollectionStrategy implements IDataCollectionStrategy {
  readonly source = DataSource.EAST_MONEY;
  readonly mode: CollectionMode = 'polling';
  private readonly logger = new Logger(EastMoneyCollectionStrategy.name);
  private readonly calculator = new KBoundaryCalculator();

  constructor(
    @InjectRepository(Security)
    private readonly securityRepository: Repository<Security>,
    private readonly collectorService: CollectorService,
  ) {}

  /**
   * Manual collection: collect data for a user-specified time range.
   * Passes startDate/endDate directly to CollectorService.
   */
  async collectForSecurity(
    security: Security,
    period: Period,
    startDate: Date,
    endDate: Date,
  ): Promise<void> {
    try {
      await this.collectorService.collectKLineForSource(
        security.code,
        period,
        startDate,
        endDate,
        this.source,
      );
      this.logger.log(
        `Manual collection completed for ${security.code} ${period}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to collect ${security.code} ${period}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Scheduled collection: collect the previous completed K candle.
   * Uses KBoundaryCalculator to determine the exact candle time boundaries.
   */
  async collectScheduledCandle(
    security: Security,
    period: Period,
    triggerTime?: Date,
  ): Promise<void> {
    const time = triggerTime || new Date();
    const boundary = this.calculator.calculate(period, time);

    if (!boundary) {
      this.logger.debug(
        `Skipping scheduled collection for ${security.code} ${period} at ${time.toISOString()} (outside trading session)`,
      );
      return;
    }

    try {
      await this.collectorService.collectKLineForSource(
        security.code,
        period,
        boundary.startTime,
        boundary.endTime,
        this.source,
      );
      this.logger.log(
        `Scheduled collection completed for ${security.code} ${period} from ${boundary.startTime.toISOString()} to ${boundary.endTime.toISOString()}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed scheduled collection for ${security.code} ${period}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Batch scheduled collection for all active securities.
   */
  async collectForAllSecurities(period: Period, triggerTime?: Date): Promise<void> {
    const activeSecurities = await this.securityRepository.find({
      where: { status: SecurityStatus.ACTIVE },
    });

    if (activeSecurities.length === 0) {
      this.logger.debug('No active securities found for collection');
      return;
    }

    this.logger.log(
      `Scheduled collection for ${period}: ${activeSecurities.length} securities`,
    );

    const results = await Promise.allSettled(
      activeSecurities.map((security) =>
        this.collectScheduledCandle!(security, period, triggerTime),
      ),
    );

    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;

    this.logger.log(
      `Scheduled collection completed for ${period}: ${succeeded} succeeded, ${failed} failed`,
    );

    if (failed > 0) {
      results
        .filter((r) => r.status === 'rejected')
        .forEach((r) => {
          this.logger.error(
            `Collection failed: ${(r as PromiseRejectedResult).reason?.message || 'Unknown error'}`,
          );
        });
    }
  }
}
```

- [ ] **Run tests to verify they pass**

Run: `npx jest --config jest.config.ts apps/mist/src/collector/strategies/east-money-collection.strategy.spec.ts --no-coverage`
Expected: PASS (all tests)

- [ ] **Commit**

```bash
git add apps/mist/src/collector/strategies/east-money-collection.strategy.ts apps/mist/src/collector/strategies/east-money-collection.strategy.spec.ts
git commit -m "refactor: update EastMoneyCollectionStrategy with separate manual and scheduled methods"
```

---

## Task 4: Update CollectDto and CollectorController

**Files:**
- Modify: `apps/mist/src/collector/dto/collect.dto.ts`
- Modify: `apps/mist/src/collector/collector.controller.ts`

### Step 4.1: Update CollectDto to require startDate/endDate

- [ ] **Replace the DTO**

```typescript
// apps/mist/src/collector/dto/collect.dto.ts
import { IsNotEmpty, IsEnum, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Period, DataSource } from '@app/shared-data';

export class CollectDto {
  @ApiProperty({ description: '证券代码', example: '000001.SH' })
  @IsNotEmpty({ message: '证券代码不能为空' })
  code!: string;

  @ApiProperty({
    description: 'K线周期',
    enum: Period,
    example: Period.FIVE_MIN,
  })
  @IsEnum(Period, {
    message: `周期必须是以下数值之一: ${Object.keys(Period)
      .filter((k) => isNaN(Number(k)))
      .join(', ')}`,
  })
  period!: Period;

  @ApiProperty({
    description: '开始时间',
    example: '2026-03-30T09:30:00+08:00',
  })
  @IsNotEmpty({ message: '开始时间不能为空' })
  @IsDateString({ strict: true })
  startDate!: string;

  @ApiProperty({
    description: '结束时间',
    example: '2026-03-30T11:30:00+08:00',
  })
  @IsNotEmpty({ message: '结束时间不能为空' })
  @IsDateString({ strict: true })
  endDate!: string;

  @ApiPropertyOptional({
    description: '数据源',
    enum: DataSource,
    example: DataSource.EAST_MONEY,
  })
  @IsEnum(DataSource, {
    message: `数据源必须是以下值之一: ${Object.keys(DataSource)
      .filter((k) => isNaN(Number(k)))
      .join(', ')}`,
  })
  source?: DataSource;
}
```

### Step 4.2: Update CollectorController to pass dates to strategy

- [ ] **Update the controller**

Replace the `collect` method body. The rest of the controller (imports, class declaration, constructor) stays the same.

```typescript
// Replace only the collect method body in CollectorController
async collect(
  @Body() dto: CollectDto,
): Promise<{ code: string; period: number }> {
  // 1. Resolve security
  const security = await this.securityService.findSecurityByCode(dto.code);

  // 2. Validate source against security's configured sources
  const sourceConfigs = await this.securityService.getSecuritySources(dto.code);
  const enabledSources = sourceConfigs.filter((c) => c.enabled);

  if (enabledSources.length === 0) {
    throw new BadRequestException(
      `No enabled data source configured for security: ${dto.code}`,
    );
  }

  if (dto.source) {
    const matched = enabledSources.find((c) => c.source === dto.source);
    if (!matched) {
      const configuredSources = enabledSources.map((c) => c.source).join(', ');
      throw new BadRequestException(
        `Source mismatch: requested '${dto.source}', but security ${dto.code} only has configured sources: ${configuredSources}`,
      );
    }
  }

  // 3. Resolve strategy and collect with user-provided dates
  const strategy = this.registry.resolve(dto.source);
  const startDate = new Date(dto.startDate);
  const endDate = new Date(dto.endDate);

  await strategy.collectForSecurity(security, dto.period, startDate, endDate);

  return { code: dto.code, period: dto.period };
}
```

- [ ] **Verify build compiles**

Run: `npx tsc --noEmit -p apps/mist/tsconfig.app.json`
Expected: No type errors

- [ ] **Commit**

```bash
git add apps/mist/src/collector/dto/collect.dto.ts apps/mist/src/collector/collector.controller.ts
git commit -m "feat: update CollectDto and CollectorController for manual time range collection"
```

---

## Task 5: Update CollectorModule

**Files:**
- Modify: `apps/mist/src/collector/collector.module.ts`

Remove `EastMoneyTimeWindowStrategy` provider. The strategy no longer injects it (it uses `KBoundaryCalculator` directly via `new`).

### Step 5.1: Update module providers

- [ ] **Update the module**

```typescript
// apps/mist/src/collector/collector.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { K, SecuritySourceConfig } from '@app/shared-data';
import { CollectorService } from './collector.service';
import { CollectorController } from './collector.controller';
import { EastMoneyCollectionStrategy } from './strategies/east-money-collection.strategy';
import { EastMoneySource } from '../sources/east-money.source';
import { TdxSource } from '../sources/tdx.source';
import { UtilsModule } from '@app/utils';
import { SecurityModule } from '../security/security.module';
import {
  COLLECTION_STRATEGIES,
  CollectionStrategyRegistry,
} from './strategies/collection-strategy.registry';

@Module({
  imports: [
    TypeOrmModule.forFeature([K, SecuritySourceConfig]),
    UtilsModule,
    SecurityModule,
  ],
  providers: [
    CollectorService,
    EastMoneyCollectionStrategy,
    EastMoneySource,
    TdxSource,
    {
      provide: COLLECTION_STRATEGIES,
      useFactory: (eastMoney: EastMoneyCollectionStrategy) => [eastMoney],
      inject: [EastMoneyCollectionStrategy],
    },
    CollectionStrategyRegistry,
  ],
  controllers: [CollectorController],
  exports: [CollectorService, EastMoneyCollectionStrategy],
})
export class CollectorModule {}
```

Changes: Removed `EastMoneyTimeWindowStrategy` import and provider.

- [ ] **Commit**

```bash
git add apps/mist/src/collector/collector.module.ts
git commit -m "refactor: remove EastMoneyTimeWindowStrategy from CollectorModule"
```

---

## Task 6: Update ScheduleController Cron Expressions

**Files:**
- Modify: `apps/schedule/src/schedulers/schedule.controller.ts`

### Step 6.1: Update cron expressions and method calls

- [ ] **Replace the entire file**

```typescript
// apps/schedule/src/schedulers/schedule.controller.ts
import { Controller, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Period } from '@app/shared-data';
import { EastMoneyCollectionStrategy } from '../../../mist/src/collector/strategies/east-money-collection.strategy';

/**
 * Schedule Controller with Cron Jobs.
 *
 * Cron expressions fire 1 minute after K candle close to ensure the candle is complete.
 * K candle boundaries align to A-share market session start times (9:30, 13:00).
 *
 * Non-market-hour triggers are guarded by KBoundaryCalculator returning null.
 */
@Controller('schedule')
export class DataCollectionScheduleController {
  private readonly logger = new Logger(DataCollectionScheduleController.name);

  constructor(private readonly strategy: EastMoneyCollectionStrategy) {}

  private isTradingDay(): boolean {
    const dayOfWeek = new Date().getDay();
    return dayOfWeek !== 0 && dayOfWeek !== 6;
  }

  // 1min: fire at :01, :02, ..., :59 every weekday
  @Cron('1-59 * * * 1-5')
  async handleOneMinuteCollection(): Promise<void> {
    if (!this.isTradingDay()) return;
    try {
      await this.strategy.collectForAllSecurities?.(Period.ONE_MIN);
    } catch (error) {
      this.logger.error(`1min collection failed: ${error.message}`);
    }
  }

  // 5min: fire at :01, :06, :11, ... after each 5min candle close
  @Cron('1,6,11,16,21,26,31,36,41,46,51,56 * * * 1-5')
  async handleFiveMinuteCollection(): Promise<void> {
    if (!this.isTradingDay()) return;
    try {
      await this.strategy.collectForAllSecurities?.(Period.FIVE_MIN);
    } catch (error) {
      this.logger.error(`5min collection failed: ${error.message}`);
    }
  }

  // 15min: fire at :01, :16, :31, :46 after each 15min candle close
  @Cron('1,16,31,46 * * * 1-5')
  async handleFifteenMinuteCollection(): Promise<void> {
    if (!this.isTradingDay()) return;
    try {
      await this.strategy.collectForAllSecurities?.(Period.FIFTEEN_MIN);
    } catch (error) {
      this.logger.error(`15min collection failed: ${error.message}`);
    }
  }

  // 30min: fire at :01, :31 after each 30min candle close
  @Cron('1,31 * * * 1-5')
  async handleThirtyMinuteCollection(): Promise<void> {
    if (!this.isTradingDay()) return;
    try {
      await this.strategy.collectForAllSecurities?.(Period.THIRTY_MIN);
    } catch (error) {
      this.logger.error(`30min collection failed: ${error.message}`);
    }
  }

  // 60min: fire at :31 after each 60min candle close (9:30→10:31, 10:30→11:31, 13:00→14:31, 14:00→15:31)
  @Cron('31 * * * 1-5')
  async handleSixtyMinuteCollection(): Promise<void> {
    if (!this.isTradingDay()) return;
    try {
      await this.strategy.collectForAllSecurities?.(Period.SIXTY_MIN);
    } catch (error) {
      this.logger.error(`60min collection failed: ${error.message}`);
    }
  }

  // daily: 18:00 weekdays, post-market
  @Cron('0 18 * * 1-5')
  async handleDailyCollection(): Promise<void> {
    if (!this.isTradingDay()) return;
    try {
      await this.strategy.collectForAllSecurities?.(Period.DAY);
    } catch (error) {
      this.logger.error(`Daily collection failed: ${error.message}`);
    }
  }

  // weekly: Friday 18:00
  @Cron('0 18 * * 5')
  async handleWeeklyCollection(): Promise<void> {
    if (!this.isTradingDay()) return;
    try {
      await this.strategy.collectForAllSecurities?.(Period.WEEK);
    } catch (error) {
      this.logger.error(`Weekly collection failed: ${error.message}`);
    }
  }

  // monthly: 18:00 on days 28-31 with last-trading-day-of-month check
  @Cron('0 18 28-31 * *')
  async handleMonthlyCollection(): Promise<void> {
    if (!this.isTradingDay()) return;
    // Only run on the last trading day of the month
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (tomorrow.getMonth() === now.getMonth()) return; // not last day yet
    try {
      await this.strategy.collectForAllSecurities?.(Period.MONTH);
    } catch (error) {
      this.logger.error(`Monthly collection failed: ${error.message}`);
    }
  }
}
```

- [ ] **Verify build compiles**

Run: `npx tsc --noEmit -p apps/schedule/tsconfig.app.json`
Expected: No type errors

- [ ] **Commit**

```bash
git add apps/schedule/src/schedulers/schedule.controller.ts
git commit -m "feat: update cron expressions for K-candle-aligned scheduled collection"
```

---

## Task 7: Delete Time-Window Files

**Files:**
- Delete: `apps/mist/src/collector/time-window/time-window.strategy.interface.ts`
- Delete: `apps/mist/src/collector/time-window/east-money-time-window.strategy.ts`
- Delete: `apps/mist/src/collector/time-window/east-money-time-window.strategy.spec.ts`
- Delete: `apps/mist/src/collector/time-window/` directory

### Step 7.1: Verify no remaining imports of deleted files

- [ ] **Search for any remaining imports of time-window files**

Run: `grep -r "time-window" apps/ apps/schedule/ libs/ --include="*.ts"`
Expected: No results (all references should have been removed in previous tasks)

If any results found, fix them first before proceeding.

- [ ] **Delete the files and directory**

```bash
rm -rf apps/mist/src/collector/time-window/
```

- [ ] **Run full test suite to verify nothing is broken**

Run: `pnpm run test`
Expected: All tests pass

- [ ] **Commit**

```bash
git add -A
git commit -m "refactor: remove obsolete time-window strategy files"
```

---

## Task 8: Final Verification

**Files:** None (verification only)

### Step 8.1: Run full build and tests

- [ ] **Run TypeScript build check**

Run: `npx tsc --noEmit -p apps/mist/tsconfig.app.json && npx tsc --noEmit -p apps/schedule/tsconfig.app.json`
Expected: No type errors in either app

- [ ] **Run full test suite**

Run: `pnpm run test`
Expected: All tests pass

- [ ] **Commit final state if any remaining changes**

```bash
git add -A
git commit -m "chore: final cleanup for collector time handling fix"
```
