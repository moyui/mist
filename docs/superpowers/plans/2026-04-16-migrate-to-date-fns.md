# Migrate `new Date()` / `Date.now()` to date-fns Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all `new Date()` constructor calls and `Date.now()` in production code with date-fns equivalents for consistent, timezone-safe date handling across the project.

**Architecture:** Migrate file-by-file in dependency order (libs first, then apps). Each task targets one file, replaces `new Date(string)` with `parseISO()`, `new Date(year,month,...)` with date-fns helpers (`set()`, `startOfMonth()`, `startOfYear()`, etc.), and `new Date().toISOString()` with `formatISO()`. `Date.now()` used for ID generation and numeric comparison is kept as-is.

> **Behavioral change notice:** `formatISO(new Date())` produces `2026-04-16T07:12:47+08:00` (local timezone with offset) whereas `new Date().toISOString()` produces `2026-04-15T23:12:47.728Z` (UTC with Z suffix). This is intentional — the project standardizes on Beijing time, so API response timestamps should reflect Beijing time. Verify downstream consumers (frontend `mist-fe`, logs) handle offset-format ISO strings correctly.
>
> **Server timezone caveat:** `formatISO(new Date())` uses server-local timezone. For guaranteed Beijing time, use `formatISO(timezoneService.getCurrentBeijingTime())`. Framework-level components (interceptor, filter) that don't inject `TimezoneService` use `formatISO(new Date())` — acceptable because the dev/prod server runs in Beijing timezone. If deployed to a non-Beijing timezone server, these must inject `TimezoneService`.

**Tech Stack:** date-fns v4, date-fns-tz v3, NestJS, TypeScript

---

## Scope Decision: What to Keep vs Migrate

### KEEP as-is (no migration needed)

| Pattern | Reason |
|---------|--------|
| `Date.now()` for ID generation (7 total; 1 in `template.service.ts` migrated, leaving 6 kept) | Pure numeric, no date semantics |
| `Date.now()` for cache expiry comparison (2 places in timezone.service.ts) | Millisecond arithmetic, not date logic |
| `new Date()` as TypeORM entity default in `k.entity.ts:49` | TypeORM controls entity instantiation |
| `toZonedTime(new Date(), 'Asia/Shanghai')` in `timezone.service.ts:92` | `toZonedTime` requires a `Date` input; this is the entry point for all "current time" |
| `new Date()` in test files (`*.spec.ts`, `test-data/`) | Test fixtures are not production code |
| `new Date()` in dev/utility scripts (`apps/mist/src/chan/test/scripts/`) | Standalone fixture-generation scripts, not runtime production code |

### MIGRATE to date-fns (10 files, ~30 call sites)

| # | File | `new Date()` count | `Date.now()` count | Migration type |
|---|------|------|------|------|
| 1 | `libs/timezone/src/timezone.service.ts` | 1 | 0 | `new Date(isoString)` → `parseISO()` |
| 2 | `libs/utils/src/utils.service.ts` | 1 | 0 | `new Date()` → remove or keep (utility) |
| 3 | `libs/utils/src/services/k-boundary-calculator.ts` | 14 | 0 | Major: `new Date(y,m,d,...)` → date-fns helpers |
| 4 | `apps/mist/src/interceptors/transform.interceptor.ts` | 1 | 1 | `new Date().toISOString()` → `formatISO()` |
| 5 | `apps/mist/src/filters/all-exceptions.filter.ts` | 1 | 1 | `new Date().toISOString()` → `formatISO()` |
| 6 | `apps/mist/src/sources/tdx/tdx-source.service.ts` | 3 (2 migrated) | 0 | `new Date(string)` → `parseISO()` (line 286 kept as-is) |
| 7 | `apps/mist/src/sources/tdx/tdx-websocket.service.ts` | 1 | 0 | `new Date()` → inject TimezoneService |
| 8 | `apps/mist/src/sources/tdx/kcandle-aggregator.ts` | 1 | 0 | `new Date(timestamp)` → `new Date(timestamp)` keep (clone) |
| 9 | `apps/mist/src/sources/east-money/east-money-source.service.ts` | 2 | 0 | `new Date(string)` → `parseISO()` |
| 10 | `apps/mist/src/chan/services/channel.service.ts` | 1 | 0 | `new Date(date).getTime()` → `getTime()` |
| 11 | `apps/mcp-server/src/services/chan-mcp.service.ts` | 3 | 0 | `new Date(kline.time)` → `parseISO()` |
| 12 | `apps/mcp-server/src/services/schedule-mcp.service.ts` | 2 | 0 | `new Date().toISOString()` → `formatISO()` |
| 13 | `apps/mcp-server/src/utils/validation.helpers.ts` | 2 | 0 | `new Date(string)` → `parseISO()` |
| 14 | `apps/saya/src/template/template.service.ts` | 0 | 1 | `Date.now()` → `formatISO(new Date())` |
| 15 | `apps/schedule/src/data-collection.controller.ts` | 1 | 0 | `new Date(now)` + setDate → `addDays()` + `startOfDay()` |

