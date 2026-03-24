# Unified Period System Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify three different period enums (KPeriod, PeriodType, and local Period) into a single authoritative Period enum in @app/shared-data, supporting all periods from 1-minute to yearly.

**Architecture:** Replace all enum-to-enum conversion logic with a single Period enum that stores values as minutes. Update all DTOs, entities, services, and controllers to use the unified enum. Delete old enum files and update PeriodMappingService to handle Period → data source format conversion only.

**Tech Stack:** NestJS 10, TypeScript 5, TypeORM, class-validator, node-talib

---

## File Structure

### Files to Create (1)
- `libs/shared-data/src/enums/period.enum.ts` - Unified Period enum with all periods as minutes

### Files to Delete (4)
- `libs/shared-data/src/enums/k-period.enum.ts` - Old string-based KPeriod enum
- `libs/shared-data/src/enums/index-period.enum.ts` - Old numeric PeriodType enum
- `libs/shared-data/src/enums/k-period.enum.spec.ts` - Old KPeriod tests
- `apps/mist/src/chan/enums/period.enum.ts` - Old local Period enum

### Files to Modify

**DTOs (5 files):**
- `libs/shared-data/src/dto/query-market-data.dto.ts` - KPeriod → Period
- `libs/shared-data/src/dto/save-market-data.dto.ts` - KPeriod → Period
- `libs/shared-data/src/dto/cron-index-period.dto.ts` - PeriodType → Period
- `apps/mist/src/indicator/dto/query/indicator-query.dto.ts` - KPeriod → Period
- `apps/mist/src/chan/dto/query/chan-query.dto.ts` - Local Period import → unified Period

**Entities (4 files):**
- `libs/shared-data/src/entities/k.entity.ts` - KPeriod → Period
- `apps/mist/src/chan/entities/chan-index-period.entity.ts` - Update Period import path
- `apps/mist/src/chan/entities/chan-bis.entity.ts` - Update Period import path
- `apps/mist/src/chan/entities/chan-fenxings.entity.ts` - Update Period import path

**Services (8 files):**
- `libs/utils/src/services/period-mapping.service.ts` - Remove toKPeriod(), update mapping to use Period
- `apps/mist/src/sources/tdx.source.ts` - Remove periodToKLinePeriod() method
- `apps/mist/src/sources/east-money.source.ts` - Remove periodToKLinePeriod() method
- `apps/mist/src/collector/collector.service.ts` - Remove convertPeriodToBarPeriod() method
- `apps/mist/src/security/security.service.ts` - Update mapMinutesToPeriod() enum names
- `apps/mist/src/indicator/indicator.service.ts` - Update interface KPeriod → Period
- `apps/mist/src/chan/chan.controller.ts` - Update Period import path
- `apps/mist/src/indicator/indicator.controller.ts` - Update if using KPeriod

**Controllers (2 files):**
- `apps/mist/src/chan/chan.controller.ts` - Update Period import path
- `apps/schedule/src/run/run.controller.ts` - PeriodType → Period

**Interfaces (1 file):**
- `apps/mist/src/collector/interfaces/source-fetcher.interface.ts` - Update Period import

**MCP Server (2 files):**
- `apps/mcp-server/src/services/data-mcp.service.ts` - KPeriod → Period
- `apps/mcp-server/src/services/data-mcp.service.spec.ts` - KPeriod → Period

**Tests (10+ files):**
- All `.spec.ts` files that import or use old enums

**Exports (1 file):**
- `libs/shared-data/src/index.ts` - Remove KPeriod/PeriodType, add Period

---

## Implementation Tasks

### Task 1: Create Unified Period Enum

**Files:**
- Create: `libs/shared-data/src/enums/period.enum.ts`

- [ ] **Step 1: Create the unified Period enum file**

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

- [ ] **Step 2: Export Period from shared-data index**

```bash
# Edit libs/shared-data/src/index.ts
```

Remove lines:
```typescript
export * from './enums/k-period.enum';
export * from './enums/index-period.enum';
```

Add line:
```typescript
export * from './enums/period.enum';
```

