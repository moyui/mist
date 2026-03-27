# Unify Data Source Enum Design

**Date**: 2026-03-27
**Status**: Draft

## Problem

Two parallel data source type systems exist in the codebase:

1. `DataSource` enum (`libs/shared-data/src/enums/data-source.enum.ts`) — internal use, values: `'ef'`, `'tdx'`, `'mqmt'`
2. `SourceType` enum (`apps/mist/src/security/dto/init-stock.dto.ts`) — API layer, values: `'aktools'`, `'other'`

`SourceType` and `SourceConfig` are duplicated in both `init-stock.dto.ts` and `add-source.dto.ts`. The mapping is lossy (`SourceType.AKTOOLS` and `SourceType.OTHER` both map to `DataSource.EAST_MONEY`).

Additionally, `SourceConfig` DTO class (`type` + `config` string) does not match the `SecuritySourceConfig` entity (`source`, `formatCode`, `priority`, `enabled`). The `addSource` API is the only endpoint that writes to `security_source_configs` table, but it cannot set `priority` or `enabled`.

## Decision

Delete `SourceType` enum and `SourceConfig` class from both DTO files. API layer uses `DataSource` directly. Rewrite `AddSourceDto` to match `SecuritySourceConfig` entity fields.

## Changes

### 1. Delete from `init-stock.dto.ts`

Remove `SourceType` enum, `SourceConfig` class, and `AddSourceDto` class. Keep only `InitStockDto`.

The canonical `AddSourceDto` will live exclusively in `add-source.dto.ts`.

### 2. Rewrite `add-source.dto.ts`

**Before:**
```typescript
import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsEnum, IsArray } from 'class-validator';

export enum SourceType { AKTOOLS = 'aktools', OTHER = 'other' }
export class SourceConfig { type: SourceType; config?: string }
export class AddSourceDto { code: string; source: SourceConfig; periods?: number[] }
```

**After:**
```typescript
import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  IsEnum,
  IsNumber,
  IsBoolean,
  IsOptional,
} from 'class-validator';
import { DataSource } from '@app/shared-data';

export class AddSourceDto {
  @ApiProperty({ description: 'Stock code (e.g., 000001.SH, 399006.SZ)' })
  @IsNotEmpty()
  @IsString()
  code!: string;

  @ApiProperty({ description: 'Data source', enum: DataSource })
  @IsEnum(DataSource)
  source!: DataSource;

  @ApiProperty({ description: 'Data source specific code format', required: false })
  @IsOptional()
  @IsString()
  formatCode?: string;

  @ApiProperty({ description: 'Priority (higher = preferred)', required: false })
  @IsOptional()
  @IsNumber()
  priority?: number;

  @ApiProperty({ description: 'Whether source is enabled', required: false })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
```

- Remove `SourceType`, `SourceConfig`, and unused `periods` field
- Remove unused `IsArray` import
- `source` is now `DataSource` enum directly
- Add `@ApiProperty` decorators for Swagger documentation
- Add `@IsOptional()` on optional fields to prevent validation errors when omitted
- Add `formatCode`, `priority`, `enabled` to match entity

### 3. Simplify `security.service.ts`

- Remove `SourceType` from import: `import { InitStockDto } from './dto/init-stock.dto'`
- Delete `mapSourceStringToDataSource()` method
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

- `security.service.spec.ts`:
  - `SourceType.AKTOOLS` → `DataSource.EAST_MONEY`, update DTO shape in `addSource` tests
  - `getSourceFormat` test: `source: 'aktools'` → `source: DataSource.EAST_MONEY` (stale mock data)
  - Remove `SourceType` import
- `security.controller.spec.ts`:
  - `SourceType.AKTOOLS` → `DataSource.EAST_MONEY`, update DTO shape
  - Remove `SourceType` import

### 5. No changes needed

- `SecuritySourceConfig` entity — already uses `DataSource`
- `SecurityController` — logic unchanged, DTO type change is sufficient
- `DataSourceSelectionService`, `CollectorService` — not affected
- All `/indicator/*` and `/chan/*` endpoints — not affected

## Out of Scope

- `getSourceFormat()` method — return type and missing `ORDER BY priority` are pre-existing issues, not introduced by this change
- `'none'` sentinel value in `getSourceFormat()` — separate follow-up

## API Change

**Before:**
```json
POST /security/v1/add-source
{
  "code": "000001.SH",
  "source": { "type": "aktools", "config": "{}" },
  "periods": [5, 15, 30]
}
```

**After:**
```json
POST /security/v1/add-source
{
  "code": "000001.SH",
  "source": "ef",
  "formatCode": "000001",
  "priority": 10,
  "enabled": true
}
```