---

### Task 1: Migrate `k-boundary-calculator.ts` (biggest win — 14 `new Date()` calls)

**Files:**
- Modify: `libs/utils/src/services/k-boundary-calculator.ts`
- Test: `libs/utils/src/services/k-boundary-calculator.spec.ts`

- [ ] **Step 1: Add date-fns imports and refactor `calculateDailyPlusCandle`**

Replace the entire `calculateDailyPlusCandle` method and imports:

```typescript
// NEW imports (replace existing imports)
import {
  set,
  startOfDay,
  addDays,
  startOfWeek,
  startOfMonth,
  addMonths,
  startOfQuarter,
  addQuarters,
  startOfYear,
  addYears,
} from 'date-fns';
import { Period } from '@app/shared-data';

// ... KCandleBoundary interface unchanged ...

export class KBoundaryCalculator {
  // ... calculate() unchanged ...

  // ... calculateMinuteCandle() — see Step 2 ...

  /**
   * Calculate daily+ K candle boundaries using date-fns helpers.
   */
  calculateDailyPlusCandle(period: Period, triggerTime: Date): KCandleBoundary {
    switch (period) {
      case Period.DAY: {
        const startTime = startOfDay(triggerTime);
        const endTime = startOfDay(addDays(triggerTime, 1));
        return { startTime, endTime };
      }
      case Period.WEEK: {
        const startTime = startOfWeek(triggerTime, { weekStartsOn: 1 });
        const endTime = startOfWeek(addDays(triggerTime, 7), { weekStartsOn: 1 });
        return { startTime, endTime };
      }
      case Period.MONTH: {
        const startTime = startOfMonth(triggerTime);
        const endTime = startOfMonth(addMonths(triggerTime, 1));
        return { startTime, endTime };
      }
      case Period.QUARTER: {
        const startTime = startOfQuarter(triggerTime);
        const endTime = startOfQuarter(addQuarters(triggerTime, 1));
        return { startTime, endTime };
      }
      case Period.YEAR: {
        const startTime = startOfYear(triggerTime);
        const endTime = startOfYear(addYears(triggerTime, 1));
        return { startTime, endTime };
      }
      default:
        throw new Error(`Unsupported period: ${period}`);
    }
  }

  // ... getSessionStart() — see Step 2 ...
}
```

- [ ] **Step 2: Refactor `calculateMinuteCandle` and `getSessionStart` to use date-fns `set()`**

```typescript
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

    // Use date-fns set() instead of mutators
    const endTime = set(sessionStart, {
      minutes: sessionStartMinutes + candleEndOffset,
      seconds: 0,
      milliseconds: 0,
    });
    const startTime = set(endTime, {
      minutes: endTime.getMinutes() - periodMinutes,
    });

    return { startTime, endTime };
  }

  private getSessionStart(triggerTime: Date): Date | null {
    const hours = triggerTime.getHours();
    const minutes = triggerTime.getMinutes();
    const totalMinutes = hours * 60 + minutes;

    // Morning session: 9:30 - 11:30 (+ 1min grace for post-session trigger)
    const morningStart = 9 * 60 + 30; // 570
    const morningEnd = 11 * 60 + 31; // 691
    if (totalMinutes >= morningStart && totalMinutes <= morningEnd) {
      return set(triggerTime, { hours: 9, minutes: 30, seconds: 0, milliseconds: 0 });
    }

    // Afternoon session: 13:00 - 15:00 (+ 1min grace for post-session trigger)
    const afternoonStart = 13 * 60; // 780
    const afternoonEnd = 15 * 60 + 1; // 901
    if (totalMinutes >= afternoonStart && totalMinutes <= afternoonEnd) {
      return set(triggerTime, { hours: 13, minutes: 0, seconds: 0, milliseconds: 0 });
    }

    return null;
  }
```

