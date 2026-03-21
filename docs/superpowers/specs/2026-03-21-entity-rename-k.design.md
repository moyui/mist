# Entity Rename Design: MarketDataBar → K

**Goal:** Rename MarketDataBar entity to K for simplicity and better alignment with Chinese market terminology (K线).

**Date:** 2026-03-21

**Version:** 2.1 (Updated with complete file inventory)

---

## Overview

This document outlines the refactoring plan to rename `MarketDataBar` entity to `K` (representing K线/K-line) while keeping `Security` unchanged. This aligns the codebase with Chinese market terminology where "K线" is the standard term, not "Bar".

---

## Renaming Scope

### 1. Entity Rename

| Current Name | New Name |
|--------------|----------|
| `MarketDataBar` | `K` |

### 2. Database Table Rename

| Current Table Name | New Table Name |
|-------------------|----------------|
| `market_data_bars` | `ks` |
| `market_data_extensions_ef` | `k_extensions_ef` |
| `market_data_extensions_tdx` | `k_extensions_tdx` |
| `market_data_extensions_mqmt` | `k_extensions_mqmt` |

### 3. Enum Rename

| Current | New |
|---------|-----|
| `BarPeriod` | `KPeriod` |

### 4. Module/Service/Controller Rename

| Current | New |
|---------|-----|
| `MarketDataModule` | `KModule` |
| `MarketDataService` | `KService` |
| `MarketDataController` | `KController` |

### 5. VO/DTO Rename

| Current | New |
|---------|-----|
| `BarsVo` | `KsVo` |
| `MarketDataBarVo` | `KVo` |
| `SaveMarketDataDto` | `SaveKDto` |
| `QueryMarketDataDto` | `QueryKDto` |
| `QueryBarsDto` | `QueryKsDto` |

### 6. File Rename

```
libs/shared-data/src/entities/
  market-data-bar.entity.ts → k.entity.ts
  market-data-extension-ef.entity.ts → k-extension-ef.entity.ts
  market-data-extension-tdx.entity.ts → k-extension-tdx.entity.ts
  market-data-extension-mqmt.entity.ts → k-extension-mqmt.entity.ts

libs/shared-data/src/enums/
  bar-period.enum.ts → k-period.enum.ts

libs/shared-data/src/vo/
  bars.vo.ts → ks.vo.ts
  market-data-bar.vo.ts → k.vo.ts

libs/shared-data/src/dto/
  save-market-data.dto.ts → save-k.dto.ts
  query-market-data.dto.ts → query-k.dto.ts
  query-bars.dto.ts → query-ks.dto.ts

apps/mist/src/market-data/ → apps/mist/src/k/
  market-data.module.ts → k.module.ts
  market-data.service.ts → k.service.ts
  market-data.controller.ts → k.controller.ts
  dto/query-bars.dto.ts → dto/query-ks.dto.ts
  vo/bars.vo.ts → vo/ks.vo.ts
```

### 7. API Routes

**Decision: Keep routes unchanged for backward compatibility**

| Route | Action | Rationale |
|-------|--------|-----------|
| `/market-data/bars` | Keep | API stability, no breaking changes |
| `/market-data` | Keep | Consistent with controller name |

---

## Complete File Inventory

### Core Entity Files (4 files)
- `libs/shared-data/src/entities/market-data-bar.entity.ts`
- `libs/shared-data/src/entities/market-data-extension-ef.entity.ts`
- `libs/shared-data/src/entities/market-data-extension-tdx.entity.ts`
- `libs/shared-data/src/entities/market-data-extension-mqmt.entity.ts`

### Enum Files (1 file)
- `libs/shared-data/src/enums/bar-period.enum.ts`

### Shared VO/DTO Files (5 files)
- `libs/shared-data/src/vo/bars.vo.ts`
- `libs/shared-data/src/vo/market-data-bar.vo.ts`
- `libs/shared-data/src/dto/save-market-data.dto.ts`
- `libs/shared-data/src/dto/query-market-data.dto.ts`
- `libs/shared-data/src/dto/query-bars.dto.ts`

### Market-Data Module Files (5 files) - Directory rename: market-data/ → k/
- `apps/mist/src/market-data/market-data.module.ts`
- `apps/mist/src/market-data/market-data.service.ts`
- `apps/mist/src/market-data/market-data.controller.ts`
- `apps/mist/src/market-data/dto/query-bars.dto.ts`
- `apps/mist/src/market-data/vo/bars.vo.ts`