- [ ] **Step 3: Verify compilation**

```bash
cd /Users/xiyugao/code/mist/mist
pnpm run build
```

Expected: SUCCESS (no errors from new enum)

- [ ] **Step 4: Commit**

```bash
git add libs/shared-data/src/enums/period.enum.ts libs/shared-data/src/index.ts
git commit -m "feat: add unified Period enum to shared-data

- Add Period enum with all periods from 1-minute to yearly
- Export Period from shared-data index
- Period values stored as minutes for easy calculations"
```

---

### Task 2: Update PeriodMappingService

**Files:**
- Modify: `libs/utils/src/services/period-mapping.service.ts`
- Modify: `libs/utils/src/services/period-mapping.service.spec.ts`

- [ ] **Step 1: Write failing test for Period enum usage**

```bash
# Edit libs/utils/src/services/period-mapping.service.spec.ts
```

Add test:
```typescript
describe('PeriodMappingService with unified Period enum', () => {
  it('should accept Period.ONE_MIN and return correct format', () => {
    const result = service.toSourceFormat(Period.ONE_MIN, DataSource.EAST_MONEY);
    expect(result).toBe('1');
  });

  it('should accept Period.DAY and return daily format', () => {
    const result = service.toSourceFormat(Period.DAY, DataSource.EAST_MONEY);
    expect(result).toBe('daily');
  });

  it('should throw error for unsupported period', () => {
    expect(() =>
      service.toSourceFormat(Period.QUARTER, DataSource.TDX)
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/xiyugao/code/mist/mist
pnpm test period-mapping.service.spec.ts
```

Expected: FAIL (Period enum not imported, old methods still exist)

- [ ] **Step 3: Update PeriodMappingService to use Period enum**

```bash
# Edit libs/utils/src/services/period-mapping.service.ts
```

Replace entire file content:
```typescript
import { Injectable, BadRequestException } from '@nestjs/common';
import { DataSource, Period } from '@app/shared-data';

@Injectable()
export class PeriodMappingService {
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
    [DataSource.TDX]: {
      [Period.ONE_MIN]: '1m',
      [Period.FIVE_MIN]: '5m',
      [Period.FIFTEEN_MIN]: '15m',
      [Period.THIRTY_MIN]: '30m',
      [Period.SIXTY_MIN]: '60m',
      [Period.DAY]: '1d',
      [Period.WEEK]: '1w',
      [Period.MONTH]: '1M',
    },
    [DataSource.MINI_QMT]: {
      [Period.ONE_MIN]: '1',
      [Period.FIVE_MIN]: '5',
      [Period.FIFTEEN_MIN]: '15',
      [Period.THIRTY_MIN]: '30',
      [Period.SIXTY_MIN]: '60',
      [Period.DAY]: 'daily',
    },
  };

  /**
   * Convert period to source-specific format
   */
  toSourceFormat(period: Period, source: DataSource): string {
    const mapping = this.periodMapping[source];
    if (!mapping || !mapping[period]) {
      throw new BadRequestException(
        `Data source ${source} does not support period ${Period[period]}`,
      );
    }
    return mapping[period]!;
  }

  /**
   * Check if source supports the period
   */
  isSupported(period: Period, source: DataSource): boolean {
    const mapping = this.periodMapping[source];
    return !!(mapping && mapping[period]);
  }

  /**
   * Get all supported periods for a source
   */
  getSupportedPeriods(source: DataSource): Period[] {
    const mapping = this.periodMapping[source];
    return mapping ? (Object.keys(mapping).map(Number) as Period[]) : [];
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test period-mapping.service.spec.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add libs/utils/src/services/period-mapping.service.ts libs/utils/src/services/period-mapping.service.spec.ts
git commit -m "refactor: update PeriodMappingService to use unified Period enum

- Remove toKPeriod() method and chanToKPeriodMapping
- Update periodMapping to use Period enum directly
- Add support for WEEK and MONTH periods
- Update tests to use Period enum"
```

---

### Task 3: Update K Entity

