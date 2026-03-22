# Multi-Data Source API Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add data source selection support to all query interfaces, reorganize utility services into NestJS Services, rename modules for clarity, and synchronize changes across all applications.

**Architecture:** Two-layer configuration (manual parameter > global default) with DataSourceService and PeriodMappingService as injectable services in a global UtilsModule. Query interfaces updated to support optional `source` parameter, management interfaces use v1 prefix at controller level.

**Tech Stack:** NestJS, TypeORM, MySQL, TypeScript, Joi

---

## Prerequisites

**Before starting, verify these assumptions:**

- DataSource enum exists at `libs/shared-data/src/enums/data-source.enum.ts` with values: `EAST_MONEY = 'ef'`, `TDX = 'tdx'`, `MINI_QMT = 'mqmt'`
- KPeriod enum exists at `libs/shared-data/src/enums/k-period.enum.ts` with values: `ONE_MIN = '1min'`, `FIVE_MIN = '5min'`, etc.
- .env files exist in `apps/mist/src/`, `apps/schedule/src/`, `apps/mcp-server/src/`

---

## File Structure

### New Files to Create

```
libs/utils/src/services/
├── data-source.service.ts          # DataSource selection with config integration
└── period-mapping.service.ts       # Period format mapping (migrated from shared-data)

apps/mist/src/
├── filters/                         # Moved from common/
│   └── all-exceptions.filter.ts
│   └── all-exceptions.filter.spec.ts
├── interceptors/                    # Moved from common/
│   └── transform.interceptor.ts
│   └── transform.interceptor.spec.ts
├── interfaces/                      # Moved from common/
│   └── response.interface.ts
├── dto/                             # Moved from common/
│   └── api-response.dto.ts
├── indicator/dto/query/
│   └── indicator-query.dto.ts       # Unified query DTO with source support
├── k/dto/query/
│   └── kline-query.dto.ts           # K-line query DTO with source support
└── chan/dto/query/
    └── chan-query.dto.ts            # Chan query DTO with source support
```

### Files to Delete

```
libs/shared-data/src/utils/           # Entire directory
├── period-mapping.util.ts
└── period-mapping.util.spec.ts

apps/mist/src/common/                 # Entire directory (contents moved to src/)

apps/mist/src/indicator/dto/          # Old DTOs
├── macd.dto.ts
├── kdj.dto.ts
├── kdj.dto.ts
├── rsi.dto.ts
├── k.dto.ts
└── run-*.dto.ts                      # All run-* DTOs
```

### Directories to Rename

```
apps/mist/src/data-collector/  →  apps/mist/src/collector/
apps/mist/src/stock/           →  apps/mist/src/security/
```

---

## Implementation Tasks

### Task 1: Create DataSourceService

**Files:**
- Create: `libs/utils/src/services/data-source.service.ts`
- Test: Create: `libs/utils/src/services/data-source.service.spec.ts`

**Context:** DataSource enum has VALUES `'ef'`, `'tdx'`, `'mqmt'`, but enum KEYS are `EAST_MONEY`, `TDX`, `MINI_QMT`. Service must handle both formats for user convenience.

- [ ] **Step 1: Create DataSourceService with comprehensive input handling**

```typescript
// libs/utils/src/services/data-source.service.ts
import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from '@app/shared-data';

@Injectable()
export class DataSourceService {
  private readonly defaultSource: DataSource;

  constructor(
    @Inject(ConfigService) private configService: ConfigService,
  ) {
    const envDefault = this.configService.get<string>('DEFAULT_DATA_SOURCE');

    // Validate and set default source
    // Accept either enum value ('ef') or normalized enum key ('EAST_MONEY')
    if (envDefault) {
      const normalized = this.normalize(envDefault);
      this.defaultSource = this.selectOrFail(normalized);
    } else {
      // Fallback to EAST_MONEY if not specified
      this.defaultSource = DataSource.EAST_MONEY;
    }
  }

  /**
   * Select data source with fallback to default
   * Accepts: enum value ('ef'), enum key ('EAST_MONEY'), or user-friendly ('east-money')
   */
  select(source?: string): DataSource {
    if (!source) {
      return this.defaultSource;
    }

    return this.selectOrFail(source);
  }

  /**
   * Select data source or throw error
   * @throws Error if source is invalid
   */
  private selectOrFail(source: string): DataSource {
    const normalized = this.normalize(source);

    // First try as enum value (e.g., 'ef', 'tdx', 'mqmt')
    const enumValues = Object.values(DataSource);
    if (enumValues.includes(source as DataSource)) {
      return source as DataSource;
    }

    // Then try as enum key (e.g., 'EAST_MONEY', 'TDX', 'MINI_QMT')
    const enumKey = normalized.toUpperCase();
    const dataSource = enumKey as keyof typeof DataSource;
    if (DataSource[dataSource]) {
      return DataSource[dataSource];
    }

    // Not found
    throw new Error(
      `Invalid data source: ${source}. Supported values: ${enumValues.join(', ')} or keys: ${Object.keys(DataSource).join(', ')}`,
    );
  }

  /**
   * Normalize source name to enum key format
   * Supports: east-money, EAST_MONEY, east_money, eastMoney → EAST_MONEY
   */
  normalize(source: string): string {
    return source.toUpperCase().replace(/-/g, '_');
  }

  /**
   * Validate if source is supported (returns boolean)
   */
  isValid(source: string): boolean {
    try {
      this.selectOrFail(source);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get configured default data source
   */
  getDefault(): DataSource {
    return this.defaultSource;
  }
}
```

- [ ] **Step 2: Create unit test for DataSourceService**

```typescript
// libs/utils/src/services/data-source.service.spec.ts
import { Test, TestingModule } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSourceService } from './data-source.service';
import { DataSource } from '@app/shared-data';

describe('DataSourceService', () => {
  let service: DataSourceService;
  let configService: jest.Mocked<ConfigService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DataSourceService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<DataSourceService>(DataSourceService);
    configService = module.get(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should use EAST_MONEY as default when no env var', () => {
    configService.get.mockReturnValue(undefined);
    expect(service.getDefault()).toBe(DataSource.EAST_MONEY);
  });

  it('should use env default when valid (enum value)', () => {
    configService.get.mockReturnValue('tdx');
    expect(service.getDefault()).toBe(DataSource.TDX);
  });

  it('should use env default when valid (enum key)', () => {
    configService.get.mockReturnValue('TDX');
    expect(service.getDefault()).toBe(DataSource.TDX);
  });

  it('should select enum value directly', () => {
    const result = service.select('ef');
    expect(result).toBe(DataSource.EAST_MONEY);
  });

  it('should select enum key', () => {
    const result = service.select('TDX');
    expect(result).toBe(DataSource.TDX);
  });

  it('should select user-friendly format', () => {
    const result = service.select('east-money');
    expect(result).toBe(DataSource.EAST_MONEY);
  });

  it('should throw on invalid source', () => {
    expect(() => service.select('INVALID')).toThrow('Invalid data source');
  });

  it('should normalize correctly', () => {
    expect(service.normalize('east-money')).toBe('EAST_MONEY');
    expect(service.normalize('EAST_MONEY')).toBe('EAST_MONEY');
    expect(service.normalize('east_money')).toBe('EAST_MONEY');
  });

  it('should validate valid sources', () => {
    expect(service.isValid('ef')).toBe(true);
    expect(service.isValid('EAST_MONEY')).toBe(true);
    expect(service.isValid('east-money')).toBe(true);
    expect(service.isValid('invalid')).toBe(false);
  });
});
```

