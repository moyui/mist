# date-fns Migration Design Spec

**Date:** 2026-04-16
**Status:** Draft
**Scope:** Replace all `new Date()` and `Date.now()` in production code with date-fns equivalents

## Goal

Eliminate all `new Date()` constructor calls and `Date.now()` usage in production code (non-test, non-fixture files) by replacing them with date-fns v4 equivalents. This ensures consistent, timezone-safe date handling across the project and centralizes time operations through the existing `TimezoneService`.

## Approach

**Strategy:** Per-file replacement in dependency order (libs first, then apps). No new abstraction layers — reuse existing `TimezoneService` for "current time" needs and import date-fns functions directly at each call site.

**Why this approach:** The project already uses date-fns v4.1.0 in 4 files and has a well-established `TimezoneService`. Adding a wrapper (DateHelper etc.) would be over-engineering for a refactoring task. Per-file replacement keeps each commit self-contained and easy to review/rollback.

## Replacement Rules

| Original Pattern | Replacement | Notes |
|------------------|-------------|-------|
| `new Date(string)` | `parseISO(string)` from date-fns | Consistent parsing behavior |
| `new Date(y, m, d, h, min, s, ms)` | `set()`, `startOfDay()`, `startOfMonth()`, `startOfWeek()`, `startOfQuarter()`, `startOfYear()`, `addDays()`, `addMonths()`, `addQuarters()`, `addYears()` | Semantic date-fns helpers |
| `new Date()` (no args) | `TimezoneService.getCurrentBeijingTime()` | Requires constructor injection |
| `new Date().toISOString()` | `formatISO(new Date())` | **Behavioral change** (see below) |
| `date.setDate()` / `date.setMinutes()` etc. | `set(date, { ... })` from date-fns | Immutable operations |
| `Date.now()` for IDs or numeric comparison | **Keep as-is** | No date semantics |

## Behavioral Change

`new Date().toISOString()` outputs UTC with `Z` suffix:
```
2026-04-15T23:12:47.728Z
```

`formatISO(new Date())` outputs local timezone with offset:
```
2026-04-16T07:12:47+08:00
```

This is **intentional**. The project standardizes on Beijing time, and API response timestamps should reflect that. Frontend (`mist-fe`) must correctly parse offset-format ISO strings (standard JavaScript `new Date()` handles both formats).

## Migration Scope

### Libs (3 files)

| File | Changes |
|------|---------|
| `libs/utils/src/services/k-boundary-calculator.ts` | 14 `new Date(y,m,d,...)` → date-fns helpers (`startOfDay`, `startOfMonth`, `startOfWeek`, `startOfQuarter`, `startOfYear`, `set`, `addDays/Months/Quarters/Years`) |
| `libs/timezone/src/timezone.service.ts` | 1 `new Date(isoString)` → `parseISO()` |
| `libs/utils/src/utils.service.ts` | Remove unused `getNowDate()` method |

### Apps (12 files)

| File | Changes |
|------|---------|
| `apps/mist/src/sources/tdx/tdx-source.service.ts` | 2 `new Date(string)` → `parseISO()`; 1 `new Date()` kept (no TimezoneService injection) |
| `apps/mist/src/sources/tdx/tdx-websocket.service.ts` | 1 `new Date()` → inject `TimezoneService.getCurrentBeijingTime()` |
| `apps/mist/src/sources/tdx/kcandle-aggregator.ts` | 1 `new Date(timestamp)` clone+mutate → `set()` |
| `apps/mist/src/sources/east-money/east-money-source.service.ts` | 2 `new Date(string)` → `parseISO()` |
| `apps/mist/src/interceptors/transform.interceptor.ts` | 1 `new Date().toISOString()` → `formatISO(new Date())` |
| `apps/mist/src/filters/all-exceptions.filter.ts` | 1 `new Date().toISOString()` → `formatISO(new Date())` |
| `apps/mist/src/chan/services/channel.service.ts` | 1 `new Date(date).getTime()` → `parseISO(date).getTime()` |
| `apps/mcp-server/src/services/chan-mcp.service.ts` | 3 `new Date(kline.time)` → `parseISO()` |
| `apps/mcp-server/src/services/schedule-mcp.service.ts` | 2 `new Date().toISOString()` → `formatISO(new Date())` |
| `apps/mcp-server/src/utils/validation.helpers.ts` | 2 `new Date(string)` → `parseISO()` |
| `apps/saya/src/template/template.service.ts` | 1 `Date.now()` → `formatISO(new Date())` (human-readable for AI agent) |
| `apps/schedule/src/data-collection.controller.ts` | 1 `new Date(now)` + mutators → `addDays()` + `getMonth()` |

### Not Migrating

| Location | Reason |
|----------|--------|
| `libs/shared-data/src/entities/k.entity.ts:49` | TypeORM entity default value |
| `libs/timezone/src/timezone.service.ts:92` | `toZonedTime(new Date(), 'Asia/Shanghai')` — entry point for Beijing time, requires Date input |
| `apps/mist/src/sources/tdx/tdx-source.service.ts:286` | `parseSnapshot` timestamp — `TdxSource` doesn't inject `TimezoneService`, low impact |
| `Date.now()` × 6 places | ID generation and cache expiry comparison — pure numeric, no date semantics |
| `*.spec.ts`, `test-data/`, `apps/mist/src/chan/test/scripts/` | Test fixtures and dev scripts, not runtime production code |

## Dependencies

- date-fns v4.1.0 (already installed)
- date-fns-tz v3 (already installed, used by `TimezoneService`)

## Testing Strategy

Each file migration is verified by:
1. Running existing unit tests for that file (no new tests needed — this is a refactoring, behavior is preserved)
2. TypeScript type-check (`npx tsc --noEmit`) after each logical group of changes
3. Full test suite (`pnpm run test`) at the end

## Success Criteria

- `grep -rn "new Date(" --include="*.ts" apps/ libs/ | grep -v ".spec.ts" | grep -v "node_modules" | grep -v "test-data"` returns only the explicitly kept exceptions listed above
- All existing tests pass
- TypeScript compiles without errors
- No new files created (pure refactoring)