- [ ] **Step 3: Run existing tests to verify no regression**

Run: `cd /Users/xiyugao/code/mist/mist && npx jest libs/utils/src/services/k-boundary-calculator.spec.ts --no-coverage`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add libs/utils/src/services/k-boundary-calculator.ts
git commit -m "refactor: migrate k-boundary-calculator from new Date() to date-fns helpers"
```

---

### Task 2: Migrate `timezone.service.ts` — `parseDateString`

**Files:**
- Modify: `libs/timezone/src/timezone.service.ts`
- Test: `libs/timezone/src/timezone.service.spec.ts`

- [ ] **Step 1: Replace `new Date(isoString)` with `parseISO()`**

Change line 71 and add import:

```typescript
// Add to imports
import { format, fromUnixTime, millisecondsToSeconds, parseISO } from 'date-fns';

// Line 71: replace
// OLD: const result = new Date(isoString);
// NEW:
const result = parseISO(isoString);
```

- [ ] **Step 2: Run existing tests**

Run: `cd /Users/xiyugao/code/mist/mist && npx jest libs/timezone/src/timezone.service.spec.ts --no-coverage`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add libs/timezone/src/timezone.service.ts
git commit -m "refactor: use parseISO() in timezone.service parseDateString"
```

---

### Task 3: Migrate `utils.service.ts` — `getNowDate()`

**Files:**
- Modify: `libs/utils/src/utils.service.ts`

- [ ] **Step 1: Remove `getNowDate()` method entirely**

The `getNowDate()` method at line 63-66 just returns `new Date()`. It has no callers that depend on it being a separate method (all production code should use `TimezoneService.getCurrentBeijingTime()`). Remove it.

Run: `cd /Users/xiyugao/code/mist/mist && grep -r "getNowDate" --include="*.ts" apps/ libs/ | grep -v ".spec.ts" | grep -v "node_modules"`

If it has callers, leave it. If no callers outside tests and its own definition, remove it.

- [ ] **Step 2: If removed, run full build to verify nothing breaks**

Run: `cd /Users/xiyugao/code/mist/mist && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add libs/utils/src/utils.service.ts
git commit -m "refactor: remove unused getNowDate() from utils.service"
```

---

### Task 4: Migrate `tdx-source.service.ts` — 3 `new Date()` calls

**Files:**
- Modify: `apps/mist/src/sources/tdx/tdx-source.service.ts`

- [ ] **Step 1: Add `parseISO` import and replace 3 call sites**

```typescript
// Update import line 13
import { format, parseISO } from 'date-fns';

// Line 154: replace
// OLD: timestamp: new Date(d),
// NEW:
timestamp: parseISO(d),

// Line 256: replace
// OLD: timestamp: new Date(dateKey + '+08:00'),
// NEW:
// Note: dateKey is like "2026-03-16T00:00:00" (already has T), so
// dateKey + '+08:00' = "2026-03-16T00:00:00+08:00" — valid for parseISO.
// If upstream format ever changes to date-only (no T), must normalize first.
timestamp: parseISO(dateKey + '+08:00'),

// Line 286: replace
// OLD: timestamp: new Date(),
// NEW:
timestamp: new Date(),  // KEEP — this is a snapshot "now" timestamp, acceptable as raw Date
```

Note: Line 286 (`parseSnapshot`) creates a "current time" timestamp. This should ideally use `TimezoneService.getCurrentBeijingTime()`, but `TdxSource` doesn't inject `TimezoneService`. Keep `new Date()` here for now — it's a low-impact snapshot timestamp.

- [ ] **Step 2: Run existing tests**