- [ ] **Step 3: Run test to verify it passes**

Run: `cd /Users/xiyugao/code/mist/mist && pnpm test -- data-source.service.spec.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add libs/utils/src/services/data-source.service.ts
git add libs/utils/src/services/data-source.service.spec.ts
git commit -m "feat: add DataSourceService with flexible input handling"
```

---

### Task 2: Create PeriodMappingService

**Files:**
- Create: `libs/utils/src/services/period-mapping.service.ts`
- Test: Create: `libs/utils/src/services/period-mapping.service.spec.ts`

- [ ] **Step 1: Create PeriodMappingService**

```typescript
// libs/utils/src/services/period-mapping.service.ts
import { Injectable } from '@nestjs/common';
import { KPeriod, DataSource } from '@app/shared-data';

@Injectable()
export class PeriodMappingService {
  private readonly periodMapping: Record<DataSource, Partial<Record<KPeriod, string>>> = {
    [DataSource.EAST_MONEY]: {
      [KPeriod.ONE_MIN]: '1',
      [KPeriod.FIVE_MIN]: '5',
      [KPeriod.FIFTEEN_MIN]: '15',
      [KPeriod.THIRTY_MIN]: '30',
      [KPeriod.SIXTY_MIN]: '60',
      [KPeriod.DAILY]: 'daily',
    },
    [DataSource.TDX]: {
      [KPeriod.ONE_MIN]: '1m',
      [KPeriod.FIVE_MIN]: '5m',
      [KPeriod.DAILY]: '1d',
    },
    [DataSource.MINI_QMT]: {
      // Fallback to EAST_MONEY format for MINI_QMT
      // TODO: Update with MINI_QMT-specific formats when available
      [KPeriod.ONE_MIN]: '1',
      [KPeriod.FIVE_MIN]: '5',
      [KPeriod.FIFTEEN_MIN]: '15',
      [KPeriod.THIRTY_MIN]: '30',
      [KPeriod.SIXTY_MIN]: '60',
      [KPeriod.DAILY]: 'daily',
    },
  };

  /**
   * Convert period to source-specific format
   */
  toSourceFormat(period: KPeriod, source: DataSource): string {
    const mapping = this.periodMapping[source];
    if (!mapping || !mapping[period]) {
      throw new Error(
        `Data source ${source} does not support period ${period}`,
      );
    }
    return mapping[period]!;
  }

  /**
   * Check if source supports the period
   */
  isSupported(period: KPeriod, source: DataSource): boolean {
    const mapping = this.periodMapping[source];
    return !!(mapping && mapping[period]);
  }

  /**
   * Get all supported periods for a source
   */
  getSupportedPeriods(source: DataSource): KPeriod[] {
    const mapping = this.periodMapping[source];
    return mapping ? Object.keys(mapping) as KPeriod[] : [];
  }
}
```

- [ ] **Step 2: Create unit test for PeriodMappingService**

```typescript
// libs/utils/src/services/period-mapping.service.spec.ts
import { Test, TestingModule } from '@nestjs/common';
import { PeriodMappingService } from './period-mapping.service';
import { KPeriod, DataSource } from '@app/shared-data';

describe('PeriodMappingService', () => {
  let service: PeriodMappingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PeriodMappingService],
    }).compile();

    service = module.get<PeriodMappingService>(PeriodMappingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should convert periods for EAST_MONEY', () => {
    expect(service.toSourceFormat(KPeriod.ONE_MIN, DataSource.EAST_MONEY)).toBe('1');
    expect(service.toSourceFormat(KPeriod.DAILY, DataSource.EAST_MONEY)).toBe('daily');
  });

  it('should convert periods for TDX', () => {
    expect(service.toSourceFormat(KPeriod.ONE_MIN, DataSource.TDX)).toBe('1m');
    expect(service.toSourceFormat(KPeriod.DAILY, DataSource.TDX)).toBe('1d');
  });

  it('should fallback to EAST_MONEY for MINI_QMT', () => {
    expect(service.toSourceFormat(KPeriod.ONE_MIN, DataSource.MINI_QMT)).toBe('1');
    expect(service.toSourceFormat(KPeriod.DAILY, DataSource.MINI_QMT)).toBe('daily');
  });

  it('should throw for unsupported period', () => {
    expect(() => service.toSourceFormat(KPeriod.FIFTEEN_MIN, DataSource.TDX))
      .toThrow('does not support period');
  });

  it('should check supported periods', () => {
    expect(service.isSupported(KPeriod.ONE_MIN, DataSource.EAST_MONEY)).toBe(true);
    expect(service.isSupported(KPeriod.FIFTEEN_MIN, DataSource.TDX)).toBe(false);
  });

  it('should get all supported periods', () => {
    const tdxPeriods = service.getSupportedPeriods(DataSource.TDX);
    expect(tdxPeriods).toContain(KPeriod.ONE_MIN);
    expect(tdxPeriods).toContain(KPeriod.DAILY);
    expect(tdxPeriods.length).toBe(3); // ONE_MIN, FIVE_MIN, DAILY
  });
});
```

- [ ] **Step 3: Run test to verify it passes**

Run: `cd /Users/xiyugao/code/mist/mist && pnpm test -- period-mapping.service.spec.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add libs/utils/src/services/period-mapping.service.ts
git add libs/utils/src/services/period-mapping.service.spec.ts
git commit -m "feat: add PeriodMappingService with source-specific period formats"
```

---

### Task 3: Update UtilsModule with @Global() decorator

**Files:**
- Modify: `libs/utils/src/utils.module.ts`

- [ ] **Step 1: Update UtilsModule to export new services**

```typescript
// libs/utils/src/utils.module.ts
import { Module, Global } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UtilsService } from './utils.service';
import { DataSourceService } from './services/data-source.service';
import { PeriodMappingService } from './services/period-mapping.service';

@Global()  // Available everywhere without explicit import
@Module({
  providers: [
    UtilsService,
    DataSourceService,
    PeriodMappingService,
  ],
  exports: [
    UtilsService,
    DataSourceService,
    PeriodMappingService,
  ],
})
export class UtilsModule {}
```

- [ ] **Step 2: Verify @Global() decorator is present**

Run: `grep -n "@Global()" libs/utils/src/utils.module.ts`
Expected: Line shows `@Global()`

- [ ] **Step 3: Update libs/utils/src/index.ts to export services**

```typescript
// Add to existing exports
export * from './services/data-source.service';
export * from './services/period-mapping.service';
```

- [ ] **Step 4: Build to verify**

Run: `cd /Users/xiyugao/code/mist/mist && pnpm build --filter=@app/utils`
Expected: SUCCESS

- [ ] **Step 5: Commit**

```bash
git add libs/utils/src/utils.module.ts
git add libs/utils/src/index.ts
git commit -m "feat: update UtilsModule with @Global() and new services"
```

---

### Task 4: Delete shared-data utils directory

**Files:**
- Delete: `libs/shared-data/src/utils/` directory
- Modify: `libs/shared-data/src/index.ts`

- [ ] **Step 1: Verify utils directory exists**

Run: `ls -la libs/shared-data/src/utils/`
Expected: Shows `period-mapping.util.ts` and `period-mapping.util.spec.ts`

- [ ] **Step 2: Delete utils directory**

Run: `rm -rf libs/shared-data/src/utils/`

- [ ] **Step 3: Update libs/shared-data/src/index.ts to remove utils exports**

