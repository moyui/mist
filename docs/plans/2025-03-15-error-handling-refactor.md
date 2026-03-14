# Error Handling Refactor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refactor error handling to remove unused functions and replace all hardcoded error messages with centralized English constants.

**Architecture:** Simplify `errors.ts` to flat string constant structure, replace 26 hardcoded errors across 4-8 service files with constant references.

**Tech Stack:** TypeScript, NestJS, HttpException, HttpStatus

---

## Task 1: Refactor errors.ts - Remove unused code and add new constants

**Files:**
- Modify: `libs/constants/src/errors.ts`

**Step 1: Backup current errors.ts**

```bash
cp libs/constants/src/errors.ts libs/constants/src/errors.ts.backup
```

**Step 2: Replace entire errors.ts with simplified version**

Read the current file, then replace with:

```typescript
/**
 * Centralized error messages for the Mist application
 * All error messages should be defined here to ensure consistency
 * and make localization easier in the future.
 *
 * All messages are in English for consistency across the codebase.
 */

export const ERROR_MESSAGES = {
  // === Service Initialization Errors ===
  INDICATOR_NOT_INITIALIZED:
    'IndicatorService not initialized. Please try again later.',
  DATA_SERVICE_NOT_INITIALIZED:
    'DataService not initialized. Please try again later.',

  // === Data Access Errors ===
  INDEX_NOT_FOUND: 'Index information not found',
  INDEX_PERIOD_REQUEST_FAILED: 'Failed to request index period data',
  INDEX_DAILY_REQUEST_FAILED: 'Failed to request index daily data',

  // === Validation Errors - Channel (Bi) ===
  BI_DATA_REQUIRED: 'Invalid input: bi data is required',
  BI_MUST_BE_ARRAY: 'Invalid input: bi must be an array',
  BI_ARRAY_EMPTY: 'Invalid input: bi array cannot be empty',
  BI_MISSING_HIGH_LOW:
    'Invalid bi at index {{index}}: missing highest or lowest value',
  BI_INVALID_NUMBER_TYPE:
    'Invalid bi at index {{index}}: highest and lowest must be numbers',
  BI_HIGH_MUST_EXCEED_LOW:
    'Invalid bi at index {{index}}: highest must be greater than lowest',
  BI_MISSING_FENXING:
    'Bi at index {{index}} is incomplete: missing fenxing information',
  BI_INVALID_DIRECTION: 'Invalid bi at index {{index}}: invalid direction value',

  // === Validation Errors - General ===
  INVALID_PERIOD: 'Invalid period specified',
  INVALID_DATE_RANGE: 'Invalid date range provided',
  INSUFFICIENT_DATA: 'Insufficient data for calculation',
  INVALID_DATA_FORMAT: 'Invalid data format provided',

  // === API Errors ===
  UNAUTHORIZED: 'Unauthorized access',
  RATE_LIMIT_EXCEEDED: 'Rate limit exceeded. Please try again later.',
  INVALID_API_KEY: 'Invalid API key provided',

  // === Database Errors ===
  DATABASE_CONNECTION_FAILED: 'Failed to connect to database',
  DATABASE_QUERY_FAILED: 'Database query failed',

  // === General Errors ===
  INTERNAL_SERVER_ERROR: 'Internal server error occurred',
  SERVICE_UNAVAILABLE: 'Service temporarily unavailable',
} as const;

export type ErrorMessage = keyof typeof ERROR_MESSAGES;
```

**What was removed:**
- `getErrorMessage()` function (~20 lines)
- `createError()` function (~25 lines)
- `ErrorConfig` interface
- `ERROR_CONFIGS` export
- `ERROR_DEFINITIONS` constant
- 5 custom exception classes (~40 lines)

**What was added:**
- ~10 new error constants for data access and bi validation

**Step 3: Verify TypeScript compilation**

```bash
cd /Users/xiyugao/code/mist/mist
pnpm run build
```

Expected: `webpack 5.97.1 compiled successfully`

**Step 4: Run lint check**

```bash
pnpm run lint
```

Expected: No errors

**Step 5: Clean up backup**

```bash
rm libs/constants/src/errors.ts.backup
```

**Step 6: Commit changes**

```bash
git add libs/constants/src/errors.ts
git commit -m "refactor(errors): simplify error messages, remove unused functions

- Remove getErrorMessage(), createError(), and 5 custom exception classes
- Add 10 new error constants for data and bi validation
- Keep flat string structure for backward compatibility"
```

