# Mist App Refactoring Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the mist application (port 8001) to remove redundant modules (DataModule, KModule, TrendModule), convert Collector to service-only, clarify module responsibilities, and maintain MCP integration.

**Architecture:** Consolidate 4 modules into a cleaner structure where Indicator, Chan, and Security provide HTTP APIs while Collector becomes a pure service module. Each module has explicit data access patterns (Indicator: READ, Chan: NONE, Security: READ/WRITE, Collector: WRITE).

**Tech Stack:** NestJS 10, TypeORM, MySQL, TypeScript, monorepo with pnpm workspaces

**Design Document:** `docs/superpowers/specs/2026-03-22-mist-app-refactor-design.md`

---

## File Structure

### Files to Create
- `apps/mist/src/chan/services/trend.service.ts` - Merged from TrendModule
- `apps/mist/src/chan/vo/judge-trend.vo.ts` - Merged from TrendModule

### Files to Modify
- `apps/mist/src/app.module.ts` - Remove deleted modules from imports
- `apps/mist/src/indicator/indicator.module.ts` - Replace DataModule with direct TypeORM imports
- `apps/mist/src/chan/chan.module.ts` - Merge TrendModule, remove import, add TrendService
- `apps/mist/src/collector/collector.module.ts` - Remove CollectorController
- `apps/mist/src/security/security.module.ts` - Import CollectorModule
- `apps/mist/src/security/security.service.ts` - Inject CollectorService, remove auto-init
- `apps/mist/src/security/security.controller.ts` - Change endpoint to /all, add response decorators
- `apps/mist/src/main.ts` - Update Swagger documentation
- `apps/mist/CLAUDE.md` - Update documentation

### Files to Delete
- `apps/mist/src/data/` - Entire directory (DataModule)
- `apps/mist/src/k/` - Entire directory (KModule)
- `apps/mist/src/trend/` - Entire directory (TrendModule)
- `apps/mist/src/collector/collector.controller.ts` - HTTP endpoints
- `apps/mist/src/collector/collector.controller.spec.ts` - Controller tests

---

## Pre-Flight Checklist

**Before starting any tasks, verify:**

- [ ] **Database is running**
  ```bash
  mysql -u root -p -e "SELECT 1"
  ```
  Expected: Database connection successful

- [ ] **All tests currently pass**
  ```bash
  cd /Users/xiyugao/code/mist/mist
  pnpm test
  ```
  Expected: All tests pass before refactoring

- [ ] **Clean git state**
  ```bash
  git status
  ```
  Expected: No uncommitted changes (or create backup branch)

- [ ] **Create backup branch**
  ```bash
  git branch backup-before-refactor-$(date +%Y%m%d)
  ```
  Purpose: Easy rollback point

- [ ] **Verify current branch**
  ```bash
  git branch --show-current
  ```
  Expected: On develop or feature branch (not main)

- [ ] **Check disk space**
  ```bash
  df -h .
  ```
  Expected: Sufficient space for builds (>5GB)

---

## Task 1: Merge TrendModule into ChanModule

**Files:**
- Read: `apps/mist/src/trend/trend.service.ts`
- Read: `apps/mist/src/trend/vo/judge-trend.vo.ts`
- Create: `apps/mist/src/chan/services/trend.service.ts`
- Create: `apps/mist/src/chan/vo/judge-trend.vo.ts`
- Modify: `apps/mist/src/chan/chan.module.ts`
- Delete: `apps/mist/src/trend/`

- [ ] **Step 1: Search for TrendService imports**

```bash
cd /Users/xiyugao/code/mist/mist
grep -r "TrendService" --exclude-dir=trend apps/mist/src/
```

Expected: List of files importing TrendService (likely none outside of trend module)

- [ ] **Step 2: Read TrendService source**

```bash
cat apps/mist/src/trend/trend.service.ts
```

Purpose: Understand the service to merge

- [ ] **Step 3: Copy TrendService to chan/services**