**Files:**
- Modify: `libs/shared-data/src/entities/k.entity.ts`

- [ ] **Step 1: Update K entity to use Period enum**

```bash
# Edit libs/shared-data/src/entities/k.entity.ts
```

Change line 12:
```typescript
// Before
import { KPeriod } from '../enums/k-period.enum';

// After
import { Period } from '../enums/period.enum';
```

Change lines 37-42:
```typescript
// Before
@Column({
  type: 'enum',
  enum: KPeriod,
  comment: 'K线周期：1min, 5min, 15min, 30min, 60min, daily等',
})
period: KPeriod = KPeriod.DAILY;

// After
@Column({
  type: 'enum',
  enum: Period,
  comment: 'K线周期：1, 5, 15, 30, 60, 1440 (day), 10080 (week), 43200 (month)',
})
period: Period = Period.DAY;
```

- [ ] **Step 2: Verify compilation**

```bash
pnpm run build
```

Expected: SUCCESS

- [ ] **Step 3: Commit**

```bash
git add libs/shared-data/src/entities/k.entity.ts
git commit -m "refactor: update K entity to use Period enum

- Change period column type from KPeriod to Period
- Update default period from DAILY to DAY
- Update comment to reflect numeric period values"
```

---

### Task 4: Update Shared DTOs

**Files:**
- Modify: `libs/shared-data/src/dto/query-market-data.dto.ts`
- Modify: `libs/shared-data/src/dto/save-market-data.dto.ts`
- Modify: `libs/shared-data/src/dto/cron-index-period.dto.ts`

- [ ] **Step 1: Update QueryMarketDataDto**

```bash
# Edit libs/shared-data/src/dto/query-market-data.dto.ts
```

Change import:
```typescript
// Before
import { KPeriod } from '../enums/k-period.enum';

// After
import { Period } from '../enums/period.enum';
```

Change period type:
```typescript
// Before
period!: KPeriod;

// After
period!: Period;
```

- [ ] **Step 2: Update SaveMarketDataDto**

```bash
# Edit libs/shared-data/src/dto/save-market-data.dto.ts
```

Change import and period type same as Step 1.

- [ ] **Step 3: Update CronIndexPeriodDto**

```bash
# Edit libs/shared-data/src/dto/cron-index-period.dto.ts
```

Change import:
```typescript
// Before
import { PeriodType } from '@app/shared-data';

// After
import { Period } from '@app/shared-data';
```

Change period type:
```typescript
// Before
periodType!: PeriodType;

// After
periodType!: Period;
```

- [ ] **Step 4: Verify compilation**

```bash
pnpm run build
```

Expected: SUCCESS

- [ ] **Step 5: Commit**

```bash
git add libs/shared-data/src/dto/query-market-data.dto.ts libs/shared-data/src/dto/save-market-data.dto.ts libs/shared-data/src/dto/cron-index-period.dto.ts
git commit -m "refactor: update shared DTOs to use Period enum

- Update QueryMarketDataDto: KPeriod → Period
- Update SaveMarketDataDto: KPeriod → Period
- Update CronIndexPeriodDto: PeriodType → Period"
```

---

### Task 5: Update Indicator Module

**Files:**
- Modify: `apps/mist/src/indicator/dto/query/indicator-query.dto.ts`
- Modify: `apps/mist/src/indicator/indicator.service.ts`
- Modify: `apps/mist/src/indicator/indicator.controller.ts` (if needed)

- [ ] **Step 1: Update IndicatorQueryDto**

```bash
# Edit apps/mist/src/indicator/dto/query/indicator-query.dto.ts
```

Change import:
```typescript
// Before
import { DataSource, KPeriod } from '@app/shared-data';

// After
import { DataSource, Period } from '@app/shared-data';
```

Change period type and validation:
```typescript
// Before
@IsEnum(KPeriod, {
  message:
    '周期只能为1min, 5min, 15min, 30min, 60min, daily，其中 1 分钟数据只能返回当前的, 其余只能返回近期的数据',
})
period!: KPeriod;

// After
@IsEnum(Period, {
  message: `周期必须是以下数值之一: ${Object.values(Period).join(', ')}`,
})
period!: Period;
```

