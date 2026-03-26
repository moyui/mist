# Unify Security Type Refactoring Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace duplicate `StockType` enum with canonical `SecurityType` from shared library, eliminating conversion logic.

**Architecture:** Remove local `StockType` enum from DTO layer, import `SecurityType` from `@app/shared-data`, remove conversion method in service layer.

**Tech Stack:** TypeScript, NestJS, TypeORM

---

## File Structure

**Files to modify:**
- `mist/apps/mist/src/security/dto/init-stock.dto.ts` - Remove StockType enum, import SecurityType
- `mist/apps/mist/src/security/security.service.ts` - Remove convertStockType method, update imports
- `mist/apps/mist/src/security/security.controller.spec.ts` - Update test imports and data
- `mist/apps/mist/src/security/security.service.spec.ts` - Update test imports and data
- `mist/docs/superpowers/plans/2026-03-25-data-source-config-and-scheduled-collection.md` - Update StockType references

**Important Notes:**
- **Breaking Change**: API consumers must now send uppercase values (`"INDEX"`, `"STOCK"`)
- **Rollback**: If issues arise, use `git revert <commit-hash>` to undo commits
- **TDD Approach**: Tests are updated first (red phase), then implementation (green phase)
- **Database Compatibility**: Verify database stores uppercase values; if not, data migration may be needed

---

## Task 0: Verify Prerequisites

- [ ] **Step 1: Verify SecurityType is exported from shared library**

Run: `cd mist && grep -r "export enum SecurityType" libs/shared-data/src/`
Expected: Found in `libs/shared-data/src/enums/security-type.enum.ts`

- [ ] **Step 2: Verify SecurityType enum values**

Run: `cd mist && cat libs/shared-data/src/enums/security-type.enum.ts`
Expected: Shows `STOCK = 'STOCK'` and `INDEX = 'INDEX'`

- [ ] **Step 3: Check current line numbers in files**

Run: `cd mist && grep -n "export enum StockType" apps/mist/src/security/dto/init-stock.dto.ts`
Run: `cd mist && grep -n "convertStockType" apps/mist/src/security/security.service.ts`
Note: Actual line numbers may differ from plan - adjust if needed

- [ ] **Step 4: Check database for existing values**

Run: Check database `security` table `type` column values
Expected: Should contain uppercase 'STOCK' or 'INDEX' (if lowercase, data migration required)

---

## Task 1: Update Security Service Tests (TDD - Red Phase)

**Files:**
- Modify: `mist/apps/mist/src/security/security.service.spec.ts`

- [ ] **Step 1: Update imports**

Change line 10 to import SecurityType instead of StockType:
```typescript
// BEFORE:
import { InitStockDto, SourceType, StockType } from './dto/init-stock.dto';

// AFTER:
import { InitStockDto, SourceType } from './dto/init-stock.dto';
import { SecurityType } from '@app/shared-data';
```

- [ ] **Step 2: Update test data to use SecurityType**

Find all occurrences of `StockType.STOCK` and `StockType.INDEX` and replace with `SecurityType.STOCK` and `SecurityType.INDEX` (around line 74):
```typescript
// BEFORE:
type: StockType.STOCK,

// AFTER:
type: SecurityType.STOCK,
```

- [ ] **Step 3: Run service tests (expecting failure)**

Run: `cd mist && pnpm run test security.service.spec.ts`
Expected: Tests may fail due to DTO and service still using old enum (this is expected in TDD red phase)

- [ ] **Step 4: Commit**

```bash
git add mist/apps/mist/src/security/security.service.spec.ts
git commit -m "test: update security service tests to use SecurityType

- Import SecurityType from shared library
- Replace StockType with SecurityType in test data
- Tests may fail until DTO/service is updated (TDD red phase)
"
```

---

## Task 2: Update Security Controller Tests (TDD - Red Phase)

**Files:**
- Modify: `mist/apps/mist/src/security/security.controller.spec.ts`

- [ ] **Step 1: Update imports**

Change line 4 to import SecurityType instead of StockType:
```typescript
// BEFORE:
import { InitStockDto, SourceType, StockType } from './dto/init-stock.dto';

// AFTER:
import { InitStockDto, SourceType } from './dto/init-stock.dto';
import { SecurityType } from '@app/shared-data';
```

- [ ] **Step 2: Update test data to use SecurityType**

Find all occurrences of `StockType.STOCK` and `StockType.INDEX` and replace with `SecurityType.STOCK` and `SecurityType.INDEX` (around line 44):
```typescript
// BEFORE:
type: StockType.STOCK,

// AFTER:
type: SecurityType.STOCK,
```

- [ ] **Step 3: Run controller tests (expecting failure)**