```bash
cp apps/mist/src/trend/trend.service.ts apps/mist/src/chan/services/trend.service.ts
```

- [ ] **Step 4: Copy Trend VO to chan/vo**

```bash
mkdir -p apps/mist/src/chan/vo
cp apps/mist/src/trend/vo/judge-trend.vo.ts apps/mist/src/chan/vo/judge-trend.vo.ts
```

- [ ] **Step 5: Update imports in trend.service.ts**

Edit `apps/mist/src/chan/services/trend.service.ts`:

```typescript
// Remove or update any relative imports
// Ensure imports point to correct locations after move
```

Run: Verify file compiles
```bash
pnpm run build -- --mode development --watch false
```

Expected: No import errors

- [ ] **Step 6: Update chan.module.ts**

Edit `apps/mist/src/chan/chan.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { chanEnvSchema } from '@app/config';
import { ChanModule as BaseChanModule } from './chan.module'; // Keep existing
import { TrendService } from './services/trend.service'; // Add

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: chanEnvSchema,
      validationOptions: {
        allowUnknown: true,
        abortEarly: false,
      },
    }),
    UtilsModule, // Keep existing
    // REMOVE: TrendModule import
  ],
  controllers: [ChanController], // Keep existing
  providers: [
    ChanService, // Keep existing
    KMergeService, // Keep existing
    ChannelService, // Keep existing
    TrendService, // ADD: Merged service
  ],
  exports: [
    ChanService, // Keep existing
    KMergeService, // Keep existing
    ChannelService, // Keep existing
    TrendService, // ADD: Export for mcp-server
  ],
})
export class ChanModule {}
```

- [ ] **Step 7: Run tests to verify merge**

```bash
pnpm test -- chan
```

Expected: All chan tests pass

- [ ] **Step 8: Run trend tests (before deletion)**

```bash
pnpm test -- trend
```

Purpose: Baseline verification before deletion

Expected: All trend tests pass

```bash
pnpm test -- trend
```

Purpose: Baseline verification

Expected: All trend tests pass

- [ ] **Step 10: Commit TrendModule merge**

```bash
git add apps/mist/src/chan/
git add apps/mist/src/trend/
git commit -m "refactor(chan): merge TrendModule into ChanModule

- Copy TrendService to chan/services/
- Copy judge-trend VO to chan/vo/
- Update ChanModule to include TrendService
- Remove TrendModule import from ChanModule

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

- [ ] **Step 11: Delete TrendModule directory**

```bash
rm -rf apps/mist/src/trend/
```

- [ ] **Step 12: Verify compilation**

```bash
pnpm run build
```

Expected: Build succeeds without errors

- [ ] **Step 13: Commit deletion**

```bash
git add apps/mist/src/trend/
git commit -m "refactor: delete TrendModule after merging into ChanModule

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 2: Delete DataModule and Update IndicatorModule

**Files:**
- Read: `apps/mist/src/indicator/indicator.module.ts`
- Modify: `apps/mist/src/indicator/indicator.module.ts`
- Modify: `apps/mist/src/app.module.ts`
- Delete: `apps/mist/src/data/`

- [ ] **Step 1: Read current IndicatorModule**

```bash
cat apps/mist/src/indicator/indicator.module.ts
```

Purpose: Understand current dependencies

- [ ] **Step 2: Search for DataService usage**

```bash
grep -r "DataService" --exclude-dir=data apps/mist/src/
```

Expected: List of files using DataService

- [ ] **Step 3: Update indicator.module.ts**

Edit `apps/mist/src/indicator/indicator.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TimezoneModule } from '@app/timezone';
import { UtilsModule } from '@app/utils'; // ADD
import { K, Security } from '@app/shared-data'; // ADD
import { IndicatorController } from './indicator.controller';
import { IndicatorService } from './indicator.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([K, Security]), // ADD: Direct entity access
    UtilsModule, // ADD: For DataSourceService
    TimezoneModule, // KEEP
    // REMOVE: DataModule
  ],
  controllers: [IndicatorController],
  providers: [IndicatorService],
  exports: [IndicatorService], // ADD: Export for mcp-server
})
export class IndicatorModule {}
```

