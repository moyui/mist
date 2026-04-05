# Unify Time Input Parameters Design

**Date**: 2026-04-05
**Status**: Approved

## Problem

mist app 中各 controller 的时间入参格式不统一：

| DTO | Controller | Type | Format | Conversion |
|-----|-----------|------|--------|-----------|
| `IndicatorQueryDto` | indicator + chan + saya tools | `number` | 13-digit ms timestamp | `convertTimestamp2Date()` |
| `CollectDto` | collector | `string` | ISO 8601 (`2026-03-30T09:30:00+08:00`) | `new Date()` |
| `UpdateBiDto` | chan (updateBi) | `Date` | Date object | None |
| MCP params | mcp-server (data) | `string` | ISO or YYYY-MM-DD | `new Date()` |
| MCP params | mcp-server (segment) | `string` | `startTime`/`endTime` naming | Zod schema |

Parameter naming is also inconsistent: MCP server uses `startTime`/`endTime`, while others use `startDate`/`endDate`.

## Decision

### Format: `YYYY-MM-DD [HH:MM:SS]`

- Full: `2024-04-01 09:30:00`
- Date only: `2024-04-01` (time defaults to `00:00:00` for both `startDate` and `endDate`)
- Timezone: treated as Beijing time (`Asia/Shanghai`), parsed via `date-fns-tz` explicitly (not `new Date()`)
- DTO type: `string`
- Parameter naming: unified to `startDate` / `endDate` everywhere

**Breaking change scope**: HTTP/MCP API surface only. Internal service methods and `convertTimestamp2Date()` are not affected.

### Rationale

- Human-readable and debuggable
- Works naturally for A-shares context (Beijing time)
- `YYYY-MM-DD` date-only option covers daily-level queries without redundant `00:00:00`
- Consistent with `TimezoneService` existing infrastructure

## Design

### 1. Shared regex constant

Define the format regex in one place, imported by all consumers:

```typescript
// libs/timezone/src/date-format.const.ts
export const BEIJING_DATE_REGEX = /^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}:\d{2})?$/;
```

Exported from `@app/timezone`. Used by:
- `parseDateString()` in TimezoneService
- `@IsBeijingDateString` decorator
- `ValidationHelper.validateDateRange()` in MCP server

### 2. TimezoneService: new `parseDateString()` method

**File**: `libs/timezone/src/timezone.service.ts`

Add a new method alongside existing `convertTimestamp2Date()`:

```typescript
parseDateString(dateStr: string): Date {
  // 1. Validate format against BEIJING_DATE_REGEX
  // 2. Append " 00:00:00" if date-only
  // 3. Parse using date-fns-tz parse() with 'Asia/Shanghai' timezone
  //    (NOT new Date() — server container timezone may not be Asia/Shanghai)
  // 4. Validate semantic correctness (real date, e.g. reject 2024-13-45)
  //    using isNaN(parsedDate.getTime())
  // 5. Return Date object (UTC internally)
  // 6. Throw HttpException with clear message if invalid
}
```

**Key constraint**: Must use `date-fns-tz` `parse()` with explicit `'Asia/Shanghai'` timezone, not `new Date()`. Container timezone may differ in Docker deployments.

`convertTimestamp2Date()` is kept unchanged. Internal code that constructs timestamps programmatically is unaffected.

### 3. DTO changes

#### a) `IndicatorQueryDto`

**File**: `apps/mist/src/indicator/dto/query/indicator-query.dto.ts`

Before:
```typescript
@IsNumber({}, { message: '开始日期必须是13位时间戳数字' })
startDate!: number;
```

After:
```typescript
@Matches(BEIJING_DATE_REGEX, { message: '日期格式必须是 YYYY-MM-DD 或 YYYY-MM-DD HH:MM:SS' })
@ApiProperty({ description: '开始日期', example: '2024-04-01 09:30:00', type: String })
startDate!: string;
```

Same for `endDate`.

#### b) `CollectDto`

**File**: `apps/mist/src/collector/dto/collect.dto.ts`

Replace `@IsDateString({ strict: true })` with `@Matches(BEIJING_DATE_REGEX)` and update Swagger examples.

#### c) `UpdateBiDto`

**File**: `apps/mist/src/chan/dto/update-bi.dto.ts`