Find and remove these lines:
```typescript
export * from './utils/period-mapping.util';
```

Run: `sed -i '' "/utils\/period-mapping/d" libs/shared-data/src/index.ts`

- [ ] **Step 4: Build to verify no broken imports**

Run: `cd /Users/xiyugao/code/mist/mist && pnpm build --filter=@app/shared-data`
Expected: SUCCESS (or fail if other files still import from utils)

- [ ] **Step 5: If build fails, find and fix remaining imports**

Run: `grep -r "from '@app/shared-data/utils'" libs/ apps/`
Fix all occurrences by changing to `from '@app/utils'`

- [ ] **Step 6: Commit**

```bash
git add libs/shared-data/src/
git commit -m "refactor: remove utils directory from shared-data, migrated to @app/utils"
```

---

### Task 5: Add configuration validation

**Files:**
- Modify: `libs/config/src/validation.schema.ts`

- [ ] **Step 1: Update validation schema**

Add to `mistEnvSchema`:

```typescript
// libs/config/src/validation.schema.ts
import Joi from 'joi';

export const mistEnvSchema = Joi.object({
  // ... existing configurations
  PORT: Joi.number().default(8001),
  mysql_server_host: Joi.string().default('localhost'),
  // ... other configs

  // NEW: Data source configuration
  // Accepts enum values ('ef', 'tdx', 'mqmt') or enum keys ('EAST_MONEY', 'TDX', 'MINI_QMT')
  DEFAULT_DATA_SOURCE: Joi.string()
    .valid('ef', 'tdx', 'mqmt', 'EAST_MONEY', 'TDX', 'MINI_QMT')
    .default('ef')
    .description('Default data source for queries (enum value or key)'),
});
```

- [ ] **Step 2: Build to verify**

Run: `cd /Users/xiyugao/code/mist/mist && pnpm build --filter=@app/config`
Expected: SUCCESS

- [ ] **Step 3: Commit**

```bash
git add libs/config/src/validation.schema.ts
git commit -m "feat: add DEFAULT_DATA_SOURCE validation"
```

---

### Task 6: Reorganize common directory

**Files:**
- Move: `apps/mist/src/common/dto/api-response.dto.ts` → `apps/mist/src/dto/api-response.dto.ts`
- Move: `apps/mist/src/common/filters/all-exceptions.filter.ts` → `apps/mist/src/filters/all-exceptions.filter.ts`
- Move: `apps/mist/src/common/interceptors/transform.interceptor.ts` → `apps/mist/src/interceptors/transform.interceptor.ts`
- Move: `apps/mist/src/common/interfaces/response.interface.ts` → `apps/mist/src/interfaces/response.interface.ts`
- Move: `apps/mist/src/common/filters/all-exceptions.filter.spec.ts` → `apps/mist/src/filters/all-exceptions.filter.spec.ts`
- Move: `apps/mist/src/common/interceptors/transform.interceptor.spec.ts` → `apps/mist/src/interceptors/transform.interceptor.spec.ts`
- Delete: `apps/mist/src/common/` directory
- Modify: `apps/mist/src/main.ts`

- [ ] **Step 1: Create target directories**

Run:
```bash
cd /Users/xiyugao/code/mist/mist/apps/mist/src
mkdir -p dto filters interceptors interfaces
```

- [ ] **Step 2: Move files from common/ to new locations**

Run:
```bash
mv common/dto/api-response.dto.ts dto/
mv common/filters/all-exceptions.filter.ts filters/
mv common/filters/all-exceptions.filter.spec.ts filters/
mv common/interceptors/transform.interceptor.ts interceptors/
mv common/interceptors/transform.interceptor.spec.ts interceptors/
mv common/interfaces/response.interface.ts interfaces/
```

- [ ] **Step 3: Update imports in main.ts**

Find and replace:
- `from './common/filters/all-exceptions.filter'` → `from './filters/all-exceptions.filter'`
- `from './common/interceptors/transform.interceptor'` → `from './interceptors/transform.interceptor'`
- `from './common/interfaces/response.interface'` → `from './interfaces/response.interface'`
- `from './common/dto/api-response.dto'` → `from './dto/api-response.dto'`

Run: `sed -i '' "s|from './common/|from './|g" apps/mist/src/main.ts`

- [ ] **Step 4: Verify all imports updated**

Run: `grep -n "from './common/" apps/mist/src/main.ts`
Expected: No results

- [ ] **Step 5: Delete empty common directory**

Run: `rm -rf apps/mist/src/common/`

- [ ] **Step 6: Build to verify**

Run: `cd /Users/xiyugao/code/mist/mist && pnpm build --filter=@app/mist`
Expected: SUCCESS

- [ ] **Step 7: Commit**

```bash
git add apps/mist/src/
git commit -m "refactor: reorganize common directory following NestJS norms"
```

---

### Task 7: Add environment configurations

**Files:**
- Modify: `apps/mist/src/.env`
- Modify: `apps/schedule/src/.env`
- Modify: `apps/mcp-server/src/.env`

- [ ] **Step 1: Verify .env files exist**

Run:
```bash
ls -la apps/mist/src/.env
ls -la apps/schedule/src/.env
ls -la apps/mcp-server/src/.env
```

Expected: All three files exist. If any don't exist, create them.

- [ ] **Step 2: Add DEFAULT_DATA_SOURCE to mist/.env**

Run: `echo "DEFAULT_DATA_SOURCE=ef" >> apps/mist/src/.env`

- [ ] **Step 3: Add DEFAULT_DATA_SOURCE to schedule/.env**

Run: `echo "DEFAULT_DATA_SOURCE=tdx" >> apps/schedule/src/.env`

- [ ] **Step 4: Add DEFAULT_DATA_SOURCE to mcp-server/.env**

Run: `echo "DEFAULT_DATA_SOURCE=ef" >> apps/mcp-server/src/.env`

- [ ] **Step 5: Verify configurations**

Run:
```bash
grep DEFAULT_DATA_SOURCE apps/mist/src/.env
grep DEFAULT_DATA_SOURCE apps/schedule/src/.env
grep DEFAULT_DATA_SOURCE apps/mcp-server/src/.env
```

Expected:
- mist: `DEFAULT_DATA_SOURCE=ef`
- schedule: `DEFAULT_DATA_SOURCE=tdx`
- mcp-server: `DEFAULT_DATA_SOURCE=ef`

- [ ] **Step 6: Commit**

```bash
git add apps/mist/src/.env
git add apps/schedule/src/.env
git add apps/mcp-server/src/.env
git commit -m "feat: add DEFAULT_DATA_SOURCE configuration to all apps"
```

---

### Task 8: Rename data-collector to collector

**Files:**
- Rename: `apps/mist/src/data-collector/` → `apps/mist/src/collector/`
- Modify: `apps/mist/src/app.module.ts`
- Modify: `apps/mist/src/collector/index.ts`

- [ ] **Step 1: Rename directory**

Run:
```bash
cd /Users/xiyugao/code/mist/mist/apps/mist/src
mv data-collector collector
```

- [ ] **Step 2: Update class names in collector directory**

Find and replace in all files under `collector/`:
- `DataCollectorController` → `CollectorController`
- `DataCollectorService` → `CollectorService`
- `DataCollectorModule` → `CollectorModule`
- `DataCollectorInterfaces` → `CollectorInterfaces`

