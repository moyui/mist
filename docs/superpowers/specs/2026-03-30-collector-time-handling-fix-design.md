# Collector Time Handling Fix Design

**Date**: 2026-03-30
**Status**: Draft

## Problem

The collector module has a fundamental business logic error in time handling. Two distinct use cases share the same time calculation logic, but they require completely different time semantics:

1. **Manual collection (API)**: Should accept user-specified `startDate`/`endDate` and collect all data within that range.
2. **Scheduled collection (Cron)**: Should collect only the **previous completed K candle**, calculated from the trigger time.

Currently, both paths use `EastMoneyTimeWindowStrategy.calculateCollectionWindow`, which returns a wide lookback window (e.g., 2 hours for 1min, 2 days for 5min). This is incorrect for both use cases.

## Requirements

### Manual Collection

- User passes `startDate` and `endDate` via API DTO
- Strategy passes these directly to `CollectorService` — no time window calculation
- Minutes-level: user specifies exact time range
- Daily/weekly/monthly+: user specifies date range

### Scheduled Collection (Minute-Level)

- Collect only the previous completed K candle
- K candle boundaries align to **market session start times** (9:30 for morning, 13:00 for afternoon), NOT natural time boundaries
- Examples:
  - 9:32 trigger 1min → collect 9:31-9:32 candle
  - 9:36 trigger 5min → collect 9:30-9:35 candle
  - 9:46 trigger 15min → collect 9:30-9:45 candle
  - 10:31 trigger 60min → collect 9:30-10:30 candle
  - 14:01 trigger 60min → collect 13:00-14:00 candle

### Scheduled Collection (Daily+)

- Post-market collection after market close
- Daily: 18:00 on trading days, collect today's candle
- Weekly: 18:00 on Fridays, collect this week's candle
- Monthly/Quarterly/Yearly: 18:00 on period-end trading day, collect current period's candle

## Design

### 1. Interface Changes (`IDataCollectionStrategy`)

```typescript
interface IDataCollectionStrategy {
  readonly source: DataSource;
  readonly mode: CollectionMode;

  // Manual collection: explicit time range
  collectForSecurity(
    security: Security,
    period: Period,
    startDate: Date,
    endDate: Date,
  ): Promise<void>;

  // Optional: scheduled collection of previous completed candle
  collectScheduledCandle?(
    security: Security,
    period: Period,
    triggerTime?: Date,
  ): Promise<void>;

  // Optional: batch scheduled collection for all active securities
  collectForAllSecurities?(period: Period, triggerTime?: Date): Promise<void>;

  // Optional: streaming methods
  start?(): Promise<void>;
  stop?(): Promise<void>;
}
```

**Rationale**: `collectScheduledCandle` and `collectForAllSecurities` are optional because streaming strategies (e.g., TDX) may not support polling-based scheduled collection.

### 2. KBoundaryCalculator

A pure utility class in `libs/utils/src/services/` that calculates the previous completed K candle's time boundaries.

#### Interface

```typescript
interface KCandleBoundary {
  startTime: Date;
  endTime: Date;
}

@Injectable()
export class KBoundaryCalculator {
  calculateMinuteCandle(period: Period, triggerTime: Date): KCandleBoundary | null;
  calculateDailyPlusCandle(period: Period, triggerTime: Date): KCandleBoundary;
  calculate(period: Period, triggerTime: Date): KCandleBoundary | null;
}
```

#### Minute-Level Calculation

A-share market sessions: 9:30-11:30 (morning), 13:00-15:00 (afternoon).

K candle boundaries align to **session start times**, not natural time boundaries. For example, 60min candles are: 9:30-10:30, 10:30-11:30, 13:00-14:00, 14:00-15:00.

**Formula**:

```
sessionStart = getSessionStart(triggerTime)   // 9:30 or 13:00
minutesSinceSessionStart = triggerMinutes - sessionStartMinutes
candleEndOffset = floor(minutesSinceSessionStart / periodMinutes) × periodMinutes

endTime   = sessionStart + candleEndOffset
startTime = endTime - periodMinutes
```

**Verification table**:

| Period | Trigger Time | Session Start | Offset | endTime | startTime |
|--------|-------------|---------------|--------|---------|-----------|
| 1min | 9:32 | 9:30 | floor(2/1)×1=2 | 9:32 | 9:31 |
| 5min | 9:36 | 9:30 | floor(6/5)×5=5 | 9:35 | 9:30 |
| 15min | 9:46 | 9:30 | floor(16/15)×15=15 | 9:45 | 9:30 |
| 30min | 10:01 | 9:30 | floor(31/30)×30=30 | 10:00 | 9:30 |
| 60min | 10:31 | 9:30 | floor(61/60)×60=60 | 10:30 | 9:30 |
| 60min | 14:01 | 13:00 | floor(61/60)×60=60 | 14:00 | 13:00 |

Returns `null` if triggerTime is outside trading sessions (early morning, lunch break, overnight).

#### Daily+ Calculation

Natural time boundaries, collected after market close.