---

## Task 2: Replace hardcoded errors in data.service.ts

**Files:**
- Modify: `apps/mist/src/data/data.service.ts`

**Step 1: Read the file to find all hardcoded errors**

```bash
grep -n "throw new HttpException" apps/mist/src/data/data.service.ts
```

Expected: Find 2 occurrences around lines 58 and 85

**Step 2: Replace error at line 58**

Find:
```typescript
throw new HttpException('查询不到该指数信息', HttpStatus.BAD_REQUEST);
```

Replace with:
```typescript
throw new HttpException(
  ERROR_MESSAGES.INDEX_NOT_FOUND,
  HttpStatus.BAD_REQUEST,
);
```

**Step 3: Replace error at line 85**

Find:
```typescript
throw new HttpException('查询不到该指数信息', HttpStatus.BAD_REQUEST);
```

Replace with:
```typescript
throw new HttpException(
  ERROR_MESSAGES.INDEX_NOT_FOUND,
  HttpStatus.BAD_REQUEST,
);
```

**Step 4: Verify imports**

Ensure file has import:
```typescript
import { ERROR_MESSAGES } from '@app/constants';
```

If not present, add it after the existing imports.

**Step 5: Build to verify**

```bash
pnpm run build
```

Expected: `compiled successfully`

**Step 6: Commit changes**

```bash
git add apps/mist/src/data/data.service.ts
git commit -m "refactor(data): replace hardcoded errors with constants"
```

---

## Task 3: Replace hardcoded errors in shared-data.service.ts

**Files:**
- Modify: `libs/shared-data/src/shared-data.service.ts`

**Step 1: Find all hardcoded errors**

```bash
grep -n "throw new HttpException" libs/shared-data/src/shared-data.service.ts
```

Expected: Find 5 occurrences

**Step 2: Replace error around line 71-73**

Find:
```typescript
throw new HttpException(
  '请求指数周期数据错误',
  HttpStatus.SERVICE_UNAVAILABLE,
);
```

Replace with:
```typescript
throw new HttpException(
  ERROR_MESSAGES.INDEX_PERIOD_REQUEST_FAILED,
  HttpStatus.SERVICE_UNAVAILABLE,
);
```

**Step 3: Replace error around line 91**

Find:
```typescript
throw new HttpException('查询不到该指数信息', HttpStatus.BAD_REQUEST);
```

Replace with:
```typescript
throw new HttpException(
  ERROR_MESSAGES.INDEX_NOT_FOUND,
  HttpStatus.BAD_REQUEST,
);
```

**Step 4: Replace error around line 285-287**

Find:
```typescript
throw new HttpException(
  '请求指数日期数据错误',
  HttpStatus.SERVICE_UNAVAILABLE,
);
```

Replace with:
```typescript
throw new HttpException(
  ERROR_MESSAGES.INDEX_DAILY_REQUEST_FAILED,
  HttpStatus.SERVICE_UNAVAILABLE,
);
```

**Step 5: Replace error around line 299**

Find:
```typescript
throw new HttpException('查询不到该指数信息', HttpStatus.BAD_REQUEST);
```

Replace with:
```typescript
throw new HttpException(
  ERROR_MESSAGES.INDEX_NOT_FOUND,
  HttpStatus.BAD_REQUEST,
);
```

**Step 6: Replace error around line 341**

Find:
```typescript
throw new HttpException('查询不到该指数信息', HttpStatus.BAD_REQUEST);
```

Replace with:
```typescript
throw new HttpException(
  ERROR_MESSAGES.INDEX_NOT_FOUND,
  HttpStatus.BAD_REQUEST,
);
```

**Step 7: Verify imports**

Ensure file has:
```typescript
import { ERROR_MESSAGES } from '@app/constants';
```

**Step 8: Build to verify**

```bash
pnpm run build
```

Expected: `compiled successfully`

**Step 9: Commit changes**

```bash
git add libs/shared-data/src/shared-data.service.ts
git commit -m "refactor(shared-data): replace hardcoded Chinese errors with English constants"
```

---

## Task 4: Replace hardcoded errors in channel.service.ts

**Files:**
- Modify: `apps/mist/src/chan/services/channel.service.ts`

