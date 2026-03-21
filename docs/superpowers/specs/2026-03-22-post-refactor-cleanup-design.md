# Post-Refactor Cleanup Design Document

**Date:** 2026-03-22
**Author:** Claude Code
**Status:** Draft

## Overview

After three major database refactors (multi-data source K-line, unified data schema, and entity rename), the codebase has accumulated TypeScript property initialization errors and unused code files. This design addresses these issues systematically.

## Problem Statement

### Issue 1: TypeScript Property Initialization Errors

Throughout the codebase, many class properties lack initialization expressions or constructor assignments, causing IDE errors under TypeScript's `strictPropertyInitialization` check.

**Impact:**
- ~56 class files affected
- ~330+ properties needing fixes
- Affects entities, DTOs, and VOs

### Issue 2: Unused Code Files

Three database refactors left behind obsolete files that are no longer referenced:

**Unused Enums:**
- `index-data.enum.ts` - DataType enum, zero references
- `stock-status.enum.ts` - Replaced by SecurityStatus, only used in its own test

**Backup Files:**
- `20260321000000-UnifiedDataSchema.ts.bak` - Migration backup file

**Deprecated but In-Use (NOT removing):**
- `index-period` related files - Marked @deprecated but schedule service depends on them
- `cron-index-*` DTOs - Still used by schedule/mist apps

## Solution Design

### Part 1: Fix Property Initialization

#### Strategy by Class Type

**1. Entity Classes (Mixed Approach)**

| Property Type | Solution | Example |
|--------------|----------|---------|
| `@PrimaryGeneratedColumn` | Use `!` assertion | `id!: number;` |
| `@ManyToOne`, `@OneToOne` | Use `!` assertion | `security!: Security;` |
| `@CreateDateColumn`, `@UpdateDateColumn` | Use `!` assertion | `createdAt!: Date;` |
| `@Column` enum | Add default value | `source: DataSource = DataSource.EAST_MONEY;` |
| `@Column` number | Add default value | `open: number = 0;` |
| `@Column` string | Add default value | `name: string = '';` |
| `@Column` bigint | Add default value | `volume: bigint = 0n;` |

**Rationale:**
- `!` for framework-managed properties (TypeORM auto-initializes these)
- Default values for data columns (ensures valid state before TypeORM hydration)

**Affected Files (13 entities):**
```
libs/shared-data/src/entities/ (6 files)
├── k.entity.ts
├── security.entity.ts
├── security-source-config.entity.ts
├── k-extension-ef.entity.ts
├── k-extension-tdx.entity.ts
└── k-extension-mqmt.entity.ts

apps/mist/src/chan/entities/ (5 files)
├── chan-fenxings.entity.ts
├── chan-index-daily.entity.ts
├── chan-bis.entity.ts
├── chan-states.entity.ts
└── chan-index-period.entity.ts

apps/mist/src/stock/stock.entity.ts
apps/schedule/src/run/entities/run.entity.ts
```

**Example Fix:**
```typescript
// Before
@Entity({ name: 'market_data_bars' })
export class K {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Security)
  security: Security;

  @Column({ type: 'enum', enum: DataSource })
  source: DataSource;

  @Column()
  open: number;
}

// After
@Entity({ name: 'market_data_bars' })
export class K {
  @PrimaryGeneratedColumn()
  id!: number;  // TypeORM managed

  @ManyToOne(() => Security)
  security!: Security;  // TypeORM managed

  @Column({
    type: 'enum',
    enum: DataSource,
  })
  source: DataSource = DataSource.EAST_MONEY;  // Default value

  @Column()
  open: number = 0;  // Default value
}
```

---

**2. VO Classes (Definite Assignment Assertion)**

**Strategy:** All properties use `!` assertion

**Rationale:** VOs are data containers populated externally (from database queries or API responses). Properties are guaranteed to be set before use, but TypeScript can't see this.

**All VO Files (12 total):**
```
libs/shared-data/src/vo/
├── k.vo.ts (13 properties - needs fix)
└── index-period.vo.ts (10 properties - needs fix)

apps/mist/src/k/vo/
└── bars.vo.ts (8 properties - needs fix)

apps/mist/src/indicator/vo/
├── k.vo.ts (✅ already uses !)
├── macd.vo.ts (✅ already uses !)
├── rsi.vo.ts (✅ already uses !)
└── kdj.vo.ts (✅ already uses !)

apps/mist/src/chan/vo/
├── bi.vo.ts (✅ already uses !)
├── merged-k.vo.ts (✅ already uses !)
├── fenxing.vo.ts (✅ already uses !)
└── channel.vo.ts (✅ already uses !)

apps/mist/src/trend/vo/
└── judge-trend.vo.ts (✅ already uses !)
```

**Files Needing Fix (3):**
```
libs/shared-data/src/vo/k.vo.ts
libs/shared-data/src/vo/index-period.vo.ts
apps/mist/src/k/vo/bars.vo.ts
```

