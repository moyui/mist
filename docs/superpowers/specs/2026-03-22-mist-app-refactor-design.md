# Mist App Refactoring Design

**Date**: 2026-03-22
**Author**: Claude (with user collaboration)
**Status**: Approved with Suggestions (Round 1)

## Overview

Refactor the `mist` application (port 8001) to clarify module responsibilities, remove redundant code, and establish clear boundaries between HTTP services and internal services.

## Goals

1. **Delete redundant modules**: DataModule, KModule, TrendModule
2. **Remove Collector HTTP endpoints**: Collector becomes a pure service module
3. **Clarify data access patterns**: Each module has a clear, single responsibility
4. **Maintain MCP integration**: Ensure mcp-server can continue using Service layer
5. **Apply consistent response formatting**: For external HTTP endpoints

## Current Architecture Issues

- **DataModule**: Creates confusion about where data queries should happen
- **KModule**: Duplicates functionality already in IndicatorModule
- **TrendModule**: Should be part of ChanModule
- **Collector HTTP endpoints**: Unnecessary when schedule can call Service directly
- **Unclear boundaries**: Mix of HTTP and Service responsibilities

## Proposed Architecture

### Module Structure

```
mist app (port 8001)
├── IndicatorModule  (HTTP + Service for mcp-server)
├── ChanModule       (HTTP + Service for mcp-server)
├── SecurityModule   (HTTP v1 + Service)
└── CollectorModule  (Service only, no HTTP)
```

### Module Responsibilities

#### IndicatorModule

**Purpose**: Provide technical indicators and K-line data

**HTTP Endpoints** (with unified response format):
```
POST /indicator/k        - K-line data query
POST /indicator/macd     - MACD indicator
POST /indicator/rsi      - RSI indicator
POST /indicator/kdj      - KDJ indicator
```

**Service Layer**:
- `findKData()` - Query K-line from database
- `runMACD()`, `runRSI()`, `runKDJ()`, etc. - Calculate indicators
- Exported for mcp-server use

**Data Access**: READ ONLY (K, Security tables)

#### ChanModule

**Purpose**: Chan Theory (缠论) calculations

**HTTP Endpoints** (with unified response format):
```
POST /chan/merge-k       - Merge K-lines
POST /chan/bi            - Identify Bi (strokes)
POST /chan/fenxing       - Identify Fenxing (fractals)
POST /chan/channel       - Identify Channels (Zhongshu)
```

**Service Layer**:
- `createBi()` - Calculate Bi from K-line array
- `getFenxings()` - Identify Fenxing patterns
- `mergeK()` - Merge K-lines (from TrendModule)
- Exported for mcp-server use

**Data Access**: NONE (pure computation, receives K[] as input)

**Note**: TrendModule functionality merged into this module

#### SecurityModule

**Purpose**: Stock/security management

**HTTP Endpoints** (with unified response format, v1):
```
POST   /security/v1/init              - Initialize a stock
POST   /security/v1/add-source        - Add data source
GET    /security/v1/all               - Get all stocks
GET    /security/v1/:code             - Get single stock
PUT    /security/v1/:code/deactivate  - Deactivate stock
PUT    /security/v1/:code/activate    - Activate stock
GET    /security/v1/:code/source      - Get source config
```

**Service Layer**:
- `initStock()` - Initialize a stock (calls Collector for historical data)
- `findAll()`, `findByCode()` - Query stocks
- `addSource()`, `deactivateStock()`, `activateStock()` - Stock management

**Data Access**: READ/WRITE (Security, SecuritySourceConfig tables)

**Dependencies**:
- Uses CollectorService to collect historical data during initialization

#### CollectorModule

**Purpose**: Data collection and storage

**HTTP Endpoints**: NONE (Service only)

**Service Layer**:
- `collectKLine()` - Fetch data from source and write to database
- `getCollectionStatus()` - Check collection status
- `removeDuplicateData()` - Clean up duplicates
- Exported for SecurityModule and schedule app use

**Data Access**: WRITE ONLY (K table)

**Callers**:
- SecurityModule (during stock initialization)
- schedule app (periodic collection tasks)

### Deleted Modules

#### DataModule

**Reason**: Creates confusion. Each module should handle its own data access.

**Migration**:
- `findBars()` → Already implemented in IndicatorService
- `initData()` → Deleted (no auto-initialization)
- `index()` → Use `GET /security/v1/all`
- `findIndexPeriodById()`, `findIndexDailyById()` → Deleted

