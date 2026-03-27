# Unify Data Source Enum Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify the data source type system by deleting `SourceType` enum and `SourceConfig` class, using `DataSource` enum directly in API layer.

**Architecture:** Delete duplicate type definitions from DTO files, rewrite `AddSourceDto` to use `DataSource` enum directly, update service to remove mapping logic, and fix tests.

**Tech Stack:** NestJS, TypeORM, class-validator, class-transformer

---

## File Structure

```
apps/mist/src/security/
├── dto/
│   ├── init-stock.dto.ts     # Modify: remove SourceType, SourceConfig, AddSourceDto
│   └── add-source.dto.ts     # Modify: rewrite AddSourceDto with DataSource enum
├── security.service.ts        # Modify: remove mapSourceStringToDataSource, update addSource
├── security.service.spec.ts   # Modify: update test data and imports
└── security.controller.spec.ts # Modify: update test data and imports
```

---

## Task 1: Clean up `init-stock.dto.ts`

**Files:**
- Modify: `apps/mist/src/security/dto/init-stock.dto.ts`

- [ ] **Step 1: Delete `SourceType` enum, `SourceConfig` class, and `AddSourceDto` class**

Keep only `InitStockDto`. The file should contain only:

```typescript
import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsEnum } from 'class-validator';
import { SecurityType } from '@app/shared-data';

export class InitStockDto {
  @ApiProperty({ description: 'Stock code (e.g., 000001.SH, 399006.SZ)' })
  @IsNotEmpty()
  @IsString()
  code!: string;

  @ApiProperty({ description: 'Stock name', required: false })
  @IsString()
  name?: string;

  @ApiProperty({ description: 'Security type', enum: SecurityType })
  @IsEnum(SecurityType)
  type!: SecurityType;
}
```

- [ ] **Step 2: Run TypeScript check**

Run: `pnpm run tsc --noEmit -p apps/mist/tsconfig.json`
Expected: No errors (files importing from init-stock.dto.ts will now import from add-source.dto.ts)

- [ ] **Step 3: Commit**

```bash
git add apps/mist/src/security/dto/init-stock.dto.ts
git commit -m "refactor: remove SourceType, SourceConfig, AddSourceDto from init-stock.dto

- Keep only InitStockDto class
- AddSourceDto now lives exclusively in add-source.dto.ts

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 2: Rewrite `add-source.dto.ts`

**Files:**
- Modify: `apps/mist/src/security/dto/add-source.dto.ts`

- [ ] **Step 1: Replace entire file content**

The file should contain:

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

- [ ] **Step 2: Run TypeScript check**

Run: `pnpm run tsc --noEmit -p apps/mist/tsconfig.json`
Expected: Type errors in security.service.ts (e.g., "Property 'type' does not exist on type 'DataSource'") - will be fixed in Task 3

- [ ] **Step 3: Commit**

```bash
git add apps/mist/src/security/dto/add-source.dto.ts
git commit -m "refactor: rewrite AddSourceDto with DataSource enum

- Remove SourceType enum and SourceConfig class
- source field now uses DataSource enum directly
- Add formatCode, priority, enabled fields matching entity
- Add @IsOptional() decorators for optional fields
- Add @ApiProperty decorators for Swagger

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 3: Update `security.service.ts`

**Files:**
- Modify: `apps/mist/src/security/security.service.ts`

- [ ] **Step 1: Remove `SourceType` from import**

Change line 14 from:
```typescript
import { InitStockDto, SourceType } from './dto/init-stock.dto';
```

To:
```typescript
import { InitStockDto } from './dto/init-stock.dto';
```

Note: Line 15 `import { AddSourceDto } from './dto/add-source.dto';` should remain unchanged.

- [ ] **Step 2: Delete `mapSourceStringToDataSource()` method**

Delete lines 54-60 (the entire method).

- [ ] **Step 3: Update `addSource()` method**

Replace the method body (lines 62-85) with:

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

- [ ] **Step 4: Run TypeScript check**

Run: `pnpm run tsc --noEmit -p apps/mist/tsconfig.json`
Expected: No errors

- [ ] **Step 5: Run tests**

Run: `pnpm run test security.service.spec`
Expected: FAIL (tests still use old DTO shape)

- [ ] **Step 6: Commit**