**Example Fix:**
```typescript
// Before
export class KVo {
  '时间': string;
  '开盘': number;
  '收盘': number;
}

// After
export class KVo {
  '时间'!: string;
  '开盘'!: number;
  '收盘'!: number;
}
```

---

**3. DTO Classes (Definite Assignment Assertion)**

**Strategy:** All properties use `!` assertion

**Rationale:** DTOs are request/response data containers populated by:
- Request body parsing (class-validator)
- Response serialization
- External data sources

Properties are guaranteed to be set during these processes.

**Affected Files (33 DTOs):**
```
libs/shared-data/src/dto/*.ts (8 files)
apps/mist/src/*/dto/*.ts (25 files)
```

**Example Fix:**
```typescript
// Before
export class SaveMarketDataDto {
  @IsNotEmpty()
  @IsString()
  code: string;

  @IsEnum(DataSource)
  source: DataSource;
}

// After
export class SaveMarketDataDto {
  @IsNotEmpty()
  @IsString()
  code!: string;

  @IsEnum(DataSource)
  source!: DataSource;
}
```

---

### Part 2: Remove Unused Code

#### Files to Delete (4 files)

**1. Unused Enums:**
```bash
libs/shared-data/src/enums/index-data.enum.ts
libs/shared-data/src/enums/stock-status.enum.ts
libs/shared-data/src/enums/stock-status.enum.spec.ts
```

**2. Backup Files:**
```bash
apps/mist/src/migrations/20260321000000-UnifiedDataSchema.ts.bak
```

#### Export Updates

**File:** `libs/shared-data/src/index.ts`

**Remove these exports:**
```typescript
export * from './dto/cron-index-daily.dto';
export * from './dto/cron-index-period.dto';
export * from './dto/index-daily.dto';
export * from './dto/index-period.dto';
export * from './dto/save-index-period.dto';
export * from './enums/index-period.enum';
export * from './enums/stock-status.enum';
```

**Note:** These exports reference deprecated files that are still in use. We're keeping the files but could clean up exports if they're not needed at the library level.

---

### Part 3: Implementation Order

**Phase 1: Fix Property Initialization**
1. Fix entity classes (14 files)
2. Fix VO classes (3 files)
3. Fix DTO classes (35 files)

**Phase 2: Cleanup**
4. Delete unused files (4 files)
5. Update exports in `libs/shared-data/src/index.ts`

**Phase 3: Verification**
6. Run TypeScript compilation: `pnpm run build`
7. Run linter: `pnpm run lint`
8. Run tests: `pnpm run test`
9. Verify IDE shows no errors

---

## Risk Assessment

### Low Risk
- ✅ Adding `!` assertions - No runtime behavior change
- ✅ Adding default values - Only affects uninitialized state (shouldn't occur in practice)
- ✅ Deleting truly unused files - Zero references

### Medium Risk
- ⚠️ Modifying 56 files - High volume increases chance of human error
- ⚠️ Breaking changes if default values conflict with business logic

**Mitigation:**
- Incremental commits after each file type
- Comprehensive testing after each phase
- Git history allows easy rollback

---

## Success Criteria

✅ All TypeScript compilation errors resolved
✅ No IDE errors for property initialization
✅ All tests passing
✅ Build succeeds without errors
✅ Lint passes
✅ Unused code removed
✅ Codebase is cleaner and more maintainable

---

## Alternative Approaches Considered

### Alternative 1: Disable `strictPropertyInitialization`
**Pros:** Quick fix, no code changes
**Cons:** Loses type safety benefits, hides real bugs
**Decision:** ❌ Rejected - Too broad, reduces code quality

### Alternative 2: Initialize All Properties in Constructors
**Pros:** Most explicit, follows strictest patterns
**Cons:** Massive code duplication, conflicts with TypeORM's lifecycle
**Decision:** ❌ Rejected - Impractical for TypeORM entities

### Alternative 3: Only Fix Entities, Leave DTOs/VOs
**Pros:** Smaller scope, faster completion
**Cons:** IDE errors remain for DTOs/VOs
**Decision:** ❌ Rejected - Doesn't fully solve the problem

---

## Notes

- **Default Values:** For numeric types, `0` is appropriate. For strings, empty string `''`. For bigint, `0n`.
- **Definite Assignment (!):** Use sparingly, only when framework guarantees initialization
- **Backward Compatibility:** All changes are type-level only, no runtime behavior changes
- **Testing Strategy:** Run full test suite after each phase to catch regressions early

---

## Appendix: File Count Summary

| Type | Files | Properties |
|------|-------|------------|
| Entities | 13 | ~100 |
| VOs | 12 | ~80 |
| DTOs | 33 | ~200 |
| **Total** | **58** | **~380** |

Plus 4 files to delete.

**Note:**
- 3 VO files need fixing (others already use `!`)
- All 33 DTO files need fixing
- All 13 entity files need fixing