#### KModule (market-data)

**Reason**: Duplicates IndicatorModule's K-line query functionality

**Migration**:
- Use `POST /indicator/k` for all K-line queries

#### TrendModule

**Reason**: Belongs as part of ChanModule

**Migration**:
- Merge TrendModule services into `src/chan/services/`
- Update ChanModule providers

## HTTP Endpoint Changes

### Deleted Endpoints

```
DELETE /market-data/bars              (KModule)
DELETE /collector/v1/collect          (Collector - no HTTP)
DELETE /collector/v1/status/:code/:period
DELETE /collector/v1/remove-duplicates/:code/:period
DELETE /data/index                    (DataModule)
DELETE /data/index-period             (DataModule)
DELETE /data/index-daily              (DataModule)
```

### Modified Endpoints

```
GET /security/v1  →  GET /security/v1/all
```

### Unchanged Endpoints

All Indicator, Chan, and other Security endpoints remain unchanged.

## Unified Response Format

### Applied To

- ✅ IndicatorController
- ✅ ChanController
- ✅ SecurityController

### Not Applied To

- ❌ AppController (`GET /app/hello` - simple health check)
- ❌ CollectorModule (no HTTP endpoints)

### Format

```typescript
{
  "success": true,
  "code": 200,
  "message": "SUCCESS",
  "data": { /* actual response data */ },
  "timestamp": "2026-03-22T10:30:00.000Z",
  "requestId": "http-1710819800000-abc123"
}
```

## Implementation Details

### Module Exports

```typescript
// IndicatorModule
@Module({
  imports: [
    TypeOrmModule.forFeature([K, Security]),  // ✅ Add direct entity access
    UtilsModule,  // ✅ Add for DataSourceService
    TimezoneModule,
  ],
  controllers: [IndicatorController],
  providers: [IndicatorService],
  exports: [IndicatorService],  // ✅ For mcp-server
})

// ChanModule
@Module({
  imports: [UtilsModule],  // ✅ Remove TrendModule import
  controllers: [ChanController],
  providers: [
    ChanService,
    KMergeService,
    ChannelService,
    TrendService,  // ✅ Add merged TrendService
  ],
  exports: [
    ChanService,
    KMergeService,
    ChannelService,
    TrendService,  // ✅ Export for mcp-server
  ],
})

// SecurityModule
@Module({
  imports: [
    TypeOrmModule.forFeature([Security, SecuritySourceConfig]),
    CollectorModule,  // ✅ Import to use CollectorService
  ],
  controllers: [SecurityController],
  providers: [SecurityService],
  // ❌ No export (not used by other apps)
})

// CollectorModule
@Module({
  imports: [TypeOrmModule.forFeature([K, Security])],
  // ❌ No controller
  providers: [CollectorService],
  exports: [CollectorService],  // ✅ For SecurityModule and schedule
})
```

**Critical Module Dependencies**:
- **IndicatorModule**: Must add `TypeOrmModule.forFeature([K, Security])` and `UtilsModule` to replace DataModule
- **ChanModule**: Must remove `TrendModule` import and add `TrendService` to providers
- **SecurityModule**: Must import `CollectorModule` to use CollectorService

### Data Access Patterns

```typescript
// IndicatorService - READ
constructor(
  @InjectRepository(K) private kRepository: Repository<K>,
  @InjectRepository(Security) private securityRepository: Repository<Security>,
) {}

// ChanService - NO DATABASE ACCESS
// Pure computation, receives K[] as input

// SecurityService - READ/WRITE
constructor(
  @InjectRepository(Security) private securityRepository: Repository<Security>,
  @InjectRepository(SecuritySourceConfig) private sourceConfigRepository: Repository<SecuritySourceConfig>,
  private collectorService: CollectorService,  // Inject to call
) {}

// CollectorService - WRITE
constructor(
  @InjectRepository(K) private kRepository: Repository<K>,
  @InjectRepository(Security) private securityRepository: Repository<Security>,
) {}
```

### Error Handling

**Principle**: Let exceptions propagate naturally to global exception filter

```typescript
// CollectorService
async collectKLine(...): Promise<void> {
  // Don't catch exceptions, let them propagate
  const data = await this.fetchFromSource(...);
  await this.kRepository.save(data);
}

// SecurityService
async initStock(...): Promise<Security> {
  // No try-catch needed - let exceptions propagate naturally
  const security = this.securityRepository.create(dto);
  await this.securityRepository.save(security);

  // Call Collector - exceptions will propagate to global filter
  await this.collectorService.collectKLine(...);

  return security;
}
```