**Step 1: Find all hardcoded errors**

```bash
grep -n "throw new HttpException" apps/mist/src/chan/services/channel.service.ts
```

Expected: Find 7+ occurrences

**Step 2: Replace error around line 20-22 (BI_DATA_REQUIRED)**

Find:
```typescript
throw new HttpException(
  'Invalid input: bi data is required',
  HttpStatus.BAD_REQUEST,
);
```

Replace with:
```typescript
throw new HttpException(
  ERROR_MESSAGES.BI_DATA_REQUIRED,
  HttpStatus.BAD_REQUEST,
);
```

**Step 3: Replace error around line 27-29 (BI_MUST_BE_ARRAY)**

Find:
```typescript
throw new HttpException(
  'Invalid input: bi must be an array',
  HttpStatus.BAD_REQUEST,
);
```

Replace with:
```typescript
throw new HttpException(
  ERROR_MESSAGES.BI_MUST_BE_ARRAY,
  HttpStatus.BAD_REQUEST,
);
```

**Step 4: Replace error around line 34-36 (BI_ARRAY_EMPTY)**

Find:
```typescript
throw new HttpException(
  'Invalid input: bi array cannot be empty',
  HttpStatus.BAD_REQUEST,
);
```

Replace with:
```typescript
throw new HttpException(
  ERROR_MESSAGES.BI_ARRAY_EMPTY,
  HttpStatus.BAD_REQUEST,
);
```

**Step 5: Replace error around line 44-46 (BI_MISSING_HIGH_LOW)**

Find:
```typescript
throw new HttpException(
  `Invalid bi at index ${i}: missing highest or lowest value`,
  HttpStatus.BAD_REQUEST,
);
```

Replace with:
```typescript
throw new HttpException(
  ERROR_MESSAGES.BI_MISSING_HIGH_LOW.replace('{{index}}', String(i)),
  HttpStatus.BAD_REQUEST,
);
```

**Step 6: Replace error around line 50-52 (BI_INVALID_NUMBER_TYPE)**

Find:
```typescript
throw new HttpException(
  `Invalid bi at index ${i}: highest and lowest must be numbers`,
  HttpStatus.BAD_REQUEST,
);
```

Replace with:
```typescript
throw new HttpException(
  ERROR_MESSAGES.BI_INVALID_NUMBER_TYPE.replace('{{index}}', String(i)),
  HttpStatus.BAD_REQUEST,
);
```

**Step 7: Replace error around line 56-58 (BI_HIGH_MUST_EXCEED_LOW)**

Find:
```typescript
throw new HttpException(
  `Invalid bi at index ${i}: highest must be greater than lowest`,
  HttpStatus.BAD_REQUEST,
);
```

Replace with:
```typescript
throw new HttpException(
  ERROR_MESSAGES.BI_HIGH_MUST_EXCEED_LOW.replace('{{index}}', String(i)),
  HttpStatus.BAD_REQUEST,
);
```

**Step 8: Replace error around line 76-78 (BI_MISSING_FENXING)**

Find:
```typescript
throw new HttpException(
  `第 ${i + 1} 笔数据不完整：缺少分型信息`,
  HttpStatus.BAD_REQUEST,
);
```

Replace with:
```typescript
throw new HttpException(
  ERROR_MESSAGES.BI_MISSING_FENXING.replace('{{index}}', String(i + 1)),
  HttpStatus.BAD_REQUEST,
);
```

**Step 9: Check for additional errors**

Search for any remaining hardcoded errors in this file:
```bash
grep -n "throw new HttpException" apps/mist/src/chan/services/channel.service.ts | grep -v "ERROR_MESSAGES"
```

If any found, replace them with appropriate constants from `ERROR_MESSAGES`.

**Step 10: Verify imports**

Ensure file has:
```typescript
import { ERROR_MESSAGES } from '@app/constants';
```

**Step 11: Build to verify**

```bash
pnpm run build
```

Expected: `compiled successfully`

**Step 12: Commit changes**

```bash
git add apps/mist/src/chan/services/channel.service.ts
git commit -m "refactor(channel): replace hardcoded errors with constants"
```

---

## Task 5: Check and replace errors in bi.service.ts

**Files:**
- Check: `apps/mist/src/chan/services/bi.service.ts`

**Step 1: Search for hardcoded errors**

