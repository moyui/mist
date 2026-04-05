# Unify Time Input Parameters — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify all time-related input parameters across the NestJS monorepo to `YYYY-MM-DD [HH:MM:SS]` string format, interpreted as Beijing time.

**Architecture:** Add a shared regex constant and `parseDateString()` method to `@app/timezone`. Update DTOs to use `string` with `@Matches` validation. Update controllers to call `parseDateString()`. Update MCP server and Saya tool descriptions.

**Tech Stack:** NestJS, class-validator (`@Matches`), date-fns, date-fns-tz, TypeORM, Zod (MCP server)

**Spec:** `docs/superpowers/specs/2026-04-05-unify-time-params-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `libs/timezone/src/date-format.const.ts` | **Create** | Shared regex `BEIJING_DATE_REGEX` |
| `libs/timezone/src/timezone.service.ts` | Modify | Add `parseDateString()` method |
| `libs/timezone/src/timezone.service.spec.ts` | Modify | Add tests for `parseDateString()` |
| `libs/timezone/src/index.ts` | Modify | Export new constant |
| `apps/mist/src/indicator/dto/query/indicator-query.dto.ts` | Modify | `number` → `string`, `@IsNumber` → `@Matches` |
| `apps/mist/src/collector/dto/collect.dto.ts` | Modify | `@IsDateString` → `@Matches` |
| `apps/mist/src/chan/dto/update-bi.dto.ts` | Modify | `Date` → `string`, add `@Matches` |
| `apps/mist/src/indicator/indicator.controller.ts` | Modify | `convertTimestamp2Date` → `parseDateString` |
| `apps/mist/src/chan/chan.controller.ts` | Modify | `convertTimestamp2Date` → `parseDateString` |
| `apps/mist/src/collector/collector.controller.ts` | Modify | `new Date()` → `parseDateString` + inject TimezoneService |
| `apps/mcp-server/src/services/data-mcp.service.ts` | Modify | Rename params, update descriptions |
| `apps/mcp-server/src/utils/validation.helpers.ts` | Modify | Update `validateDateRange()` regex |
| `apps/saya/src/tools/tools.service.ts` | Modify | Update tool descriptions |

---

### Task 1: Create shared regex constant and `parseDateString()` in TimezoneService

**Files:**
- Create: `libs/timezone/src/date-format.const.ts`
- Modify: `libs/timezone/src/timezone.service.ts:1-49`
- Modify: `libs/timezone/src/timezone.service.spec.ts`
- Modify: `libs/timezone/src/index.ts`

- [ ] **Step 1: Write failing tests for `parseDateString()`**

Add to `libs/timezone/src/timezone.service.spec.ts` after the existing `convertTimestamp2Date` describe block:

```typescript
describe('parseDateString', () => {
  it('should parse full datetime as Beijing time', () => {
    // "2024-04-01 09:30:00" in Beijing (UTC+8) = 2024-04-01T01:30:00.000Z
    const result = service.parseDateString('2024-04-01 09:30:00');
    expect(result).toBeInstanceOf(Date);
    expect(result.toISOString()).toBe('2024-04-01T01:30:00.000Z');
  });

  it('should parse date-only and default time to 00:00:00', () => {
    // "2024-04-01" in Beijing (UTC+8) = 2024-03-31T16:00:00.000Z
    const result = service.parseDateString('2024-04-01');
    expect(result).toBeInstanceOf(Date);
    expect(result.toISOString()).toBe('2024-03-31T16:00:00.000Z');
  });

  it('should throw on invalid format', () => {
    expect(() => service.parseDateString('not-a-date')).toThrow();
  });

  it('should throw on semantically invalid date', () => {
    expect(() => service.parseDateString('2024-13-45 25:61:99')).toThrow();
  });

  it('should throw on empty string', () => {
    expect(() => service.parseDateString('')).toThrow();
  });

  it('should parse midnight correctly', () => {
    const result = service.parseDateString('2024-01-01 00:00:00');
    expect(result).toBeInstanceOf(Date);
    // Beijing midnight = UTC 16:00 previous day
    expect(result.toISOString()).toBe('2023-12-31T16:00:00.000Z');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm run test -- --testPathPattern='timezone.service.spec' --no-coverage`
Expected: FAIL — `service.parseDateString is not a function`

- [ ] **Step 3: Create `date-format.const.ts`**

Create `libs/timezone/src/date-format.const.ts`:

```typescript
/**
 * Regex for Beijing date string format.
 * Accepts "YYYY-MM-DD" or "YYYY-MM-DD HH:MM:SS".
 */
export const BEIJING_DATE_REGEX = /^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}:\d{2})?$/;
```

- [ ] **Step 4: Add `parseDateString()` to TimezoneService**

Add to `libs/timezone/src/timezone.service.ts`:

After the imports, add:
```typescript
import { BEIJING_DATE_REGEX } from './date-format.const';
```

After `convertTimestamp2Date()`, add:
```typescript
/**
 * Parse date string to Date object.
 * Accepts "YYYY-MM-DD HH:MM:SS" or "YYYY-MM-DD".
 * Interpreted as Beijing time (Asia/Shanghai, UTC+8).
 *
 * Implementation: appends "+08:00" and uses Date constructor,
 * which is timezone-agnostic (works regardless of server timezone).
 */
parseDateString(dateStr: string): Date {
  if (!BEIJING_DATE_REGEX.test(dateStr)) {
    throw new HttpException(
      `Invalid date format: "${dateStr}". Expected YYYY-MM-DD or YYYY-MM-DD HH:MM:SS`,
      HttpStatus.BAD_REQUEST,
    );
  }

  // Append " 00:00:00" if date-only, then convert to ISO with +08:00 offset
  const normalized = dateStr.includes(' ')
    ? dateStr
    : `${dateStr} 00:00:00`;
  const isoString = normalized.replace(' ', 'T') + '+08:00';
  const result = new Date(isoString);

  if (isNaN(result.getTime())) {
    throw new HttpException(
      `Invalid date: "${dateStr}". Date values are out of range.`,
      HttpStatus.BAD_REQUEST,
    );
  }

  return result;
}
```

- [ ] **Step 5: Export the constant from index.ts**

Modify `libs/timezone/src/index.ts`:

```typescript
export * from './date-format.const';
export * from './timezone.module';
export * from './timezone.service';
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm run test -- --testPathPattern='timezone.service.spec' --no-coverage`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add libs/timezone/src/
git commit -m "feat: add parseDateString() and BEIJING_DATE_REGEX to TimezoneService"
```

---

### Task 2: Update `IndicatorQueryDto` — `number` to `string`

**Files:**
- Modify: `apps/mist/src/indicator/dto/query/indicator-query.dto.ts`

- [ ] **Step 1: Update the DTO**

Replace `apps/mist/src/indicator/dto/query/indicator-query.dto.ts` contents with:

```typescript
import { DataSource, Period } from '@app/shared-data';
import { IsEnum, IsNotEmpty, IsOptional, Matches } from 'class-validator';
import { BEIJING_DATE_REGEX } from '@app/timezone';

/**
 * Unified query DTO for all indicator endpoints
 * Supports optional data source selection
 */
export class IndicatorQueryDto {
  @IsNotEmpty({
    message: '指数代码不能为空',
  })
  code!: string;

  @IsOptional()
  @IsEnum(DataSource, {
    message: `数据源必须是以下值之一: ${Object.values(DataSource).join(', ')}`,
  })
  source?: DataSource;

  @IsEnum(Period, {
    message: `周期必须是以下数值之一: ${Object.values(Period).join(', ')}`,
  })
  period!: Period;

  @IsNotEmpty({
    message: '开始日期不能为空',
  })
  @Matches(BEIJING_DATE_REGEX, {
    message: '开始日期格式必须是 YYYY-MM-DD 或 YYYY-MM-DD HH:MM:SS',
  })
  startDate!: string;

  @IsNotEmpty({
    message: '结束日期不能为空',
  })
  @Matches(BEIJING_DATE_REGEX, {
    message: '结束日期格式必须是 YYYY-MM-DD 或 YYYY-MM-DD HH:MM:SS',
  })
  endDate!: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/mist/src/indicator/dto/query/indicator-query.dto.ts
git commit -m "refactor: update IndicatorQueryDto startDate/endDate from timestamp to Beijing date string"
```

---

### Task 3: Update `CollectDto` — change validation

**Files:**
- Modify: `apps/mist/src/collector/dto/collect.dto.ts`

- [ ] **Step 1: Update the DTO**

Modify `apps/mist/src/collector/dto/collect.dto.ts`. Replace the import line and the `startDate`/`endDate` field decorators:

Change import from:
```typescript
import { IsNotEmpty, IsOptional, IsEnum, IsDateString } from 'class-validator';
```
To:
```typescript
import { IsNotEmpty, IsOptional, IsEnum, Matches } from 'class-validator';
```

Add import:
```typescript
import { BEIJING_DATE_REGEX } from '@app/timezone';
```

Replace `startDate` field (lines 22-28):
```typescript
  @ApiProperty({
    description: '开始时间',
    example: '2026-03-30 09:30:00',
  })
  @IsNotEmpty({ message: '开始时间不能为空' })
  @Matches(BEIJING_DATE_REGEX, {
    message: '开始时间格式必须是 YYYY-MM-DD 或 YYYY-MM-DD HH:MM:SS',
  })
  startDate!: string;
```

Replace `endDate` field (lines 30-36):
```typescript
  @ApiProperty({
    description: '结束时间',
    example: '2026-03-30 11:30:00',
  })
  @IsNotEmpty({ message: '结束时间不能为空' })
  @Matches(BEIJING_DATE_REGEX, {
    message: '结束时间格式必须是 YYYY-MM-DD 或 YYYY-MM-DD HH:MM:SS',
  })
  endDate!: string;
```

- [ ] **Step 2: Commit**

```bash
git add apps/mist/src/collector/dto/collect.dto.ts
git commit -m "refactor: update CollectDto validation from ISO date to Beijing date string"
```

---

### Task 4: Update `UpdateBiDto` — `Date` to `string`

**Files:**
- Modify: `apps/mist/src/chan/dto/update-bi.dto.ts`

- [ ] **Step 1: Update the DTO**

Replace `apps/mist/src/chan/dto/update-bi.dto.ts` contents with:

```typescript
import { IsNotEmpty, Matches } from 'class-validator';
import { BEIJING_DATE_REGEX } from '@app/timezone';

export class UpdateBiDto {
  @IsNotEmpty({
    message: '指数代码不能为空',
  })
  symbol!: string;

  @IsNotEmpty({
    message: '交易所不能为空',
  })
  code!: string;

  @IsNotEmpty({
    message: '开始时间不能为空',
  })
  @Matches(BEIJING_DATE_REGEX, {
    message: '开始时间格式必须是 YYYY-MM-DD 或 YYYY-MM-DD HH:MM:SS',
  })
  startDate!: string;

  @IsNotEmpty({
    message: '结束时间不能为空',
  })
  @Matches(BEIJING_DATE_REGEX, {
    message: '结束时间格式必须是 YYYY-MM-DD 或 YYYY-MM-DD HH:MM:SS',
  })
  endDate!: string;

  period!: number;
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/mist/src/chan/dto/update-bi.dto.ts
git commit -m "refactor: update UpdateBiDto startDate/endDate from Date to Beijing date string"
```

---

### Task 5: Update controllers — switch to `parseDateString()`

**Files:**
- Modify: `apps/mist/src/indicator/indicator.controller.ts`
- Modify: `apps/mist/src/chan/chan.controller.ts`
- Modify: `apps/mist/src/collector/collector.controller.ts`

- [ ] **Step 1: Update IndicatorController**

In `apps/mist/src/indicator/indicator.controller.ts`, replace every occurrence of:

```typescript
this.timezoneService.convertTimestamp2Date(
  queryDto.startDate,
);
```

With:

```typescript
this.timezoneService.parseDateString(queryDto.startDate);
```

Same for `queryDto.endDate`. This affects 4 endpoints: `macd` (lines 55-60), `kdj` (lines 101-106), `rsi` (lines 157-162), `k` (lines 198-203).

- [ ] **Step 2: Update ChanController**

In `apps/mist/src/chan/chan.controller.ts`, replace every occurrence of:

```typescript
this.timezoneService.convertTimestamp2Date(
  queryDto.startDate,
);
```

With:

```typescript
this.timezoneService.parseDateString(queryDto.startDate);
```

Same for `queryDto.endDate`. This affects 4 endpoints: `postMergeK` (lines 40-45), `postIndexBi` (lines 83-88), `postFenxing` (lines 126-131), `postChannel` (lines 170-175).

- [ ] **Step 3: Update CollectorController**

In `apps/mist/src/collector/collector.controller.ts`:

1. Add `TimezoneService` import:
```typescript
import { TimezoneService } from '@app/timezone';
```

2. Inject `TimezoneService` into constructor:
```typescript
constructor(
  private readonly securityService: SecurityService,
  private readonly registry: CollectionStrategyRegistry,
  private readonly timezoneService: TimezoneService,
) {}
```

3. Replace lines 60-61:
```typescript
// Before:
const startDate = new Date(dto.startDate);
const endDate = new Date(dto.endDate);

// After:
const startDate = this.timezoneService.parseDateString(dto.startDate);
const endDate = this.timezoneService.parseDateString(dto.endDate);
```

- [ ] **Step 4: Verify build compiles**

Run: `pnpm run build`
Expected: Successful build with no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/mist/src/indicator/indicator.controller.ts apps/mist/src/chan/chan.controller.ts apps/mist/src/collector/collector.controller.ts
git commit -m "refactor: switch controllers to parseDateString() for unified time parsing"
```

---

### Task 6: Update MCP Server — data service

**Files:**
- Modify: `apps/mcp-server/src/services/data-mcp.service.ts`

- [ ] **Step 1: Rename params and update descriptions in `getKlineData`**

In `data-mcp.service.ts`:

1. Update the `@Tool` description for `get_kline_data` (line 111):
```typescript
Optional: limit (default 100), startDate, endDate, source (ef/tdx/mqmt).
```

2. Rename method params (line 117-123):
```typescript
async getKlineData(
  symbol: string,
  period: '1min' | '5min' | '15min' | '30min' | '60min' | 'daily',
  limit: number = 100,
  startDate?: string,
  endDate?: string,
  source?: 'ef' | 'tdx' | 'mqmt',
) {
```

3. Update validation call (lines 142-145):
```typescript
const dateRangeError = ValidationHelper.validateDateRange(
  startDate,
  endDate,
);
```

4. Update QueryBuilder params (lines 177-182):
```typescript
if (startDate) {
  queryBuilder.andWhere('bar.timestamp >= :startDate', { startDate });
}
if (endDate) {
  queryBuilder.andWhere('bar.timestamp <= :endDate', { endDate });
}
```

> **Note:** MySQL `DATETIME` column accepts `YYYY-MM-DD HH:MM:SS` strings directly. Format validation is handled by `ValidationHelper.validateDateRange()` (updated in Task 7). No `parseDateString()` call needed here — the raw string passes through to MySQL correctly.

- [ ] **Step 2: Update `getDailyKline` descriptions**

No renaming needed here — it already uses `startDate`/`endDate`. Only update the description to mention format:

Update description (line 208):
```typescript
Optional: limit (default 100), startDate (YYYY-MM-DD HH:MM:SS), endDate (YYYY-MM-DD HH:MM:SS), source (ef/tdx/mqmt).
```

- [ ] **Step 3: Commit**

```bash
git add apps/mcp-server/src/services/data-mcp.service.ts
git commit -m "refactor: rename MCP data service params startTime→startDate, unify format"
```

---

### Task 7: Update MCP Server — validation helper

**Files:**
- Modify: `apps/mcp-server/src/utils/validation.helpers.ts`

> **Note:** `segment-mcp.service.ts` BiSchema/SegmentSchema fields (`startTime`/`endTime`) describe output data model shapes (Bi and Segment time ranges), NOT query input parameters. They are excluded from this change.

- [ ] **Step 1: Update `ValidationHelper.validateDateRange()`**

In `validation.helpers.ts`, update the method to validate against `BEIJING_DATE_REGEX`:

Add import at top:
```typescript
import { BEIJING_DATE_REGEX } from '@app/timezone';
```

Replace `validateDateRange()` method:
```typescript
static validateDateRange(
  startDate: string | undefined,
  endDate: string | undefined,
): string | null {
  if (!startDate || !endDate) {
    return null; // Optional parameters, skip validation
  }

  if (!BEIJING_DATE_REGEX.test(startDate)) {
    return `Invalid startDate format: "${startDate}". Expected YYYY-MM-DD or YYYY-MM-DD HH:MM:SS.`;
  }

  if (!BEIJING_DATE_REGEX.test(endDate)) {
    return `Invalid endDate format: "${endDate}". Expected YYYY-MM-DD or YYYY-MM-DD HH:MM:SS.`;
  }

  const start = new Date(
    startDate.includes(' ')
      ? startDate.replace(' ', 'T') + '+08:00'
      : startDate + 'T00:00:00+08:00',
  );
  const end = new Date(
    endDate.includes(' ')
      ? endDate.replace(' ', 'T') + '+08:00'
      : endDate + 'T00:00:00+08:00',
  );

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return `Invalid date values. Start: "${startDate}", End: "${endDate}".`;
  }

  if (start >= end) {
    return `Invalid date range: start date (${startDate}) must be before end date (${endDate}).`;
  }

  return null;
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/mcp-server/src/utils/validation.helpers.ts
git commit -m "refactor: update MCP ValidationHelper to Beijing date string format"
```

---

### Task 8: Update Saya tool descriptions

**Files:**
- Modify: `apps/saya/src/tools/tools.service.ts`

- [ ] **Step 1: Update tool descriptions**

In `tools.service.ts`, replace all 4 tool descriptions. Change `startDate(13位数字类型)、endDate(13位数字类型)` to `startDate(YYYY-MM-DD HH:MM:SS字符串类型)、endDate(YYYY-MM-DD HH:MM:SS字符串类型)`:

1. `createGetKTool` description (line 58):
```
'根据提供的 symbol、code、startDate、endDate 从本地系统获取股票的k线数据。输入必须是包含 symbol (字符串类型)、code (字符串类型)、startDate(YYYY-MM-DD HH:MM:SS字符串类型)、endDate(YYYY-MM-DD HH:MM:SS字符串类型) 的对象。'
```

2. `createGetKDJTool` description (line 75):
```
'根据提供的 symbol、code、startDate、endDate 从本地系统获取股票的kdj数据。输入必须是包含 symbol (字符串类型)、code (字符串类型)、startDate(YYYY-MM-DD HH:MM:SS字符串类型)、endDate(YYYY-MM-DD HH:MM:SS字符串类型) 的对象。'
```

3. `createGetMACDTool` description (line 92):
```
'根据提供的 symbol、code、startDate、endDate 从本地系统获取股票的macd数据。输入必须是包含 symbol (字符串类型)、code (字符串类型)、startDate(YYYY-MM-DD HH:MM:SS字符串类型)、endDate(YYYY-MM-DD HH:MM:SS字符串类型) 的对象。'
```

4. `createGetRSITool` description (line 109):
```
'根据提供的 symbol、code、startDate、endDate 从本地系统获取股票的rsi数据。输入必须是包含 symbol (字符串类型)、code (字符串类型)、startDate(YYYY-MM-DD HH:MM:SS字符串类型)、endDate(YYYY-MM-DD HH:MM:SS字符串类型) 的对象。'
```

- [ ] **Step 2: Commit**

```bash
git add apps/saya/src/tools/tools.service.ts
git commit -m "refactor: update saya tool descriptions to reflect Beijing date string format"
```

---

### Task 9: Verify build and run tests

**Files:** None (verification only)

- [ ] **Step 1: Run full build**

Run: `pnpm run build`
Expected: Successful build with no type errors.

- [ ] **Step 2: Run unit tests**

Run: `pnpm run test -- --no-coverage`
Expected: All tests pass. Pay attention to timezone.service.spec.ts results.

- [ ] **Step 3: Run linter**

Run: `pnpm run lint`
Expected: No lint errors.

- [ ] **Step 4: Final commit if any fixes needed**

If any issues found during verification, fix and commit:
```bash
git add -A
git commit -m "fix: address build/test/lint issues from time parameter unification"
```
