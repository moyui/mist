# Error Handling Refactor Design

**Date**: 2025-03-15
**Status**: ✅ Approved
**Author**: Claude Code

## Overview

Refactor the error handling system in the Mist backend to:
1. Remove unused functions from `errors.ts`
2. Replace all hardcoded error messages with centralized constants
3. Standardize all error messages to English

## Problem Statement

### Current Issues

1. **Unused Code**: `errors.ts` contains functions that are never used:
   - `getErrorMessage()` - only used internally
   - `createError()` - never used
   - 5 custom exception classes - never used

2. **Inconsistent Error Handling**: 26 hardcoded `HttpException` calls across 8 files:
   - Mixed English and Chinese error messages
   - Scattered error strings, difficult to maintain
   - No centralized error management

3. **Maintenance Burden**:
   - Duplicate error messages across files
   - Difficult to update error messages consistently
   - No support for future internationalization

### Impact Analysis

| File | Hardcoded Errors | Language | Priority |
|------|------------------|----------|----------|
| `data.service.ts` | 2 | Chinese | High |
| `shared-data.service.ts` | 5 | Chinese | High |
| `channel.service.ts` | 7+ | Mixed | High |
| `bi.service.ts` | TBD | TBD | Medium |
| `timezone.service.ts` | TBD | TBD | Low |
| `tools.service.ts` | TBD | TBD | Low |

## Solution Design

### Approach: Simplified Refactor

**Chosen for**: Minimal complexity, backward compatibility, easy maintenance

### Architecture

```
┌─────────────────────────────────────────┐
│         ERROR_MESSAGES                  │
│  (Flat string constants)                │
├─────────────────────────────────────────┤
│ • INDEX_NOT_FOUND                       │
│ • BI_DATA_REQUIRED                      │
│ • BI_MISSING_HIGH_LOW                   │
│ • ... (20+ constants)                   │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│     Services (Usage Pattern)            │
├─────────────────────────────────────────┤
│ throw new HttpException(                │
│   ERROR_MESSAGES.INDEX_NOT_FOUND,       │
│   HttpStatus.NOT_FOUND                  │
│ )                                       │
└─────────────────────────────────────────┘
```

### Key Decisions

1. **Remove unused functions**: Delete `getErrorMessage()`, `createError()`, and 5 custom exception classes
2. **Keep flat structure**: Maintain simple string constants for backward compatibility
3. **English only**: Standardize all error messages to English
4. **One-time migration**: Replace all 26 hardcoded errors in single refactor

## Implementation Details

### Phase 1: Refactor errors.ts

**File**: `libs/constants/src/errors.ts`

**Remove**:
- `getErrorMessage()` function
- `createError()` function
- `ErrorConfig` interface
- `ERROR_CONFIGS` export
- `ERROR_DEFINITIONS` constant
- 5 custom exception classes

**Add** ~20 new error constants:
```typescript
export const ERROR_MESSAGES = {
  // === Service Initialization ===
  INDICATOR_NOT_INITIALIZED: '...',

  // === Data Access ===
  INDEX_NOT_FOUND: 'Index information not found',
  INDEX_PERIOD_REQUEST_FAILED: 'Failed to request index period data',
  INDEX_DAILY_REQUEST_FAILED: 'Failed to request index daily data',

  // === Channel Validation ===
  BI_DATA_REQUIRED: 'Invalid input: bi data is required',
  BI_MUST_BE_ARRAY: 'Invalid input: bi must be an array',
  BI_ARRAY_EMPTY: 'Invalid input: bi array cannot be empty',
  BI_MISSING_HIGH_LOW: 'Invalid bi at index {{index}}: missing highest or lowest value',
  BI_INVALID_NUMBER_TYPE: 'Invalid bi at index {{index}}: highest and lowest must be numbers',
  BI_HIGH_MUST_EXCEED_LOW: 'Invalid bi at index {{index}}: highest must be greater than lowest',
  BI_MISSING_FENXING: 'Bi at index {{index}} is incomplete: missing fenxing information',

  // ... more constants
} as const;
```

### Phase 2: Replace Hardcoded Errors

#### Pattern 1: Simple replacement (no parameters)
```typescript
// Before
throw new HttpException('查询不到该指数信息', HttpStatus.BAD_REQUEST);

// After
throw new HttpException(
  ERROR_MESSAGES.INDEX_NOT_FOUND,
  HttpStatus.BAD_REQUEST,
);
```

#### Pattern 2: Manual interpolation (with parameters)
```typescript
// Before
throw new HttpException(
  `Invalid bi at index ${i}: missing highest or lowest value`,
  HttpStatus.BAD_REQUEST,
);

// After
throw new HttpException(
  ERROR_MESSAGES.BI_MISSING_HIGH_LOW.replace('{{index}}', String(i)),
  HttpStatus.BAD_REQUEST,
);
```

### Phase 3: File-by-File Migration

| File | Changes | Risk |
|------|---------|------|
| `libs/constants/src/errors.ts` | Refactor: -130 lines, +40 lines | Medium |
| `apps/mist/src/data/data.service.ts` | Replace 2 errors | Low |
| `libs/shared-data/src/shared-data.service.ts` | Replace 5 errors | Low |
| `apps/mist/src/chan/services/channel.service.ts` | Replace 7+ errors | Low |
| `apps/mist/src/chan/services/bi.service.ts` | Check & replace | Low |
| Other files | Check & replace | Low |

### Phase 4: Verification

```bash
# 1. TypeScript compilation
pnpm run build

# 2. Linting
pnpm run lint

# 3. Run affected tests
pnpm run test apps/mist/src/data/data.service.spec.ts
pnpm run test libs/shared-data/src/shared-data.service.spec.ts
pnpm run test apps/mist/src/chan/services/channel.service.spec.ts
```

**Manual verification**:
- [ ] All endpoints return English error messages
- [ ] HTTP status codes remain unchanged
- [ ] No regression in existing functionality

## Testing Strategy

### Automated Tests
- Compile check: `pnpm run build`
- Lint check: `pnpm run lint`
- Unit tests: All existing tests must pass

### Manual Testing
1. Test data service endpoints with invalid index
2. Test channel service endpoints with invalid bi data
3. Verify error messages are in English
4. Verify HTTP status codes are correct

### Rollback Plan
```bash
# If issues arise, revert changes
git checkout HEAD~1 -- libs/constants/src/errors.ts
```

## Impact Assessment

### Benefits
- ✅ Removes ~130 lines of unused code
- ✅ Centralizes error management
- ✅ Standardizes to English
- ✅ Easier maintenance and updates
- ✅ Foundation for future i18n

### Risks
- ⚠️ Breaking change: Chinese error messages become English
- ⚠️ Need to update frontend error handling if it expects Chinese
- ⚠️ API contracts change (error message language)

### Mitigation
- Document API changes
- Update frontend if needed
- Keep git history for easy rollback

## Success Criteria

1. ✅ All unused functions removed from errors.ts
2. ✅ All 26 hardcoded errors replaced with constants
3. ✅ All error messages in English
4. ✅ Build passes (TypeScript + ESLint)
5. ✅ All tests pass
6. ✅ No regression in functionality

## Estimated Effort

- **Design**: 30 minutes ✅ (Complete)
- **Implementation**: 30-45 minutes
- **Testing**: 15 minutes
- **Total**: ~1.5 hours

## Next Steps

1. ✅ Design approved
2. ⏭️ Create detailed implementation plan (writing-plans skill)
3. ⏭️ Execute implementation
4. ⏭️ Verify and test
5. ⏭️ Deploy

---

**Appendix**: See implementation plan for detailed step-by-step instructions.