### Indicator DTO Files (4 files) - Use BarPeriod enum
- `apps/mist/src/indicator/dto/k.dto.ts`
- `apps/mist/src/indicator/dto/macd.dto.ts`
- `apps/mist/src/indicator/dto/rsi.dto.ts`
- `apps/mist/src/indicator/dto/kdj.dto.ts`

### Source Files (2 files) - Use BarPeriod enum
- `apps/mist/src/sources/tdx.source.ts`
- `apps/mist/src/sources/east-money.source.ts`

### Data Module Files (3 files) - Use MarketDataBar entity
- `apps/mist/src/data/data.service.ts`
- `apps/mist/src/data/data.controller.ts`
- `apps/mist/src/data/data.module.ts`

### Module Import Files (3 files)
- `apps/mist/src/app.module.ts` (imports KModule, registers K entities)
- `apps/mcp-server/src/mcp-server.module.ts` (imports K entity)
- `apps/schedule/src/schedule.module.ts` (imports K entity)

### Service Reference Files (3 files)
- `libs/shared-data/src/shared-data.service.ts` (@InjectRepository)
- `apps/mist/src/data-collector/data-collector.service.ts` (references)
- `apps/mist/src/data/data.service.ts` (references)

### Test Files (13+ files)
- `libs/shared-data/src/enums/bar-period.enum.spec.ts`
- `libs/shared-data/src/utils/period-mapping.util.spec.ts`
- `libs/shared-data/src/shared-data.service.spec.ts`
- `apps/mist/src/sources/tdx.source.spec.ts`
- `apps/mist/src/data/data.service.spec.ts`
- `apps/mist/src/data/data.controller.spec.ts`
- `apps/mist/src/data-collector/data-collector.service.spec.ts`
- `apps/mcp-server/src/services/data-mcp.service.spec.ts`
- `apps/mist/src/stock/stock.service.spec.ts`
- `apps/mist/src/stock/stock.controller.spec.ts`
- Plus: indicator test files, source test files, and market-data test files (if exist)

### Index/Export Files (3 files)
- `libs/shared-data/src/index.ts` (entity exports)
- `libs/shared-data/src/entities/index.ts`
- `apps/mist/src/market-data/index.ts` (if exists)

**Total: ~45-50 files** (complete inventory with all references)

---

## Database Migration Plan

### Step 1: Verify Current Constraints

Before migration, query the actual constraint names:

```sql
-- Get all foreign key constraints
SELECT
    CONSTRAINT_NAME,
    TABLE_NAME,
    REFERENCED_TABLE_NAME
FROM information_schema.REFERENTIAL_CONSTRAINTS
WHERE TABLE_SCHEMA = 'mist'
AND (TABLE_NAME LIKE 'market_data%' OR TABLE_NAME LIKE 'k_extension%');
```

### Step 2: Create Migration

```sql
-- Rename main table
RENAME TABLE market_data_bars TO ks;

-- Rename extension tables
RENAME TABLE market_data_extensions_ef TO k_extensions_ef;
RENAME TABLE market_data_extensions_tdx TO k_extensions_tdx;
RENAME TABLE market_data_extensions_mqmt TO k_extensions_mqmt;

-- Update foreign key constraints in extension tables
-- Note: Constraint names will be verified in Step 1
-- Example (adjust actual constraint names):
ALTER TABLE k_extensions_ef DROP FOREIGN KEY fk_market_data_extensions_ef_bar_id;
ALTER TABLE k_extensions_ef ADD CONSTRAINT fk_k_extensions_ef_bar_id
  FOREIGN KEY (bar_id) REFERENCES ks(id) ON DELETE CASCADE;

-- Repeat for tdx and mqmt tables
```

### Step 3: Update Indexes (if any)

```sql
-- Check for custom indexes
SHOW INDEX FROM ks;
SHOW INDEX FROM k_extensions_ef;
SHOW INDEX FROM k_extensions_tdx;
SHOW INDEX FROM k_extensions_mqmt;

-- Update index names if needed (e.g., idx_market_data_bars_* → idx_ks_*)
```

---

## Implementation Steps

### Phase 1: Code Changes (Without Database Migration)

