# Unify Time Input Parameters Design

**Date**: 2026-04-05
**Status**: Approved

## Problem

mist app 中各 controller 的时间入参格式不统一：

| DTO | Controller | Type | Format | Conversion |
|-----|-----------|------|--------|-----------|
| `IndicatorQueryDto` | indicator + chan | `number` | 13-digit ms timestamp | `convertTimestamp2Date()` |
| `CollectDto` | collector | `string` | ISO 8601 (`2026-03-30T09:30:00+08:00`) | `new Date()` |
| `UpdateBiDto` | chan (updateBi) | `Date` | Date object | None |
| MCP params | mcp-server | `string` | ISO or YYYY-MM-DD | `new Date()` |

Parameter naming is also inconsistent: MCP server uses `startTime`/`endTime`, while others use `startDate`/`endDate`.

## Decision

### Format: `YYYY-MM-DD [HH:MM:SS]`

- Full: `2024-04-01 09:30:00`
- Date only: `2024-04-01` (time defaults to `00:00:00`)
- Timezone: treated as system local time (Beijing time, `Asia/Shanghai`)
- DTO type: `string`
- Parameter naming: unified to `startDate` / `endDate` everywhere

### Rationale

- Human-readable and debuggable
- Works naturally for A-shares context (Beijing time)
- `YYYY-MM-DD` date-only option covers daily-level queries without redundant `00:00:00`
- Consistent with `TimezoneService` existing infrastructure

## Design

### 1. TimezoneService: new `parseDateString()` method

**File**: `libs/timezone/src/timezone.service.ts`

Add a new method alongside existing `convertTimestamp2Date()`:

```typescript
private static readonly DATE_REGEX = /^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}:\d{2})?$/;

parseDateString(dateStr: string): Date {
  // Validate format: "YYYY-MM-DD" or "YYYY-MM-DD HH:MM:SS"
  // Append " 00:00:00" if date-only
  // Parse as Beijing time via toZonedTime or parse from date-fns
  // Return Date object (UTC internally)
}
```

The method should:
1. Validate the string matches `YYYY-MM-DD` or `YYYY-MM-DD HH:MM:SS`
2. Interpret the datetime as Beijing time (`Asia/Shanghai`)
3. Return a `Date` object (internally UTC, as per JS convention)
4. Throw a clear error if the format is invalid

`convertTimestamp2Date()` is kept unchanged for backward compatibility with internal code that constructs timestamps programmatically.

### 2. DTO changes

#### a) `IndicatorQueryDto`

**File**: `apps/mist/src/indicator/dto/query/indicator-query.dto.ts`

Changes:
- `startDate`: `number` → `string`
- `endDate`: `number` → `string`
- Validation: replace `@IsNumber` with custom `@Matches` regex validator for `YYYY-MM-DD [HH:MM:SS]`
- Update Swagger `@ApiProperty` examples to `2024-04-01 09:30:00`

#### b) `CollectDto`

**File**: `apps/mist/src/collector/dto/collect.dto.ts`

Changes:
- Replace `@IsDateString({ strict: true })` with `@Matches` regex validator for the new format
- Update Swagger examples from ISO string to `2024-03-30 09:30:00`

#### c) `UpdateBiDto`

**File**: `apps/mist/src/chan/dto/update-bi.dto.ts`

Changes:
- `startDate`: `Date` → `string`
- `endDate`: `Date` → `string`
- Add `@Matches` validation decorators

#### d) MCP Server

**File**: `apps/mcp-server/src/services/data-mcp.service.ts`

Changes:
- Rename `startTime`/`endTime` → `startDate`/`endDate`
- Enforce `YYYY-MM-DD [HH:MM:SS]` format in parameter descriptions

**File**: `apps/mcp-server/src/utils/validation.helpers.ts`

Changes:
- Update `validateDateRange()` to validate the new format via regex

### 3. Controller changes

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

### 4. Shared validation decorator (optional)

If the `@Matches` pattern is repeated across 3+ DTOs, extract into a reusable decorator:

```typescript
// libs/utils/src/decorators/is-beijing-date-string.decorator.ts
@Matches(/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}:\d{2})?$/, {
  message: '日期格式必须是 YYYY-MM-DD 或 YYYY-MM-DD HH:MM:SS',
})
```

Place in `@app/utils` since it's already a shared lib.

## Affected Files

| File | Change |
|------|--------|
| `libs/timezone/src/timezone.service.ts` | Add `parseDateString()` |
| `libs/utils/src/` | Add shared `@IsBeijingDateString` decorator (optional) |
| `apps/mist/src/indicator/dto/query/indicator-query.dto.ts` | Type + validation |
| `apps/mist/src/collector/dto/collect.dto.ts` | Validation |
| `apps/mist/src/chan/dto/update-bi.dto.ts` | Type + validation |
| `apps/mist/src/indicator/indicator.controller.ts` | Conversion method |
| `apps/mist/src/chan/chan.controller.ts` | Conversion method |
| `apps/mist/src/collector/collector.controller.ts` | Conversion method |
| `apps/mcp-server/src/services/data-mcp.service.ts` | Param naming + format |
| `apps/mcp-server/src/utils/validation.helpers.ts` | Format validation |

## Out of Scope

- Service layer (already uses `Date` objects, no change needed)
- Response format (already uses ISO strings in `ApiResponseDto`, no change)
- `period` parameter (separate concept, not affected)
- Frontend (mist-fe) updates (separate project, follow-up)
