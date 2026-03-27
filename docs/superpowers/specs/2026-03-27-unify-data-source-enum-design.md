# Unify Data Source Enum Design

**Date**: 2026-03-27
**Status**: Draft

## Problem

Two parallel data source type systems exist in the codebase:

1. `DataSource` enum (`libs/shared-data/src/enums/data-source.enum.ts`) — internal use, values: `'ef'`, `'tdx'`, `'mqmt'`
2. `SourceType` enum (`apps/mist/src/security/dto/init-stock.dto.ts`) — API layer, values: `'aktools'`, `'other'`

`SourceType` is duplicated in `add-source.dto.ts`. The mapping is lossy (`SourceType.AKTOOLS` and `SourceType.OTHER` both map to `DataSource.EAST_MONEY`).

Additionally, `SourceConfig` DTO class (`type` + `config` string) does not match the `SecuritySourceConfig` entity (`source`, `formatCode`, `priority`, `enabled`). The `addSource` API is the only endpoint that writes to `security_source_configs` table, but it cannot set `priority` or `enabled`.

## Decision

Delete `SourceType` enum and `SourceConfig` class. API layer uses `DataSource` directly. Rewrite `AddSourceDto` to match `SecuritySourceConfig` entity fields.

## Changes

### 1. Delete from `init-stock.dto.ts`

Remove `SourceType` enum and `SourceConfig` class. Keep only `InitStockDto`.

### 2. Rewrite `add-source.dto.ts`

**Before:**
```typescript
export enum SourceType { AKTOOLS = 'aktools', OTHER = 'other' }
export class SourceConfig { type: SourceType; config?: string }
export class AddSourceDto { code: string; source: SourceConfig; periods?: number[] }
```

**After:**
```typescript
import { DataSource } from '@app/shared-data';

export class AddSourceDto {
  @IsNotEmpty()
  @IsString()
  code!: string;

  @IsEnum(DataSource)
  source!: DataSource;

  @IsString()
  formatCode?: string;

  @IsNumber()
  priority?: number;

  @IsBoolean()
  enabled?: boolean;
}
```

- Remove `SourceType`, `SourceConfig`, and unused `periods` field
- `source` is now `DataSource` enum directly
- Add `formatCode`, `priority`, `enabled` to match entity

### 3. Simplify `security.service.ts`

- Delete `mapSourceStringToDataSource()` method
- Delete `SourceType` import
- Update `addSource()`:

```typescript
async addSource(addSourceDto: AddSourceDto): Promise<Security> {
  const formattedCode = this.formatCode(addSourceDto.code);
  const stock = await this.securityRepository.findOne({
    where: { code: formattedCode },
  });
  if (!stock) {
    throw new NotFoundException(`Stock with code ${formattedCode} not found`);
  }

  const sourceConfig = this.sourceConfigRepository.create({
    security: stock,
    source: addSourceDto.source,
    formatCode: addSourceDto.formatCode || '',
    priority: addSourceDto.priority ?? 0,
    enabled: addSourceDto.enabled ?? true,
  });
  await this.sourceConfigRepository.save(sourceConfig);

  return stock;
}
```

### 4. Update test files

- `security.service.spec.ts`: `SourceType.AKTOOLS` → `DataSource.EAST_MONEY`, update DTO shape
- `security.controller.spec.ts`: same

### 5. No changes needed

- `SecuritySourceConfig` entity — already uses `DataSource`
- `SecurityController` — logic unchanged, DTO type change is sufficient
- `DataSourceSelectionService`, `CollectorService` — not affected
- All `/indicator/*` and `/chan/*` endpoints — not affected

## API Change

**Before:**
```json
POST /v1/security/add-source
{
  "code": "000001.SH",
  "source": { "type": "aktools", "config": "{}" },
  "periods": [5, 15, 30]
}
```

**After:**
```json
POST /v1/security/add-source
{
  "code": "000001.SH",
  "source": "ef",
  "formatCode": "000001",
  "priority": 10,
  "enabled": true
}
```