Run:
```bash
cd collector
find . -type f -name "*.ts" -exec sed -i '' \
  -e 's/DataCollectorController/CollectorController/g' \
  -e 's/DataCollectorService/CollectorService/g' \
  -e 's/DataCollectorModule/CollectorModule/g' \
  -e 's/DataCollectorInterfaces/CollectorInterfaces/g' {} +
```

- [ ] **Step 3: Update collector/index.ts**

```typescript
// apps/mist/src/collector/index.ts
export * from './collector.module';
export * from './collector.service';
export * from './collector.controller';
export * from './interfaces/collector.interfaces';
```

- [ ] **Step 4: Update app.module.ts imports**

Find and replace in `apps/mist/src/app.module.ts`:
- `from './data-collector/data-collector.module'` → `from './collector/collector.module'`
- `DataCollectorModule` → `CollectorModule`

Run: `sed -i '' \
  -e "s|from './data-collector/|from './collector/|g" \
  -e "s/DataCollectorModule/CollectorModule/g" \
  apps/mist/src/app.module.ts`

- [ ] **Step 5: Find and update all other imports**

Run: `grep -r "data-collector" apps/mist/src/ --include="*.ts"`
Fix all occurrences by changing to `collector`

- [ ] **Step 6: Build to verify**

Run: `cd /Users/xiyugao/code/mist/mist && pnpm build --filter=@app/mist`
Expected: SUCCESS

- [ ] **Step 7: Commit**

```bash
git add apps/mist/src/
git commit -m "refactor: rename data-collector module to collector"
```

---

### Task 9: Rename stock to security

**Files:**
- Rename: `apps/mist/src/stock/` → `apps/mist/src/security/`
- Modify: `apps/mist/src/app.module.ts`
- Modify: `apps/mist/src/security/index.ts`

- [ ] **Step 1: Rename directory**

Run:
```bash
cd /Users/xiyugao/code/mist/mist/apps/mist/src
mv stock security
```

- [ ] **Step 2: Update class names in security directory**

Find and replace in all files under `security/`:
- `StockController` → `SecurityController`
- `StockService` → `SecurityService`
- `StockModule` → `SecurityModule`

Run:
```bash
cd security
find . -type f -name "*.ts" -exec sed -i '' \
  -e 's/StockController/SecurityController/g' \
  -e 's/StockService/SecurityService/g' \
  -e 's/StockModule/SecurityModule/g' {} +
```

- [ ] **Step 3: Update security/index.ts**

```typescript
// apps/mist/src/security/index.ts
export * from './security.module';
export * from './security.service';
export * from './security.controller';
```

- [ ] **Step 4: Update app.module.ts imports**

Find and replace in `apps/mist/src/app.module.ts`:
- `from './stock/stock.module'` → `from './security/security.module'`
- `StockModule` → `SecurityModule`

Run: `sed -i '' \
  -e "s|from './stock/|from './security/|g" \
  -e "s/StockModule/SecurityModule/g" \
  apps/mist/src/app.module.ts`

- [ ] **Step 5: Find and update all other imports**

Run: `grep -r "from '../stock/" apps/mist/src/ --include="*.ts"`
Fix all occurrences by changing to `from '../security/`

- [ ] **Step 6: Build to verify**

Run: `cd /Users/xiyugao/code/mist/mist && pnpm build --filter=@app/mist`
Expected: SUCCESS

- [ ] **Step 7: Commit**

```bash
git add apps/mist/src/
git commit -m "refactor: rename stock module to security"
```

---

### Task 10: Update DataService with source support

**Files:**
- Modify: `apps/mist/src/data/data.service.ts`
- Test: Modify: `apps/mist/src/data/data.service.spec.ts`

- [ ] **Step 1: Read current DataService to understand structure**

Run: Read the file to see existing methods

- [ ] **Step 2: Update DataService**

```typescript
// apps/mist/src/data/data.service.ts
import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { K, Security, KPeriod, DataSource } from '@app/shared-data';
import { DataSourceService } from '@app/utils';

@Injectable()
export class DataService {
  constructor(
    @InjectRepository(Security) private securityRepository: Repository<Security>,
    @InjectRepository(K) private kRepository: Repository<K>,
    private dataSourceService: DataSourceService,  // Inject service
  ) {}

  /**
   * Unified K-line query with data source support
   * Replaces: findIndexDailyById(), findIndexPeriodById()
   */
  async findBars(queryDto: {
    symbol: string;
    period: KPeriod;
    startDate: Date;
    endDate: Date;
    source?: DataSource;  // Optional data source (enum type)
  }): Promise<K[]> {
    const foundSecurity = await this.securityRepository.findOneBy({
      code: queryDto.symbol,
    });

    if (!foundSecurity) {
      throw new HttpException(
        `Security ${queryDto.symbol} not found`,
        HttpStatus.BAD_REQUEST,
      );
    }

    // Select data source (uses queryDto.source or global default)
    const source = this.dataSourceService.select(queryDto.source);

    const foundBars = await this.kRepository.find({
      relations: ['security'],
      where: {
        security: { id: foundSecurity.id },
        source: source,  // Filter by data source
        period: queryDto.period,
        timestamp: Between(queryDto.startDate, queryDto.endDate),
      },
      order: { timestamp: 'ASC' },
    });

    return foundBars;
  }

  // DEPRECATED METHODS REMOVED:
  // - findIndexDailyById()
  // - findIndexPeriodById()
}
```

- [ ] **Step 3: Update DataService tests**

```typescript
// apps/mist/src/data/data.service.spec.ts
import { Test, TestingModule } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DataService } from './data.service';
import { Security, K, KPeriod, DataSource } from '@app/shared-data';
import { DataSourceService } from '@app/utils';

describe('DataService', () => {
  let service: DataService;
  let securityRepository: Repository<Security>;
  let kRepository: Repository<K>;
  let dataSourceService: jest.Mocked<DataSourceService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DataService,
        {
          provide: getRepositoryToken(Security),
          useValue: {
            findOneBy: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(K),
          useValue: {
            find: jest.fn(),
          },
        },
        {
          provide: DataSourceService,
          useValue: {
            select: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<DataService>(DataService);
    securityRepository = module.get<Repository<Security>>(getRepositoryToken(Security));
    kRepository = module.get<Repository<K>>(getRepositoryToken(K));
    dataSourceService = module.get(DataSourceService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should use selected data source', async () => {
    const mockSecurity = { id: 1, code: '000001' };
    const mockBars = [{ id: 1, timestamp: new Date() }];

    securityRepository.findOneBy = jest.fn().mockResolvedValue(mockSecurity);
    dataSourceService.select.mockReturnValue(DataSource.TDX);
    kRepository.find = jest.fn().mockResolvedValue(mockBars);

    const result = await service.findBars({
      symbol: '000001',
      period: KPeriod.DAILY,
      startDate: new Date('2024-01-01'),
      endDate: new Date('2024-12-31'),
      source: 'TDX',
    });

    expect(dataSourceService.select).toHaveBeenCalledWith('TDX');
    expect(kRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          source: DataSource.TDX,
        }),
      }),
    );
  });

  it('should use default source when not specified', async () => {
    const mockSecurity = { id: 1, code: '000001' };
    const mockBars = [{ id: 1, timestamp: new Date() }];

    securityRepository.findOneBy = jest.fn().mockResolvedValue(mockSecurity);
    dataSourceService.select.mockReturnValue(DataSource.EAST_MONEY);
    kRepository.find = jest.fn().mockResolvedValue(mockBars);

    await service.findBars({
      symbol: '000001',
      period: KPeriod.DAILY,
      startDate: new Date('2024-01-01'),
      endDate: new Date('2024-12-31'),
    });

    expect(dataSourceService.select).toHaveBeenCalledWith(undefined);
  });

  it('should throw error for invalid security', async () => {
    securityRepository.findOneBy = jest.fn().mockResolvedValue(null);

    await expect(
      service.findBars({
        symbol: 'INVALID',
        period: KPeriod.DAILY,
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-12-31'),
      }),
    ).rejects.toThrow('Security INVALID not found');
  });
});
```