- [ ] **Step 4: Verify IndicatorService has data access**

```bash
grep -n "Repository\|findK\|kRepository" apps/mist/src/indicator/indicator.service.ts | head -20
```

Expected: IndicatorService already has @InjectRepository decorators

- [ ] **Step 5: Update app.module.ts**

Edit `apps/mist/src/app.module.ts`:

```typescript
// REMOVE from imports:
// - DataModule

// Keep existing:
imports: [
  ConfigModule.forRoot({...}),
  ThrottlerModule.forRoot([...]),
  TypeOrmModule.forRootAsync({...}),
  // DataModule, // REMOVE
  CollectorModule,
  IndicatorModule,
  KModule, // Will be removed in Task 3
  SecurityModule,
  ChanModule,
  TrendModule, // Already removed in Task 1
],
```

- [ ] **Step 6: Search for remaining DataModule references**

```bash
grep -r "DataModule" apps/mist/src/ --exclude-dir=node_modules
```

Expected: No remaining references (except in deleted directory)

- [ ] **Step 7: Run tests to verify**

```bash
pnpm test -- indicator
```

Expected: All indicator tests pass

- [ ] **Step 8: Build to verify compilation**

```bash
pnpm run build
```

Expected: Build succeeds

- [ ] **Step 9: Commit DataModule removal**

```bash
git add apps/mist/src/indicator/indicator.module.ts
git add apps/mist/src/app.module.ts
git add apps/mist/src/data/
git commit -m "refactor: remove DataModule and update IndicatorModule

- Replace DataModule with TypeOrmModule.forFeature([K, Security])
- Add UtilsModule for DataSourceService
- Add exports to IndicatorModule for mcp-server
- Remove DataModule from AppModule imports

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

- [ ] **Step 10: Delete data directory**

```bash
rm -rf apps/mist/src/data/
```

- [ ] **Step 11: Verify build**

```bash
pnpm run build
```

Expected: Build succeeds

- [ ] **Step 12: Commit directory deletion**

```bash
git add apps/mist/src/data/
git commit -m "refactor: delete data directory after removing DataModule

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 3: Delete KModule (market-data)

**Files:**
- Modify: `apps/mist/src/app.module.ts`
- Delete: `apps/mist/src/k/`

- [ ] **Step 1: Search for KModule usage**

```bash
grep -r "KModule\|market-data\|/market-data/" apps/mist/src/ --exclude-dir=node_modules
```

Expected: Only in app.module.ts and k/ directory

- [ ] **Step 2: Update app.module.ts**

Edit `apps/mist/src/app.module.ts`:

```typescript
imports: [
  // ...
  // REMOVE: KModule
  IndicatorModule,
  SecurityModule,
  ChanModule,
  CollectorModule,
],
```

- [ ] **Step 3: Verify no references to /market-data endpoints**

```bash
grep -r "market-data" apps/mist/ --exclude-dir=node_modules --exclude-dir=k
```

Expected: No references outside of k/ directory

- [ ] **Step 4: Commit KModule removal**

```bash
git add apps/mist/src/app.module.ts
git add apps/mist/src/k/
git commit -m "refactor: remove KModule (market-data)

- Remove KModule from AppModule imports
- Delete k/ directory
- K-line functionality already exists in IndicatorModule

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

- [ ] **Step 5: Delete k directory**

```bash
rm -rf apps/mist/src/k/
```

- [ ] **Step 6: Verify build**

```bash
pnpm run build
```

Expected: Build succeeds

---

## Task 4: Remove Collector HTTP Endpoints

**Files:**
- Modify: `apps/mist/src/collector/collector.module.ts`
- Delete: `apps/mist/src/collector/collector.controller.ts`
- Delete: `apps/mist/src/collector/collector.controller.spec.ts`

- [ ] **Step 1: Read collector.module.ts**

```bash
cat apps/mist/src/collector/collector.module.ts
```

- [ ] **Step 2: Update collector.module.ts**

Edit `apps/mist/src/collector/collector.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { K, Security } from '@app/shared-data';
import { CollectorService } from './collector.service';