Run: `cd /Users/xiyugao/code/mist/mist && npx jest apps/mist/src/sources/tdx/ --no-coverage`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add apps/mist/src/sources/tdx/tdx-source.service.ts
git commit -m "refactor: use parseISO() in tdx-source.service for date parsing"
```

---

### Task 5: Migrate `east-money-source.service.ts` — 2 `new Date()` calls

**Files:**
- Modify: `apps/mist/src/sources/east-money/east-money-source.service.ts`

- [ ] **Step 1: Add `parseISO` import and replace 2 call sites**

```typescript
// Update import line 18
import { format, parseISO } from 'date-fns';

// Line 82: replace
// OLD: const timestamp = new Date(item['时间']);
// NEW:
const timestamp = parseISO(item['时间']);

// Line 154: replace
// OLD: timestamp: new Date(item.date),
// NEW:
timestamp: parseISO(item.date),
```

- [ ] **Step 2: Run existing tests**

Run: `cd /Users/xiyugao/code/mist/mist && npx jest apps/mist/src/sources/east-money/ --no-coverage`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add apps/mist/src/sources/east-money/east-money-source.service.ts
git commit -m "refactor: use parseISO() in east-money-source.service for date parsing"
```

---

### Task 6: Migrate `kcandle-aggregator.ts` — 1 `new Date(timestamp)` (clone)

**Files:**
- Modify: `apps/mist/src/sources/tdx/kcandle-aggregator.ts`

- [ ] **Step 1: Assess — `new Date(timestamp)` at line 104 is a Date clone**

`getCandleTime` receives a `Date` and clones it with `new Date(timestamp)` before mutating. With date-fns `set()`, the original is never mutated, so we can use `set(timestamp, {})` or just restructure the method to use `set()` directly:

```typescript
// Add import
import { set } from 'date-fns';

// Replace getCandleTime method
private getCandleTime(timestamp: Date, period: Period): Date {
  switch (period) {
    case Period.ONE_MIN:
      return set(timestamp, { seconds: 0, milliseconds: 0 });

    case Period.FIVE_MIN: {
      const minutes5 = Math.floor(timestamp.getMinutes() / 5) * 5;
      return set(timestamp, { minutes: minutes5, seconds: 0, milliseconds: 0 });
    }

    case Period.FIFTEEN_MIN: {
      const minutes15 = Math.floor(timestamp.getMinutes() / 15) * 15;
      return set(timestamp, { minutes: minutes15, seconds: 0, milliseconds: 0 });
    }

    case Period.THIRTY_MIN: {
      const minutes30 = Math.floor(timestamp.getMinutes() / 30) * 30;
      return set(timestamp, { minutes: minutes30, seconds: 0, milliseconds: 0 });
    }

    case Period.SIXTY_MIN:
      return set(timestamp, { minutes: 0, seconds: 0, milliseconds: 0 });

    default:
      return set(timestamp, { hours: 0, minutes: 0, seconds: 0, milliseconds: 0 });
  }
}
```

- [ ] **Step 2: Run existing tests**

Run: `cd /Users/xiyugao/code/mist/mist && npx jest apps/mist/src/sources/tdx/kcandle-aggregator.spec.ts --no-coverage`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add apps/mist/src/sources/tdx/kcandle-aggregator.ts
git commit -m "refactor: use date-fns set() in kcandle-aggregator for time alignment"
```

---

### Task 7: Migrate response interceptors and filters — `new Date().toISOString()`

**Files:**
- Modify: `apps/mist/src/interceptors/transform.interceptor.ts`
- Modify: `apps/mist/src/filters/all-exceptions.filter.ts`

- [ ] **Step 1: Replace in `transform.interceptor.ts`**

```typescript
// Add import at top
import { formatISO } from 'date-fns';

// Line 27: replace
// OLD: timestamp: new Date().toISOString(),
// NEW:
timestamp: formatISO(new Date()),
```

Note: `Date.now()` on line 35 is for ID generation — KEEP.

- [ ] **Step 2: Replace in `all-exceptions.filter.ts`**

```typescript
// Add import at top
import { formatISO } from 'date-fns';