Run: `cd mist && pnpm run test security.controller.spec.ts`
Expected: Tests may fail due to DTO still using old enum (this is expected in TDD red phase)

- [ ] **Step 4: Commit**

```bash
git add mist/apps/mist/src/security/security.controller.spec.ts
git commit -m "test: update security controller tests to use SecurityType

- Import SecurityType from shared library
- Replace StockType with SecurityType in test data
- Tests may fail until DTO is updated (TDD red phase)
"
```

---

## Task 3: Update DTO to use SecurityType (TDD - Green Phase)

**Files:**
- Modify: `mist/apps/mist/src/security/dto/init-stock.dto.ts`

- [ ] **Step 1: Remove StockType enum definition**

Delete the StockType enum definition (lines 12-15):
```typescript
// DELETE these lines:
export enum StockType {
  INDEX = 'index',
  STOCK = 'stock',
}
```

- [ ] **Step 2: Import SecurityType from shared library**

Add at top of file after existing imports:
```typescript
import { SecurityType } from '@app/shared-data';
```

- [ ] **Step 3: Update InitStockDto.type property**

Change the type and API property decorator (lines 45-47):
```typescript
// BEFORE:
@ApiProperty({ description: 'Stock type', enum: StockType })
@IsEnum(StockType)
type!: StockType;

// AFTER:
@ApiProperty({ description: 'Security type', enum: SecurityType })
@IsEnum(SecurityType)
type!: SecurityType;
```

- [ ] **Step 4: Verify no TypeScript errors**

Run: `cd mist && pnpm run build -- --target apps/mist/src/security/dto/init-stock.dto.ts`
Expected: No compilation errors

- [ ] **Step 5: Run tests to verify green phase**

Run: `cd mist && pnpm run test -- --testPathPattern=security`
Expected: Tests now pass (TDD green phase achieved)

- [ ] **Step 6: Commit**

```bash
git add mist/apps/mist/src/security/dto/init-stock.dto.ts
git commit -m "refactor: replace StockType with SecurityType in DTO

- Remove local StockType enum definition
- Import SecurityType from @app/shared-data
- Update InitStockDto to use SecurityType
- Breaking change: API now expects uppercase values (INDEX/STOCK)
"
```

---

## Task 4: Update SecurityService (TDD - Green Phase)

**Files:**
- Modify: `mist/apps/mist/src/security/security.service.ts`

- [ ] **Step 1: Remove StockType from imports**

Update line 17 to remove StockType:
```typescript
// BEFORE:
import { InitStockDto, StockType, SourceType } from './dto/init-stock.dto';

// AFTER:
import { InitStockDto, SourceType } from './dto/init-stock.dto';
```

- [ ] **Step 2: Remove convertStockType method**

Delete the entire convertStockType method (lines 87-93):
```typescript
// DELETE these lines:
private convertStockType(stockType: StockType): SecurityType {
  // Convert DTO enum to entity enum
  // Both use 'stock' and 'index' but entity uses uppercase
  return stockType === StockType.INDEX
    ? SecurityType.INDEX
    : SecurityType.STOCK;
}
```

- [ ] **Step 3: Update initStock method to use SecurityType directly**

Replace the conversion call (line 47-48):
```typescript
// BEFORE:
// Convert DTO StockType to entity SecurityType
const securityType = this.convertStockType(initStockDto.type);

// AFTER:
const securityType = initStockDto.type;
```

- [ ] **Step 4: Verify no TypeScript errors**

Run: `cd mist && pnpm run build -- --target apps/mist/src/security/security.service.ts`
Expected: No compilation errors

- [ ] **Step 5: Run tests to verify green phase**

Run: `cd mist && pnpm run test -- --testPathPattern=security`
Expected: All tests pass (TDD green phase complete)

- [ ] **Step 6: Commit**

```bash
git add mist/apps/mist/src/security/security.service.ts
git commit -m "refactor: remove convertStockType method in SecurityService

- Remove StockType from imports
- Delete convertStockType method (no longer needed)
- Use SecurityType directly from DTO
"
```

---

## Task 5: Verify All Tests Pass (TDD - Refactor Phase Complete)

- [ ] **Step 1: Run all security module tests**

Run: `cd mist && pnpm run test -- --testPathPattern=security`
Expected: All tests pass (green phase complete)

- [ ] **Step 2: Run full test suite**

Run: `cd mist && pnpm run test`
Expected: All tests pass, no regressions

- [ ] **Step 3: Build project**

Run: `cd mist && pnpm run build`
Expected: Build succeeds with no errors

- [ ] **Step 4: Run integration tests (if any)**

Run: `cd mist && pnpm run test:e2e 2>/dev/null || echo "No E2E tests configured"`
Expected: Integration tests pass

- [ ] **Step 5: Final commit**

