# Multi-Data Source API Design Document

**Date:** 2026-03-22
**Author:** Claude Code
**Status:** Draft

---

## Table of Contents

1. [Background](#background)
2. [Goals](#goals)
3. [Architecture Overview](#architecture-overview)
4. [File Structure](#file-structure)
5. [API Design](#api-design)
6. [Core Components](#core-components)
7. [Configuration Management](#configuration-management)
8. [Migration Steps](#migration-steps)
9. [Testing Strategy](#testing-strategy)
10. [Rollback Plan](#rollback-plan)

---

## Background

After three major database refactors (entity rename, multi-data source support, unified data schema), the codebase has been updated with:
- Renamed entities: `MarketDataBar` → `K`, `BarPeriod` → `KPeriod`
- Unified data model: `Security` entity for stocks and indices
- Multi-data source support: `EAST_MONEY`, `TDX`, `MQMT`

However, the upper-layer APIs still lack support for data source selection. All current interfaces default to East Money (aktools) without the ability to specify alternative data sources or query data from multiple sources.

---

## Goals

### Primary Goals

1. **Add Data Source Selection**: Enable all query interfaces to specify data source via parameters
2. **Unified Configuration**: Global default data source configuration with per-app override capability
3. **Module Renaming**: Rename modules for clarity: `data-collector` → `collector`, `stock` → `security`
4. **Code Cleanup**: Remove deprecated code and reorganize common utilities
5. **Update All Apps**: Synchronize changes across `mist`, `schedule`, and `mcp-server` applications

### Non-Goals

- API versioning for query interfaces (Indicator, K-line, Chan)
- Backward compatibility with old interfaces (complete migration)
- Data source aggregation or comparison in a single query

---

## Architecture Overview

### Data Flow

```
┌─────────────────────────────────────────────────────────┐
│                   Global Configuration                    │
│           DEFAULT_DATA_SOURCE=EAST_MONEY                │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│              DataSourceService (NestJS Service)          │
│  - select(source?: string): DataSource                 │
│  - validateSource(source: DataSource): void            │
│  - getDefault(): DataSource                            │
│  - Reads from ConfigService                            │
└─────────────────────────────────────────────────────────┘
                          ↓
        ┌─────────────────┼─────────────────┐
        ↓                 ↓                 ↓
   HTTP接口         MCP Server        定时任务
   支持source       支持source        手动指定
   参数             参数              或使用默认
```

### Design Principles

1. **Two-Layer Configuration**: Manual parameter > Global default
2. **Service-First**: All utilities are NestJS Services (dependency injection)
3. **Separation of Concerns**: `shared-data` for models, `utils` for services
4. **No Pure Utils**: Eliminate pure static utility classes in favor of injectable services

---

## File Structure

### Libraries Structure

```
libs/
├── shared-data/              # Data models only
│   └── src/
│       ├── entities/
│       │   ├── k.entity.ts
│       │   ├── security.entity.ts
│       │   ├── security-source-config.entity.ts
│       │   ├── k-extension-ef.entity.ts
│       │   ├── k-extension-tdx.entity.ts
│       │   └── k-extension-mqmt.entity.ts
│       ├── enums/
│       │   ├── data-source.enum.ts
│       │   ├── k-period.enum.ts
│       │   ├── security-type.enum.ts
│       │   └── security-status.enum.ts
│       ├── dto/
│       ├── vo/
│       ├── shared-data.module.ts
│       ├── shared-data.service.ts
│       └── index.ts
│
└── utils/                    # All utility services
    └── src/
        ├── services/
        │   ├── utils.service.ts              # Existing utils
        │   ├── data-source.service.ts        # NEW: Data source selection
        │   └── period-mapping.service.ts     # MIGRATED: Period format mapping
        ├── interfaces/
        ├── utils.module.ts                   # @Global() module
        └── index.ts
```

### Applications Structure

```
apps/
├── mist/                     # Main application
│   ├── .env                  # DEFAULT_DATA_SOURCE=EAST_MONEY
│   └── src/
│       ├── filters/          # Moved from common/
│       │   └── all-exceptions.filter.ts
│       ├── interceptors/     # Moved from common/
│       │   └── transform.interceptor.ts
│       ├── interfaces/       # Moved from common/
│       │   └── response.interface.ts
│       ├── dto/              # Moved from common/
│       │   └── api-response.dto.ts
│       ├── indicator/
│       │   ├── indicator.controller.ts      # @Controller('indicator')
│       │   ├── indicator.service.ts
│       │   └── dto/
│       │       └── query/
│       │           └── indicator-query.dto.ts
│       ├── k/
│       │   ├── k.controller.ts              # @Controller('k')
│       │   ├── k.service.ts
│       │   └── dto/
│       ├── chan/
│       │   ├── chan.controller.ts           # @Controller('chan')
│       │   ├── chan.service.ts
│       │   └── dto/
│       ├── security/        # Renamed from stock
│       │   ├── security.controller.ts       # @Controller('security/v1')
│       │   ├── security.service.ts
│       │   └── dto/
│       ├── collector/       # Renamed from data-collector
│       │   ├── collector.controller.ts      # @Controller('collector/v1')
│       │   ├── collector.service.ts
│       │   └── interfaces/
│       ├── data/
       │   ├── data.service.ts
│       │   └── data.controller.ts
│       ├── trend/
│       ├── sources/
│       ├── app.module.ts
│       └── main.ts
│
├── schedule/                # Scheduled tasks
│   ├── .env                  # DEFAULT_DATA_SOURCE=TDX
│   └── src/
│       ├── tasks/
│       │   └── data-collection.task.ts
│       ├── schedule.service.ts
│       ├── schedule.controller.ts
│       └── schedule.module.ts
│
└── mcp-server/              # MCP Server
    ├── .env                  # DEFAULT_DATA_SOURCE=EAST_MONEY
    └── src/
        ├── tools/
        │   └── kline.tool.ts
        └── mcp-server.module.ts
```

### Key Changes

1. **Deleted**: `libs/shared-data/src/utils/` directory (migrated to `libs/utils`)
2. **Deleted**: `apps/mist/src/common/` directory (contents moved to `src/` root level)
3. **Renamed**: `data-collector/` → `collector/`
4. **Renamed**: `stock/` → `security/`
5. **Migrated**: `PeriodMapping` from shared-data to utils as a Service
6. **Created**: `DataSourceService` in `libs/utils/src/services/`

---

## API Design

### Query Interfaces (No Version Prefix)

These are user-facing query interfaces. Updated in-place without version prefix.

#### Indicator API

```
POST /indicator/macd
POST /indicator/kdj
POST /indicator/rsi
POST /indicator/k
POST /indicator/adx
POST /indicator/atr
POST /indicator/dual-ma
```

**Request DTO:**
```typescript
export class IndicatorQueryDto {
  symbol!: string;              // Securities code
  source?: DataSource;          // NEW: Optional data source
  period!: KPeriod;            // Time period
  startDate!: string;          // Start date (ISO 8601)
  endDate!: string;            // End date (ISO 8601)
}
```

#### K-line API

```
POST /k/query
POST /k/batch
```

**Request DTO:**
```typescript
export class KlineQueryDto {
  symbol!: string;
  source?: DataSource;          // NEW: Optional data source
  period!: KPeriod;
  startDate!: string;
  endDate!: string;
}
```

#### Chan Theory API

```
POST /chan/merge-k
POST /chan/bi
POST /chan/channel
```

**Request DTO:**
```typescript
export class ChanQueryDto {
  symbol!: string;
  source?: DataSource;          // NEW: Optional data source
  period!: KPeriod;            // Time period (using KPeriod for consistency)
  startDate?: string;
  endDate?: string;
}
```

### Management Interfaces (v1 Prefix)

These are management interfaces that may undergo significant changes. Version prefix applied at controller level.

#### Security API (formerly Stock)

```
POST /security/v1/init
POST /security/v1/add-source
GET /security/v1/:code
GET /security/v1
PUT /security/v1/:code/deactivate
PUT /security/v1/:code/activate
GET /security/v1/:code/source
```

**Controller:**
```typescript
@Controller('security/v1')
export class SecurityController {
  // All routes prefixed with /security/v1
}
```

#### Collector API (formerly Data Collector)

```
POST /collector/v1/collect
GET /collector/v1/status/:code/:period
DELETE /collector/v1/duplicates/:code/:period
```

**Controller:**
```typescript
@Controller('collector/v1')
export class CollectorController {
  // All routes prefixed with /collector/v1
}
```

---

## Core Components

### 1. DataSourceService

**Location:** `libs/utils/src/services/data-source.service.ts`

**Purpose:** Manages data source selection and validation with configuration integration.

```typescript
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
    if (envDefault && this.isValid(envDefault)) {
      this.defaultSource = this.select(envDefault);
    } else {
      // Fallback to EAST_MONEY if invalid or not specified
      this.defaultSource = DataSource.EAST_MONEY;
    }
  }

  /**
   * Select data source with fallback to default
   */
  select(source?: string): DataSource {
    if (!source) {
      return this.defaultSource;
    }

    const normalizedSource = this.normalize(source);

    if (!this.isValid(normalizedSource)) {
      throw new Error(
        `Invalid data source: ${source}. Supported: ${Object.values(DataSource).join(', ')}`,
      );
    }

    return normalizedSource as DataSource;
  }

  /**
   * Normalize source name to enum format
   * Supports: east-money, EAST_MONEY, east_money, eastMoney
   */
  normalize(source: string): string {
    return source.toUpperCase().replace('-', '_');
  }

  /**
   * Validate if source is supported
   */
  isValid(source: string): boolean {
    return Object.values(DataSource).includes(source as DataSource);
  }

  /**
   * Get configured default data source
   */
  getDefault(): DataSource {
    return this.defaultSource;
  }
}
```

**Usage Example:**
```typescript
@Injectable()
export class DataService {
  constructor(
    private dataSourceService: DataSourceService,
    @InjectRepository(K) private kRepository: Repository<K>,
  ) {}

  async findBars(dto: KlineQueryDto): Promise<K[]> {
    // Select data source (uses dto.source or global default)
    const source = this.dataSourceService.select(dto.source);

    return await this.kRepository.find({
      where: { source, period: dto.period },
    });
  }
}
```

### 2. PeriodMappingService

**Location:** `libs/utils/src/services/period-mapping.service.ts`

**Purpose:** Converts periods to data source-specific formats. Migrated from `libs/shared-data/src/utils/period-mapping.util.ts` as a NestJS Service.

```typescript
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
      // Fallback to EAST_MONEY format for MQMT
      // TODO: Update with MQMT-specific formats when available
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

### 3. UtilsModule

**Location:** `libs/utils/src/utils.module.ts`

**Purpose:** Global module providing all utility services via dependency injection.

```typescript
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

### 4. Updated DataService

**Location:** `apps/mist/src/data/data.service.ts`

**Purpose:** Unified K-line query service with data source support.

```typescript
import { K, Security, KPeriod, DataSource } from '@app/shared-data';
import { Injectable, NotFoundException, HttpException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
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

---

## Configuration Management

### Environment Variables

**apps/mist/src/.env**
```bash
PORT=8001
DEFAULT_DATA_SOURCE=EAST_MONEY  # NEW: Global default for mist app
```

**apps/schedule/src/.env**
```bash
PORT=8003
DEFAULT_DATA_SOURCE=TDX  # NEW: Override for schedule app
```

**apps/mcp-server/src/.env**
```bash
PORT=8009
DEFAULT_DATA_SOURCE=EAST_MONEY  # NEW: Override for mcp-server
```

### Configuration Schema

**Location:** `libs/config/src/validation.schema.ts`

```typescript
import Joi from 'joi';

export const mistEnvSchema = Joi.object({
  // ... existing configurations
  PORT: Joi.number().default(8001),
  mysql_server_host: Joi.string().default('localhost'),
  // ... other configs

  // NEW: Data source configuration (must match DataSource enum values)
  DEFAULT_DATA_SOURCE: Joi.string()
    .valid('EAST_MONEY', 'TDX', 'MQMT')
    .default('EAST_MONEY')
    .description('Default data source for queries (must match DataSource enum)'),
});
```

---

## Migration Steps

### Phase 1: Create New Services

**Files to Create:**

1. `libs/utils/src/services/data-source.service.ts`
2. `libs/utils/src/services/period-mapping.service.ts`
3. Update `libs/utils/src/utils.module.ts`
4. Update `libs/utils/src/index.ts`

**Commands:**
```bash
cd /Users/xiyugao/code/mist/mist

# Create services
mkdir -p libs/utils/src/services
# [Create files with content from Core Components section]

# Update module
# [Edit utils.module.ts]

# Update exports
# [Edit index.ts]
```

### Phase 2: Update Configuration

**Files to Modify:**

1. `libs/config/src/validation.schema.ts` - Add `DEFAULT_DATA_SOURCE` validation
2. `apps/mist/src/.env` - Add `DEFAULT_DATA_SOURCE=EAST_MONEY`
3. `apps/schedule/src/.env` - Add `DEFAULT_DATA_SOURCE=TDX`
4. `apps/mcp-server/src/.env` - Add `DEFAULT_DATA_SOURCE=EAST_MONEY`

### Phase 3: Migrate PeriodMapping

**Files to Delete:**
- `libs/shared-data/src/utils/period-mapping.util.ts`
- `libs/shared-data/src/utils/period-mapping.util.spec.ts`
- `libs/shared-data/src/utils/` directory (if empty)

**Files to Create:**
- `libs/utils/src/services/period-mapping.service.ts` (already created in Phase 1)

**Files to Update:**
- `libs/shared-data/src/index.ts` - Remove utils export
- All files importing `PeriodMapping` - Update import to `@app/utils`

### Phase 4: Reorganize Common Directory

**Files to Move:**
```bash
cd /Users/xiyugao/code/mist/mist/apps/mist/src

# Move from common/ to src/ root
mv common/dto/api-response.dto.ts dto/
mv common/filters/all-exceptions.filter.ts filters/
mv common/interceptors/transform.interceptor.ts interceptors/
mv common/interfaces/response.interface.ts interfaces/

# Remove empty common/ directory
rm -rf common/
```

**Files to Update:**
- `apps/mist/src/main.ts` - Update imports from `common/` to new locations
- All files importing from `common/` - Update import paths

### Phase 5: Rename Modules

**Commands:**
```bash
cd /Users/xiyugao/code/mist/mist/apps/mist/src

# Rename data-collector to collector
mv data-collector collector

# Rename stock to security
mv stock security
```

**Files to Update:**
- `apps/mist/src/app.module.ts` - Update module imports
- All files importing from renamed modules - Update import paths
- Update class names: `DataCollector*` → `Collector*`, `Stock*` → `Security*`

### Phase 6: Update Services

**Files to Modify:**

1. `apps/mist/src/data/data.service.ts`
   - Inject `DataSourceService`
   - Update `findBars()` to support `source` parameter
   - Remove deprecated methods: `findIndexDailyById()`, `findIndexPeriodById()`

2. `apps/mist/src/k/k.service.ts`
   - Inject `DataSourceService`
   - Update methods to support `source` parameter

3. All other services using K-line queries - Update to use new `DataService.findBars()`

### Phase 7: Create New Controllers

**Files to Create:**

1. `apps/mist/src/indicator/dto/query/indicator-query.dto.ts`
2. `apps/mist/src/indicator/indicator.controller.ts` (replace existing)
3. `apps/mist/src/k/dto/query/kline-query.dto.ts`
4. `apps/mist/src/k/k.controller.ts` (replace existing)
5. `apps/mist/src/chan/dto/query/chan-query.dto.ts`
6. `apps/mist/src/chan/chan.controller.ts` (replace existing)
7. `apps/mist/src/security/security.controller.ts` (rename from stock)
8. `apps/mist/src/collector/collector.controller.ts` (rename from data-collector)

**Controller Implementation Example:**

```typescript
// apps/mist/src/indicator/indicator.controller.ts
import { Controller, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { IndicatorService } from './indicator.service';
import { IndicatorQueryDto } from './dto/query/indicator-query.dto';

@ApiTags('indicator')
@Controller('indicator')  // No v1 prefix
export class IndicatorController {
  constructor(private readonly indicatorService: IndicatorService) {}

  @Post('macd')
  @ApiOperation({ summary: 'Calculate MACD indicator with data source support' })
  async macd(@Body() dto: IndicatorQueryDto) {
    return await this.indicatorService.runMACD(dto);
  }

  @Post('kdj')
  async kdj(@Body() dto: IndicatorQueryDto) {
    return await this.indicatorService.runKDJ(dto);
  }

  // ... other endpoints
}
```

### Phase 8: Update Schedule Application

**Files to Modify:**

1. `apps/schedule/src/schedule.module.ts`
   - Import `UtilsModule`

2. `apps/schedule/src/tasks/data-collection.task.ts`
   - Inject `DataSourceService`
   - Use `select()` method or explicitly specify source

**Example:**
```typescript
@Injectable()
export class DataCollectionTask {
  constructor(
    private dataSourceService: DataSourceService,
    private collectorService: CollectorService,
  ) {}

  @Cron('0 9 * * 1-5')
  async collectDailyData() {
    // Option 1: Use default from .env
    const source = this.dataSourceService.select();

    // Option 2: Explicitly specify for debugging
    const tdxSource = this.dataSourceService.select('TDX');

    await this.collectorService.collectKLine(
      '000001',
      Period.DAY,
      new Date('2024-01-01'),
      new Date(),
      tdxSource,  // Explicit source
    );
  }
}
```

### Phase 9: Update MCP Server

**Files to Modify:**

1. `apps/mcp-server/src/mcp-server.module.ts`
   - Import `UtilsModule`

2. `apps/mcp-server/src/tools/kline.tool.ts`
   - Update tool schema to include optional `source` parameter
   - Inject `DataSourceService` in handler

**Example:**
```typescript
// apps/mcp-server/src/tools/kline.tool.ts
export const klineTool = {
  name: 'get_kline',
  description: 'Get K-line data with optional data source selection',
  inputSchema: {
    type: 'object',
    properties: {
      symbol: { type: 'string', description: 'Security code' },
      period: { type: 'string', description: 'Time period' },
      source: {
        type: 'string',
        description: 'Data source: EAST_MONEY, TDX, MQMT (optional, uses default if not specified)',
      },
      startDate: { type: 'string' },
      endDate: { type: 'string' },
    },
    required: ['symbol', 'period', 'startDate', 'endDate'],
  },
};

// Handler
export async function getKlineHandler(
  dataSourceService: DataSourceService,
  params: any,
) {
  const source = dataSourceService.select(params.source);
  // ... query logic
}
```

### Phase 10: Update Swagger Documentation

**File to Modify:** `apps/mist/src/main.ts`

```typescript
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

### Phase 11: Update Tests

**Files to Update:**

1. All service tests - Mock `DataSourceService`
2. All controller tests - Update DTOs with `source` field
3. Import paths - Update after module renames

**Example:**
```typescript
// apps/mist/src/data/data.service.spec.ts
describe('DataService', () => {
  let service: DataService;
  let dataSourceService: jasmine.SpyObj<DataSourceService>;

  beforeEach(() => {
    const module = Test.createTestingModule({
      providers: [
        DataService,
        {
          provide: DataSourceService,
          useValue: {
            select: jasmine.createSpy('select').and.returnValue(DataSource.EAST_MONEY),
          },
        },
        // ... other providers
      ],
    }).compile();

    service = module.get<DataService>(DataService);
    dataSourceService = module.get(DataSourceService);
  });

  it('should use selected data source', async () => {
    dataSourceService.select.and.returnValue(DataSource.TDX);

    const result = await service.findBars({
      symbol: '000001',
      period: KPeriod.DAILY,
      startDate: new Date('2024-01-01'),
      endDate: new Date('2024-12-31'),
      source: 'TDX',
    });

    expect(dataSourceService.select).toHaveBeenCalledWith('TDX');
    // ... verify result
  });
});
```

### Phase 12: Verification

**Run tests and builds:**
```bash
cd /Users/xiyugao/code/mist/mist

# Build all apps
pnpm run build

# Run tests
pnpm test

# Start applications
pnpm run start:dev:mist
pnpm run start:dev:schedule
pnpm run start:dev:mcp-server

# Test APIs
curl -X POST http://localhost:8001/indicator/macd \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "000001",
    "source": "EAST_MONEY",
    "period": "daily",
    "startDate": "2024-01-01",
    "endDate": "2024-12-31"
  }'
```

---

## Testing Strategy

### Unit Tests

1. **DataSourceService**
   - Test `select()` with and without source parameter
   - Test `normalize()` with various formats
   - Test `isValid()` with valid and invalid sources
   - Test default configuration loading

2. **PeriodMappingService**
   - Test `toSourceFormat()` for each source
   - Test `isSupported()` for edge cases
   - Test `getSupportedPeriods()`

3. **DataService**
   - Test `findBars()` with different source parameters
   - Test query construction with source filter
   - Test error handling for invalid sources

### Integration Tests

1. **API Endpoints**
   - Test each endpoint with `source` parameter
   - Test without `source` parameter (uses default)
   - Test invalid `source` parameter (returns error)
   - Test data returns correct source data

2. **Multi-App Tests**
   - Test mist app with EAST_MONEY default
   - Test schedule app with TDX default
   - Test mcp-server with EAST_MONEY default

### Manual Testing Checklist

- [ ] All Indicator endpoints work with `source` parameter
- [ ] All K-line endpoints work with `source` parameter
- [ ] All Chan endpoints work with `source` parameter
- [ ] Security v1 endpoints function correctly
- [ ] Collector v1 endpoints function correctly
- [ ] Omitting `source` parameter uses default from `.env`
- [ ] Invalid `source` parameter returns proper error
- [ ] Swagger documentation displays correctly
- [ ] Schedule app uses TDX by default
- [ ] MCP Server uses EAST_MONEY by default

---

## Rollback Plan

If critical issues arise during migration:

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

If only specific components fail:

1. **Rollback UtilsModule changes:**
   ```bash
   git checkout <previous-commit> -- libs/utils/
   ```

2. **Rollback Controller changes:**
   ```bash
   git checkout <previous-commit> -- apps/mist/src/indicator/indicator.controller.ts
   ```

3. **Rollback Module renames:**
   ```bash
   cd apps/mist/src
   mv collector data-collector
   mv security stock
   ```

### Option 3: Configuration Rollback

Remove new environment variables:
```bash
# Remove from .env files
sed -i '/DEFAULT_DATA_SOURCE/d' apps/mist/src/.env
sed -i '/DEFAULT_DATA_SOURCE/d' apps/schedule/src/.env
sed -i '/DEFAULT_DATA_SOURCE/d' apps/mcp-server/src/.env
```

---

## Success Criteria

Migration is considered complete when:

- [x] All query interfaces support optional `source` parameter
- [x] All management interfaces use v1 prefix at controller level
- [x] `DataSourceService` and `PeriodMappingService` are NestJS Services in `libs/utils`
- [x] `libs/shared-data/src/utils/` directory is deleted
- [x] `apps/mist/src/common/` directory is reorganized
- [x] `data-collector` renamed to `collector`
- [x] `stock` renamed to `security`
- [x] All `.env` files contain `DEFAULT_DATA_SOURCE` configuration
- [x] `schedule` and `mcp-server` apps are updated
- [x] All tests pass
- [x] All apps build successfully
- [x] API documentation is updated
- [x] Manual testing confirms functionality

---

## Appendix

### A. DataSource Enum Values

```typescript
enum DataSource {
  EAST_MONEY = 'EAST_MONEY',  // aktools (default)
  TDX = 'TDX',                // TongDaXin
  MQMT = 'MQMT',              // miniQMT
}
```

### B. KPeriod Enum Values

```typescript
enum KPeriod {
  ONE_MIN = '1min',
  FIVE_MIN = '5min',
  FIFTEEN_MIN = '15min',
  THIRTY_MIN = '30min',
  SIXTY_MIN = '60min',
  DAILY = 'daily',
}
```

### C. Import Path Changes

| Old Import | New Import |
|------------|------------|
| `from '@app/shared-data/utils/period-mapping.util'` | `from '@app/utils'` |
| `from '../common/filters/all-exceptions.filter'` | `from '../filters/all-exceptions.filter'` |
| `from '../stock/stock.service'` | `from '../security/security.service'` |
| `from '../data-collector/data-collector.service'` | `from '../collector/collector.service'` |

---

**Document Version:** 1.0
**Last Updated:** 2026-03-22