// Line 32: replace
// OLD: timestamp: new Date().toISOString(),
// NEW:
timestamp: formatISO(new Date()),
```

Note: `Date.now()` on line 90 is for ID generation — KEEP.

- [ ] **Step 3: Run build to verify**

Run: `cd /Users/xiyugao/code/mist/mist && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add apps/mist/src/interceptors/transform.interceptor.ts apps/mist/src/filters/all-exceptions.filter.ts
git commit -m "refactor: use formatISO() for response timestamps in interceptor and filter"
```

---

### Task 8: Migrate `tdx-websocket.service.ts` — `new Date()` for snapshot timestamp

**Files:**
- Modify: `apps/mist/src/sources/tdx/tdx-websocket.service.ts`

- [ ] **Step 1: Replace `new Date()` at line 176**

The `parseSnapshot` method creates a snapshot with `timestamp: new Date()`. This is a real-time snapshot timestamp. Since `TdxWebSocketService` doesn't inject `TimezoneService`, we have two options:

**Option A (minimal change):** Keep `new Date()` — it's intentionally "right now" and the downstream consumer handles timezone.

**Option B (proper):** Inject `TimezoneService` and use `getCurrentBeijingTime()`.

Given the project convention to use `TimezoneService.getCurrentBeijingTime()`, go with Option B:

```typescript
// Add to constructor injection
constructor(
  private readonly configService: ConfigService,
  private readonly aggregator: KCandleAggregator,
  private readonly timezoneService: TimezoneService,  // ADD
) {

// In parseSnapshot (line 176):
// OLD: timestamp: new Date(),
// NEW:
timestamp: this.timezoneService.getCurrentBeijingTime(),
```

Also need to add `TimezoneService` to the module's providers. Check which module declares `TdxWebSocketService` and add `TimezoneModule` import.

- [ ] **Step 2: Verify module imports TimezoneModule**

Search for the module that provides `TdxWebSocketService` and ensure `TimezoneModule` is imported.

- [ ] **Step 3: Run build + tests**

Run: `cd /Users/xiyugao/code/mist/mist && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add apps/mist/src/sources/tdx/tdx-websocket.service.ts
git commit -m "refactor: use TimezoneService for snapshot timestamps in tdx-websocket"
```

---

### Task 9: Migrate `channel.service.ts` — `new Date(date).getTime()`

**Files:**
- Modify: `apps/mist/src/chan/services/channel.service.ts`

- [ ] **Step 1: Simplify `getTime` helper at line 441-446**

```typescript
// OLD:
const getTime = (date: Date | string): number => {
  if (date instanceof Date) {
    return date.getTime();
  }
  return new Date(date).getTime();
};

// NEW:
import { parseISO } from 'date-fns';

const getTime = (date: Date | string): number => {
  if (date instanceof Date) {
    return date.getTime();
  }
  return parseISO(date).getTime();
};
```

Add `parseISO` to the file's imports.

- [ ] **Step 2: Run build**

Run: `cd /Users/xiyugao/code/mist/mist && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add apps/mist/src/chan/services/channel.service.ts
git commit -m "refactor: use parseISO() in channel.service getTime helper"
```

---

### Task 10: Migrate MCP services — `chan-mcp.service.ts`, `schedule-mcp.service.ts`, `validation.helpers.ts`

**Files:**
- Modify: `apps/mcp-server/src/services/chan-mcp.service.ts`
- Modify: `apps/mcp-server/src/services/schedule-mcp.service.ts`
- Modify: `apps/mcp-server/src/utils/validation.helpers.ts`

- [ ] **Step 1: Migrate `chan-mcp.service.ts` — 3 `new Date(kline.time)`**

```typescript
// Add import
import { parseISO } from 'date-fns';

// Lines 110, 151, 194: replace all 3 occurrences
// OLD: time: new Date(kline.time),
// NEW:
time: parseISO(kline.time),
```

- [ ] **Step 2: Migrate `schedule-mcp.service.ts` — 2 `new Date().toISOString()`**

```typescript
// Add import
import { formatISO } from 'date-fns';

// Line 73: replace
// OLD: triggeredAt: new Date().toISOString(),
// NEW:
triggeredAt: formatISO(new Date()),

// Line 196: replace
// OLD: triggeredAt: new Date().toISOString(),
// NEW:
triggeredAt: formatISO(new Date()),
```

- [ ] **Step 3: Migrate `validation.helpers.ts` — 2 `new Date(string)`**

```typescript
// Add import
import { parseISO } from 'date-fns';

// Lines 32-41: replace
// OLD:
//   const start = new Date(
//     startDate.includes(' ')
//       ? startDate.replace(' ', 'T') + '+08:00'
//       : startDate + 'T00:00:00+08:00',
//   );
//   const end = new Date(
//     endDate.includes(' ')
//       ? endDate.replace(' ', 'T') + '+08:00'
//       : endDate + 'T00:00:00+08:00',
//   );
// NEW:
const start = parseISO(
  startDate.includes(' ')
    ? startDate.replace(' ', 'T') + '+08:00'
    : startDate + 'T00:00:00+08:00',
);
const end = parseISO(
  endDate.includes(' ')
    ? endDate.replace(' ', 'T') + '+08:00'
    : endDate + 'T00:00:00+08:00',
);
```

- [ ] **Step 4: Run build + MCP server tests**

Run: `cd /Users/xiyugao/code/mist/mist && npx jest apps/mcp-server/ --no-coverage && npx tsc --noEmit`
Expected: All tests PASS, no build errors

- [ ] **Step 5: Commit**

```bash
git add apps/mcp-server/src/services/chan-mcp.service.ts apps/mcp-server/src/services/schedule-mcp.service.ts apps/mcp-server/src/utils/validation.helpers.ts
git commit -m "refactor: migrate MCP services to date-fns parseISO and formatISO"
```

---

### Task 11: Migrate `saya/template.service.ts` and `schedule/data-collection.controller.ts`

**Files:**
- Modify: `apps/saya/src/template/template.service.ts`
- Modify: `apps/schedule/src/data-collection.controller.ts`

- [ ] **Step 1: Migrate `template.service.ts` — `Date.now()` as template variable**

```typescript
// Add import
import { formatISO } from 'date-fns';

// Line 22: replace
// OLD: }).format({ CURRENT_TIME: Date.now() });
// NEW:
}).format({ CURRENT_TIME: formatISO(new Date()) });
```

This gives the AI agent a human-readable ISO timestamp instead of a raw epoch number.

- [ ] **Step 2: Migrate `data-collection.controller.ts` — `new Date(now)` clone + mutators**

```typescript
// Add import
import { addDays, getMonth } from 'date-fns';