@Module({
  imports: [TypeOrmModule.forFeature([K, Security])],
  // REMOVE: CollectorController
  providers: [CollectorService],
  exports: [CollectorService], // KEEP: Export for SecurityModule and schedule
})
export class CollectorModule {}
```

- [ ] **Step 3: Verify CollectorService exists**

```bash
cat apps/mist/src/collector/collector.service.ts | head -30
```

Expected: Service file exists and has collectKLine method

- [ ] **Step 4: Run collector service tests**

```bash
pnpm test -- collector
```

Expected: Service tests pass (controller tests will fail, that's expected)

- [ ] **Step 5: Commit controller removal**

```bash
git add apps/mist/src/collector/collector.module.ts
git add apps/mist/src/collector/collector.controller.ts
git add apps/mist/src/collector/collector.controller.spec.ts
git commit -m "refactor(collector): remove HTTP endpoints, convert to service-only

- Remove CollectorController from CollectorModule
- Delete collector.controller.ts
- Delete collector.controller.spec.ts
- Keep CollectorService exported for SecurityModule and schedule app

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

- [ ] **Step 6: Delete controller files**

```bash
rm apps/mist/src/collector/collector.controller.ts
rm apps/mist/src/collector/collector.controller.spec.ts
```

- [ ] **Step 7: Verify build**

```bash
pnpm run build
```

Expected: Build succeeds

---

## Task 5: Update SecurityModule

**Files:**
- Modify: `apps/mist/src/security/security.module.ts`
- Modify: `apps/mist/src/security/security.service.ts`
- Modify: `apps/mist/src/security/security.controller.ts`

- [ ] **Step 1: Read security.module.ts**

```bash
cat apps/mist/src/security/security.module.ts
```

- [ ] **Step 2: Update security.module.ts**

Edit `apps/mist/src/security/security.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Security, SecuritySourceConfig } from '@app/shared-data';
import { CollectorModule } from '../collector/collector.module'; // ADD
import { SecurityController } from './security.controller';
import { SecurityService } from './security.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Security, SecuritySourceConfig]),
    CollectorModule, // ADD: Import to use CollectorService
  ],
  controllers: [SecurityController],
  providers: [SecurityService],
  exports: [], // Keep empty or remove if present
})
export class SecurityModule {}
```

- [ ] **Step 3: Read security.service.ts**

```bash
cat apps/mist/src/security/security.service.ts
```

- [ ] **Step 4: Update security.service.ts constructor**

Edit `apps/mist/src/security/security.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Security, SecuritySourceConfig } from '@app/shared-data';
import { CollectorService } from '../collector/collector.service'; // ADD

@Injectable()
export class SecurityService {
  constructor(
    @InjectRepository(Security)
    private securityRepository: Repository<Security>,
    @InjectRepository(SecuritySourceConfig)
    private sourceConfigRepository: Repository<SecuritySourceConfig>,
    private collectorService: CollectorService, // ADD
  ) {}

  // REMOVE any initData() method or auto-initialization from constructor
}
```

- [ ] **Step 5: Update initStock method**

Edit `apps/mist/src/security/security.service.ts`:

```typescript
async initStock(initStockDto: InitStockDto): Promise<Security> {
  // Create security
  const security = this.securityRepository.create(initStockDto);
  await this.securityRepository.save(security);

  // Call CollectorService to collect historical data
  if (initStockDto.periods && initStockDto.periods.length > 0) {
    await this.collectorService.collectKLine(
      initStockDto.code,
      initStockDto.periods[0], // Use first period
      new Date(initStockDto.startDate || Date.now() - 30 * 24 * 60 * 60 * 1000),
      new Date(),
    );
  }

  return security;
}
```