Change `startDate`/`endDate` from `Date` to `string` with `@Matches(BEIJING_DATE_REGEX)`.

#### d) MCP Server — data service

**File**: `apps/mcp-server/src/services/data-mcp.service.ts`

- Rename `startTime`/`endTime` → `startDate`/`endDate` in `getKlineData()`
- Update parameter descriptions to specify `YYYY-MM-DD [HH:MM:SS]` format
- **TypeORM query compatibility**: MySQL `DATETIME` column accepts `YYYY-MM-DD HH:MM:SS` strings directly. For correctness, convert via `parseDateString()` before passing to QueryBuilder.

#### e) MCP Server — segment service

**File**: `apps/mcp-server/src/services/segment-mcp.service.ts`

- Rename `startTime`/`endTime` → `startDate`/`endDate` in Zod schemas
- Update descriptions

#### f) ValidationHelper

**File**: `apps/mcp-server/src/utils/validation.helpers.ts`

Update `validateDateRange()` to validate against `BEIJING_DATE_REGEX` format.

### 4. Saya app — tool descriptions

**File**: `apps/saya/src/tools/tools.service.ts`

This file imports `IndicatorQueryDto` and creates LangChain tools with descriptions referencing `startDate(13位数字类型)`. Update descriptions to reflect the new string format: `startDate(YYYY-MM-DD HH:MM:SS)`.

### 5. Controller changes

All controllers update their time conversion to use `parseDateString()`:

```typescript
// Before (indicator/chan):
const startDate = this.timezoneService.convertTimestamp2Date(queryDto.startDate);

// After:
const startDate = this.timezoneService.parseDateString(queryDto.startDate);

// Before (collector):
const startDate = new Date(dto.startDate);

// After:
const startDate = this.timezoneService.parseDateString(dto.startDate);
```

Affected controllers:
- `apps/mist/src/indicator/indicator.controller.ts`
- `apps/mist/src/chan/chan.controller.ts`
- `apps/mist/src/collector/collector.controller.ts`

### 6. Shared validation decorator (recommended)

Extract a reusable decorator since the pattern is used in 3+ DTOs:

```typescript
// libs/timezone/src/decorators/is-beijing-date-string.decorator.ts
import { Matches } from 'class-validator';
import { BEIJING_DATE_REGEX } from '../date-format.const';

export function IsBeijingDateString() {
  return Matches(BEIJING_DATE_REGEX, {
    message: '日期格式必须是 YYYY-MM-DD 或 YYYY-MM-DD HH:MM:SS',
  });
}
```

Exported from `@app/timezone` alongside TimezoneService.

## Affected Files

| File | Change |
|------|--------|
| `libs/timezone/src/date-format.const.ts` | **New** — shared regex constant |
| `libs/timezone/src/timezone.service.ts` | Add `parseDateString()` |
| `libs/timezone/src/decorators/is-beijing-date-string.decorator.ts` | **New** — shared decorator |
| `libs/timezone/src/index.ts` | Export new constant + decorator |
| `apps/mist/src/indicator/dto/query/indicator-query.dto.ts` | Type `number` → `string`, validation |
| `apps/mist/src/collector/dto/collect.dto.ts` | Validation update |
| `apps/mist/src/chan/dto/update-bi.dto.ts` | Type `Date` → `string`, validation |
| `apps/mist/src/indicator/indicator.controller.ts` | Conversion method |
| `apps/mist/src/chan/chan.controller.ts` | Conversion method |
| `apps/mist/src/collector/collector.controller.ts` | Conversion method |
| `apps/mcp-server/src/services/data-mcp.service.ts` | Param naming + format + parseDateString |
| `apps/mcp-server/src/services/segment-mcp.service.ts` | Param naming in Zod schemas |
| `apps/mcp-server/src/utils/validation.helpers.ts` | Format validation |
| `apps/saya/src/tools/tools.service.ts` | Tool descriptions update |

## Out of Scope

- Service layer (already uses `Date` objects, no change needed)
- Response format (already uses ISO strings in `ApiResponseDto`, no change)
- `period` parameter (separate concept, not affected)
- Frontend (mist-fe) updates (separate project, follow-up)
- `chan-mcp.service.ts` KLineSchema `time` field (K-line data field, not query parameter)
- `convertTimestamp2Date()` (kept for internal programmatic use)