- [ ] **Step 4: Run tests to verify**

Run: `cd /Users/xiyugao/code/mist/mist && pnpm test -- data.service.spec.ts`
Expected: PASS

- [ ] **Step 5: Build to verify**

Run: `pnpm build --filter=@app/mist`
Expected: SUCCESS

- [ ] **Step 6: Commit**

```bash
git add apps/mist/src/data/
git commit -m "feat: add data source support to DataService.findBars()"
```

---

### Task 11: Create unified IndicatorQueryDto

**Files:**
- Create: `apps/mist/src/indicator/dto/query/indicator-query.dto.ts`

- [ ] **Step 1: Create query DTO directory**

Run: `mkdir -p apps/mist/src/indicator/dto/query`

- [ ] **Step 2: Create IndicatorQueryDto**

```typescript
// apps/mist/src/indicator/dto/query/indicator-query.dto.ts
import { DataSource, KPeriod } from '@app/shared-data';
import { IsString, IsOptional, IsEnum, IsDateString } from 'class-validator';

export class IndicatorQueryDto {
  @IsString()
  symbol!: string;

  @IsOptional()
  @IsEnum(DataSource)
  source?: DataSource;  // Optional data source (enum, not string)

  @IsEnum(KPeriod)
  period!: KPeriod;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;
}
```

- [ ] **Step 3: Update indicator/dto/index.ts**

```typescript
// Add to existing exports
export * from './query/indicator-query.dto';
```

- [ ] **Step 4: Build to verify**

Run: `cd /Users/xiyugao/code/mist/mist && pnpm build --filter=@app/mist`
Expected: SUCCESS

- [ ] **Step 5: Commit**

```bash
git add apps/mist/src/indicator/dto/
git commit -m "feat: add unified IndicatorQueryDto with source support"
```

---

### Task 12: Update Indicator controller and service

**Files:**
- Modify: `apps/mist/src/indicator/indicator.controller.ts`
- Modify: `apps/mist/src/indicator/indicator.service.ts`

- [ ] **Step 1: Update IndicatorController**

Read the current controller to understand all endpoints, then update:

```typescript
// apps/mist/src/indicator/indicator.controller.ts
import { TimezoneService } from '@app/timezone';
import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { DataService } from '../data/data.service';
import { IndicatorQueryDto } from './dto/query/indicator-query.dto';
import { IndicatorService } from './indicator.service';
import { KVo } from './vo/k.vo';
import { KDJVo } from './vo/kdj.vo';
import { MACDVo } from './vo/macd.vo';
import { RSIVo } from './vo/rsi.vo';

export function formatIndicator(
  begIndex: number,
  index: number,
  data: number[],
) {
  if (index < begIndex) return NaN;
  return data[index - begIndex];
}

@ApiTags('indicator')
@Controller('indicator')  // No v1 prefix for query interfaces
export class IndicatorController {
  constructor(
    private readonly indicatorService: IndicatorService,
    private readonly dataService: DataService,
    private readonly timezoneService: TimezoneService,
  ) {}

  @Post('macd')
  @Throttle({ default: { limit: 40, ttl: 60000 } })
  @ApiOperation({
    summary: 'Calculate MACD indicator with data source support',
    description:
      'Computes MACD (Moving Average Convergence Divergence) with default parameters: fast=12, slow=26, signal=9. Supports optional data source parameter.',
  })
  @ApiResponse({
    status: 200,
    description:
      'Returns array of MACD values with MACD line, signal line, and histogram',
    type: [MACDVo],
  })
  async macd(@Body() queryDto: IndicatorQueryDto): Promise<MACDVo[]> {
    const startDate = this.timezoneService.convertTimestamp2Date(
      queryDto.startDate,
    );
    const endDate = this.timezoneService.convertTimestamp2Date(queryDto.endDate);

    // Use unified findBars with source support
    const data = await this.dataService.findBars({
      symbol: queryDto.symbol,
      source: queryDto.source,  // Pass source parameter
      period: queryDto.period,
      startDate,
      endDate,
    });

    const macdResult = await this.indicatorService.runMACD(
      data.map((item) => item.close),
    );

    return data.map((item, index) => ({
      macd: formatIndicator(macdResult.begIndex, index, macdResult.macd),
      signal: formatIndicator(macdResult.begIndex, index, macdResult.signal),
      histogram: formatIndicator(
        macdResult.begIndex,
        index,
        macdResult.histogram,
      ),
      symbol: item.security.code,
      time: item.timestamp,
      close: item.close,
    }));
  }

  @Post('kdj')
  @Throttle({ default: { limit: 40, ttl: 60000 } })
  @ApiOperation({
    summary: 'Calculate KDJ indicator with data source support',
    description:
      'Computes KDJ (Stochastic) indicator with default parameters: period=9, kSmoothing=3, dSmoothing=3. Supports optional data source parameter.',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns array of KDJ values with K, D, and J lines',
    type: [KDJVo],
  })
  async kdj(@Body() queryDto: IndicatorQueryDto): Promise<KDJVo[]> {
    const startDate = this.timezoneService.convertTimestamp2Date(
      queryDto.startDate,
    );
    const endDate = this.timezoneService.convertTimestamp2Date(queryDto.endDate);

    const data = await this.dataService.findBars({
      symbol: queryDto.symbol,
      source: queryDto.source,
      period: queryDto.period,
      startDate,
      endDate,
    });

    const KDJParams = data.reduce<any>(
      (prev, cur) => {
        prev.high.push(cur.highest);
        prev.low.push(cur.lowest);
        prev.close.push(cur.close);
        return prev;
      },
      {
        high: [],
        low: [],
        close: [],
        period: 14,
        kSmoothing: 3,
        dSmoothing: 3,
      },
    );

    const kdjResult = await this.indicatorService.runKDJ(KDJParams);

    return data.map((item, index) => ({
      k: formatIndicator(kdjResult.begIndex, index, kdjResult.K),
      d: formatIndicator(kdjResult.begIndex, index, kdjResult.D),
      j: formatIndicator(kdjResult.begIndex, index, kdjResult.J),
      symbol: item.security.code,
      time: item.timestamp,
      close: item.close,
    }));
  }

  @Post('rsi')
  @Throttle({ default: { limit: 40, ttl: 60000 } })
  @ApiOperation({
    summary: 'Calculate RSI indicator with data source support',
    description:
      'Computes RSI (Relative Strength Index) with default period of 14. Supports optional data source parameter.',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns array of RSI values (0-100 range)',
    type: [RSIVo],
  })
  async rsi(@Body() queryDto: IndicatorQueryDto): Promise<RSIVo[]> {
    const startDate = this.timezoneService.convertTimestamp2Date(
      queryDto.startDate,
    );
    const endDate = this.timezoneService.convertTimestamp2Date(queryDto.endDate);

    const data = await this.dataService.findBars({
      symbol: queryDto.symbol,
      source: queryDto.source,
      period: queryDto.period,
      startDate,
      endDate,
    });

    const rsiResult = await this.indicatorService.runRSI(
      data.map((item) => item.close),
    );

    return data.map((item, index) => ({
      rsi: formatIndicator(rsiResult.begIndex, index, rsiResult.rsi),
      symbol: item.security.code,
      time: item.timestamp,
      close: item.close,
    }));
  }

  @Post('k')
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({
    summary: 'Get K-line data with data source support',
    description:
      'Retrieves K-line (candlestick) data for the specified symbol and time range. Supports optional data source parameter.',
  })
  @ApiResponse({
    status: 200,
    description:
      'Returns array of K-line data with open, high, low, close, and volume',
    type: [KVo],
  })
  async k(@Body() queryDto: IndicatorQueryDto): Promise<KVo[]> {
    const startDate = this.timezoneService.convertTimestamp2Date(
      queryDto.startDate,
    );
    const endDate = this.timezoneService.convertTimestamp2Date(queryDto.endDate);

    const data = await this.dataService.findBars({
      symbol: queryDto.symbol,
      source: queryDto.source,
      period: queryDto.period,
      startDate,
      endDate,
    });

    return data.map((item) => ({
      id: item.id,
      highest: item.highest,
      lowest: item.lowest,
      open: item.open,
      close: item.close,
      symbol: item.security.code,
      time: item.timestamp,
      amount: item.amount,
    }));
  }
}
```