| Period | Trigger Time | startTime | endTime |
|--------|-------------|-----------|---------|
| daily | 18:00 weekdays | today 00:00 | today 23:59 |
| weekly | 18:00 Friday | this Monday 00:00 | this Friday 23:59 |
| monthly | 18:00 last trading day of month | 1st of month 00:00 | last day of month 23:59 |
| quarterly | 18:00 last trading day of quarter | quarter start 00:00 | quarter end 23:59 |
| yearly | 18:00 last trading day of year | Jan 1 00:00 | Dec 31 23:59 |

### 3. Cron Schedule Changes

Cron expressions must fire after K candle close, not at natural time boundaries.

| Period | Current Cron | New Cron | Rationale |
|--------|-------------|---------|-----------|
| 1min | `EVERY_MINUTE` | `1-59 * * * 1-5` | Every minute after candle close, weekdays only |
| 5min | `EVERY_5_MINUTES` | `1,6,11,16,21,26,31,36,41,46,51,56 * * * 1-5` | 1min after each 5min candle close |
| 15min | `*/15 * * * *` | `1,16,31,46 * * * 1-5` | 1min after each 15min candle close |
| 30min | `EVERY_30_MINUTES` | `1,31 * * * 1-5` | 1min after each 30min candle close |
| 60min | `EVERY_HOUR` | `31 * * * 1-5` | 1min after each 60min candle close (10:31, 11:31, 14:31) |
| daily | `5 15 * * 1-5` | `0 18 * * 1-5` | 18:00 weekdays, post-market |
| weekly | none | `0 18 * * 5` | Friday 18:00 |
| monthly | none | `0 18 28-31 * *` + last-trading-day check | Last few days of month + trading day check |

`isTradingDay()` is kept as secondary validation (holiday calendar), while cron `1-5` excludes weekends.

### 4. Data Flow

#### Manual Collection (New)

```
API Request (startDate, endDate)
  → CollectorController.collect()
    → strategy.collectForSecurity(security, period, startDate, endDate)
      → collectorService.collectKLineForSource(code, period, startDate, endDate, source)
        → sourceFetcher.fetchKLine({ code, period, startDate, endDate })
        → saveKData()
```

No time window calculation — user-provided dates pass through directly.

#### Scheduled Collection (New)

```
Cron trigger (triggerTime = now)
  → strategy.collectForAllSecurities(period, triggerTime)
    → for each active security:
      → strategy.collectScheduledCandle(security, period, triggerTime)
        → kBoundaryCalculator.calculate(period, triggerTime) → { startTime, endTime }
        → collectorService.collectKLineForSource(code, period, startTime, endTime, source)
          → sourceFetcher.fetchKLine({ code, period, startTime, endTime })
          → saveKData()
```

Precisely one K candle per trigger.

### 5. File Changes

#### New Files

| File | Description |
|------|-------------|
| `libs/utils/src/services/k-boundary-calculator.ts` | K boundary calculation, pure logic |
| `libs/utils/src/services/k-boundary-calculator.spec.ts` | Unit tests for boundary calculation |

#### Modified Files

| File | Change |
|------|--------|
| `collector/dto/collect.dto.ts` | Add optional `startDate`/`endDate` fields |
| `collector/collector.controller.ts` | Pass DTO's startDate/endDate to strategy |
| `strategies/data-collection.strategy.interface.ts` | `collectForSecurity` signature change; add optional `collectScheduledCandle?`, `collectForAllSecurities?` |
| `strategies/east-money-collection.strategy.ts` | Implement new interface, remove time-window dependency, inject KBoundaryCalculator |
| `schedulers/schedule.controller.ts` | Update cron expressions, call `collectForAllSecurities` |
| `collector/collector.module.ts` | Update providers (remove time-window, add k-boundary) |
| `libs/utils/src/index.ts` | Export KBoundaryCalculator |

#### Deleted Files

| File | Reason |
|------|--------|
| `time-window/time-window.strategy.interface.ts` | Entire time-window concept replaced by KBoundaryCalculator |
| `time-window/east-money-time-window.strategy.ts` | Replaced by KBoundaryCalculator |
| `time-window/` directory | Cleared after migration |

#### Unchanged Files

| File | Reason |
|------|--------|
| `collector.service.ts` | `collectKLineForSource` already accepts startDate/endDate |
| `sources/east-money.source.ts` | `fetchKLine` interface unchanged |
| `sources/tdx.source.ts` | Same |
| `sources/interfaces/source-fetcher.interface.ts` | Same |

### 6. Edge Cases

1. **triggerTime outside trading sessions**: KBoundaryCalculator returns `null`, `collectScheduledCandle` skips collection.
2. **Manual collection without startDate/endDate**: DTO fields are `@IsOptional()`. Strategy can either use a sensible default or throw validation error — behavior TBD during implementation.
3. **Holiday handling**: `isTradingDay()` covers basic weekend exclusion. Holiday calendar integration is a future TODO.
4. **Non-trading-day cron triggers**: Cron `1-5` + `isTradingDay()` double-check prevents unnecessary work.

### 7. Testing Strategy

- **KBoundaryCalculator**: Comprehensive unit tests covering all periods, session boundaries, edge cases (lunch break, overnight, market open/close)
- **EastMoneyCollectionStrategy**: Test `collectScheduledCandle` with mocked KBoundaryCalculator and CollectorService
- **CollectDto**: Validation tests for new optional fields
- **ScheduleController**: Verify cron expressions trigger at correct times (integration test or manual verification)