- [ ] **Step 2: Update IndicatorService**

```bash
# Edit apps/mist/src/indicator/indicator.service.ts
```

Find and replace all occurrences of `KPeriod` with `Period` in the file.

- [ ] **Step 3: Verify compilation**

```bash
pnpm run build
```

Expected: SUCCESS

- [ ] **Step 4: Commit**

```bash
git add apps/mist/src/indicator/dto/query/indicator-query.dto.ts apps/mist/src/indicator/indicator.service.ts
git commit -m "refactor: update indicator module to use Period enum

- Update IndicatorQueryDto: KPeriod → Period
- Update IndicatorService interface: KPeriod → Period
- Update validation message to show Period enum values"
```

---

### Task 6: Update Chan Module

**Files:**
- Modify: `apps/mist/src/chan/dto/query/chan-query.dto.ts`
- Modify: `apps/mist/src/chan/entities/chan-index-period.entity.ts`
- Modify: `apps/mist/src/chan/entities/chan-bis.entity.ts`
- Modify: `apps/mist/src/chan/entities/chan-fenxings.entity.ts`
- Modify: `apps/mist/src/chan/chan.controller.ts`

- [ ] **Step 1: Update ChanQueryDto import**

```bash
# Edit apps/mist/src/chan/dto/query/chan-query.dto.ts
```

Change import:
```typescript
// Before
import { DataSource } from '@app/shared-data';
import { Period } from '../../enums/period.enum';

// After
import { DataSource, Period } from '@app/shared-data';
```

- [ ] **Step 2: Update Chan entities**

```bash
# Edit apps/mist/src/chan/entities/chan-index-period.entity.ts
# Edit apps/mist/src/chan/entities/chan-bis.entity.ts
# Edit apps/mist/src/chan/entities/chan-fenxings.entity.ts
```

Change import in each file:
```typescript
// Before
import { Period } from '../../enums/period.enum';

// After
import { Period } from '@app/shared-data';
```

- [ ] **Step 3: Update chan.controller.ts**

```bash
# Edit apps/mist/src/chan/chan.controller.ts
```

Remove:
```typescript
import { Period } from './enums/period.enum';
```

The Period import is now from @app/shared-data via ChanQueryDto.

- [ ] **Step 4: Verify compilation**

```bash
pnpm run build
```

Expected: SUCCESS

- [ ] **Step 5: Commit**

```bash
git add apps/mist/src/chan/dto/query/chan-query.dto.ts apps/mist/src/chan/entities/ apps/mist/src/chan/chan.controller.ts
git commit -m "refactor: update chan module to use unified Period enum

- Update ChanQueryDto to import Period from @app/shared-data
- Update all Chan entities to import Period from @app/shared-data
- Remove local Period enum import from chan.controller.ts"
```

---

### Task 7: Update Data Source Services

**Files:**
- Modify: `apps/mist/src/sources/tdx.source.ts`
- Modify: `apps/mist/src/sources/east-money.source.ts`

- [ ] **Step 1: Update TdxSource**

```bash
# Edit apps/mist/src/sources/tdx.source.ts
```

Find and remove the `periodToKLinePeriod()` method (if exists).
Update all references to use Period enum directly from @app/shared-data.

- [ ] **Step 2: Update EastMoneySource**

```bash
# Edit apps/mist/src/sources/east-money.source.ts
```

Find and remove the `periodToKLinePeriod()` method (if exists).
Update all references to use Period enum directly from @app/shared-data.

- [ ] **Step 3: Verify compilation**

```bash
pnpm run build
```

Expected: SUCCESS

- [ ] **Step 4: Commit**

```bash
git add apps/mist/src/sources/tdx.source.ts apps/mist/src/sources/east-money.source.ts
git commit -m "refactor: update data source services to use Period enum

- Remove periodToKLinePeriod() method from TdxSource
- Remove periodToKLinePeriod() method from EastMoneySource
- Use Period enum directly from @app/shared-data"
```

