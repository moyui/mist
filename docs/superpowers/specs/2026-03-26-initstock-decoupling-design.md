# initStock Decoupling Design

**Date**: 2026-03-26
**Author**: Claude
**Status**: Draft

## Overview

Decouple the `initStock()` method in `SecurityService` from K-line data collection and source configuration initialization, making it responsible only for creating the Security entity itself.

## Problem Statement

The current `initStock()` method has three responsibilities:
1. Creating the Security entity
2. Creating SecuritySourceConfig (if source provided)
3. Collecting historical K-line data (if periods provided)

This violates Single Responsibility Principle and couples unrelated concerns:
- Stock initialization should only create the stock record
- Source configuration should be managed separately
- Data collection should be triggered independently

## Design Goals

1. **Separation of Concerns**: Each method should have one clear responsibility
2. **Minimal Changes**: Use minimal refactor approach to reduce risk
3. **API Clarity**: Clear distinction between stock creation and configuration
4. **Backward Compatibility**: Minimize breaking changes to existing consumers

## Proposed Changes

### 1. Simplify InitStockDto

**Remove fields:**
- `periods?: number[]` - No longer needed for K-line collection
- `source?: SourceConfig` - Source config will be added separately

**Result DTO:**
```typescript
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

### 2. Simplify initStock() Method

**Remove logic:**
- Lines 56-67: SecuritySourceConfig creation
- Lines 69-78: K-line collection via CollectorService

**Updated method:**
```typescript
async initStock(initStockDto: InitStockDto): Promise<Security> {
  const formattedCode = this.formatCode(initStockDto.code);

  const existingStock = await this.securityRepository.findOne({
    where: { code: formattedCode },
  });

  if (existingStock) {
    throw new ConflictException(
      `Stock with code ${formattedCode} already exists`,
    );
  }

  const stock = this.securityRepository.create({
    code: formattedCode,
    name: initStockDto.name || '',
    type: initStockDto.type,
    status: SecurityStatus.ACTIVE,
  });

  return await this.securityRepository.save(stock);
}
```

### 3. Implement addSource() Method

**Current state**: Method exists but only returns the stock without creating source config.

**Updated implementation:**
```typescript
async addSource(addSourceDto: AddSourceDto): Promise<Security> {
  const formattedCode = this.formatCode(addSourceDto.code);

  const stock = await this.securityRepository.findOne({
    where: { code: formattedCode },
  });

  if (!stock) {
    throw new NotFoundException(`Stock with code ${formattedCode} not found`);
  }

  // Create source config
  const dataSource = this.mapSourceStringToDataSource(addSourceDto.source.type);
  const sourceConfig = this.sourceConfigRepository.create({
    security: stock,
    source: dataSource,
    formatCode: addSourceDto.source.config || '{}',
  });
  await this.sourceConfigRepository.save(sourceConfig);

  return stock;
}
```

### 4. Remove Unused Helper Methods

Remove the following private method which is no longer needed:
- `mapMinutesToPeriod()` - Used only for K-line collection

**Keep:**
- `mapSourceStringToDataSource()` - Still needed by addSource()

### 5. Update Service Dependencies

**Remove dependency:**
- `CollectorService` - No longer needed in SecurityService

**Update constructor:**
```typescript
constructor(
  @InjectRepository(Security)
  private readonly securityRepository: Repository<Security>,
  @InjectRepository(SecuritySourceConfig)
  private readonly sourceConfigRepository: Repository<SecuritySourceConfig>,
) {}
```

## API Changes

### POST /v1/security/init

**Before:**
```json
{
  "code": "000001.SH",
  "name": "平安银行",
  "type": "stock",
  "periods": [1, 5, 15, 30, 60],
  "source": {
    "type": "aktools",
    "config": "{}"
  }
}
```

**After:**
```json
{
  "code": "000001.SH",
  "name": "平安银行",
  "type": "stock"
}
```

### POST /v1/security/add-source

**No changes to API**, but implementation will now create the source config:

```json
{
  "code": "000001.SH",
  "source": {
    "type": "aktools",
    "config": "{}"
  },
  "periods": [1, 5, 15, 30, 60]
}
```

**Note**: The `periods` field in `AddSourceDto` is currently not used. It could be repurposed for metadata or removed in a future refactor.

## Migration Path

For existing consumers of the `/v1/security/init` endpoint:

1. **Stock creation**: Call `/v1/security/init` with simplified payload
2. **Source configuration**: Call `/v1/security/add-source` separately
3. **Data collection**: Trigger via collector endpoints or scheduler

**Example migration:**
```typescript
// Before (single call)
await initStock({
  code: '000001.SH',
  type: SecurityType.STOCK,
  periods: [5, 30],
  source: { type: SourceType.AKTOOLS }
});

// After (multiple calls)
await initStock({
  code: '000001.SH',
  type: SecurityType.STOCK
});

await addSource({
  code: '000001.SH',
  source: { type: SourceType.AKTOOLS }
});
```

## Testing Considerations

1. **Unit tests**: Update `security.service.spec.ts` to reflect simplified initStock
2. **E2E tests**: Update `security.controller.spec.ts` to use two-step initialization
3. **Integration tests**: Verify source config is created correctly via addSource

## Benefits

1. **Clear separation**: Stock creation is now independent of data collection and source config
2. **Flexibility**: Consumers can configure sources and collect data on their own schedule
3. **Testability**: Simpler initStock() is easier to test
4. **Maintainability**: Each method has a single, clear responsibility

## Future Considerations

1. **AddSourceDto periods field**: Currently unused; consider removing or repurposing
2. **Multiple sources**: Could extend addSource() to support multiple data sources per stock
3. **Source config CRUD**: May need update/delete endpoints for source management
