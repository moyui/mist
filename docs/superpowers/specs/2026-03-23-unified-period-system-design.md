# Unified Period System Design Document

**Date:** 2026-03-23
**Author:** Claude Code
**Status:** Draft

---

## Table of Contents

1. [Background](#background)
2. [Goals](#goals)
3. [Solution Overview](#solution-overview)
4. [Architecture Design](#architecture-design)
5. [File Changes](#file-changes)
6. [Error Handling](#error-handling)
7. [Testing Strategy](#testing-strategy)
8. [Implementation Steps](#implementation-steps)
9. [Risk Assessment](#risk-assessment)
10. [Future Optimizations](#future-optimizations)

---

## Background

The mist project currently uses **three different period enums** across different modules:

1. **`KPeriod`** (`libs/shared-data/src/enums/k-period.enum.ts`)
   - String format: `'1min', '5min', '15min', '30min', '60min', 'daily'`
   - Used in: IndicatorQueryDto, K entity, data source mappings

2. **`PeriodType`** (`libs/shared-data/src/enums/index-period.enum.ts`)
   - Numeric format: `1, 5, 15, 30, 60`
   - Used in: Schedule app cron jobs

3. **`Period`** (`apps/mist/src/chan/enums/period.enum.ts`)
   - Numeric format: `1, 5, 15, 30, 60, 1440, 10080, 43200, 129600, 525600`
   - Used in: ChanQueryDto, Chan Theory entities

This fragmentation causes:
- Complex mapping logic in `PeriodMappingService`
- Inconsistent period representations (strings vs numbers)
- Limited period support (KPeriod only goes up to 'daily')
- High maintenance cost and potential for bugs

---

## Goals

### Primary Goals

1. **Single Period Enum**: Unify all period enums into one authoritative `Period` enum in `@app/shared-data`
2. **Complete Period Coverage**: Support all periods from 1-minute to yearly (1, 5, 15, 30, 60, DAY, WEEK, MONTH, QUARTER, YEAR)
3. **Standardized Naming**: Use clear, TypeScript-standard enum member names (ONE_MIN, FIVE_MIN, etc.)
4. **Simplified Mapping**: Remove enum-to-enum conversion logic from `PeriodMappingService`
5. **Type Safety**: Leverage TypeScript for compile-time period validation
6. **One-Time Migration**: Clean deletion of old enums with complete file updates

### Non-Goals

- Backward compatibility with old enum names (complete migration)
- Period calculation utilities (can be added later)
- Dynamic period discovery from data sources (static configuration)

---

## Solution Overview

### Chosen Approach: **Standardized Naming (Option B)**

Based on the requirements for:
- **Code simplification**: Remove mapping complexity
- **Feature expansion**: Support all periods across all modules
- **Type safety**: Strong typing with clear naming

The solution uses the Chan module's `Period` enum as the foundation (since it has the most complete period coverage), moves it to `@app/shared-data`, and standardizes the naming to follow TypeScript conventions.

### Key Design Decisions

1. **Numeric Storage Format**: Keep period values as minutes (e.g., DAY = 1440) for easy time calculations
2. **Location**: Place unified enum in `@app/shared-data` for maximum reusability
3. **Naming Convention**: Use `ONE_MIN`, `FIVE_MIN` instead of `One`, `FIVE` for clarity
4. **Migration Strategy**: One-time rewrite with immediate deletion of old enums
5. **Mapping Service**: PeriodMappingService only handles `Period → data source format` conversion

---

## Architecture Design

### Enum Definition

**File:** `libs/shared-data/src/enums/period.enum.ts`

```typescript
/**
 * Unified period enum for all time-based data operations
 * All period values are stored as minutes for easy time calculations
 */
export enum Period {
  // Minute-level periods
  ONE_MIN = 1,
  FIVE_MIN = 5,
  FIFTEEN_MIN = 15,
  THIRTY_MIN = 30,
  SIXTY_MIN = 60,

  // Day-level and longer periods
  DAY = 1440,           // 1 day = 24 * 60 minutes
  WEEK = 10080,         // 1 week = 7 * 24 * 60 minutes
  MONTH = 43200,        // 1 month = 30 * 24 * 60 minutes
  QUARTER = 129600,     // 1 quarter = 90 * 24 * 60 minutes
  YEAR = 525600,        // 1 year = 365 * 24 * 60 minutes
}
```

### Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│                     API Layer (DTOs)                        │
│  IndicatorQueryDto | ChanQueryDto | QueryMarketDataDto      │
│         period: Period (unified enum)                       │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                   Service Layer                             │
│  IndicatorService | ChanService | CollectorService          │
│         Use Period enum for business logic                  │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│            PeriodMappingService (@app/utils)                │
│     Period → Data Source Format Mapping                     │
│  - toSourceFormat(period, source): string                   │
│  - isSupported(period, source): boolean                     │
│  - getSupportedPeriods(source): Period[]                    │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                   Data Source Layer                          │
│   EastMoneySource | TdxSource | MiniQmtSource               │
│   Use data source-specific period formats for API calls     │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                   Data Layer (TypeORM)                      │
│   K entity (period: Period) - Store in database            │
└─────────────────────────────────────────────────────────────┘
```

### PeriodMappingService Refactor

**Before:**
- Handled `Period` → `KPeriod` conversion
- Handled `KPeriod` → data source format conversion
- Complex multi-step mapping

**After:**
- Only handles `Period` → data source format conversion
- Single-step mapping
- Clean separation of concerns

**Key Changes:**
```typescript
// REMOVED: chanToKPeriodMapping
// REMOVED: toKPeriod() method

// UPDATED: periodMapping now uses Period enum directly
private readonly periodMapping: Record<
  DataSource,
  Partial<Record<Period, string>>
> = {
  [DataSource.EAST_MONEY]: {
    [Period.ONE_MIN]: '1',
    [Period.FIVE_MIN]: '5',
    [Period.FIFTEEN_MIN]: '15',
    [Period.THIRTY_MIN]: '30',
    [Period.SIXTY_MIN]: '60',
    [Period.DAY]: 'daily',
    [Period.WEEK]: '1w',
    [Period.MONTH]: '1M',
  },
  // ... other sources
};
```

---

## File Changes

### Files to Delete (4)

1. ❌ `libs/shared-data/src/enums/k-period.enum.ts`
2. ❌ `libs/shared-data/src/enums/index-period.enum.ts`
3. ❌ `libs/shared-data/src/enums/k-period.enum.spec.ts`
4. ❌ `apps/mist/src/chan/enums/period.enum.ts`

### Files to Create (1)

1. ✨ `libs/shared-data/src/enums/period.enum.ts`

### Files to Update (25+)

#### DTOs (5 files)
1. `apps/mist/src/indicator/dto/query/indicator-query.dto.ts` - `KPeriod` → `Period`
2. `apps/mist/src/chan/dto/query/chan-query.dto.ts` - Local `Period` → unified `Period`
3. `libs/shared-data/src/dto/query-market-data.dto.ts` - `KPeriod` → `Period`
4. `libs/shared-data/src/dto/save-market-data.dto.ts` - `KPeriod` → `Period`
5. `libs/shared-data/src/dto/cron-index-period.dto.ts` - `PeriodType` → `Period`

#### Entities (4 files)
6. `libs/shared-data/src/entities/k.entity.ts` - `KPeriod` → `Period`
7. `apps/mist/src/chan/entities/chan-index-period.entity.ts` - Update import
8. `apps/mist/src/chan/entities/chan-bis.entity.ts` - Update import
9. `apps/mist/src/chan/entities/chan-fenxings.entity.ts` - Update import

#### Services (8 files)
10. `libs/utils/src/services/period-mapping.service.ts` - Remove enum conversion methods
11. `apps/mist/src/sources/tdx.source.ts` - Remove `periodToKLinePeriod()` method
12. `apps/mist/src/sources/east-money.source.ts` - Remove `periodToKLinePeriod()` method
13. `apps/mist/src/collector/collector.service.ts` - Remove `convertPeriodToBarPeriod()` method
14. `apps/mist/src/security/security.service.ts` - Update `mapMinutesToPeriod()` method
15. `apps/mist/src/indicator/indicator.service.ts` - Update interface `KPeriod` → `Period`
16. `apps/mist/src/chan/chan.controller.ts` - Update import path
17. `apps/mist/src/indicator/indicator.controller.ts` - Update if using `KPeriod`

#### Interfaces (1 file)
18. `apps/mist/src/collector/interfaces/source-fetcher.interface.ts` - Update `Period` import

#### Controllers (2 files)
19. `apps/schedule/src/run/run.controller.ts` - `PeriodType` → `Period`
20. `apps/mist/src/chan/chan.controller.ts` - Update import path

#### MCP Server (2 files)
21. `apps/mcp-server/src/services/data-mcp.service.ts` - `KPeriod` → `Period`
22. `apps/mcp-server/src/services/indicator-mcp.service.ts` - Update if using `KPeriod`

#### Test Files (10+ files)
23. All `.spec.ts` files that import or use old enums

### Enum Member Name Mapping

```typescript
// KPeriod → Period (unified)
KPeriod.ONE_MIN     → Period.ONE_MIN      (no change)
KPeriod.FIVE_MIN    → Period.FIVE_MIN     (no change)
KPeriod.FIFTEEN_MIN → Period.FIFTEEN_MIN  (no change)
KPeriod.THIRTY_MIN  → Period.THIRTY_MIN   (no change)
KPeriod.SIXTY_MIN   → Period.SIXTY_MIN    (no change)
KPeriod.DAILY       → Period.DAY          (renamed)

// Period (Chan) → Period (unified)
Period.One          → Period.ONE_MIN      (renamed)
Period.FIVE         → Period.FIVE_MIN     (renamed)
Period.FIFTEEN      → Period.FIFTEEN_MIN  (renamed)
Period.THIRTY       → Period.THIRTY_MIN   (renamed)
Period.SIXTY        → Period.SIXTY_MIN    (renamed)
Period.DAY          → Period.DAY          (no change)
Period.WEEK         → Period.WEEK         (no change)
Period.MONTH        → Period.MONTH        (no change)
Period.QUARTER      → Period.QUARTER      (no change)
Period.YEAR         → Period.YEAR         (no change)

// PeriodType → Period (unified)
PeriodType.One      → Period.ONE_MIN      (renamed)
PeriodType.FIVE     → Period.FIVE_MIN     (renamed)
PeriodType.FIFTEEN  → Period.FIFTEEN_MIN  (renamed)
PeriodType.THIRTY   → Period.THIRTY_MIN   (renamed)
PeriodType.SIXTY    → Period.SIXTY_MIN    (renamed)
// PeriodType had no DAY, WEEK, MONTH - now supported
```

---

## Error Handling

The unified period system leverages the existing error handling infrastructure (`ValidationPipe`, `AllExceptionsFilter`, `TransformInterceptor`).

### DTO Validation Layer

**class-validator** automatically validates enum values:

```typescript
@IsEnum(Period, {
  message: `周期必须是以下值之一: ${Object.values(Period).join(', ')}`,
})
period!: Period;
```

**Example Error Response:**
```json
// Request: { "symbol": "000001", "period": "10min" }
// Response: HTTP 400
{
  "success": false,
  "code": 1001,
  "message": "周期必须是以下值之一: 1, 5, 15, 30, 60, 1440, 10080, 43200, 129600, 525600",
  "timestamp": "2026-03-23T10:30:00.000Z",
  "requestId": "err-1710819800000-abc123"
}
```

### Data Source Support Validation

**PeriodMappingService** throws `BadRequestException` for unsupported periods:

```typescript
toSourceFormat(period: Period, source: DataSource): string {
  const mapping = this.periodMapping[source];
  if (!mapping || !mapping[period]) {
    throw new BadRequestException(
      `Data source ${source} does not support period ${Period[period]}`
    );
  }
  return mapping[period]!;
}
```

**Example Error Response:**
```json
// Request: { "period": 43200 (MONTH), "source": "tdx" }
// Response: HTTP 400
{
  "success": false,
  "code": 2001,
  "message": "Data source tdx does not support period MONTH",
  "timestamp": "2026-03-23T10:30:00.000Z",
  "requestId": "err-1710819800000-def456"
}
```

### Error Handling Flow

```
Invalid Input
    │
    ▼
ValidationPipe (NestJS built-in)
    │
    ▼
class-validator @IsEnum(Period)
    │
    ▼
AllExceptionsFilter
    │
    ▼
TransformInterceptor
    │
    ▼
Unified Error Response
```

---

## Testing Strategy

### Unit Tests

**1. Period Enum Tests**
```typescript
describe('Period Enum', () => {
  it('should have all required period values', () => {
    expect(Period.ONE_MIN).toBe(1);
    expect(Period.FIVE_MIN).toBe(5);
    expect(Period.DAY).toBe(1440);
    expect(Period.WEEK).toBe(10080);
    expect(Period.MONTH).toBe(43200);
  });

  it('should correctly calculate period in minutes', () => {
    expect(Period.WEEK).toBe(7 * 24 * 60);     // 10080
    expect(Period.MONTH).toBe(30 * 24 * 60);   // 43200
    expect(Period.QUARTER).toBe(90 * 24 * 60); // 129600
    expect(Period.YEAR).toBe(365 * 24 * 60);   // 525600
  });
});
```

**2. PeriodMappingService Tests**
```typescript
describe('PeriodMappingService', () => {
  describe('toSourceFormat', () => {
    it('should convert period to east money format', () => {
      expect(service.toSourceFormat(Period.FIVE_MIN, DataSource.EAST_MONEY))
        .toBe('5');
      expect(service.toSourceFormat(Period.DAY, DataSource.EAST_MONEY))
        .toBe('daily');
    });

    it('should convert period to tdx format', () => {
      expect(service.toSourceFormat(Period.FIVE_MIN, DataSource.TDX))
        .toBe('5m');
      expect(service.toSourceFormat(Period.DAY, DataSource.TDX))
        .toBe('1d');
    });

    it('should throw error for unsupported period', () => {
      expect(() =>
        service.toSourceFormat(Period.QUARTER, DataSource.MINI_QMT)
      ).toThrow(BadRequestException);
    });
  });

  describe('isSupported', () => {
    it('should return true for supported periods', () => {
      expect(service.isSupported(Period.FIVE_MIN, DataSource.EAST_MONEY))
        .toBe(true);
    });

    it('should return false for unsupported periods', () => {
      expect(service.isSupported(Period.QUARTER, DataSource.MINI_QMT))
        .toBe(false);
    });
  });

  describe('getSupportedPeriods', () => {
    it('should return all supported periods for a source', () => {
      const periods = service.getSupportedPeriods(DataSource.EAST_MONEY);
      expect(periods).toContain(Period.FIVE_MIN);
      expect(periods).toContain(Period.DAY);
    });
  });
});
```

### Integration Tests

**DTO Validation Tests**
```typescript
describe('IndicatorQueryDto', () => {
  it('should validate valid period', () => {
    const dto = new IndicatorQueryDto();
    dto.symbol = '000001';
    dto.period = Period.FIVE_MIN;
    dto.startDate = Date.now();
    dto.endDate = Date.now();

    const errors = validateSync(dto);
    expect(errors).toHaveLength(0);
  });

  it('should reject invalid period', () => {
    const dto = new IndicatorQueryDto();
    dto.symbol = '000001';
    dto.period = 999 as Period;

    const errors = validateSync(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].constraints).toHaveProperty('isEnum');
  });
});
```

**API Endpoint Tests**
```typescript
describe('IndicatorController (e2e)', () => {
  it('should accept valid period in request', async () => {
    const response = await request(app.getHttpServer())
      .post('/indicator/k')
      .send({
        symbol: '000001',
        period: Period.FIVE_MIN,
        startDate: Date.now() - 86400000,
        endDate: Date.now(),
      })
      .expect(200);

    expect(response.body.success).toBe(true);
  });

  it('should reject invalid period with proper error message', async () => {
    const response = await request(app.getHttpServer())
      .post('/indicator/k')
      .send({
        symbol: '000001',
        period: 'invalid',
        startDate: Date.now() - 86400000,
        endDate: Date.now(),
      })
      .expect(400);

    expect(response.body.success).toBe(false);
    expect(response.body.code).toBe(1001);
  });
});
```

### Test Execution Order

1. Enum definition tests
2. PeriodMappingService unit tests
3. DTO validation tests
4. Service layer integration tests
5. Controller API tests
6. End-to-end tests (if applicable)

---

## Implementation Steps

### Phase 1: Preparation (5 min)

1. **Create new enum file**
   - Create `libs/shared-data/src/enums/period.enum.ts`
   - Update `libs/shared-data/src/index.ts` to export `Period`

2. **Create git branch**
   ```bash
   git checkout -b refactor/unify-period-enum
   ```

### Phase 2: Core File Updates (15 min)

3. **Update PeriodMappingService**
   - Remove `chanToKPeriodMapping` and `toKPeriod()` method
   - Update mapping table to use `Period` enum
   - Run tests: `pnpm test period-mapping.service.spec.ts`

4. **Update shared-data exports**
   - Remove `KPeriod` and `PeriodType` from `libs/shared-data/src/index.ts`
   - Add `Period` to exports

### Phase 3: Entity and DTO Updates (20 min)

5. **Update K entity**
   - `libs/shared-data/src/entities/k.entity.ts`: Change `period: KPeriod` to `period: Period`

6. **Update all DTOs** (in order)
   - `libs/shared-data/src/dto/query-market-data.dto.ts`
   - `libs/shared-data/src/dto/save-market-data.dto.ts`
   - `libs/shared-data/src/dto/cron-index-period.dto.ts`
   - `apps/mist/src/indicator/dto/query/indicator-query.dto.ts`
   - `apps/mist/src/chan/dto/query/chan-query.dto.ts`

### Phase 4: Service Layer Updates (25 min)

7. **Update data source services**
   - `apps/mist/src/sources/tdx.source.ts`: Remove `periodToKLinePeriod()` method
   - `apps/mist/src/sources/east-money.source.ts`: Remove `periodToKLinePeriod()` method
   - Use `Period` enum directly

8. **Update business services**
   - `apps/mist/src/collector/collector.service.ts`: Remove `convertPeriodToBarPeriod()` method
   - `apps/mist/src/security/security.service.ts`: Update `mapMinutesToPeriod()` to use new enum names
   - `apps/mist/src/indicator/indicator.service.ts`: Change interface `KPeriod` → `Period`

9. **Update controllers**
   - `apps/mist/src/chan/chan.controller.ts`: Update import path
   - `apps/schedule/src/run/run.controller.ts`: Change `PeriodType` → `Period`
   - `apps/mist/src/indicator/indicator.controller.ts`: Update if using `KPeriod`

10. **Update interfaces**
    - `apps/mist/src/collector/interfaces/source-fetcher.interface.ts`

11. **Update Chan entities**
    - `apps/mist/src/chan/entities/chan-index-period.entity.ts`
    - `apps/mist/src/chan/entities/chan-bis.entity.ts`
    - `apps/mist/src/chan/entities/chan-fenxings.entity.ts`

12. **Update MCP Server**
    - `apps/mcp-server/src/services/data-mcp.service.ts`
    - `apps/mcp-server/src/services/indicator-mcp.service.ts`

### Phase 5: Cleanup (5 min)

13. **Delete old enum files**
    - `libs/shared-data/src/enums/k-period.enum.ts`
    - `libs/shared-data/src/enums/index-period.enum.ts`
    - `libs/shared-data/src/enums/k-period.enum.spec.ts`
    - `apps/mist/src/chan/enums/period.enum.ts`

### Phase 6: Testing & Verification (20 min)

14. **Run unit tests**
    ```bash
    pnpm test period-mapping.service.spec.ts
    pnpm test
    ```

15. **Run application startup tests**
    ```bash
    pnpm run start:dev:mist     # Check for compilation errors
    pnpm run start:dev:chan
    pnpm run start:dev:schedule
    ```

16. **API functionality tests**
    ```bash
    # Test Indicator endpoint
    curl -X POST http://localhost:8001/indicator/k \
      -H "Content-Type: application/json" \
      -d '{"symbol":"000001","period":5,"startDate":...,"endDate":...}'

    # Test Chan endpoint
    curl -X POST http://localhost:8001/chan/bi \
      -H "Content-Type: application/json" \
      -d '{"symbol":"000001","period":5}'
    ```

### Phase 7: Commit (5 min)

17. **Git commit**
    ```bash
    git add .
    git commit -m "refactor: unify period enum across all modules

    - Replace KPeriod, PeriodType, and local Period with unified Period enum
    - Update all DTOs, entities, services to use Period enum
    - Remove PeriodMappingService enum conversion methods
    - Delete deprecated enum files (k-period, index-period, chan/period)
    - Standardize enum member naming (ONE_MIN, FIVE_MIN, etc.)
    - Support all periods from 1-minute to yearly across all modules"
    ```

**Estimated Total Time:** ~90 minutes

---

## Risk Assessment

### Potential Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| **Enum naming incompatibility** | Chan module's `Period.One` → `Period.ONE_MIN` may affect existing logic | Medium | Global search-and-replace, run full test suite |
| **Incomplete data source mapping** | Some data sources may not support new periods (e.g., QUARTER) | Low | PeriodMappingService throws clear error messages |
| **Insufficient test coverage** | May miss some edge cases | Medium | Focus testing on API endpoints and data source services |
| **Compilation errors** | TypeScript compilation fails | High | Run `pnpm run build` incrementally to catch errors early |
| **Runtime errors** | Some services may fail at runtime | Medium | Start applications one by one, monitor logs |

### Rollback Plan

If critical issues arise:

```bash
# Immediate rollback
git checkout main
git branch -D refactor/unify-period-enum

# Or if commits were made
git reset --hard main
```

### Success Criteria

- ✅ All old enum files deleted
- ✅ All imports updated to use `Period` from `@app/shared-data`
- ✅ All tests pass
- ✅ All applications start without errors
- ✅ API endpoints return valid responses
- ✅ No TypeScript compilation errors
- ✅ No runtime errors in logs

---

## Future Optimizations

### Optimization 1: Period Helper Utilities

Add utility service for common period operations:

```typescript
// libs/utils/src/services/period-helper.service.ts
@Injectable()
export class PeriodHelper {
  /**
   * Get human-readable display name for period
   */
  static getDisplayName(period: Period): string {
    const names: Record<Period, string> = {
      [Period.ONE_MIN]: '1分钟',
      [Period.FIVE_MIN]: '5分钟',
      [Period.DAY]: '日线',
      [Period.WEEK]: '周线',
      [Period.MONTH]: '月线',
      [Period.QUARTER]: '季线',
      [Period.YEAR]: '年线',
    };
    return names[period];
  }

  /**
   * Convert period to milliseconds
   */
  static toMilliseconds(period: Period): number {
    return period * 60 * 1000;
  }

  /**
   * Parse period from string ('1min', '5min', 'daily', '1w', '1M')
   */
  static fromString(str: string): Period {
    const mapping: Record<string, Period> = {
      '1min': Period.ONE_MIN,
      '5min': Period.FIVE_MIN,
      '15min': Period.FIFTEEN_MIN,
      '30min': Period.THIRTY_MIN,
      '60min': Period.SIXTY_MIN,
      'daily': Period.DAY,
      '1d': Period.DAY,
      '1w': Period.WEEK,
      '1M': Period.MONTH,
    };
    const result = mapping[str.toLowerCase()];
    if (!result) {
      throw new BadRequestException(`Invalid period string: ${str}`);
    }
    return result;
  }

  /**
   * Convert period to string format
   */
  static toString(period: Period): string {
    const mapping: Record<Period, string> = {
      [Period.ONE_MIN]: '1min',
      [Period.FIVE_MIN]: '5min',
      [Period.FIFTEEN_MIN]: '15min',
      [Period.THIRTY_MIN]: '30min',
      [Period.SIXTY_MIN]: '60min',
      [Period.DAY]: 'daily',
      [Period.WEEK]: '1w',
      [Period.MONTH]: '1M',
      [Period.QUARTER]: '1Q',
      [Period.YEAR]: '1Y',
    };
    return mapping[period];
  }
}
```

### Optimization 2: Data Source Capability Declaration

Declare data source capabilities explicitly:

```typescript
interface DataSourceCapabilities {
  source: DataSource;
  supportedPeriods: Period[];
  realtimeSupport: boolean;
  historicalLimitDays: number;
}

const DATA_SOURCE_CAPABILITIES: DataSourceCapabilities[] = [
  {
    source: DataSource.EAST_MONEY,
    supportedPeriods: [
      Period.ONE_MIN,
      Period.FIVE_MIN,
      Period.FIFTEEN_MIN,
      Period.THIRTY_MIN,
      Period.SIXTY_MIN,
      Period.DAY,
    ],
    realtimeSupport: true,
    historicalLimitDays: 365,
  },
  {
    source: DataSource.TDX,
    supportedPeriods: [
      Period.ONE_MIN,
      Period.FIVE_MIN,
      Period.FIFTEEN_MIN,
      Period.THIRTY_MIN,
      Period.SIXTY_MIN,
      Period.DAY,
      Period.WEEK,
      Period.MONTH,
    ],
    realtimeSupport: false,
    historicalLimitDays: 180,
  },
  {
    source: DataSource.MINI_QMT,
    supportedPeriods: [
      Period.ONE_MIN,
      Period.FIVE_MIN,
      Period.FIFTEEN_MIN,
      Period.THIRTY_MIN,
      Period.SIXTY_MIN,
      Period.DAY,
    ],
    realtimeSupport: true,
    historicalLimitDays: 90,
  },
];
```

**Note:** These optimizations are **not included** in the current refactoring scope. They can be implemented in future iterations based on actual needs.

---

## Summary

This design document outlines a comprehensive refactoring to unify the period system across the entire mist codebase. By consolidating three different period enums into a single, well-named `Period` enum in `@app/shared-data`, we achieve:

1. **Code Simplification**: Remove complex enum-to-enum conversion logic
2. **Feature Expansion**: Support all periods from 1-minute to yearly
3. **Type Safety**: Leverage TypeScript for compile-time validation
4. **Maintainability**: Single source of truth for period definitions
5. **Developer Experience**: Clear, standardized naming conventions

The one-time migration strategy ensures clean deletion of old code, while the phased implementation approach minimizes risk and allows for incremental verification.

---

**Next Steps:**
1. Review and approve this design document
2. Invoke `writing-plans` skill to create detailed implementation plan
3. Execute implementation following the 7-phase approach
4. Run comprehensive tests
5. Deploy and monitor

---

**Document Version:** 1.0
**Last Updated:** 2026-03-23