- [ ] **Step 2: Build to verify**

Run: `cd /Users/xiyugao/code/mist/mist && pnpm build --filter=@app/mist`
Expected: SUCCESS

- [ ] **Step 3: Commit**

```bash
git add apps/mist/src/indicator/
git commit -m "feat: update Indicator controller with unified query DTO and source support"
```

---

### Task 13: Create KlineQueryDto and update K controller

**Files:**
- Create: `apps/mist/src/k/dto/query/kline-query.dto.ts`
- Modify: `apps/mist/src/k/k.controller.ts`

- [ ] **Step 1: Create query DTO directory**

Run: `mkdir -p apps/mist/src/k/dto/query`

- [ ] **Step 2: Create KlineQueryDto**

```typescript
// apps/mist/src/k/dto/query/kline-query.dto.ts
import { DataSource, KPeriod } from '@app/shared-data';
import { IsString, IsOptional, IsEnum, IsDateString } from 'class-validator';

export class KlineQueryDto {
  @IsString()
  symbol!: string;

  @IsOptional()
  @IsEnum(DataSource)
  source?: DataSource;

  @IsEnum(KPeriod)
  period!: KPeriod;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;
}
```

- [ ] **Step 3: Update k/dto/index.ts**

```typescript
export * from './query/kline-query.dto';
```

- [ ] **Step 4: Read current K controller to understand endpoints**

- [ ] **Step 5: Update K controller to use KlineQueryDto**

Update all endpoints to use `KlineQueryDto` and pass `source` to DataService.

- [ ] **Step 6: Build to verify**

Run: `cd /Users/xiyugao/code/mist/mist && pnpm build --filter=@app/mist`
Expected: SUCCESS

- [ ] **Step 7: Commit**

```bash
git add apps/mist/src/k/
git commit -m "feat: add KlineQueryDto with source support to K controller"
```

---

### Task 14: Create ChanQueryDto and update Chan controller

**Files:**
- Create: `apps/mist/src/chan/dto/query/chan-query.dto.ts`
- Modify: `apps/mist/src/chan/chan.controller.ts`

**Note:** Chan module uses its own `Period` enum (values: 1, 5, 15, 30, 60, DAY, WEEK, etc.) which is different from `KPeriod` (values: '1min', '5min', 'daily', etc.). Keep using `Period` for Chan API.

- [ ] **Step 1: Create query DTO directory**

Run: `mkdir -p apps/mist/src/chan/dto/query`

- [ ] **Step 2: Create ChanQueryDto using Period enum**

```typescript
// apps/mist/src/chan/dto/query/chan-query.dto.ts
import { DataSource } from '@app/shared-data';
import { Period } from '../../enums/period.enum';
import { IsString, IsOptional, IsEnum, IsDateString } from 'class-validator';

export class ChanQueryDto {
  @IsString()
  symbol!: string;

  @IsOptional()
  @IsEnum(DataSource)
  source?: DataSource;

  @IsEnum(Period)
  period!: Period;  // Using Chan's Period enum, not KPeriod

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}
```

- [ ] **Step 3: Update chan/dto/index.ts**

```typescript
export * from './query/chan-query.dto';
```

- [ ] **Step 4: Read current Chan controller to understand endpoints**

- [ ] **Step 5: Update Chan controller to use ChanQueryDto**

Update `/chan/merge-k`, `/chan/bi`, `/chan/channel` endpoints to use `ChanQueryDto` and pass `source` to data queries.

- [ ] **Step 6: Build to verify**

Run: `cd /Users/xiyugao/code/mist/mist && pnpm build --filter=@app/mist`
Expected: SUCCESS

- [ ] **Step 7: Commit**

```bash
git add apps/mist/src/chan/
git commit -m "feat: add ChanQueryDto with source support to Chan controller"
```

---

### Task 15: Update Security controller with v1 prefix

**Files:**
- Modify: `apps/mist/src/security/security.controller.ts`

- [ ] **Step 1: Update controller class**

```typescript
// apps/mist/src/security/security.controller.ts
import { Controller, Get, Post, Put, Body, Param } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { SecurityService } from './security.service';

@ApiTags('security v1')
@Controller('security/v1')  // v1 prefix at controller level
export class SecurityController {  // Renamed from StockController
  constructor(private readonly securityService: SecurityService) {}

  @Post('init')
  @ApiOperation({ summary: 'Initialize a new security with source configuration' })
  async init(@Body() dto: any) {  // Replace any with actual DTO
    return await this.securityService.init(dto);
  }

  @Post('add-source')
  @ApiOperation({ summary: 'Add or update data source for existing security' })
  async addSource(@Body() dto: any) {
    return await this.securityService.addSource(dto);
  }

  @Get(':code')
  @ApiOperation({ summary: 'Get security by code' })
  async getByCode(@Param('code') code: string) {
    return await this.securityService.getByCode(code);
  }

  // ... other endpoints
}
```

- [ ] **Step 2: Build to verify**

Run: `cd /Users/xiyugao/code/mist/mist && pnpm build --filter=@app/mist`
Expected: SUCCESS

- [ ] **Step 3: Commit**

```bash
git add apps/mist/src/security/
git commit -m "feat: add v1 prefix to Security controller"
```

---

### Task 16: Update Collector controller with v1 prefix

**Files:**
- Modify: `apps/mist/src/collector/collector.controller.ts`

- [ ] **Step 1: Update controller class**

```typescript
// apps/mist/src/collector/collector.controller.ts
import { Controller, Get, Post, Delete, Body, Param } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { CollectorService } from './collector.service';

@ApiTags('collector v1')
@Controller('collector/v1')  // v1 prefix at controller level
export class CollectorController {  // Renamed from DataCollectorController
  constructor(private readonly collectorService: CollectorService) {}

  @Post('collect')
  @ApiOperation({ summary: 'Collect K-line data from configured sources' })
  async collect(@Body() dto: any) {  // Replace any with actual DTO
    return await this.collectorService.collect(dto);
  }

  @Get('status/:code/:period')
  @ApiOperation({ summary: 'Get collection status for specific security and period' })
  async getStatus(@Param('code') code: string, @Param('period') period: string) {
    return await this.collectorService.getStatus(code, period);
  }

  @Delete('duplicates/:code/:period')
  @ApiOperation({ summary: 'Delete duplicate K-line records' })
  async deleteDuplicates(@Param('code') code: string, @Param('period') period: string) {
    return await this.collectorService.deleteDuplicates(code, period);
  }
}
```