- [ ] **Step 6: Read security.controller.ts**

```bash
cat apps/mist/src/security/security.controller.ts
```

- [ ] **Step 7: Update security.controller.ts**

Edit `apps/mist/src/security/security.controller.ts`:

```typescript
import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  UseInterceptors,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { TransformInterceptor } from '../interceptors/transform.interceptor'; // ADD
import { AllExceptionsFilter } from '../filters/all-exceptions.filter'; // ADD
import { SecurityService } from './security.service';
import { InitStockDto } from './dto/init-stock.dto';
import { AddSourceDto } from './dto/add-source.dto';
import { Security } from './security.entity';

@ApiTags('security v1')
@Controller('security/v1')
@UseInterceptors(TransformInterceptor) // ADD
@UseFilters(AllExceptionsFilter) // ADD
export class SecurityController {
  constructor(private readonly securityService: SecurityService) {}

  @Post('init')
  async initStock(@Body() initStockDto: InitStockDto): Promise<Security> {
    return await this.securityService.initStock(initStockDto);
  }

  @Post('add-source')
  async addSource(@Body() addSourceDto: AddSourceDto): Promise<Security> {
    return await this.securityService.addSource(addSourceDto);
  }

  @Get('all') // CHANGE from @Get() to @Get('all')
  async getAllStocks(): Promise<Security[]> {
    return await this.securityService.findAll();
  }

  @Get(':code')
  async getStock(@Param('code') code: string): Promise<Security> {
    return await this.securityService.findByCode(code);
  }

  @Put(':code/deactivate')
  async deactivateStock(@Param('code') code: string): Promise<void> {
    await this.securityService.deactivateStock(code);
  }

  @Put(':code/activate')
  async activateStock(@Param('code') code: string): Promise<void> {
    await this.securityService.activateStock(code);
  }

  @Get(':code/source')
  async getSource(@Param('code') code: string) {
    return await this.securityService.getSourceFormat(code);
  }
}
```

- [ ] **Step 8: Run security tests**

```bash
pnpm test -- security
```

Expected: Tests pass (may need updates for CollectorService integration)

- [ ] **Step 9: Commit SecurityModule updates**

```bash
git add apps/mist/src/security/
git commit -m "refactor(security): integrate CollectorService and update endpoints

- Import CollectorModule to use CollectorService
- Inject CollectorService into SecurityService
- Remove auto-initialization logic
- Change @Get() to @Get('all') for getting all stocks
- Add unified response format decorators

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 6: Update Indicator and Chan Controllers with Response Decorators

**Files:**
- Modify: `apps/mist/src/indicator/indicator.controller.ts`
- Modify: `apps/mist/src/chan/chan.controller.ts`

- [ ] **Step 1: Update indicator.controller.ts**

Edit `apps/mist/src/indicator/indicator.controller.ts`:

```typescript
import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { TransformInterceptor } from '../interceptors/transform.interceptor'; // ADD
import { AllExceptionsFilter } from '../filters/all-exceptions.filter'; // ADD
import { IndicatorService } from './indicator.service';
// ... other imports

@ApiTags('indicator')
@Controller('indicator')
@UseInterceptors(TransformInterceptor) // ADD
@UseFilters(AllExceptionsFilter) // ADD
export class IndicatorController {
  // ... rest of controller
}
```

- [ ] **Step 2: Update chan.controller.ts**

Edit `apps/mist/src/chan/chan.controller.ts`:

```typescript
import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { TransformInterceptor } from '../interceptors/transform.interceptor'; // ADD
import { AllExceptionsFilter } from '../filters/all-exceptions.filter'; // ADD
import { ChanService } from './chan.service';
// ... other imports