---

### Task 8: Update Collector and Security Services

**Files:**
- Modify: `apps/mist/src/collector/collector.service.ts`
- Modify: `apps/mist/src/security/security.service.ts`
- Modify: `apps/mist/src/collector/interfaces/source-fetcher.interface.ts`

- [ ] **Step 1: Update CollectorService**

```bash
# Edit apps/mist/src/collector/collector.service.ts
```

Find and remove the `convertPeriodToBarPeriod()` method (if exists).
Update all KPeriod references to Period.

- [ ] **Step 2: Update SecurityService**

```bash
# Edit apps/mist/src/security/security.service.ts
```

Find the `mapMinutesToPeriod()` method and update enum names:
```typescript
// Before
case 1: return KPeriod.ONE_MIN;
case 5: return KPeriod.FIVE_MIN;
// ...

// After
case 1: return Period.ONE_MIN;
case 5: return Period.FIVE_MIN;
// ...
case 1440: return Period.DAY;
```

- [ ] **Step 3: Update SourceFetcherInterface**

```bash
# Edit apps/mist/src/collector/interfaces/source-fetcher.interface.ts
```

Update Period import from @app/shared-data.

- [ ] **Step 4: Verify compilation**

```bash
pnpm run build
```

Expected: SUCCESS

- [ ] **Step 5: Commit**

```bash
git add apps/mist/src/collector/collector.service.ts apps/mist/src/security/security.service.ts apps/mist/src/collector/interfaces/source-fetcher.interface.ts
git commit -m "refactor: update collector and security services for Period enum

- Remove convertPeriodToBarPeriod() from CollectorService
- Update mapMinutesToPeriod() in SecurityService with new enum names
- Update SourceFetcherInterface to use Period from @app/shared-data"
```

---

### Task 9: Update Schedule Controller

**Files:**
- Modify: `apps/schedule/src/run/run.controller.ts`

- [ ] **Step 1: Update run.controller.ts**

```bash
# Edit apps/schedule/src/run/run.controller.ts
```

Change import:
```typescript
// Before
import { PeriodType } from '@app/shared-data';

// After
import { Period } from '@app/shared-data';
```

Change all PeriodType references to Period.

- [ ] **Step 2: Verify compilation**

```bash
pnpm run build
```

Expected: SUCCESS

- [ ] **Step 3: Commit**

```bash
git add apps/schedule/src/run/run.controller.ts
git commit -m "refactor: update schedule controller to use Period enum

- Change PeriodType → Period in run.controller.ts
- Update all references to use unified Period enum"
```

---

### Task 10: Update MCP Server

**Files:**
- Modify: `apps/mcp-server/src/services/data-mcp.service.ts`
- Modify: `apps/mcp-server/src/services/data-mcp.service.spec.ts`

- [ ] **Step 1: Update DataMcpService**

```bash
# Edit apps/mcp-server/src/services/data-mcp.service.ts
```

Change import:
```typescript
// Before
import { KPeriod } from '@app/shared-data';

// After
import { Period } from '@app/shared-data';
```

Change all KPeriod references to Period.

- [ ] **Step 2: Update DataMcpService tests**

```bash
# Edit apps/mcp-server/src/services/data-mcp.service.spec.ts
```

Update all test cases to use Period enum instead of KPeriod.

- [ ] **Step 3: Verify compilation**

```bash
pnpm run build
```

Expected: SUCCESS

- [ ] **Step 4: Commit**

```bash
git add apps/mcp-server/src/services/data-mcp.service.ts apps/mcp-server/src/services/data-mcp.service.spec.ts
git commit -m "refactor: update MCP server to use Period enum

- Change KPeriod → Period in DataMcpService
- Update all tests to use Period enum"
```

---

### Task 11: Update Test Files

**Files:**
- Modify: All `.spec.ts` files using old enums

- [ ] **Step 1: Update chan.controller.spec.ts**

```bash
# Edit apps/mist/src/chan/chan.controller.spec.ts
```

Change Period import to @app/shared-data.