- [ ] **Step 2: Build to verify**

Run: `cd /Users/xiyugao/code/mist/mist && pnpm build --filter=@app/mist`
Expected: SUCCESS

- [ ] **Step 3: Commit**

```bash
git add apps/mist/src/collector/
git commit -m "feat: add v1 prefix to Collector controller"
```

---

### Task 17: Update schedule application

**Files:**
- Modify: `apps/schedule/src/schedule.module.ts`
- Modify: `apps/schedule/src/tasks/data-collection.task.ts`

- [ ] **Step 1: Update schedule.module.ts to import UtilsModule**

```typescript
// apps/schedule/src/schedule.module.ts
import { Module } from '@nestjs/common';
import { ScheduleModule as NestScheduleModule } from '@nestjs/schedule';
import { UtilsModule } from '@app/utils';  // Import global UtilsModule
import { ScheduleService } from './schedule.service';
import { DataCollectionTask } from './tasks/data-collection.task';

@Module({
  imports: [
    NestScheduleModule.forRoot(),
    UtilsModule,  // No need to import if @Global(), but explicit is OK
    // ... other imports
  ],
  providers: [ScheduleService, DataCollectionTask],
})
export class ScheduleModule {}
```

- [ ] **Step 2: Update DataCollectionTask to use DataSourceService**

```typescript
// apps/schedule/src/tasks/data-collection.task.ts
import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSourceService } from '@app/utils';
import { CollectorService } from '../collector/collector.service';  // Updated import
import { Period } from '@app/shared-data';  // Use KPeriod from shared-data

@Injectable()
export class DataCollectionTask {
  constructor(
    private dataSourceService: DataSourceService,
    private collectorService: CollectorService,
  ) {}

  @Cron('0 9 * * 1-5')
  async collectDailyData() {
    // Option 1: Use default from .env (TDX for schedule app)
    const defaultSource = this.dataSourceService.select();

    // Option 2: Explicitly specify for debugging
    const tdxSource = this.dataSourceService.select('TDX');

    await this.collectorService.collectKLine(
      '000001',
      Period.DAY,  // Using Period enum
      new Date('2024-01-01'),
      new Date(),
      tdxSource,  // Explicit source
    );
  }
}
```

- [ ] **Step 3: Build to verify**

Run: `cd /Users/xiyugao/code/mist/mist && pnpm build --filter=@app/schedule`
Expected: SUCCESS

- [ ] **Step 4: Commit**

```bash
git add apps/schedule/src/
git commit -m "feat: integrate DataSourceService into schedule app"
```

---

### Task 18: Update MCP Server

**Files:**
- Modify: `apps/mcp-server/src/mcp-server.module.ts`
- Modify: `apps/mcp-server/src/tools/kline.tool.ts`

- [ ] **Step 1: Update mcp-server.module.ts to import UtilsModule**

```typescript
// apps/mcp-server/src/mcp-server.module.ts
import { Module } from '@nestjs/common';
import { UtilsModule } from '@app/utils';  // Import global UtilsModule
import { McpServerService } from './mcp-server.service';
// ... other imports

@Module({
  imports: [
    UtilsModule,
    // ... other imports
  ],
  providers: [McpServerService],
  exports: [McpServerService],
})
export class McpServerModule {}
```

- [ ] **Step 2: Update kline.tool.ts to support source parameter**

```typescript
// apps/mcp-server/src/tools/kline.tool.ts
import { z } from 'zod';
import { KPeriod, DataSource } from '@app/shared-data';

export const klineTool = {
  name: 'get_kline',
  description: 'Get K-line data with optional data source selection',
  inputSchema: {
    type: 'object',
    properties: {
      symbol: { type: 'string', description: 'Security code' },
      period: {
        type: 'string',
        description: 'Time period (1min, 5min, 15min, 30min, 60min, daily)',
        enum: ['1min', '5min', '15min', '30min', '60min', 'daily'],
      },
      source: {
        type: 'string',
        description: 'Data source: ef (east-money), tdx, mqmt (optional, uses default if not specified)',
        enum: ['ef', 'tdx', 'mqmt'],
      },
      startDate: { type: 'string', description: 'Start date (ISO 8601)' },
      endDate: { type: 'string', description: 'End date (ISO 8601)' },
    },
    required: ['symbol', 'period', 'startDate', 'endDate'],
  },
};

// Handler function (update to inject DataSourceService)
export async function getKlineHandler(
  dataSourceService: any,  // Replace any with proper type
  params: z.infer<typeof klineTool.inputSchema>,
) {
  const source = dataSourceService.select(params.source);
  // ... query logic with source parameter
  return { /* result */ };
}
```

- [ ] **Step 3: Build to verify**

Run: `cd /Users/xiyugao/code/mist/mist && pnpm build --filter=@app/mcp-server`
Expected: SUCCESS

- [ ] **Step 4: Commit**

```bash
git add apps/mcp-server/src/
git commit -m "feat: add source parameter support to MCP Server tools"
```

---

### Task 19: Update Swagger documentation

**Files:**
- Modify: `apps/mist/src/main.ts`

- [ ] **Step 1: Update Swagger configuration**

```typescript
// apps/mist/src/main.ts
import { DocumentBuilder } from '@nestjs/swagger';

const config = new DocumentBuilder()
  .setTitle('Mist API')
  .setDescription('Stock market analysis and alert system with multi-data source support')
  .setVersion('2.0')
  .addTag('indicator', 'Technical Indicators with data source support')
  .addTag('k', 'K-line data with data source support')
  .addTag('chan', 'Chan Theory Analysis with data source support')
  .addTag('security v1', 'Security management API')
  .addTag('collector v1', 'Data collection management API')
  .addServer('http://localhost:8001', 'Local development')
  .build();
```

- [ ] **Step 2: Build and verify**

Run: `cd /Users/xiyugao/code/mist/mist && pnpm build --filter=@app/mist`
Expected: SUCCESS

- [ ] **Step 3: Commit**

```bash
git add apps/mist/src/main.ts
git commit -m "docs: update Swagger documentation for v2.0"
```

---

### Task 20: Final verification and testing

**Files:**
- All modified files

- [ ] **Step 1: Build all apps**

Run:
```bash
cd /Users/xiyugao/code/mist/mist
pnpm build
```

Expected: All apps build successfully

- [ ] **Step 2: Run all unit tests**

Run:
```bash
pnpm test
```

Expected: All tests pass

- [ ] **Step 3: Run typecheck**

Run:
```bash
pnpm exec tsc --noEmit
```

Expected: No type errors

- [ ] **Step 4: Start mist app**

Run:
```bash
pnpm run start:dev:mist
```

Expected: App starts on port 8001

- [ ] **Step 5: Test Indicator API with source parameter**

Run:
```bash
curl -X POST http://localhost:8001/indicator/macd \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "000001",
    "source": "ef",
    "period": "daily",
    "startDate": "2024-01-01T00:00:00.000Z",
    "endDate": "2024-12-31T23:59:59.999Z"
  }'
```

Expected: Returns MACD data from EAST_MONEY source

- [ ] **Step 6: Test without source parameter (uses default)**