## Implementation Steps

### Step 1: Merge TrendModule into ChanModule

1. **Review TrendModule structure**
   ```bash
   ls -la src/trend/
   # Check services, VOs, and any dependencies
   ```

2. **Search for TrendService imports**
   ```bash
   grep -r "TrendService" --exclude-dir=trend src/
   # Find all files importing TrendService
   ```

3. **Copy TrendService to ChanModule**
   - Copy `src/trend/trend.service.ts` to `src/chan/services/trend.service.ts`
   - Move or merge `src/trend/vo/judge-trend.vo.ts` to `src/chan/vo/judge-trend.vo.ts`
   - Update all imports

4. **Update ChanModule**
   - Remove `TrendModule` from imports
   - Add `TrendService` to providers
   - Add `TrendService` to exports
   - Update any references

5. **Run tests to verify merge**
   ```bash
   pnpm test -- trend
   pnpm test -- chan
   ```

6. **Delete `src/trend/` directory**
   ```bash
   rm -rf src/trend/
   ```

### Step 2: Delete DataModule

1. **Update IndicatorModule**
   - Remove `DataModule` from imports
   - Add `TypeOrmModule.forFeature([K, Security])`
   - Add `UtilsModule` (for DataSourceService)
   - Verify IndicatorService has all necessary data access methods

2. **Update AppModule**
   - Remove `DataModule` from imports

3. **Search for remaining references**
   ```bash
   grep -r "DataService" --exclude-dir=data src/
   grep -r "DataModule" src/
   ```

4. **Delete `src/data/` directory**
   ```bash
   rm -rf src/data/
   ```

5. **Run tests to verify**
   ```bash
   pnpm test -- indicator
   ```

### Step 3: Delete KModule

1. Remove from AppModule imports
2. Delete `src/k/` directory
3. Check for remaining references

### Step 4: Remove Collector HTTP Endpoints

1. Remove CollectorController from CollectorModule
2. Delete `src/collector/collector.controller.ts`
3. Delete related test files

### Step 5: Update SecurityModule

1. **Import CollectorModule**
   ```typescript
   @Module({
     imports: [
       TypeOrmModule.forFeature([Security, SecuritySourceConfig]),
       CollectorModule,  // ✅ Import to use CollectorService
     ],
     // ...
   })
   ```

2. **Update SecurityService**
   - Inject `CollectorService`
   - Remove auto-initialization logic from constructor
   - Update `initStock()` to call CollectorService

3. **Modify SecurityController**
   - Change `@Get()` to `@Get('all')`
   - Add unified response format decorators
   - Update Swagger documentation

4. **Run tests to verify**
   ```bash
   pnpm test -- security
   ```

### Step 6: Modify Security Endpoints

1. Change `@Get()` to `@Get('all')` in SecurityController
2. Add unified response decorators
3. Inject CollectorService into SecurityService
4. Remove auto-initialization logic

### Step 7: Generate Database Migration

After structural changes, generate a database migration:

```bash
pnpm run migration:generate -- -n RefactorModuleConsolidation
```

This ensures schema consistency after entity relationship changes.

### Step 8: Update Module Exports

1. Add exports to IndicatorModule
2. Verify ChanModule exports
3. Remove CollectorModule controller registration

### Step 9: Verify Entity Exports

Ensure entities can be imported by multiple modules:

```typescript
// Should work without errors
import { K, Security } from '@app/shared-data';
import { SecuritySourceConfig } from '@app/shared-data';
```

### Step 10: Update Documentation

1. Update Swagger documentation in main.ts
2. Update CLAUDE.md
3. Update test files

### Step 11: Comprehensive Testing

1. Unit tests
2. Integration tests
3. mcp-server integration tests
4. Manual HTTP endpoint testing

## Testing Strategy

### Unit Tests

**Delete**:
- `src/data/**/*.spec.ts`
- `src/k/**/*.spec.ts`
- `src/trend/**/*.spec.ts`
- `src/collector/collector.controller.spec.ts`

**Update**:
- `src/indicator/indicator.service.spec.ts` - Verify exports and data access
- `src/chan/chan.service.spec.ts` - Verify Trend merge functionality
- `src/chan/chan.spec.ts` - Add TrendModule tests after merge
- `src/security/security.controller.spec.ts` - Verify endpoint changes
- `src/security/security.service.spec.ts` - Verify Collector integration
- **Add**: Integration test for SecurityService → CollectorService calls
- **Add**: Test for TrendModule functionality after merging to ChanModule