- [ ] **Step 2: Update source test files**

```bash
# Edit apps/mist/src/sources/tdx.source.spec.ts
# Edit apps/mist/src/sources/east-money.source.spec.ts
```

Update KPeriod → Period.

- [ ] **Step 3: Run all tests**

```bash
pnpm test
```

Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add apps/mist/src/chan/chan.controller.spec.ts apps/mist/src/sources/
git commit -m "refactor: update test files to use Period enum

- Update chan.controller.spec.ts
- Update tdx.source.spec.ts
- Update east-money.source.spec.ts"
```

---

### Task 12: Delete Old Enum Files

**Files:**
- Delete: `libs/shared-data/src/enums/k-period.enum.ts`
- Delete: `libs/shared-data/src/enums/index-period.enum.ts`
- Delete: `libs/shared-data/src/enums/k-period.enum.spec.ts`
- Delete: `apps/mist/src/chan/enums/period.enum.ts`

- [ ] **Step 1: Delete old enum files**

```bash
cd /Users/xiyugao/code/mist/mist
rm libs/shared-data/src/enums/k-period.enum.ts
rm libs/shared-data/src/enums/index-period.enum.ts
rm libs/shared-data/src/enums/k-period.enum.spec.ts
rm apps/mist/src/chan/enums/period.enum.ts
```

- [ ] **Step 2: Verify compilation**

```bash
pnpm run build
```

Expected: SUCCESS

- [ ] **Step 3: Run all tests**

```bash
pnpm test
```

Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: delete old period enum files

- Remove k-period.enum.ts (replaced by unified Period)
- Remove index-period.enum.ts (replaced by unified Period)
- Remove k-period.enum.spec.ts (tests now in period-mapping.service.spec.ts)
- Remove chan/enums/period.enum.ts (replaced by unified Period in shared-data)"
```

---

### Task 13: Final Verification

- [ ] **Step 1: Build all projects**

```bash
cd /Users/xiyugao/code/mist/mist
pnpm run build
```

Expected: SUCCESS with no errors

- [ ] **Step 2: Run all tests**

```bash
pnpm test
```

Expected: All tests PASS

- [ ] **Step 3: Start applications**

```bash
# Terminal 1
pnpm run start:dev:mist

# Terminal 2
pnpm run start:dev:saya

# Terminal 3
pnpm run start:dev:schedule
```

Expected: All applications start without errors

- [ ] **Step 4: Test API endpoints**

```bash
# Test indicator endpoint
curl -X POST http://localhost:8001/indicator/k \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "000001",
    "period": 5,
    "startDate": 1710979200000,
    "endDate": 1711065600000
  }'

# Test chan endpoint
curl -X POST http://localhost:8001/chan/bi \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "000001",
    "period": 5
  }'
```

Expected: Valid API responses with no errors

- [ ] **Step 5: Create summary commit**

```bash
git add -A
git commit -m "refactor: complete unified period system migration

✅ All old enum files deleted
✅ All DTOs, entities, services updated to use Period enum
✅ PeriodMappingService simplified (removed enum conversion)
✅ All tests passing
✅ All applications starting successfully
✅ API endpoints responding correctly

Changes:
- Single Period enum in @app/shared-data
- Support all periods from 1-minute to yearly
- Standardized enum member naming (ONE_MIN, FIVE_MIN, etc.)
- Simplified PeriodMappingService (single-step mapping)"
```

---

## Success Criteria

- ✅ All old enum files deleted (4 files)
- ✅ All imports updated to use `Period` from `@app/shared-data`
- ✅ All tests pass (unit + integration)
- ✅ All applications start without errors
- ✅ API endpoints return valid responses
- ✅ No TypeScript compilation errors
- ✅ No runtime errors in logs

## Rollback Plan

If critical issues arise:

```bash
# Immediate rollback
git checkout main
git branch -D refactor/unify-period-enum

# Or if commits were made
git reset --hard main
```

---

**Total Estimated Time:** ~90 minutes

**Next Steps:** Execute this plan using superpowers:subagent-driven-development or superpowers:executing-plans