```bash
git add .
git commit -m "test: verify all tests pass after SecurityType refactoring

- All security module tests passing
- Full test suite passing
- Build successful
- TDD refactor phase complete
"
```

---

## Task 6: Update Documentation Files

**Files:**
- Modify: `mist/docs/superpowers/plans/2026-03-25-data-source-config-and-scheduled-collection.md`
- Check other documentation for references

- [ ] **Step 1: Search for remaining StockType references in all documentation**

Run: `grep -r "StockType" mist/docs/ docs/ 2>/dev/null || echo "No references found"`

- [ ] **Step 2: Update plan document with StockType references**

Edit `mist/docs/superpowers/plans/2026-03-25-data-source-config-and-scheduled-collection.md`:
- Replace `StockType` with `SecurityType`
- Update enum value examples from lowercase to uppercase
- Update type references in code examples

- [ ] **Step 3: Check for other documentation references**

Run: `find . -name "*.md" -type f | xargs grep -l "StockType" 2>/dev/null || echo "No other references found"`

- [ ] **Step 4: Update any API documentation**

If API documentation exists (Swagger/OpenAPI specs), update to reflect uppercase enum values

- [ ] **Step 5: Commit documentation updates**

```bash
git add mist/docs/ docs/
git commit -m "docs: update references from StockType to SecurityType

- Update plan documents to use SecurityType enum
- Update examples to use uppercase enum values (INDEX/STOCK)
- Ensure consistency across all documentation
"
```

---

## Task 7: Manual API Testing (Optional but Recommended)

- [ ] **Step 1: Start the mist application**

Run: `cd mist && pnpm run start:dev:mist`

- [ ] **Step 2: Test API with new uppercase enum values**

```bash
curl -X POST http://localhost:8001/v1/security/init \
  -H "Content-Type: application/json" \
  -d '{
    "code": "000001.SH",
    "name": "平安银行",
    "type": "STOCK",
    "periods": [5, 15, 30],
    "source": {
      "type": "aktools",
      "config": "{}"
    }
  }'
```

Expected: Success response (200)

- [ ] **Step 3: Verify lowercase values no longer work**

```bash
curl -X POST http://localhost:8001/v1/security/init \
  -H "Content-Type: application/json" \
  -d '{
    "code": "000002.SH",
    "name": "测试",
    "type": "stock",
    "periods": [5],
    "source": {
      "type": "aktools",
      "config": "{}"
    }
  }'
```

Expected: Validation error (400 Bad Request - enum doesn't match)

- [ ] **Step 4: Test INDEX type**

```bash
curl -X POST http://localhost:8001/v1/security/init \
  -H "Content-Type: application/json" \
  -d '{
    "code": "000001",
    "name": "上证指数",
    "type": "INDEX",
    "periods": [5],
    "source": {
      "type": "aktools",
      "config": "{}"
    }
  }'
```

Expected: Success response (200)

---

## Task 8: Create Migration Guide for API Consumers

- [ ] **Step 1: Create migration guide document**

Create `mist/docs/api-migration-security-type.md`:
```markdown
# SecurityType API Migration Guide

## Breaking Change

The `/v1/security/init` endpoint now requires uppercase enum values for the `type` field.

## Changes Required

### Before (no longer supported):
```json
{
  "type": "stock"
}
```

### After (required):
```json
{
  "type": "STOCK"
}
```

## Valid Values

- `"STOCK"` - for stocks
- `"INDEX"` - for indices

## Migration Steps

1. Update all API calls to use uppercase values
2. Test in development environment first
3. Deploy changes before cutoff date

## Support

If you have questions, contact the development team.
```

- [ ] **Step 2: Commit migration guide**

```bash
git add mist/docs/api-migration-security-type.md
git commit -m "docs: add SecurityType migration guide for API consumers

- Document breaking change from lowercase to uppercase enum values
- Provide migration examples
"
```

---

## Summary

This refactoring:
- ✅ Eliminates duplicate enum definition
- ✅ Removes unnecessary conversion logic
- ✅ Establishes single source of truth (SecurityType from @app/shared-data)
- ✅ Improves code maintainability
- ✅ Follows TDD principles (red-green-refactor)
- ✅ Updates all documentation
- ⚠️ **Breaking change**: API consumers must use uppercase values (INDEX/STOCK)
- 📝 **Migration guide**: Provided for API consumers

**Total estimated time:** 45-60 minutes
**Test coverage:** All existing tests updated and passing
**Rollback strategy:** Use `git revert` to undo commits if issues arise

---

## Post-Implementation Checklist

- [ ] All tests passing
- [ ] Build successful
- [ ] Documentation updated
- [ ] API tested manually
- [ ] Migration guide created
- [ ] Team notified of breaking change
- [ ] Database values verified (uppercase)