// Lines 152-154: replace
// OLD:
//   const tomorrow = new Date(now);
//   tomorrow.setDate(tomorrow.getDate() + 1);
//   if (tomorrow.getMonth() === now.getMonth()) return;
// NEW:
const tomorrow = addDays(now, 1);
if (getMonth(tomorrow) === getMonth(now)) return;
```

- [ ] **Step 3: Run build**

Run: `cd /Users/xiyugao/code/mist/mist && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add apps/saya/src/template/template.service.ts apps/schedule/src/data-collection.controller.ts
git commit -m "refactor: migrate saya and schedule to date-fns helpers"
```

---

### Task 12: Final verification — full test suite + grep audit

- [ ] **Step 1: Run full test suite**

Run: `cd /Users/xiyugao/code/mist/mist && pnpm run test`
Expected: All tests PASS

- [ ] **Step 2: Audit remaining `new Date()` in production code**

Run: `cd /Users/xiyugao/code/mist/mist && grep -rn "new Date(" --include="*.ts" apps/ libs/ | grep -v ".spec.ts" | grep -v "node_modules" | grep -v "test-data"`

Expected remaining should only be:
- `libs/shared-data/src/entities/k.entity.ts:49` — TypeORM entity default
- `libs/timezone/src/timezone.service.ts:92` — `toZonedTime(new Date(), ...)` (entry point)
- `Date.now()` for ID generation (6 places)
- Any `new Date()` in TDX snapshot parsing where TimezoneService isn't injected yet

- [ ] **Step 3: Final commit if any cleanup needed**

```bash
git add -A
git commit -m "refactor: complete date-fns migration — final cleanup"
```