```bash
git add apps/mist/src/security/security.service.ts
git commit -m "refactor: simplify addSource to use DataSource enum

- Remove mapSourceStringToDataSource() method
- Remove SourceType import
- Directly use DataSource enum from AddSourceDto
- Add priority and enabled field mapping

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 4: Update `security.service.spec.ts`

**Files:**
- Modify: `apps/mist/src/security/security.service.spec.ts`

- [ ] **Step 1: Update imports**

Change line 11 from:
```typescript
import { AddSourceDto, SourceType } from './dto/add-source.dto';
```

To:
```typescript
import { AddSourceDto } from './dto/add-source.dto';
import { DataSource } from '@app/shared-data';
```

- [ ] **Step 2: Update `addSource` test data (lines 111-117)**

Change from:
```typescript
const addSourceDto: AddSourceDto = {
  code: '600000',
  source: {
    type: SourceType.AKTOOLS,
    config: '{}',
  },
};
```

To:
```typescript
const addSourceDto: AddSourceDto = {
  code: '600000',
  source: DataSource.EAST_MONEY,
  formatCode: '{}',
};
```

- [ ] **Step 3: Update `addSource` test mock expectations (lines 140-144)**

Change from:
```typescript
expect(mockSourceConfigRepository.create).toHaveBeenCalledWith({
  security: mockStock,
  source: 'ef' as any,
  formatCode: '{}',
});
```

To:
```typescript
expect(mockSourceConfigRepository.create).toHaveBeenCalledWith({
  security: mockStock,
  source: DataSource.EAST_MONEY,
  formatCode: '{}',
  priority: 0,
  enabled: true,
});
```

- [ ] **Step 4: Update `addSource` NotFoundException test data (lines 149-155)**

Change from:
```typescript
const addSourceDto: AddSourceDto = {
  code: '999999',
  source: {
    type: SourceType.AKTOOLS,
    config: '{}',
  },
};
```

To:
```typescript
const addSourceDto: AddSourceDto = {
  code: '999999',
  source: DataSource.EAST_MONEY,
};
```

- [ ] **Step 5: Update `getSourceFormat` test mock data (lines 230-239)**

Change from:
```typescript
const sourceConfigs = [
  {
    id: 1,
    security: stock,
    source: 'aktools',
    formatCode: '{"base": "shanghai"}',
    createTime: new Date(),
    updateTime: new Date(),
  },
];
```

To:
```typescript
const sourceConfigs = [
  {
    id: 1,
    security: stock,
    source: DataSource.EAST_MONEY,
    formatCode: '{"base": "shanghai"}',
    createTime: new Date(),
    updateTime: new Date(),
  },
];
```

- [ ] **Step 6: Update `getSourceFormat` test expectation (lines 246-249)**

Change from:
```typescript
expect(result).toEqual({
  type: 'aktools',
  config: '{"base": "shanghai"}',
});
```

To:
```typescript
expect(result).toEqual({
  type: 'ef',  // DataSource.EAST_MONEY string value, since getSourceFormat returns the enum as string
  config: '{"base": "shanghai"}',
});
```

- [ ] **Step 7: Run tests**

Run: `pnpm run test security.service.spec`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add apps/mist/src/security/security.service.spec.ts
git commit -m "test: update security.service tests for DataSource enum

- Remove SourceType import
- Update addSource test data to use new DTO shape
- Update getSourceFormat test mock data (aktools -> EAST_MONEY)
- Add priority and enabled to mock expectations

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 5: Update `security.controller.spec.ts`

**Files:**
- Modify: `apps/mist/src/security/security.controller.spec.ts`

- [ ] **Step 1: Update imports**

Change line 4 from:
```typescript
import { InitStockDto, SourceType } from './dto/init-stock.dto';
```

To:
```typescript
import { InitStockDto } from './dto/init-stock.dto';
```

Add import for DataSource:
```typescript
import { DataSource } from '@app/shared-data';
```

Note: Verify line 5 `import { AddSourceDto } from './dto/add-source.dto';` remains unchanged.

- [ ] **Step 2: Update `addSource` test data (lines 81-87)**

Change from:
```typescript
const addSourceDto: AddSourceDto = {
  code: '600001',
  source: {
    type: SourceType.AKTOOLS,
    config: '{}',
  },
};
```

To:
```typescript
const addSourceDto: AddSourceDto = {
  code: '600001',
  source: DataSource.EAST_MONEY,
  formatCode: '{}',
};
```

- [ ] **Step 3: Run tests**

Run: `pnpm run test security.controller.spec`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/mist/src/security/security.controller.spec.ts
git commit -m "test: update security.controller tests for DataSource enum

- Remove SourceType import
- Add DataSource import
- Update addSource test data to use new DTO shape

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 6: Run full test suite

**Files:**
- Test: `apps/mist/test/**/*.spec.ts`

- [ ] **Step 1: Run all mist app tests**

Run: `cd apps/mist && pnpm run test`
Expected: PASS

- [ ] **Step 2: Run linter**

Run: `pnpm run lint`
Expected: PASS (or fix auto-fixable issues)

- [ ] **Step 3: Build project**

Run: `pnpm run build`
Expected: PASS

- [ ] **Step 4: Final commit**

```bash
git add .
git commit -m "chore: final cleanup after data source unification

All tests passing, build successful

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 7: Manual verification (optional)

- [ ] **Step 1: Start mist app**

Run: `pnpm run start:dev:mist`

- [ ] **Step 2: Test API with curl**

```bash
# Initialize a stock
curl -X POST http://localhost:8001/security/v1/init \
  -H "Content-Type: application/json" \
  -d '{"code": "600001.SH", "name": "test", "type": "stock"}'

# Add source with new format
curl -X POST http://localhost:8001/security/v1/add-source \
  -H "Content-Type: application/json" \
  -d '{"code": "600001.SH", "source": "ef", "formatCode": "600001", "priority": 10, "enabled": true}'
```

Expected: Both requests return success response

- [ ] **Step 3: Verify Swagger UI**

Open: `http://localhost:8001/api-docs`
Verify: The add-source endpoint shows correct schema with `source` as enum, `formatCode/priority/enabled` as optional fields

---

## Verification Checklist

After completing all tasks, verify:

- [ ] `SourceType` enum is deleted from both DTO files
- [ ] `SourceConfig` class is deleted from both DTO files
- [ ] `AddSourceDto` only exists in `add-source.dto.ts`
- [ ] `AddSourceDto.source` uses `DataSource` enum directly
- [ ] `mapSourceStringToDataSource()` method is deleted
- [ ] All tests pass
- [ ] Build succeeds
- [ ] Swagger UI shows correct schema