1. **Rename enum** (BarPeriod → KPeriod)
2. **Rename entity files**
3. **Update all imports** across the codebase
4. **Rename modules/services/controllers**
5. **Update DTOs/VOs**
6. **Update all references** in service/controller code
7. **Update test files**
8. **Verify compilation** (no database connection yet)

### Phase 2: Database Migration

9. **Create migration file** with verified SQL
10. **Backup database** (optional but recommended)
11. **Run migration** on development database
12. **Verify foreign keys** work correctly
13. **Test queries** on new table structure
14. **Run full test suite**

### Phase 3: Validation

15. **Data integrity check**: Verify all data migrated correctly
16. **API test**: Verify endpoints still work
17. **Performance check**: Verify no query performance degradation

---

## Rollback Plan

### If Migration Fails

**Option 1: Reverse Migration**
```sql
-- Rollback table renames
RENAME TABLE ks TO market_data_bars;
RENAME TABLE k_extensions_ef TO market_data_extensions_ef;
RENAME TABLE k_extensions_tdx TO market_data_extensions_tdx;
RENAME TABLE k_extensions_mqmt TO market_data_extensions_mqmt;

-- Restore foreign key constraints
ALTER TABLE k_extensions_ef DROP FOREIGN KEY fk_k_extensions_ef_bar_id;
ALTER TABLE k_extensions_ef ADD CONSTRAINT fk_market_data_extensions_ef_bar_id
  FOREIGN KEY (bar_id) REFERENCES market_data_bars(id) ON DELETE CASCADE;
-- Repeat for other extension tables
```

**Option 2: Git Revert**
- `git revert <commit-hash>` - Undo migration commit
- Restore code from backup if needed

### Rollback Triggers

- Migration fails to execute
- Foreign key constraints break
- Test failures > 20%
- Performance degradation > 50%

---

## Backward Compatibility

### API Routes

**Decision: Keep existing routes unchanged**

- `/market-data/bars` → No change (internal entity renamed, API stable)
- This is a **non-breaking change** for API consumers

### Data Format

**No changes** to:
- Request/response DTOs (internal names only)
- JSON structure
- API contract

---

## Testing Strategy

### Unit Tests

- Update all test imports
- Update mock objects
- Verify all tests pass after rename

### Integration Tests

- Test foreign key relationships
- Test data queries
- Test API endpoints with new entities

### Data Validation

After migration:
1. Verify row counts match: `SELECT COUNT(*) FROM ks` should equal previous `market_data_bars`
2. Verify all foreign keys point to correct tables
3. Sample queries to ensure data integrity

---

## Risk Assessment

### Low Risk ✅

- Entity renaming (IDE can handle automatically)
- Enum renaming
- Module/service renaming

### Medium Risk ⚠️

- Database table renaming (requires careful testing)
- Foreign key constraint updates
- Test file updates (may miss some references)

### Mitigation Strategies

1. **Use IDE refactoring tools** for code changes
2. **Verify constraint names** before writing migration
3. **Comprehensive testing** after migration
4. **Database backup** before migration
5. **Rollback plan** ready

---

## Notes

- **Security entity and related tables remain completely unchanged**
- **security_id foreign key fields remain unchanged**
- **timestamp, open, close, high, low, volume, amount fields remain unchanged**
- **"ks" is not a SQL reserved word** in MySQL, PostgreSQL, or SQL Server
- **K is a standard abbreviation for K-line/K线** in financial markets
- **Single-letter entity name (K)** is unconventional but clear in context

---

## Rationale

1. **Simplicity**: Single letter `K` is concise and memorable
2. **Semantic clarity**: `K` universally represents K-line in financial contexts
3. **Cultural alignment**: Aligns with Chinese market terminology ("K线" not "Bar")
4. **Minimal changes**: Keeping Security unchanged reduces refactoring risk
5. **API stability**: Keeping routes unchanged ensures no breaking changes for API consumers

---

## Change Log

### v2.1 (2026-03-21)
- Added complete file inventory with all 45-50 files
- Added previously missing Indicator DTO files (4 files)
- Added previously missing Source files (2 files)
- Added previously missing Data Module controller and module files (2 files)
- Added comprehensive test file list (13+ files)
- Updated File Rename section with market-data DTO/VO paths
- Updated total file count from ~35-40 to ~45-50

### v2.0 (2026-03-21)
- Initial design based on code review feedback
- Added database migration plan with constraint verification
- Added rollback plan
- Added backward compatibility strategy
- Added testing strategy and risk assessment
