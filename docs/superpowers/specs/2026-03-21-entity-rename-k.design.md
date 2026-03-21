# Entity Rename Design: MarketDataBar → K

**Goal:** Rename MarketDataBar entity to K for simplicity and better alignment with Chinese market terminology (K线).

**Date:** 2026-03-21

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

### 5. VO Rename

| Current | New |
|---------|-----|
| `BarsVo` | `KsVo` |

### 6. File Rename

```
libs/shared-data/src/entities/
  market-data-bar.entity.ts → k.entity.ts
  market-data-extension-ef.entity.ts → k-extension-ef.entity.ts
  market-data-extension-tdx.entity.ts → k-extension-tdx.entity.ts
  market-data-extension-mqmt.entity.ts → k-extension-mqmt.entity.ts

libs/shared-data/src/enums/
  bar-period.enum.ts → k-period.enum.ts

apps/mist/src/market-data/ → apps/mist/src/k/
  market-data.module.ts → k.module.ts
  market-data.service.ts → k.service.ts
  market-data.controller.ts → k.controller.ts
  vo/bars.vo.ts → vo/ks.vo.ts
```

### 7. Route Rename

| Current Route | New Route |
|--------------|-----------|
| `/market-data/bars` | `/k/bars` |

---

## Database Migration

Create a new migration to rename tables:

```sql
RENAME TABLE market_data_bars TO ks;
RENAME TABLE market_data_extensions_ef TO k_extensions_ef;
RENAME TABLE market_data_extensions_tdx TO k_extensions_tdx;
RENAME TABLE market_data_extensions_mqmt TO k_extensions_mqmt;

-- Update foreign key references in extension tables
ALTER TABLE k_extensions_ef DROP FOREIGN KEY fk_market_data_extensions_ef_bar_id;
ALTER TABLE k_extensions_ef ADD CONSTRAINT fk_k_extensions_ef_bar_id FOREIGN KEY (bar_id) REFERENCES ks(id) ON DELETE CASCADE;

ALTER TABLE k_extensions_tdx DROP FOREIGN KEY fk_market_data_extensions_tdx_bar_id;
ALTER TABLE k_extensions_tdx ADD CONSTRAINT fk_k_extensions_tdx_bar_id FOREIGN KEY (bar_id) REFERENCES ks(id) ON DELETE CASCADE;

ALTER TABLE k_extensions_mqmt DROP FOREIGN KEY fk_market_data_extensions_mqmt_bar_id;
ALTER TABLE k_extensions_mqmt ADD CONSTRAINT fk_k_extensions_mqmt_bar_id FOREIGN KEY (bar_id) REFERENCES ks(id) ON DELETE CASCADE;
```

---

## Implementation Steps

1. **Create new migration** for table renames
2. **Rename entity files**
3. **Update all imports** across the codebase
4. **Rename enums** (BarPeriod → KPeriod)
5. **Rename modules/services/controllers**
6. **Update all references** in service/controller code
7. **Update test files**
8. **Update documentation**
9. **Run tests** to verify
10. **Run migration** on database

---

## Files to Modify

Estimated **45-50 files** including:

- **Entities**: 4 files
- **Enums**: 1 file
- **Services**: 2 files
- **Controllers**: 2 files
- **Modules**: 3 files
- **DTOs/VOs**: 3 files
- **Tests**: ~10 files
- **Type exports**: 3 files
- **App module**: 1 file

---

## Notes

- **Security entity and related tables remain unchanged**
- **security_id foreign key fields remain unchanged**
- **Only MarketDataBar and its direct dependencies are renamed**
- **"ks" is not a SQL reserved word** in MySQL, PostgreSQL, or SQL Server
- **K is a standard abbreviation for K-line/K线** in financial markets

---

## Rationale

1. **Simplicity**: Single letter `K` is concise and memorable
2. **Semantic clarity**: `K` universally represents K-line in financial contexts
3. **Cultural alignment**: Aligns with Chinese market terminology ("K线" not "Bar")
4. **Minimal changes**: Keeping Security unchanged reduces refactoring risk