@ApiTags('chan')
@Controller('chan')
@UseInterceptors(TransformInterceptor) // ADD
@UseFilters(AllExceptionsFilter) // ADD
export class ChanController {
  // ... rest of controller
}
```

- [ ] **Step 3: Run tests**

```bash
pnpm test -- indicator
pnpm test -- chan
```

Expected: All tests pass

- [ ] **Step 4: Commit controller updates**

```bash
git add apps/mist/src/indicator/indicator.controller.ts
git add apps/mist/src/chan/chan.controller.ts
git commit -m "refactor: add unified response format to Indicator and Chan controllers

- Add @UseInterceptors(TransformInterceptor)
- Add @UseFilters(AllExceptionsFilter)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 7: Update Swagger Documentation

**Files:**
- Modify: `apps/mist/src/main.ts`

- [ ] **Step 1: Read main.ts**

```bash
cat apps/mist/src/main.ts
```

- [ ] **Step 2: Update Swagger tags**

Edit `apps/mist/src/main.ts`:

```typescript
const config = new DocumentBuilder()
  .setTitle('Mist API')
  .setDescription(`Stock market analysis and alert system

## Multi-Data Source Support

This API supports multiple data sources:
- **ef** - East Money (default)
- **tdx** - TongDaXin
- **mqmt** - MaQiMaTe

## API Endpoints

- **Health**: `GET /app/hello`
- **Indicators**: `POST /indicator/*` (MACD, RSI, KDJ, K-line data)
- **Chan Theory**: `POST /chan/*` (Merge K, Bi, Fenxing, Channel)
- **Security**: `GET|POST|PUT /security/v1/*` (v1 versioned)
`)
  .setVersion('2.0')
  .addTag('health', 'Health check')
  .addTag('indicator', 'Technical indicators and K-line data')
  .addTag('chan', 'Chan Theory analysis')
  .addTag('security v1', 'Security management (v1)')
  // REMOVE: .addTag('k', 'K-line data')
  // REMOVE: .addTag('collector v1', 'Data collection')
  .addServer('http://localhost:8001', 'Local development')
  .build();
```

- [ ] **Step 3: Commit documentation update**