Run:
```bash
curl -X POST http://localhost:8001/indicator/macd \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "000001",
    "period": "daily",
    "startDate": "2024-01-01T00:00:00.000Z",
    "endDate": "2024-12-31T23:59:59.999Z"
  }'
```

Expected: Returns MACD data using default source (ef)

- [ ] **Step 7: Test invalid source parameter**

Run:
```bash
curl -X POST http://localhost:8001/indicator/macd \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "000001",
    "source": "invalid",
    "period": "daily",
    "startDate": "2024-01-01T00:00:00.000Z",
    "endDate": "2024-12-31T23:59:59.999Z"
  }'
```

Expected: Returns validation error or DataSourceService error

- [ ] **Step 8: Test Security v1 endpoint**

Run:
```bash
curl http://localhost:8001/security/v1/000001
```

Expected: Returns security info (v1 routing works)

- [ ] **Step 9: Test Collector v1 endpoint**

Run:
```bash
curl http://localhost:8001/collector/v1/status/000001/daily
```

Expected: Returns collection status (v1 routing works)

- [ ] **Step 10: Check Swagger UI**

Open: http://localhost:8001/api-docs
Expected: All endpoints visible with correct tags and v1 prefixes

- [ ] **Step 11: Run schedule app with TDX default**

Run:
```bash
pnpm run start:dev:schedule
```

Expected: App starts on port 8003, uses TDX as default

- [ ] **Step 12: Run MCP Server**

Run:
```bash
pnpm run start:dev:mcp-server
```

Expected: App starts on port 8009, uses ef as default

- [ ] **Step 13: Final commit**

```bash
git add .
git commit -m "test: all verification tests pass, implementation complete"
```

---

### Task 21: Clean up old DTO files

**Files:**
- Delete: Old indicator DTOs

- [ ] **Step 1: List all old DTOs**

Run:
```bash
ls -la apps/mist/src/indicator/dto/
```

Expected: Shows old DTOs (macd.dto.ts, kdj.dto.ts, rsi.dto.ts, k.dto.ts, run-*.dto.ts) and new query/ directory

- [ ] **Step 2: Delete old DTOs (keep query/ and vo/ directories)**

Run:
```bash
cd apps/mist/src/indicator/dto/
rm -f macd.dto.ts kdj.dto.ts rsi.dto.ts k.dto.ts run-*.dto.ts
```

- [ ] **Step 3: Verify no remaining imports**

Run:
```bash
grep -r "from './dto/macd.dto'" apps/mist/src/
grep -r "from './dto/kdj.dto'" apps/mist/src/
grep -r "from './dto/rsi.dto'" apps/mist/src/
grep -r "from './dto/k.dto'" apps/mist/src/
```

Expected: No results (all imports updated)

- [ ] **Step 4: Build to verify**

Run: `cd /Users/xiyugao/code/mist/mist && pnpm build --filter=@app/mist`
Expected: SUCCESS

- [ ] **Step 5: Commit**

```bash
git add apps/mist/src/indicator/dto/
git commit -m "chore: remove deprecated indicator DTOs"
```

---

### Task 22: Update CLAUDE.md documentation

**Files:**
- Modify: `mist/CLAUDE.md`

- [ ] **Step 1: Update module names in CLAUDE.md**

Find and replace:
- `data-collector` → `collector`
- `stock` → `security`
- `DataCollectorModule` → `CollectorModule`
- `StockModule` → `SecurityModule`

- [ ] **Step 2: Add multi-data source API documentation**

Add to "API Endpoints" section:

```markdown
### Multi-Data Source Support

All query interfaces support optional `source` parameter:

**Valid sources:**
- `ef` (EAST_MONEY) - East Money / aktools (default for mist, mcp-server)
- `tdx` (TDX) - TongDaXin (default for schedule)
- `mqmt` (MINI_QMT) - miniQMT

**Example usage:**
\`\`\`json
{
  "symbol": "000001",
  "source": "tdx",  // Optional, uses default if omitted
  "period": "daily",
  "startDate": "2024-01-01",
  "endDate": "2024-12-31"
}
\`\`\`

**Default sources per app:**
- mist: `ef` (EAST_MONEY)
- schedule: `tdx` (TDX)
- mcp-server: `ef` (EAST_MONEY)
```

- [ ] **Step 3: Commit**

```bash
git add mist/CLAUDE.md
git commit -m "docs: update CLAUDE.md with new module names and multi-data source API"
```

---

## Troubleshooting

### Issue: Build fails with "Cannot find module '@app/utils'"

**Cause:** UtilsModule not properly exported or built

**Solution:**
1. Verify `libs/utils/src/index.ts` exports services
2. Run `pnpm build --filter=@app/utils`
3. Clean and rebuild: `rm -rf dist && pnpm build`

### Issue: DataSource enum validation fails

**Cause:** Using enum key names instead of values

**Solution:**
- Use enum VALUES ('ef', 'tdx', 'mqmt') in .env files
- DataSourceService accepts both formats, but validation schema should use values

### Issue: Tests fail with "Cannot spy on undefined property"

**Cause:** Test mocks not properly configured

**Solution:**
```typescript
{
  provide: DataSourceService,
  useValue: {
    select: jest.fn().mockReturnValue(DataSource.EAST_MONEY),
  },
}
```

### Issue: v1 routes return 404

**Cause:** Controller decorator not updated

**Solution:**
- Verify `@Controller('security/v1')` NOT `@Controller('security')`
- Check for conflicting route definitions

### Issue: Period enum mismatch in Chan module

**Cause:** Chan uses `Period` enum (numeric) while rest use `KPeriod` (string)

**Solution:**
- Keep `Period` for Chan DTOs
- Use `KPeriod` for Indicator and K-line DTOs
- Do not mix them

---

## Rollback Plan

If critical issues arise:

### Option 1: Git Revert

```bash
# Identify problematic commit
git log --oneline

# Revert specific commit
git revert <commit-hash>

# Or reset to known good state
git reset --hard <commit-hash>
```

### Option 2: Partial Rollback

```bash
# Rollback utils changes
git checkout <previous-commit> -- libs/utils/

# Rollback controller changes
git checkout <previous-commit> -- apps/mist/src/indicator/indicator.controller.ts

# Rollback module renames
cd apps/mist/src
mv collector data-collector
mv security stock
```

### Option 3: Configuration Rollback

```bash
# Remove from .env files
sed -i '' '/DEFAULT_DATA_SOURCE/d' apps/mist/src/.env
sed -i '' '/DEFAULT_DATA_SOURCE/d' apps/schedule/src/.env
sed -i '' '/DEFAULT_DATA_SOURCE/d' apps/mcp-server/src/.env
```

---

## Success Criteria

Implementation is complete when:

- [ ] All query interfaces support optional `source` parameter
- [ ] All management interfaces use v1 prefix at controller level
- [ ] `DataSourceService` and `PeriodMappingService` are NestJS Services in `libs/utils`
- [ ] `libs/shared-data/src/utils/` directory is deleted
- [ ] `apps/mist/src/common/` directory is reorganized
- [ ] `data-collector` renamed to `collector`
- [ ] `stock` renamed to `security`
- [ ] All `.env` files contain `DEFAULT_DATA_SOURCE` configuration
- [ ] `schedule` and `mcp-server` apps are updated
- [ ] All tests pass (unit + integration)
- [ ] All apps build successfully
- [ ] API documentation is updated
- [ ] Manual testing confirms functionality
- [ ] Old DTO files are deleted
- [ ] CLAUDE.md is updated

---

**End of Implementation Plan**