### Integration Tests

**Verify**:
1. `POST /indicator/k` returns data correctly
2. `POST /chan/bi` calculates correctly
3. TrendModule functionality works after merge
4. `GET /security/v1/all` returns all stocks
5. SecurityService can call CollectorService
6. CollectorService writes to database
7. Unified response format applied correctly

### mcp-server Integration

**Verify**:
1. mcp-server starts successfully
2. ChanMcpService can call ChanService
3. IndicatorMcpService can call IndicatorService
4. MCP tools work correctly

## Migration Guide

### For Frontend/HTTP Clients

**Change**:
```typescript
// Old
GET /security/v1

// New
GET /security/v1/all
```

**Use**:
```typescript
// For K-line data
POST /indicator/k

// Instead of deleted endpoint
// POST /market-data/bars (deleted)
```

### For Schedule App

**Change**:
```typescript
// Old: HTTP call
POST http://localhost:8001/collector/v1/collect

// New: Direct service call
import { CollectorModule, CollectorService } from '@mist/collector';

// In schedule app module
imports: [CollectorModule],

// In service
constructor(private collectorService: CollectorService) {}
await this.collectorService.collectKLine(...);
```

### For mcp-server

**No changes needed** - continues to import and use Service layer

## Files to Modify

### Delete

```
src/data/
src/k/
src/trend/
src/collector/collector.controller.ts
src/collector/collector.controller.spec.ts
```

### Modify

```
src/app.module.ts
src/collector/collector.module.ts
src/security/security.controller.ts
src/security/security.service.ts
src/chan/chan.module.ts
src/indicator/indicator.module.ts
src/main.ts
```

### Create

```
src/chan/services/[merged TrendModule services]
```

## Risks and Mitigations

### Risk 1: Breaking existing HTTP clients

**Mitigation**: Clear documentation of endpoint changes, provide migration guide

### Risk 2: mcp-server integration breaks

**Mitigation**: Verify module exports are correct, run integration tests

### Risk 3: Missing functionality after deleting modules

**Mitigation**: Comprehensive audit of deleted modules, ensure all features migrated

### Risk 4: Collector exception handling

**Mitigation**: Clear documentation of error handling strategy, test exception propagation

## Success Criteria

- [ ] All deleted modules removed without breaking references
- [ ] TrendModule functionality working in ChanModule
- [ ] All HTTP endpoints return unified response format (except health check)
- [ ] SecurityService can call CollectorService successfully
- [ ] mcp-server integration works without changes
- [ ] All tests pass
- [ ] Documentation updated

## Open Questions

None - all requirements clarified during brainstorming.

## Appendix: Directory Structure After Refactor

```
mist app (port 8001)
├── src/
│   ├── chan/              ✅ ChanModule
│   │   ├── services/
│   │   │   ├── chan.service.ts
│   │   │   ├── k-merge.service.ts
│   │   │   ├── channel.service.ts
│   │   │   └── [merged TrendModule services]
│   │   ├── dto/
│   │   ├── vo/
│   │   └── chan.module.ts
│   │
│   ├── collector/         ✅ CollectorModule (Service only)
│   │   ├── dto/
│   │   ├── interfaces/
│   │   ├── collector.service.ts
│   │   └── collector.module.ts
│   │
│   ├── indicator/         ✅ IndicatorModule
│   │   ├── dto/
│   │   ├── vo/
│   │   ├── indicator.service.ts
│   │   ├── indicator.controller.ts
│   │   └── indicator.module.ts
│   │
│   ├── security/          ✅ SecurityModule
│   │   ├── dto/
│   │   ├── security.service.ts
│   │   ├── security.controller.ts
│   │   └── security.module.ts
│   │
│   ├── sources/           ✅ Data source implementations
│   │   ├── east-money.source.ts
│   │   └── tdx.source.ts
│   │
│   ├── filters/           ✅ Global filters
│   ├── interceptors/      ✅ Global interceptors
│   ├── dto/               ✅ Global DTOs
│   ├── interfaces/        ✅ Global interfaces
│   ├── config/            ✅ Configuration
│   ├── migrations/        ✅ Database migrations
│   │
│   ├── app.controller.ts
│   ├── app.service.ts
│   ├── app.module.ts
│   └── main.ts
```

---

**End of Design Document**