```bash
grep -n "throw new HttpException" apps/mist/src/chan/services/bi.service.ts
```

**Step 2: If errors found, replace them**

For each error found, determine if it matches an existing `ERROR_MESSAGES` constant or if a new constant is needed.

**Step 3: If replacements made, commit**

```bash
git add apps/mist/src/chan/services/bi.service.ts
git commit -m "refactor(bi): replace hardcoded errors with constants"
```

**Step 4: If no errors found, note it**

No changes needed for this file.

---

## Task 6: Check other service files for hardcoded errors

**Files:**
- Check: `libs/timezone/src/timezone.service.ts`
- Check: `apps/saya/src/tools/tools.service.ts`

**Step 1: Check timezone.service.ts**

```bash
grep -n "throw new HttpException" libs/timezone/src/timezone.service.ts
```

If errors found, replace with constants and commit:
```bash
git add libs/timezone/src/timezone.service.ts
git commit -m "refactor(timezone): replace hardcoded errors with constants"
```

**Step 2: Check tools.service.ts**

```bash
grep -n "throw new HttpException" apps/saya/src/tools/tools.service.ts
```

If errors found, replace with constants and commit:
```bash
git add apps/saya/src/tools/tools.service.ts
git commit -m "refactor(tools): replace hardcoded errors with constants"
```

---

## Task 7: Final verification and testing

**Step 1: Build entire project**

```bash
pnpm run build
```

Expected: `webpack 5.97.1 compiled successfully`

**Step 2: Run lint check**

```bash
pnpm run lint
```

Expected: No errors

**Step 3: Run all tests**

```bash
pnpm run test
```

Expected: All tests pass

**Step 4: Verify no hardcoded errors remain**

Search for any remaining hardcoded Chinese error messages:
```bash
grep -r "throw new HttpException" apps/mist libs --include="*.ts" | grep -v "ERROR_MESSAGES" | grep "[\u4e00-\u9fa5]"
```

Expected: No results (all Chinese errors replaced)

**Step 5: Verify no hardcoded English errors in core services**

```bash
grep -r "throw new HttpException" apps/mist/src/data apps/mist/src/chan libs/shared-data --include="*.ts" | grep -v "ERROR_MESSAGES"
```

Expected: No results from core service files

**Step 6: Manual API verification (optional but recommended)**

Start the service and test error endpoints:
```bash
cd /Users/xiyugao/code/mist/mist
pnpm run start:dev:mist
```

Test endpoints with invalid data to verify English error messages are returned.

**Step 7: Final commit for docs**

```bash
git add docs/plans/2025-03-15-error-handling-refactor.md docs/plans/2025-03-15-error-handling-refactor-design.md
git commit -m "docs: add error handling refactor design and implementation plan"
```

---

## Task 8: Update project documentation

**Files:**
- Update: `CLAUDE.md` (if error handling is documented)

**Step 1: Check if CLAUDE.md documents error handling**

```bash
grep -i "error" CLAUDE.md | head -20
```

**Step 2: If documented, update the section**

Add note about centralized error messages:
```markdown
### Error Handling

All error messages are centralized in `libs/constants/src/errors.ts`.
Use `ERROR_MESSAGES` constant when throwing errors:

\`\`\`typescript
throw new HttpException(
  ERROR_MESSAGES.INDEX_NOT_FOUND,
  HttpStatus.NOT_FOUND,
);
\`\`\`

All error messages are in English for consistency.
```

**Step 3: Commit documentation updates**

```bash
git add CLAUDE.md
git commit -m "docs: update error handling documentation"
```

---

## Summary

**Total tasks:** 8
**Estimated time:** 45-60 minutes
**Files modified:** 1-8 files
**Lines removed:** ~130 lines (unused code)
**Lines added:** ~40 lines (new constants)
**Errors replaced:** 26 hardcoded errors

**Success criteria:**
- ✅ All unused functions removed from errors.ts
- ✅ All hardcoded errors replaced with ERROR_MESSAGES constants
- ✅ All error messages in English
- ✅ Build passes (TypeScript + ESLint)
- ✅ All tests pass
- ✅ No hardcoded Chinese errors remain

---

## Rollback Instructions

If issues arise, revert all changes:
```bash
git reset --hard HEAD~8  # Revert all refactor commits
```

Or revert specific file:
```bash
git checkout HEAD~1 -- libs/constants/src/errors.ts
```