```bash
git add apps/mist/src/main.ts
git commit -m "docs: update Swagger documentation

- Remove deprecated tags (k, collector v1)
- Update description to reflect new API structure
- Clarify endpoint organization

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 8: Generate Database Migration

**Files:**
- Create: `apps/mist/src/migrations/*` (auto-generated)

- [ ] **Step 1: Generate migration**

```bash
cd /Users/xiyugao/code/mist/mist
pnpm run migration:generate -- -n RefactorModuleConsolidation
```

Expected: New migration file created

- [ ] **Step 2: Review generated migration**

```bash
ls -lt apps/mist/src/migrations/ | head -5
```

- [ ] **Step 3: Commit migration**

```bash
git add apps/mist/src/migrations/
git commit -m "migration: generate schema migration for module consolidation

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 9: Update Documentation

**Files:**
- Modify: `apps/mist/CLAUDE.md`

- [ ] **Step 1: Update CLAUDE.md**

Edit `apps/mist/CLAUDE.md` to reflect:
- Removed DataModule, KModule, TrendModule
- Collector is now service-only
- Updated endpoint paths
- New module responsibilities

- [ ] **Step 2: Commit documentation**

```bash
git add apps/mist/CLAUDE.md
git commit -m "docs: update CLAUDE.md after module consolidation

- Document removed modules
- Update module responsibilities
- Clarify service-only modules

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 10: Comprehensive Testing

**Files:**
- No file modifications, just testing

- [ ] **Step 1: Run all unit tests**

```bash
pnpm test
```

Expected: All tests pass

- [ ] **Step 2: Run E2E tests**

```bash
pnpm run test:e2e
```

Expected: E2E tests pass

- [ ] **Step 3: Test indicator endpoints**

```bash
# Start the application
pnpm run start:dev:mist &

# Test K-line endpoint
curl -X POST http://localhost:8001/indicator/k \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "000001",
    "period": "daily",
    "startDate": "2024-01-01T00:00:00Z",
    "endDate": "2024-01-31T00:00:00Z"
  }'
```

Expected: JSON response with unified format

- [ ] **Step 4: Test chan endpoints**

```bash
curl -X POST http://localhost:8001/chan/bi \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "000001",
    "period": "daily",
    "startDate": "2024-01-01T00:00:00Z",
    "endDate": "2024-01-31T00:00:00Z"
  }'
```

Expected: JSON response with Bi data in unified format

- [ ] **Step 5: Test security endpoint**

```bash
curl http://localhost:8001/security/v1/all
```

Expected: JSON array of securities in unified format

- [ ] **Step 6: Verify mcp-server integration**

```bash
cd /Users/xiyugao/code/mist/mist/apps/mcp-server
pnpm run start:dev:mcp-server &
```

Expected: mcp-server starts successfully, can import ChanModule and IndicatorModule

- [ ] **Step 7: Stop test servers**

```bash
pkill -f "nest start"
```

---

## Task 11: Final Verification and Cleanup

**Files:**
- Various cleanup tasks

- [ ] **Step 1: Check for any remaining references**

```bash
grep -r "DataModule\|KModule\|TrendModule" apps/mist/src/ --exclude-dir=node_modules
```

Expected: No references found

- [ ] **Step 2: Check for deleted endpoints**

```bash
grep -r "market-data\|/collector/v1" apps/mist/src/ --exclude-dir=node_modules
```

Expected: No references found (except in comments or documentation)

- [ ] **Step 3: Verify all module exports**

```bash
find apps/mist/src -name "*.module.ts" -exec grep -l "exports:" {} \;
```

Expected: Finds indicator.module.ts, chan.module.ts, collector.module.ts with exports

- [ ] **Step 3.1: Verify SecurityModule has no exports**

```bash
grep -n "exports:" apps/mist/src/security/security.module.ts
```

Expected: No output (SecurityModule should not export)

- [ ] **Step 4: Final build**

```bash
pnpm run build
```

Expected: Build succeeds

- [ ] **Step 5: Create summary commit**

```bash
git add -A
git commit -m "refactor: complete mist app module consolidation

Summary of changes:
- Merged TrendModule into ChanModule
- Deleted DataModule (replaced with direct TypeORM in IndicatorModule)
- Deleted KModule (functionality in IndicatorModule)
- Removed Collector HTTP endpoints (service-only now)
- Updated SecurityModule to integrate CollectorService
- Applied unified response format to Indicator, Chan, Security
- Updated Swagger documentation
- Generated database migration

All tests passing. Ready for deployment.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Success Criteria

After completing all tasks, verify:

- [ ] All deleted modules removed without breaking references
- [ ] TrendModule functionality working in ChanModule
- [ ] All HTTP endpoints return unified response format (except health check)
- [ ] SecurityService can call CollectorService successfully
- [ ] mcp-server can import and use ChanModule and IndicatorModule
- [ ] All unit tests pass
- [ ] All E2E tests pass
- [ ] Documentation updated
- [ ] Build succeeds
- [ ] No remaining references to deleted modules

---

## Testing Commands Reference

```bash
# Run all tests
pnpm test

# Run specific module tests
pnpm test -- indicator
pnpm test -- chan
pnpm test -- security
pnpm test -- collector

# Run E2E tests
pnpm run test:e2e

# Build application
pnpm run build

# Start dev server
pnpm run start:dev:mist

# Start mcp-server
pnpm run start:dev:mcp-server

# Generate migration
pnpm run migration:generate -- -n MigrationName

# Run migration
pnpm run migration:run
```

---

## Rollback Procedures

**If critical failure occurs during refactoring:**

### Option 1: Git Reset (Recommended if commits are pushed)

```bash
# Reset to specific number of commits back
git reset --hard HEAD~N  # Where N is number of commits to revert

# Example: reset 5 commits
git reset --hard HEAD~5

# Verify reset
git log --oneline -5
```

### Option 2: Reset to Backup Branch

```bash
# Checkout backup branch created in pre-flight checklist
git checkout backup-before-refactor-YYYYMMDD

# Or create new branch from backup
git checkout -b recovery-branch
git reset --hard backup-before-refactor-YYYYMMDD
```

### Option 3: Revert Specific Commits

```bash
# Revert last commit but keep changes
git revert HEAD

# Revert multiple commits
git revert HEAD~5..HEAD

# Push revert (if already pushed)
git push origin <branch> --force-with-lease
```

### Option 4: Stash and Clean

```bash
# Stash current changes
git stash push -u -m "WIP: failed refactor"

# Clean working directory
git clean -fd

# Pop stash if needed
git stash pop
```

### Recovery Steps After Rollback

1. **Verify application starts**
   ```bash
   pnpm run start:dev:mist
   ```

2. **Run tests to confirm**
   ```bash
   pnpm test
   ```

3. **Check for data corruption**
   ```bash
   # Verify database integrity
   mysql -u root -p mist -e "SELECT COUNT(*) FROM k;"
   mysql -u root -p mist -e "SELECT COUNT(*) FROM security;"
   ```

4. **Document what went wrong**
   ```bash
   # Create issue report
   git log --oneline -10 > rollback-report.txt
   git diff HEAD~5 > changes-diff.txt
   ```

---

## Error Scenario Testing

**Test exception propagation from SecurityService → CollectorService**

- [ ] **Test Error Scenario 1: Invalid stock code**

```bash
# Start application
pnpm run start:dev:mist &
SERVER_PID=$!

# Wait for startup
sleep 10

# Test with invalid code
curl -X POST http://localhost:8001/security/v1/init \
  -H "Content-Type: application/json" \
  -d '{
    "code": "INVALID_CODE_999",
    "name": "Invalid Test Stock",
    "type": "stock",
    "periods": ["daily"],
    "startDate": "2024-01-01T00:00:00Z",
    "endDate": "2024-01-31T00:00:00Z"
  }'

# Expected response:
{
  "success": false,
  "code": 1002,
  "message": "Stock not found or data source error",
  "timestamp": "...",
  "requestId": "err-..."
}

# Cleanup
kill $SERVER_PID
```

- [ ] **Test Error Scenario 2: Data source unavailable**

```bash
# Stop AKTools if running
pkill -f "aktools"

# Try to initialize stock
curl -X POST http://localhost:8001/security/v1/init \
  -H "Content-Type: application/json" \
  -d '{
    "code": "000001",
    "name": "Test Stock",
    "type": "stock",
    "periods": ["daily"]
  }'

# Expected: Error response indicating data source unavailable
# Should NOT crash the server

# Cleanup
pkill -f "nest start"
```

- [ ] **Test Error Scenario 3: Missing required fields**

```bash
curl -X POST http://localhost:8001/security/v1/init \
  -H "Content-Type: application/json" \
  -d '{
    "code": "000001"
    // Missing required fields: name, type
  }'

# Expected: Validation error with specific field names
{
  "success": false,
  "code": 1001,
  "message": "Validation failed: name is required, type is required",
  "timestamp": "...",
  "requestId": "..."
}
```

---

## MCP Server Integration Verification

**After Task 2 (IndicatorModule update), verify mcp-server can import:**

```bash
cd /Users/xiyugao/code/mist/mist/apps/mcp-server

# Try to build mcp-server
pnpm run build

# Expected: Build succeeds without import errors
# If errors: Fix IndicatorModule exports before continuing
```

**After Task 1 (ChanModule merge), verify:**

```bash
cd /Users/xiyugao/code/mist/mist/apps/mcp-server

# Check imports still work
grep -r "ChanModule\|IndicatorModule" src/

# Try to build
pnpm run build

# Expected: Build succeeds, modules can be imported
```

---

**End of Implementation Plan**
