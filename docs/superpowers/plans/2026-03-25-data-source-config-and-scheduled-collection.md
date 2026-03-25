# Data Source Configuration and Scheduled Collection Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement security-level data source configuration (方案B) and scheduled K-line data collection with East Money-specific time window and merge logic, while supporting future WebSocket-based data sources.

**Architecture:**
- **Data Source Configuration (方案B)**: Each security can have its own data source configurations with priority. SecuritySourceConfig entity stores per-source settings, and CollectorService queries this before choosing data source.
- **Scheduled Collection**: DataCollectionScheduler manages IDataCollectionStrategy implementations (polling for East Money, streaming for TDX/miniQMT). Only East Money uses time window filtering and K-line merging.
- **East Money Specifics**: EastMoneyTimeWindowStrategy calculates collection windows (e.g., 9:32 collects 9:30-9:31 data), EastMoneyKLineMergeService merges data for special times (market open, lunch break).

**Tech Stack:** NestJS, TypeORM, MySQL, node-cron, @nestjs/schedule, date-fns, date-fns-tz

---

## Task 1: Implement Data Source Selection Logic (方案B)

**Files:**
- Modify: `apps/mist/src/collector/collector.service.ts`
- Modify: `apps/mist/src/collector/collector.module.ts`
- Test: `apps/mist/src/collector/collector.service.spec.ts`

**Goal:** Make CollectorService query SecuritySourceConfig before choosing data source

- [ ] **Step 0: Add SecuritySourceConfig repository injection to CollectorService**

```typescript
// collector.module.ts
@Module({
  imports: [
    TypeOrmModule.forFeature([K, Security, SecuritySourceConfig]), // ADD SecuritySourceConfig
    // ... other imports
  ],
  providers: [CollectorService],
  exports: [CollectorService],
})
export class CollectorModule {}

// collector.service.ts - Update constructor
@Injectable()
export class CollectorService {
  constructor(
    @InjectRepository(K)
    private readonly kRepository: Repository<K>,
    @InjectRepository(Security)
    private readonly securityRepository: Repository<Security>,
    @InjectRepository(SecuritySourceConfig) // ADD THIS
    private readonly sourceConfigRepository: Repository<SecuritySourceConfig>, // ADD THIS
    private readonly eastMoneySource: EastMoneySource,
    private readonly tdxSource: TdxSource,
    private readonly dataSourceService: DataSourceService, // ADD THIS
  ) {
    this.registerDataSources();
  }

  // ... rest of implementation
}
```

- [ ] **Step 1: Add failing test for data source selection with configuration**

```typescript
// collector.service.spec.ts
describe('CollectorService - Data Source Selection', () => {
  it('should use configured data source when SecuritySourceConfig exists', async () => {
    // Create security with TDX config (higher priority)
    const security = await securityRepository.save({
      code: 'TEST001',
      name: 'Test Security',
      type: SecurityType.STOCK,
      status: SecurityStatus.ACTIVE,
    });

    await sourceConfigRepository.save({
      security,
      source: DataSource.TDX,
      priority: 10,
      enabled: true,
      formatCode: 'test001',
    });

    // Mock collectorService to track which source is used
    const collectSpy = jest.spyOn(collectorService as any, 'getSourceForSecurity');

    await collectorService.collectKLine('TEST001', Period.FIVE_MIN, new Date(), new Date());

    expect(collectSpy).toHaveReturnedWith(DataSource.TDX);
  });

  it('should fall back to global default when no config exists', async () => {
    const security = await securityRepository.save({
      code: 'TEST002',
      name: 'Test Security 2',
      type: SecurityType.STOCK,
      status: SecurityStatus.ACTIVE,
    });

    // No SecuritySourceConfig created
    const result = await collectorService.collectKLine('TEST002', Period.FIVE_MIN, new Date(), new Date());

    // Should use global default (DataSource.EAST_MONEY from env)
    expect(result).toEqual(DataSource.EAST_MONEY);
  });

  it('should use highest priority source when multiple configs exist', async () => {
    const security = await securityRepository.save({
      code: 'TEST003',
      name: 'Test Security 3',
      type: SecurityType.STOCK,
      status: SecurityStatus.ACTIVE,
    });

    await sourceConfigRepository.save([
      {
        security,
        source: DataSource.EAST_MONEY,
        priority: 5,
        enabled: true,
        formatCode: 'test003',
      },
      {
        security,
        source: DataSource.TDX,
        priority: 10,
        enabled: true,
        formatCode: 'test003',
      },
    ]);

    const result = await collectorService.collectKLine('TEST003', Period.FIVE_MIN, new Date(), new Date());

    expect(result).toEqual(DataSource.TDX);
  });

  it('should skip disabled source configs', async () => {
    const security = await securityRepository.save({
      code: 'TEST004',
      name: 'Test Security 4',
      type: SecurityType.STOCK,
      status: SecurityStatus.ACTIVE,
    });

    await sourceConfigRepository.save([
      {
        security,
        source: DataSource.TDX,
        priority: 10,
        enabled: false, // Disabled
        formatCode: 'test004',
      },
      {
        security,
        source: DataSource.EAST_MONEY,
        priority: 5,
        enabled: true,
        formatCode: 'test004',
      },
    ]);

    const result = await collectorService.collectKLine('TEST004', Period.FIVE_MIN, new Date(), new Date());

    expect(result).toEqual(DataSource.EAST_MONEY);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd mist
pnpm test collector.service.spec.ts
```

Expected: FAIL - "Method not implemented: getSourceForSecurity"

- [ ] **Step 3: Implement data source selection logic in CollectorService**

```typescript
// collector.service.ts
@Injectable()
export class CollectorService {
  // ... existing code ...

  /**
   * Get data source for a security (方案B: Security-level configuration)
   * Uses shared DataSourceSelectionService to avoid DRY violation
   */
  private async getSourceForSecurity(security: Security): Promise<DataSource> {
    return this.dataSourceSelectionService.getDataSourceForSecurity(security);
  }

  /**
   * Modified collectKLine to use getSourceForSecurity
   */
  async collectKLine(
    stockCode: string,
    period: Period,
    startDate: Date,
    endDate: Date,
  ): Promise<void> {
    try {
      // Validate security exists
      const security = await this.securityRepository.findOne({
        where: { code: stockCode },
      });

      if (!security) {
        throw new NotFoundException(
          `Security with code ${stockCode} not found`,
        );
      }

      // Use configured data source instead of hardcoded EAST_MONEY
      const dataSource = await this.getSourceForSecurity(security);
      const sourceFetcher = this.sources.get(dataSource);

      if (!sourceFetcher) {
        throw new BadRequestException(
          `Data source ${dataSource} is not available`,
        );
      }

      // Check if period is supported
      if (!sourceFetcher.isSupportedPeriod(period)) {
        throw new BadRequestException(
          `Period ${period} is not supported by data source ${dataSource}`,
        );
      }

      // Fetch data from the source
      const fetchParams: KLineFetchParams = {
        code: stockCode,
        period,
        startDate,
        endDate,
      };

      const kLineData = await sourceFetcher.fetchKLine(fetchParams);

      if (kLineData.length === 0) {
        console.warn(
          `No data returned for security ${stockCode}, period ${period}, from ${startDate} to ${endDate}`,
        );
        return;
      }

      // Save data to database
      await this.saveKLineData(security, kLineData, dataSource, period);

      console.log(
        `Successfully collected ${kLineData.length} K-line records for ${stockCode}, period ${period} from ${dataSource}`,
      );
    } catch (error) {
      console.error(`Failed to collect K-line data for ${stockCode}:`, error);
      throw error;
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test collector.service.spec.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/mist/src/collector/collector.service.ts
git add apps/mist/src/collector/collector.service.spec.ts
git commit -m "feat: implement security-level data source configuration (方案B)"
```

---

## Task 2: Extract Shared Data Source Selection Logic

**Files:**
- Create: `libs/utils/src/services/data-source-selection.service.ts`
- Test: `libs/utils/src/services/data-source-selection.service.spec.ts`

**Goal:** Create shared service to avoid DRY violation (data source selection logic appears in both CollectorService and DataCollectionScheduler)

- [ ] **Step 1: Write failing tests for DataSourceSelectionService**

```typescript
// data-source-selection.service.spec.ts
describe('DataSourceSelectionService', () => {
  let service: DataSourceSelectionService;
  let mockSourceConfigRepository: jest.Mocked<Repository<SecuritySourceConfig>>;
  let mockDataSourceService: jest.Mocked<DataSourceService>;

  beforeEach(() => {
    mockSourceConfigRepository = createMockSourceConfigRepository();
    mockDataSourceService = createMockDataSourceService();
    service = new DataSourceSelectionService(
      mockSourceConfigRepository,
      mockDataSourceService,
    );
  });

  it('should return configured source when SecuritySourceConfig exists', async () => {
    const security = createTestSecurity(1);
    const configs = [
      {
        security,
        source: DataSource.TDX,
        priority: 10,
        enabled: true,
        formatCode: 'test',
      },
    ];

    mockSourceConfigRepository.find.mockResolvedValue(configs);

    const result = await service.getDataSourceForSecurity(security);

    expect(result).toBe(DataSource.TDX);
  });

  it('should return global default when no config exists', async () => {
    const security = createTestSecurity(1);
    mockSourceConfigRepository.find.mockResolvedValue([]);
    mockDataSourceService.getDefault.mockReturnValue(DataSource.EAST_MONEY);

    const result = await service.getDataSourceForSecurity(security);

    expect(result).toBe(DataSource.EAST_MONEY);
    expect(mockDataSourceService.getDefault).toHaveBeenCalled();
  });

  it('should return highest priority source when multiple configs exist', async () => {
    const security = createTestSecurity(1);
    const configs = [
      {
        security,
        source: DataSource.EAST_MONEY,
        priority: 5,
        enabled: true,
        formatCode: 'test',
      },
      {
        security,
        source: DataSource.TDX,
        priority: 10,
        enabled: true,
        formatCode: 'test',
      },
    ];

    mockSourceConfigRepository.find.mockResolvedValue(configs);

    const result = await service.getDataSourceForSecurity(security);

    expect(result).toBe(DataSource.TDX);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd libs/utils
pnpm test data-source-selection.service.spec.ts
```

Expected: FAIL - Class not implemented

- [ ] **Step 3: Implement DataSourceSelectionService**

```typescript
// data-source-selection.service.ts
import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { Security, SecuritySourceConfig, DataSource } from '@app/shared-data';
import { DataSourceService } from './data-source.service';

/**
 * Shared service for data source selection (方案B)
 *
 * Used by both CollectorService and DataCollectionScheduler to avoid DRY violation
 */
@Injectable()
export class DataSourceSelectionService {
  constructor(
    private readonly sourceConfigRepository: Repository<SecuritySourceConfig>,
    private readonly dataSourceService: DataSourceService,
  ) {}

  /**
   * Get data source for a security
   * Priority: SecuritySourceConfig (highest enabled priority) > Global Default
   *
   * @param security Security object
   * @returns Selected data source
   */
  async getDataSourceForSecurity(security: Security): Promise<DataSource> {
    // Query SecuritySourceConfig for this security
    const configs = await this.sourceConfigRepository.find({
      where: {
        security: { id: security.id },
        enabled: true,
      },
      relations: ['security'],
      order: {
        priority: 'DESC', // Highest priority first
      },
    });

    // If config exists, return highest priority source
    if (configs.length > 0) {
      return configs[0].source;
    }

    // Fall back to global default
    return this.dataSourceService.getDefault();
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test data-source-selection.service.spec.ts
```

Expected: PASS

- [ ] **Step 5: Export service from UtilsModule**

```typescript
// utils/src/utils.module.ts
import { DataSourceSelectionService } from './services/data-source-selection.service';

@Module({
  // ... existing imports ...
  providers: [
    // ... existing providers ...
    DataSourceSelectionService,
  ],
  exports: [
    // ... existing exports ...
    DataSourceSelectionService,
  ],
})
export class UtilsModule {}
```

- [ ] **Step 6: Commit**

```bash
git add libs/utils/src/services/data-source-selection.service.ts
git add libs/utils/src/services/data-source-selection.service.spec.ts
git add libs/utils/src/utils.module.ts
git commit -m "feat: extract shared data source selection logic to avoid DRY violation"
```

---

## Task 3: Update SecurityService.initStock to Create SecuritySourceConfig

**Files:**
- Modify: `apps/mist/src/security/security.service.ts`
- Test: `apps/mist/src/security/security.service.spec.ts`

**Goal:** When initializing a stock, create corresponding SecuritySourceConfig entries

- [ ] **Step 1: Add failing test for SecuritySourceConfig creation**

```typescript
// security.service.spec.ts
describe('SecurityService - initStock with Source Config', () => {
  it('should create SecuritySourceConfig when source is provided in InitStockDto', async () => {
    const initDto: InitStockDto = {
      code: '000001.SH',
      name: '平安银行',
      type: StockType.STOCK,
      periods: [5],
      source: {
        type: 'aktools',
        config: '{}',
      },
    };

    const result = await securityService.initStock(initDto);

    // Verify Security created
    expect(result.code).toBe('000001.SH');

    // Verify SecuritySourceConfig created
    const configs = await sourceConfigRepository.find({
      where: { security: { id: result.id } },
    });

    expect(configs).toHaveLength(1);
    expect(configs[0].source).toBe(DataSource.EAST_MONEY); // aktools maps to EAST_MONEY
    expect(configs[0].enabled).toBe(true);
    expect(configs[0].priority).toBe(0); // Default priority
  });

  it('should create multiple SecuritySourceConfig for multiple sources', async () => {
    // This test prepares for future multi-source support
    const initDto: InitStockDto = {
      code: '000002.SH',
      name: 'Test Stock',
      type: StockType.STOCK,
      periods: [5],
      source: {
        type: 'eastmoney',
        config: '{}',
      },
    };

    const security = await securityService.initStock(initDto);

    // Manually add a second config for testing
    await sourceConfigRepository.save({
      security,
      source: DataSource.TDX,
      priority: 10,
      enabled: true,
      formatCode: '000002',
    });

    const configs = await sourceConfigRepository.find({
      where: { security: { id: security.id } },
      order: { priority: 'DESC' },
    });

    expect(configs).toHaveLength(2);
    expect(configs[0].source).toBe(DataSource.TDX); // Higher priority
    expect(configs[1].source).toBe(DataSource.EAST_MONEY);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test security.service.spec.ts
```

Expected: FAIL - SecuritySourceConfig not created

- [ ] **Step 3: Update InitStockDto to support source configuration**

```typescript
// dto/init-stock.dto.ts
export class SourceConfig {
  @ApiProperty({ description: 'Data source type' })
  @IsEnum(['aktools', 'eastmoney', 'tdx', 'mqmt'])
  type!: string;

  @ApiProperty({ description: 'Source-specific configuration (JSON string)' })
  @IsString()
  config!: string;
}

export class InitStockDto {
  @ApiProperty({ description: 'Stock code (e.g., 000001.SH, 399006.SZ)' })
  code!: string;

  @ApiProperty({ description: 'Stock name', required: false })
  name?: string;

  @ApiProperty({ description: 'Stock type', enum: StockType })
  type!: StockType;

  @ApiProperty({ description: 'Supported periods (minutes)', required: false })
  periods?: number[];

  @ApiProperty({ description: 'Data source configuration', required: false })
  source?: SourceConfig;
}
```

- [ ] **Step 4: Update SecurityService.initStock to create SecuritySourceConfig**

```typescript
// security.service.ts
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

  // Convert DTO StockType to entity SecurityType
  const securityType = this.convertStockType(initStockDto.type);

  // Create security
  const stock = this.securityRepository.create({
    code: formattedCode,
    name: initStockDto.name || '',
    type: securityType,
    status: SecurityStatus.ACTIVE,
  });

  const savedStock = await this.securityRepository.save(stock);

  // Create SecuritySourceConfig if source is provided
  if (initStockDto.source) {
    const dataSource = this.mapSourceStringToDataSource(initStockDto.source.type);

    await this.sourceConfigRepository.save({
      security: savedStock,
      source: dataSource,
      formatCode: formattedCode,
      priority: 0, // Default priority
      enabled: true,
    });
  }

  // Call CollectorService to collect historical data for first period
  if (initStockDto.periods && initStockDto.periods.length > 0) {
    const period = this.mapMinutesToPeriod(initStockDto.periods[0]);
    await this.collectorService.collectKLine(
      formattedCode,
      period,
      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
      new Date(),
    );
  }

  return savedStock;
}

/**
 * Map source string from DTO to DataSource enum
 */
private mapSourceStringToDataSource(sourceType: string): DataSource {
  const mapping: Record<string, DataSource> = {
    'aktools': DataSource.EAST_MONEY,
    'eastmoney': DataSource.EAST_MONEY,
    'ef': DataSource.EAST_MONEY,
    'tdx': DataSource.TDX,
    'mqmt': DataSource.MINI_QMT,
  };

  const normalized = sourceType.toLowerCase();
  if (!(normalized in mapping)) {
    throw new BadRequestException(
      `Unknown data source type: ${sourceType}. Supported: ${Object.keys(mapping).join(', ')}`
    );
  }

  return mapping[normalized];
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
pnpm test security.service.spec.ts
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/mist/src/security/security.service.ts
git add apps/mist/src/security/dto/init-stock.dto.ts
git add apps/mist/src/security/security.service.spec.ts
git commit -m "feat: create SecuritySourceConfig on stock initialization"
```

---

## Task 4: Implement Time Window Strategy Interface

**Files:**
- Create: `apps/mist/src/collector/time-window/time-window.strategy.interface.ts`
- Create: `apps/mist/src/collector/time-window/east-money-time-window.strategy.ts`
- Test: `apps/mist/src/collector/time-window/east-money-time-window.strategy.spec.ts`

**Goal:** Define interface and implement East Money-specific time window logic

- [ ] **Step 1: Write the interface definition**

```typescript
// time-window.strategy.interface.ts
import { Period } from '@app/shared-data';

/**
 * Time window calculation result
 */
export interface CollectionWindow {
  startTime: Date;
  endTime: Date;
}

/**
 * Time window strategy interface
 * Different data sources may have different time window requirements
 *
 * For East Money (AKTools):
 * - 9:32 execution collects 9:30-9:31 data (1min)
 * - 9:36 execution collects 9:30-9:35 data (5min)
 * - Accounts for data availability delays
 */
export interface ITimeWindowStrategy {
  /**
   * Calculate the time range that should be collected
   * @param currentTime Current execution time
   * @param period K-line period
   * @returns Time range to collect
   */
  calculateCollectionWindow(
    currentTime: Date,
    period: Period,
  ): Promise<CollectionWindow>;

  /**
   * Check if current time is within execution window
   * Prevents execution outside valid collection times
   *
   * @param currentTime Current time
   * @param period K-line period
   * @returns true if execution is allowed
   */
  isInExecutionWindow(
    currentTime: Date,
    period: Period,
  ): Promise<boolean>;
}
```

- [ ] **Step 2: Commit interface**

```bash
git add apps/mist/src/collector/time-window/time-window.strategy.interface.ts
git commit -m "feat: add time window strategy interface"
```

- [ ] **Step 3: Write failing tests for East Money time window**

```typescript
// east-money-time-window.strategy.spec.ts
describe('EastMoneyTimeWindowStrategy', () => {
  let strategy: EastMoneyTimeWindowStrategy;

  beforeEach(() => {
    strategy = new EastMoneyTimeWindowStrategy(timezoneService);
  });

  describe('calculateCollectionWindow', () => {
    it('should calculate 1min window: 9:32 -> 9:30-9:31', async () => {
      const time = new Date('2024-03-25T09:32:00+08:00');
      const window = await strategy.calculateCollectionWindow(time, Period.ONE_MIN);

      expect(window.startTime).toEqual(new Date('2024-03-25T09:30:00+08:00'));
      expect(window.endTime).toEqual(new Date('2024-03-25T09:31:00+08:00'));
    });

    it('should calculate 5min window: 9:36 -> 9:30-9:35', async () => {
      const time = new Date('2024-03-25T09:36:00+08:00');
      const window = await strategy.calculateCollectionWindow(time, Period.FIVE_MIN);

      expect(window.startTime).toEqual(new Date('2024-03-25T09:30:00+08:00'));
      expect(window.endTime).toEqual(new Date('2024-03-25T09:35:00+08:00'));
    });

    it('should calculate 15min window: 9:46 -> 9:30-9:45', async () => {
      const time = new Date('2024-03-25T09:46:00+08:00');
      const window = await strategy.calculateCollectionWindow(time, Period.FIFTEEN_MIN);

      expect(window.startTime).toEqual(new Date('2024-03-25T09:30:00+08:00'));
      expect(window.endTime).toEqual(new Date('2024-03-25T09:45:00+08:00'));
    });

    it('should calculate 30min window: 10:01 -> 9:30-10:00', async () => {
      const time = new Date('2024-03-25T10:01:00+08:00');
      const window = await strategy.calculateCollectionWindow(time, Period.THIRTY_MIN);

      expect(window.startTime).toEqual(new Date('2024-03-25T09:30:00+08:00'));
      expect(window.endTime).toEqual(new Date('2024-03-25T10:00:00+08:00'));
    });

    it('should handle afternoon session: 13:01 -> 13:00 data for 1min', async () => {
      const time = new Date('2024-03-25T13:01:00+08:00');
      const window = await strategy.calculateCollectionWindow(time, Period.ONE_MIN);

      expect(window.startTime).toEqual(new Date('2024-03-25T13:00:00+08:00'));
      expect(window.endTime).toEqual(new Date('2024-03-25T13:00:00+08:00'));
    });
  });

  describe('isInExecutionWindow', () => {
    it('should return true for 1min at 9:32 (valid time)', async () => {
      const time = new Date('2024-03-25T09:32:00+08:00');
      const result = await strategy.isInExecutionWindow(time, Period.ONE_MIN);
      expect(result).toBe(true);
    });

    it('should return false for 1min at 9:30 (too early)', async () => {
      const time = new Date('2024-03-25T09:30:00+08:00');
      const result = await strategy.isInExecutionWindow(time, Period.ONE_MIN);
      expect(result).toBe(false);
    });

    it('should return false for 1min at 11:32 (outside trading)', async () => {
      const time = new Date('2024-03-25T11:32:00+08:00');
      const result = await strategy.isInExecutionWindow(time, Period.ONE_MIN);
      expect(result).toBe(false);
    });

    it('should return true for 5min at 9:36 (valid time)', async () => {
      const time = new Date('2024-03-25T09:36:00+08:00');
      const result = await strategy.isInExecutionWindow(time, Period.FIVE_MIN);
      expect(result).toBe(true);
    });

    it('should return true for 5min at 13:06 (afternoon session)', async () => {
      const time = new Date('2024-03-25T13:06:00+08:00');
      const result = await strategy.isInExecutionWindow(time, Period.FIVE_MIN);
      expect(result).toBe(true);
    });
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

```bash
pnpm test east-money-time-window.strategy.spec.ts
```

Expected: FAIL - Class not implemented

- [ ] **Step 5: Implement EastMoneyTimeWindowStrategy**

```typescript
// east-money-time-window.strategy.ts
import { Injectable } from '@nestjs/common';
import { Period } from '@app/shared-data';
import { TimezoneService } from '@app/timezone';
import {
  ITimeWindowStrategy,
  CollectionWindow,
} from './time-window.strategy.interface';

/**
 * East Money (AKTools) specific time window strategy
 *
 * Execution windows:
 * - 1min: 9:32-11:31, 13:01-15:01
 * - 5min: 9:36-11:31, 13:06-15:01
 * - 15min: 9:46-11:31, 13:16-15:01
 * - 30min: 10:01-11:31, 13:31-15:01
 * - 60min: 10:31, 11:31, 14:01, 15:01
 */
@Injectable()
export class EastMoneyTimeWindowStrategy implements ITimeWindowStrategy {
  constructor(private readonly timezoneService: TimezoneService) {}

  async calculateCollectionWindow(
    currentTime: Date,
    period: Period,
  ): Promise<CollectionWindow> {
    // Map period to minutes
    const periodMinutes = this.periodToMinutes(period);

    // Calculate end time (current time - 1 minute)
    // This accounts for data availability delay
    // NOTE: Using date-fns addMinutes instead of TimezoneService for simple arithmetic
    const endTime = this.addMinutes(currentTime, -1);

    // Calculate start time (end time - period minutes)
    const startTime = this.addMinutes(endTime, -periodMinutes);

    return { startTime, endTime };
  }

  async isInExecutionWindow(
    currentTime: Date,
    period: Period,
  ): Promise<boolean> {
    switch (period) {
      case Period.ONE_MIN:
        return this.timezoneService.isInTime1Min(currentTime);
      case Period.FIVE_MIN:
        return this.timezoneService.isInTime5Min(currentTime);
      case Period.FIFTEEN_MIN:
        return this.timezoneService.isInTime15Min(currentTime);
      case Period.THIRTY_MIN:
        return this.timezoneService.isInTime30Min(currentTime);
      case Period.SIXTY_MIN:
        // 60min uses fixed time points, not a continuous window
        return this.isInTime60Min(currentTime);
      case Period.DAY:
        // Daily collection runs at fixed time (e.g., 17:00)
        return true;
      default:
        return false;
    }
  }

  /**
   * Convert Period enum to minutes
   */
  private periodToMinutes(period: Period): number {
    const mapping: Record<Period, number> = {
      [Period.ONE_MIN]: 1,
      [Period.FIVE_MIN]: 5,
      [Period.FIFTEEN_MIN]: 15,
      [Period.THIRTY_MIN]: 30,
      [Period.SIXTY_MIN]: 60,
      [Period.DAY]: 1440,
    };
    return mapping[period] || 5;
  }

  /**
   * Add minutes to date (utility method)
   */
  private addMinutes(date: Date, minutes: number): Date {
    return new Date(date.getTime() + minutes * 60 * 1000);
  }

  /**
   * Check if current time is one of the 60min execution points
   * 10:31, 11:31, 14:01, 15:01
   */
  private isInTime60Min(time: Date): boolean {
    const hours = time.getHours();
    const minutes = time.getMinutes();

    return (
      (hours === 10 && minutes === 31) ||
      (hours === 11 && minutes === 31) ||
      (hours === 14 && minutes === 1) ||
      (hours === 15 && minutes === 1)
    );
  }
}
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
pnpm test east-money-time-window.strategy.spec.ts
```

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/mist/src/collector/time-window/
git commit -m "feat: implement East Money time window strategy"
```

---

## Task 5: Implement K-Line Merge Service

**Files:**
- Create: `apps/mist/src/collector/kline-merge/kline-merge.service.ts`
- Create: `apps/mist/src/collector/kline-merge/east-money-kline-merge.service.ts`
- Test: `apps/mist/src/collector/kline-merge/east-money-kline-merge.service.spec.ts`

**Goal:** Merge K-line data for special times (market open, lunch break)

- [ ] **Step 1: Write the base service interface**

```typescript
// kline-merge.service.ts
import { Period } from '@app/shared-data';

/**
 * Raw K-line data from data source
 */
export interface RawKLineData {
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  amount?: number;
}

/**
 * Merged K-line data
 */
export interface MergedKLineData extends RawKLineData {}

/**
 * K-line merge service interface
 * Different data sources may need different merge logic
 */
export interface IKLineMergeService {
  /**
   * Merge raw K-line data
   * @param rawData Raw data from data source (may contain multiple bars)
   * @param period K-line period
   * @param endTime End time of the collection window
   * @returns Merged K-line data
   */
  merge(
    rawData: RawKLineData[],
    period: Period,
    endTime: Date,
  ): Promise<MergedKLineData>;
}
```

- [ ] **Step 2: Write failing tests for East Money K-line merge**

```typescript
// east-money-kline-merge.service.spec.ts
describe('EastMoneyKLineMergeService', () => {
  let service: EastMoneyKLineMergeService;

  beforeEach(() => {
    service = new EastMoneyKLineMergeService();
  });

  describe('merge - 1min period', () => {
    it('should merge 9:30-9:31 for market open (9:31 execution)', async () => {
      const rawData: RawKLineData[] = [
        {
          timestamp: new Date('2024-03-25T09:30:00+08:00'),
          open: 10.0,
          high: 10.2,
          low: 9.9,
          close: 10.1,
          volume: 1000,
          amount: 10000,
        },
        {
          timestamp: new Date('2024-03-25T09:31:00+08:00'),
          open: 10.1,
          high: 10.3,
          low: 10.0,
          close: 10.2,
          volume: 1200,
          amount: 12000,
        },
      ];

      const endTime = new Date('2024-03-25T09:31:00+08:00');
      const result = await service.merge(rawData, Period.ONE_MIN, endTime);

      // Merged result
      expect(result.timestamp).toEqual(new Date('2024-03-25T09:31:00+08:00'));
      expect(result.open).toBe(10.0); // First bar's open
      expect(result.close).toBe(10.2); // Second bar's close
      expect(result.high).toBe(10.3); // Max of both
      expect(result.low).toBe(9.9);   // Min of both
      expect(result.volume).toBe(2200); // Sum
      expect(result.amount).toBe(22000);
    });

    it('should use first bar for lunch break open (13:01 execution)', async () => {
      const rawData: RawKLineData[] = [
        {
          timestamp: new Date('2024-03-25T13:00:00+08:00'),
          open: 10.5,
          high: 10.6,
          low: 10.4,
          close: 10.5,
          volume: 800,
          amount: 8000,
        },
      ];

      const endTime = new Date('2024-03-25T13:01:00+08:00');
      const result = await service.merge(rawData, Period.ONE_MIN, endTime);

      expect(result.timestamp).toEqual(new Date('2024-03-25T13:00:00+08:00'));
      expect(result.open).toBe(10.5);
      expect(result.close).toBe(10.5);
    });

    it('should use second bar for normal times (e.g., 9:45 execution)', async () => {
      const rawData: RawKLineData[] = [
        {
          timestamp: new Date('2024-03-25T09:44:00+08:00'),
          open: 10.0,
          high: 10.1,
          low: 9.9,
          close: 10.05,
          volume: 1000,
          amount: 10000,
        },
        {
          timestamp: new Date('2024-03-25T09:45:00+08:00'),
          open: 10.05,
          high: 10.2,
          low: 10.0,
          close: 10.15,
          volume: 1100,
          amount: 11000,
        },
      ];

      const endTime = new Date('2024-03-25T09:45:00+08:00');
      const result = await service.merge(rawData, Period.ONE_MIN, endTime);

      // Should use second bar
      expect(result.timestamp).toEqual(new Date('2024-03-25T09:45:00+08:00'));
      expect(result.open).toBe(10.05);
      expect(result.close).toBe(10.15);
    });
  });

  describe('merge - 5min period', () => {
    it('should use first bar for market open (9:35 execution)', async () => {
      const rawData: RawKLineData[] = [
        {
          timestamp: new Date('2024-03-25T09:30:00+08:00'),
          open: 10.0,
          high: 10.5,
          low: 9.8,
          close: 10.3,
          volume: 5000,
          amount: 50000,
        },
        {
          timestamp: new Date('2024-03-25T09:35:00+08:00'),
          open: 10.3,
          high: 10.6,
          low: 10.2,
          close: 10.5,
          volume: 3000,
          amount: 30000,
        },
      ];

      const endTime = new Date('2024-03-25T09:35:00+08:00');
      const result = await service.merge(rawData, Period.FIVE_MIN, endTime);

      // Should use first bar (market open logic)
      expect(result.timestamp).toEqual(new Date('2024-03-25T09:35:00+08:00'));
      expect(result.open).toBe(10.0);
      expect(result.close).toBe(10.5);
    });

    it('should use first bar for lunch break open (13:05 execution)', async () => {
      const rawData: RawKLineData[] = [
        {
          timestamp: new Date('2024-03-25T13:00:00+08:00'),
          open: 10.5,
          high: 10.7,
          low: 10.4,
          close: 10.6,
          volume: 2000,
          amount: 20000,
        },
      ];

      const endTime = new Date('2024-03-25T13:05:00+08:00');
      const result = await service.merge(rawData, Period.FIVE_MIN, endTime);

      expect(result.open).toBe(10.5);
    });

    it('should use first bar for normal times (e.g., 13:10 execution)', async () => {
      const rawData: RawKLineData[] = [
        {
          timestamp: new Date('2024-03-25T13:05:00+08:00'),
          open: 10.6,
          high: 10.8,
          low: 10.5,
          close: 10.7,
          volume: 1500,
          amount: 15000,
        },
        {
          timestamp: new Date('2024-03-25T13:10:00+08:00'),
          open: 10.7,
          high: 10.9,
          low: 10.6,
          close: 10.8,
          volume: 1600,
          amount: 16000,
        },
      ];

      const endTime = new Date('2024-03-25T13:10:00+08:00');
      const result = await service.merge(rawData, Period.FIVE_MIN, endTime);

      // Should use first bar
      expect(result.open).toBe(10.6);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test east-money-kline-merge.service.spec.ts
```

Expected: FAIL - Class not implemented

- [ ] **Step 3: Implement EastMoneyKLineMergeService**

```typescript
// east-money-kline-merge.service.ts
import { Injectable } from '@nestjs/common';
import { Period } from '@app/shared-data';
import {
  IKLineMergeService,
  RawKLineData,
  MergedKLineData,
} from './kline-merge.service';

/**
 * East Money (AKTools) specific K-line merge service
 *
 * Handles special cases:
 * - Market open: merge first 2 bars (9:30-9:31 for 1min)
 * - Lunch break open: use first bar only
 * - Normal times: use second bar (or first for 5min+)
 */
@Injectable()
export class EastMoneyKLineMergeService implements IKLineMergeService {
  async merge(
    rawData: RawKLineData[],
    period: Period,
    endTime: Date,
  ): Promise<MergedKLineData> {
    if (rawData.length === 0) {
      throw new Error('No data to merge');
    }

    if (rawData.length === 1) {
      return rawData[0] as MergedKLineData;
    }

    switch (period) {
      case Period.ONE_MIN:
        return this.build1MinData(endTime, rawData);
      case Period.FIVE_MIN:
        return this.build5MinData(endTime, rawData);
      case Period.FIFTEEN_MIN:
        return this.build15MinData(endTime, rawData);
      case Period.THIRTY_MIN:
        return this.build30MinData(endTime, rawData);
      case Period.SIXTY_MIN:
        return this.build60MinData(endTime, rawData);
      default:
        return rawData[rawData.length - 1] as MergedKLineData;
    }
  }

  /**
   * Merge 1-minute data
   * - 9:31: merge 9:30 and 9:31
   * - 13:01: use first bar (lunch break open)
   * - Other: use second bar
   */
  private build1MinData(timeEnd: Date, data: RawKLineData[]): MergedKLineData {
    const hours = timeEnd.getHours();
    const minutes = timeEnd.getMinutes();

    // Morning market open: merge 9:30 and 9:31
    if (hours === 9 && minutes === 31) {
      return {
        timestamp: data[1].timestamp,
        open: data[0].open,
        close: data[1].close,
        high: Math.max(data[0].high, data[1].high),
        low: Math.min(data[0].low, data[1].low),
        volume: data[0].volume + data[1].volume,
        amount: (data[0].amount || 0) + (data[1].amount || 0),
      };
    }

    // Lunch break open: use first bar
    if (hours === 13 && minutes === 1) {
      return data[0] as MergedKLineData;
    }

    // Normal times: use second bar
    return data[1] as MergedKLineData;
  }

  /**
   * Merge 5-minute data
   * - 9:35: use first bar (market open)
   * - 13:05: use first bar (lunch break open)
   * - Other: use first bar
   */
  private build5MinData(timeEnd: Date, data: RawKLineData[]): MergedKLineData {
    const hours = timeEnd.getHours();
    const minutes = timeEnd.getMinutes();

    // Market open or lunch break open
    if ((hours === 9 && minutes === 35) || (hours === 13 && minutes === 5)) {
      return data[0] as MergedKLineData;
    }

    // Normal times: use first bar
    return data[0] as MergedKLineData;
  }

  /**
   * Merge 15-minute data
   */
  private build15MinData(timeEnd: Date, data: RawKLineData[]): MergedKLineData {
    const hours = timeEnd.getHours();
    const minutes = timeEnd.getMinutes();

    if ((hours === 9 && minutes === 45) || (hours === 13 && minutes === 15)) {
      return data[0] as MergedKLineData;
    }

    return data[0] as MergedKLineData;
  }

  /**
   * Merge 30-minute data
   */
  private build30MinData(timeEnd: Date, data: RawKLineData[]): MergedKLineData {
    const hours = timeEnd.getHours();
    const minutes = timeEnd.getMinutes();

    if ((hours === 10 && minutes === 0) || (hours === 13 && minutes === 30)) {
      return data[0] as MergedKLineData;
    }

    return data[0] as MergedKLineData;
  }

  /**
   * Merge 60-minute data
   */
  private build60MinData(timeEnd: Date, data: RawKLineData[]): MergedKLineData {
    const hours = timeEnd.getHours();
    const minutes = timeEnd.getMinutes();

    if (
      (hours === 10 && minutes === 30) ||
      (hours === 11 && minutes === 30) ||
      (hours === 14 && minutes === 0) ||
      (hours === 15 && minutes === 0)
    ) {
      return data[0] as MergedKLineData;
    }

    return data[0] as MergedKLineData;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test east-money-kline-merge.service.spec.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/mist/src/collector/kline-merge/
git commit -m "feat: implement East Money K-line merge service"
```

---

## Task 6: Implement Data Collection Strategy Interface

**Files:**
- Create: `apps/mist/src/collector/strategies/data-collection.strategy.interface.ts`
- Create: `apps/mist/src/collector/strategies/east-money-collection.strategy.ts`
- Create: `apps/mist/src/collector/strategies/websocket-collection.strategy.ts`
- Test: `apps/mist/src/collector/strategies/east-money-collection.strategy.spec.ts`

**Goal:** Define strategy pattern for polling vs streaming data collection

- [ ] **Step 1: Write the strategy interface**

```typescript
// data-collection.strategy.interface.ts
import { Security, Period } from '@app/shared-data';

/**
 * Data collection mode
 */
export type CollectionMode = 'polling' | 'streaming';

/**
 * Data collection strategy interface
 * All data sources must implement this interface
 */
export interface IDataCollectionStrategy {
  /**
   * Data source type (e.g., EAST_MONEY, TDX, MINI_QMT)
   */
  readonly source: string;

  /**
   * Collection mode
   * - polling: Actively fetch data on schedule (East Money)
   * - streaming: Receive data via WebSocket push (TDX, miniQMT)
   */
  readonly mode: CollectionMode;

  /**
   * Collect data for a specific security
   *
   * For polling mode: Fetch data for the given time range
   * For streaming mode: Subscribe to data feed
   *
   * @param security Security object
   * @param period K-line period
   * @param time Current time (only used for polling mode)
   */
  collectForSecurity(
    security: Security,
    period: Period,
    time?: Date,
  ): Promise<void>;

  /**
   * Start the strategy (for streaming mode)
   * Establishes WebSocket connection, sets up handlers
   */
  start?(): Promise<void>;

  /**
   * Stop the strategy (for streaming mode)
   * Closes WebSocket connection, cleans up resources
   */
  stop?(): Promise<void>;
}
```

- [ ] **Step 2: Commit interface**

```bash
git add apps/mist/src/collector/strategies/data-collection.strategy.interface.ts
git commit -m "feat: add data collection strategy interface"
```

- [ ] **Step 3: Write failing tests for East Money collection strategy**

```typescript
// east-money-collection.strategy.spec.ts
describe('EastMoneyCollectionStrategy', () => {
  let strategy: EastMoneyCollectionStrategy;
  let mockCollectorService: jest.Mocked<CollectorService>;
  let mockTimeWindowStrategy: jest.Mocked<EastMoneyTimeWindowStrategy>;
  let mockKLineMergeService: jest.Mocked<EastMoneyKLineMergeService>;

  beforeEach(() => {
    mockCollectorService = createMockCollectorService();
    mockTimeWindowStrategy = createMockTimeWindowStrategy();
    mockKLineMergeService = createMockKLineMergeService();

    strategy = new EastMoneyCollectionStrategy(
      mockCollectorService,
      mockTimeWindowStrategy,
      mockKLineMergeService,
      new Logger('EastMoneyStrategy'),
    );
  });

  describe('collectForSecurity', () => {
    it('should skip collection when outside execution window', async () => {
      const security = createTestSecurity('000001.SH');
      const time = new Date('2024-03-25T09:30:00+08:00'); // Too early

      mockTimeWindowStrategy.isInExecutionWindow.mockResolvedValue(false);

      await strategy.collectForSecurity(security, Period.ONE_MIN, time);

      expect(mockTimeWindowStrategy.isInExecutionWindow).toHaveBeenCalledWith(
        time,
        Period.ONE_MIN,
      );
      expect(mockCollectorService.collectKLineForSource).not.toHaveBeenCalled();
    });

    it('should calculate window and collect data when in execution window', async () => {
      const security = createTestSecurity('000001.SH');
      const time = new Date('2024-03-25T09:32:00+08:00');

      mockTimeWindowStrategy.isInExecutionWindow.mockResolvedValue(true);
      mockTimeWindowStrategy.calculateCollectionWindow.mockResolvedValue({
        startTime: new Date('2024-03-25T09:30:00+08:00'),
        endTime: new Date('2024-03-25T09:31:00+08:00'),
      });

      const mockRawData = [createMockKLineData()];
      mockKLineMergeService.merge.mockResolvedValue(createMockKLineData());

      await strategy.collectForSecurity(security, Period.ONE_MIN, time);

      expect(mockTimeWindowStrategy.calculateCollectionWindow).toHaveBeenCalledWith(
        time,
        Period.ONE_MIN,
      );
      expect(mockCollectorService.collectKLineForSource).toHaveBeenCalledWith(
        security,
        Period.ONE_MIN,
        new Date('2024-03-25T09:30:00+08:00'),
        new Date('2024-03-25T09:31:00+08:00'),
        'EAST_MONEY',
        expect.any(Function),
      );
    });

    it('should apply K-line merge to collected data', async () => {
      const security = createTestSecurity('000001.SH');
      const time = new Date('2024-03-25T09:32:00+08:00');

      mockTimeWindowStrategy.isInExecutionWindow.mockResolvedValue(true);
      mockTimeWindowStrategy.calculateCollectionWindow.mockResolvedValue({
        startTime: new Date('2024-03-25T09:30:00+08:00'),
        endTime: new Date('2024-03-25T09:31:00+08:00'),
      });

      const rawData = [
        createMockKLineData({ timestamp: new Date('2024-03-25T09:30:00+08:00') }),
        createMockKLineData({ timestamp: new Date('2024-03-25T09:31:00+08:00') }),
      ];

      // Mock the postProcess callback to call merge
      mockCollectorService.collectKLineForSource.mockImplementation(
        async (_, __, ___, ___, _____, postProcess) => {
          if (postProcess) {
            await postProcess(rawData);
          }
        },
      );

      const mergedData = createMockKLineData({ close: 10.5 });
      mockKLineMergeService.merge.mockResolvedValue(mergedData);

      await strategy.collectForSecurity(security, Period.ONE_MIN, time);

      expect(mockKLineMergeService.merge).toHaveBeenCalledWith(
        rawData,
        Period.ONE_MIN,
        new Date('2024-03-25T09:31:00+08:00'),
      );
    });
  });

  // Helper functions
  function createTestSecurity(code: string): Security {
    return {
      id: 1,
      code,
      name: 'Test Security',
      type: SecurityType.STOCK,
      status: SecurityStatus.ACTIVE,
    } as Security;
  }

  function createMockKLineData(overrides?: Partial<any>): any {
    return {
      timestamp: new Date(),
      open: 10.0,
      high: 10.2,
      low: 9.8,
      close: 10.1,
      volume: 1000,
      amount: 10000,
      ...overrides,
    };
  }
});
```

- [ ] **Step 4: Run tests to verify they fail**

```bash
pnpm test east-money-collection.strategy.spec.ts
```

Expected: FAIL - Class not implemented

- [ ] **Step 5: Implement EastMoneyCollectionStrategy**

```typescript
// east-money-collection.strategy.ts
import { Injectable, Logger } from '@nestjs/common';
import { Security, Period, DataSource } from '@app/shared-data';
import { CollectorService } from '../collector.service';
import { EastMoneyTimeWindowStrategy } from '../time-window/east-money-time-window.strategy';
import { EastMoneyKLineMergeService } from '../kline-merge/east-money-kline-merge.service';
import {
  IDataCollectionStrategy,
  CollectionMode,
} from './data-collection.strategy.interface';

/**
 * East Money data collection strategy
 *
 * - Mode: polling (actively fetch on schedule)
 * - Features: time window filtering, K-line merging
 */
@Injectable()
export class EastMoneyCollectionStrategy implements IDataCollectionStrategy {
  readonly source = DataSource.EAST_MONEY;
  readonly mode: CollectionMode = 'polling';

  constructor(
    private readonly collectorService: CollectorService,
    private readonly timeWindowStrategy: EastMoneyTimeWindowStrategy,
    private readonly kLineMergeService: EastMoneyKLineMergeService,
    private readonly logger: Logger,
  ) {}

  async collectForSecurity(
    security: Security,
    period: Period,
    time?: Date,
  ): Promise<void> {
    const currentTime = time || new Date();

    // 1. Check if in execution window
    const inWindow = await this.timeWindowStrategy.isInExecutionWindow(
      currentTime,
      period,
    );

    if (!inWindow) {
      this.logger.debug(
        `Not in execution window for ${security.code} ${period} at ${currentTime}`,
      );
      return;
    }

    // 2. Calculate collection window
    const { startTime, endTime } =
      await this.timeWindowStrategy.calculateCollectionWindow(
        currentTime,
        period,
      );

    // 3. Collect data with post-processing (K-line merge)
    try {
      await this.collectorService.collectKLineForSource(
        security,
        period,
        startTime,
        endTime,
        this.source,
        async (rawData) => this.kLineMergeService.merge(rawData, period, endTime),
      );

      this.logger.log(
        `Successfully collected ${security.code} ${period} from ${startTime} to ${endTime}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to collect ${security.code} ${period}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}
```

- [ ] **Step 6: Implement WebSocket collection strategy (stub for future)**

```typescript
// websocket-collection.strategy.ts
import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { Security, Period, DataSource } from '@app/shared-data';
import { ConfigService } from '@nestjs/config';
import { CollectorService } from '../collector.service';
import {
  IDataCollectionStrategy,
  CollectionMode,
} from './data-collection.strategy.interface';

/**
 * WebSocket data collection strategy
 *
 * - Mode: streaming (real-time push)
 * - For: TDX, miniQMT
 * - Status: Stub for future implementation
 */
@Injectable()
export class WebSocketCollectionStrategy implements IDataCollectionStrategy {
  readonly source: DataSource;
  readonly mode: CollectionMode = 'streaming';

  // TODO: Implement WebSocket client
  private wsClient: any = null;
  private subscriptions: Set<string> = new Set();

  constructor(
    source: DataSource,
    private readonly collectorService: CollectorService,
    private readonly configService: ConfigService,
    private readonly logger: Logger,
  ) {
    if (
      source !== DataSource.TDX &&
      source !== DataSource.MINI_QMT
    ) {
      throw new Error(
        `WebSocket strategy only supports TDX and MINI_QMT, got ${source}`,
      );
    }
    this.source = source;
  }

  async start(): Promise<void> {
    // TODO: Implement WebSocket connection
    this.logger.warn(
      `WebSocket strategy for ${this.source} is not yet implemented. Streaming mode is disabled.`,
    );
    // Return early instead of throwing to avoid crashing the scheduler
    return;
  }

  async stop(): Promise<void> {
    // TODO: Implement WebSocket disconnection
    if (this.wsClient) {
      await this.wsClient.disconnect();
      this.wsClient = null;
      this.subscriptions.clear();
    }
  }

  async collectForSecurity(
    security: Security,
    period: Period,
  ): Promise<void> {
    // TODO: Subscribe to WebSocket data
    this.logger.warn(
      `WebSocket subscription for ${this.source} is not yet implemented. Security ${security.code} will not receive streaming data.`,
    );
    // Return early instead of throwing to avoid crashing the scheduler
    return;
  }

  // TODO: Add WebSocket message handler
  // private async handleIncomingData(data: any): Promise<void> {
  //   // Parse and save data
  // }
}
```

- [ ] **Step 7: Run tests to verify they pass**

```bash
pnpm test east-money-collection.strategy.spec.ts
```

Expected: PASS (with warnings for WebSocket stub)

- [ ] **Step 8: Commit**

```bash
git add apps/mist/src/collector/strategies/
git commit -m "feat: implement data collection strategies (polling + streaming stub)"
```

---

## Task 7: Update CollectorService to Support collectKLineForSource

**Files:**
- Modify: `apps/mist/src/collector/collector.service.ts`
- Test: `apps/mist/src/collector/collector.service.spec.ts`

**Goal:** Add new method that supports post-processing callback

- [ ] **Step 1: Add failing test for collectKLineForSource**

```typescript
// collector.service.spec.ts
describe('CollectorService - collectKLineForSource', () => {
  it('should fetch data and apply post-processing callback', async () => {
    const security = await createTestSecurity('TEST001');
    const startTime = new Date('2024-03-25T09:30:00+08:00');
    const endTime = new Date('2024-03-25T09:35:00+08:00');

    const rawData = [
      { timestamp: startTime, open: 10, high: 10.5, low: 9.5, close: 10.2, volume: 1000, amount: 10000 },
      { timestamp: endTime, open: 10.2, high: 10.6, low: 10, close: 10.4, volume: 1200, amount: 12000 },
    ];

    const mergedData = { ...rawData[1], close: 10.5 }; // Simulated merge

    // Mock fetcher to return raw data
    jest.spyOn(eastMoneySource, 'fetchKLine').mockResolvedValue(rawData);

    // Mock save
    const saveSpy = jest.spyOn(kRepository, 'save').mockResolvedValue(undefined);

    // Call with post-processing
    await collectorService.collectKLineForSource(
      security,
      Period.FIVE_MIN,
      startTime,
      endTime,
      DataSource.EAST_MONEY,
      async (data) => mergedData,
    );

    // Verify merge was applied
    expect(saveSpy).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          close: 10.5, // Merged value
          security,
          source: DataSource.EAST_MONEY,
          period: Period.FIVE_MIN,
        }),
      ]),
    );
  });

  it('should skip post-processing if callback not provided', async () => {
    const security = await createTestSecurity('TEST002');
    const startTime = new Date('2024-03-25T09:30:00+08:00');
    const endTime = new Date('2024-03-25T09:35:00+08:00');

    const rawData = [
      { timestamp: endTime, open: 10, high: 10.5, low: 9.5, close: 10.2, volume: 1000, amount: 10000 },
    ];

    jest.spyOn(eastMoneySource, 'fetchKLine').mockResolvedValue(rawData);
    const saveSpy = jest.spyOn(kRepository, 'save').mockResolvedValue(undefined);

    await collectorService.collectKLineForSource(
      security,
      Period.FIVE_MIN,
      startTime,
      endTime,
      DataSource.EAST_MONEY,
      undefined, // No post-processing
    );

    // Verify raw data was saved
    expect(saveSpy).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          close: 10.2, // Original value
        }),
      ]),
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test collector.service.spec.ts
```

Expected: FAIL - Method not implemented

- [ ] **Step 3: Implement collectKLineForSource in CollectorService**

```typescript
// collector.service.ts
@Injectable()
export class CollectorService {
  // ... existing code ...

  /**
   * Collect K-line data for a specific security with optional post-processing
   *
   * @param security Security object
   * @param period K-line period
   * @param startTime Start of collection window
   * @param endTime End of collection window
   * @param source Data source to use
   * @param postProcess Optional post-processing callback (e.g., K-line merge)
   */
  async collectKLineForSource(
    security: Security,
    period: Period,
    startTime: Date,
    endTime: Date,
    source: DataSource,
    postProcess?: (rawData: KLineData[]) => Promise<KLineData | KLineData[]>,
  ): Promise<void> {
    try {
      // 1. Get data source fetcher
      const sourceFetcher = this.sources.get(source);
      if (!sourceFetcher) {
        throw new BadRequestException(
          `Data source ${source} is not available`,
        );
      }

      // 2. Check period support
      if (!sourceFetcher.isSupportedPeriod(period)) {
        throw new BadRequestException(
          `Period ${period} is not supported by data source ${source}`,
        );
      }

      // 3. Fetch raw data
      const rawData = await sourceFetcher.fetchKLine({
        code: security.code,
        period,
        startDate: startTime,
        endDate: endTime,
      });

      if (rawData.length === 0) {
        console.warn(
          `No data returned for ${security.code} ${period} from ${startTime} to ${endTime}`,
        );
        return;
      }

      // 4. Apply post-processing if provided
      let dataToSave: KLineData[];
      if (postProcess) {
        const processed = await postProcess(rawData);
        dataToSave = Array.isArray(processed) ? processed : [processed];
      } else {
        dataToSave = rawData;
      }

      // 5. Save to database
      await this.saveKLineData(security, dataToSave, source, period);

      console.log(
        `Successfully collected ${dataToSave.length} K-line records for ${security.code} ${period} from ${source}`,
      );
    } catch (error) {
      console.error(
        `Failed to collect K-line data for ${security.code}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Save raw K-line data (for WebSocket streaming)
   */
  async saveRawKLineData(
    security: Security,
    period: Period,
    source: DataSource,
    data: {
      timestamp: Date;
      open: number;
      high: number;
      low: number;
      close: number;
      volume: number;
      amount?: number;
    },
  ): Promise<void> {
    const kEntity = this.kRepository.create({
      security,
      source,
      period,
      timestamp: data.timestamp,
      open: data.open,
      high: data.high,
      low: data.low,
      close: data.close,
      volume: BigInt(Math.round(data.volume)),
      amount: data.amount || 0,
    });

    await this.kRepository.save(kEntity);
  }

  /**
   * Find security by code
   */
  async findSecurityByCode(code: string): Promise<Security | null> {
    return this.securityRepository.findOne({ where: { code } });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test collector.service.spec.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/mist/src/collector/collector.service.ts
git add apps/mist/src/collector/collector.service.spec.ts
git commit -m "feat: add collectKLineForSource with post-processing support"
```

---

## Task 8: Implement Data Collection Scheduler

**Files:**
- Create: `apps/schedule/src/schedulers/data-collection.scheduler.ts`
- Test: `apps/schedule/src/schedulers/data-collection.scheduler.spec.ts`

**Goal:** Central scheduler that manages collection strategies and orchestrates data collection

- [ ] **Step 1: Write failing tests for DataCollectionScheduler**

```typescript
// data-collection.scheduler.spec.ts
describe('DataCollectionScheduler', () => {
  let scheduler: DataCollectionScheduler;
  let mockSecurityRepository: jest.Mocked<Repository<Security>>;
  let mockStrategy: jest.Mocked<IDataCollectionStrategy>;

  beforeEach(() => {
    mockSecurityRepository = createMockSecurityRepository();
    mockStrategy = createMockCollectionStrategy();

    scheduler = new DataCollectionScheduler(
      mockSecurityRepository,
      new Logger('DataCollectionScheduler'),
    );
  });

  describe('registerStrategy', () => {
    it('should register a collection strategy', () => {
      scheduler.registerStrategy(mockStrategy);

      expect(scheduler['strategies'].get('EAST_MONEY')).toBe(mockStrategy);
    });
  });

  describe('collectForAllSecurities', () => {
    it('should skip collection when not trading day', async () => {
      scheduler.setIsTradingDay(false);

      await scheduler.collectForAllSecurities(Period.ONE_MIN);

      expect(mockSecurityRepository.find).not.toHaveBeenCalled();
      expect(mockStrategy.collectForSecurity).not.toHaveBeenCalled();
    });

    it('should collect for all active securities', async () => {
      scheduler.setIsTradingDay(true);
      scheduler.registerStrategy(mockStrategy);

      const securities = [
        { id: 1, code: '000001.SH', status: SecurityStatus.ACTIVE },
        { id: 2, code: '000002.SH', status: SecurityStatus.ACTIVE },
        { id: 3, code: '399001.SZ', status: SecurityStatus.SUSPENDED }, // Should skip
      ] as Security[];

      mockSecurityRepository.find.mockResolvedValue(securities);
      mockStrategy.mode = 'polling';
      mockStrategy.collectForSecurity.mockResolvedValue(undefined);

      await scheduler.collectForAllSecurities(Period.ONE_MIN);

      // Should only collect for active securities
      expect(mockStrategy.collectForSecurity).toHaveBeenCalledTimes(2);
      expect(mockStrategy.collectForSecurity).toHaveBeenCalledWith(
        securities[0],
        Period.ONE_MIN,
        expect.any(Date),
      );
      expect(mockStrategy.collectForSecurity).toHaveBeenCalledWith(
        securities[1],
        Period.ONE_SEC,
        expect.any(Date),
      );
    });

    it('should handle collection errors gracefully', async () => {
      scheduler.setIsTradingDay(true);
      scheduler.registerStrategy(mockStrategy);

      const securities = [
        { id: 1, code: '000001.SH', status: SecurityStatus.ACTIVE },
        { id: 2, code: '000002.SH', status: SecurityStatus.ACTIVE },
      ] as Security[];

      mockSecurityRepository.find.mockResolvedValue(securities);
      mockStrategy.mode = 'polling';
      mockStrategy.collectForSecurity
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('Network error'));

      // Should not throw
      await expect(
        scheduler.collectForAllSecurities(Period.ONE_MIN),
      ).resolves.not.toThrow();

      // Both should be attempted
      expect(mockStrategy.collectForSecurity).toHaveBeenCalledTimes(2);
    });
  });

  describe('collectForSecurity', () => {
    it('should use polling strategy when available', async () => {
      scheduler.registerStrategy(mockStrategy);
      mockStrategy.mode = 'polling';
      mockStrategy.source = 'EAST_MONEY';

      const security = { id: 1, code: '000001.SH' } as Security;

      // Mock getDataSourceForSecurity to return EAST_MONEY
      jest.spyOn(scheduler as any, 'getDataSourceForSecurity').mockResolvedValue('EAST_MONEY');

      await scheduler.collectForSecurity(security, Period.FIVE_MIN);

      expect(mockStrategy.collectForSecurity).toHaveBeenCalledWith(
        security,
        Period.FIVE_MIN,
        expect.any(Date),
      );
    });

    it('should skip streaming strategies in scheduled collection', async () => {
      const streamingStrategy = createMockCollectionStrategy();
      streamingStrategy.mode = 'streaming';
      streamingStrategy.source = 'TDX';

      scheduler.registerStrategy(streamingStrategy);

      const security = { id: 1, code: '000001.SH' } as Security;
      jest.spyOn(scheduler as any, 'getDataSourceForSecurity').mockResolvedValue('TDX');

      await scheduler.collectForSecurity(security, Period.FIVE_MIN);

      expect(streamingStrategy.collectForSecurity).not.toHaveBeenCalled();
    });
  });

  describe('setIsTradingDay', () => {
    it('should update trading day flag', () => {
      scheduler.setIsTradingDay(true);
      expect(scheduler['isTradingDay']).toBe(true);

      scheduler.setIsTradingDay(false);
      expect(scheduler['isTradingDay']).toBe(false);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test data-collection.scheduler.spec.ts
```

Expected: FAIL - Class not implemented

- [ ] **Step 3: Implement DataCollectionScheduler**

```typescript
// data-collection.scheduler.ts
import { Injectable, Logger } from '@nestjs/common';
import { Repository } from 'typeorm';
import { Security, SecurityStatus, DataSource, Period } from '@app/shared-data';
import { IDataCollectionStrategy } from '../../../mist/src/collector/strategies/data-collection.strategy.interface';
import { DataSourceService } from '@app/utils';

/**
 * Central data collection scheduler
 *
 * Manages collection strategies and orchestrates data collection for all securities
 */
@Injectable()
export class DataCollectionScheduler {
  private strategies: Map<string, IDataCollectionStrategy> = new Map();
  private isTradingDay = false;

  constructor(
    private readonly securityRepository: Repository<Security>,
    private readonly logger: Logger,
  ) {}

  /**
   * Register a data collection strategy
   */
  registerStrategy(strategy: IDataCollectionStrategy): void {
    this.strategies.set(strategy.source, strategy);
    this.logger.log(
      `Registered collection strategy for ${strategy.source} (${strategy.mode})`,
    );
  }

  /**
   * Collect data for all active securities
   * Only processes polling-mode strategies
   */
  async collectForAllSecurities(period: Period, time?: Date): Promise<void> {
    if (!this.isTradingDay) {
      this.logger.debug('Not a trading day, skipping collection');
      return;
    }

    // Query all active securities
    const activeSecurities = await this.securityRepository.find({
      where: { status: SecurityStatus.ACTIVE },
    });

    this.logger.log(
      `Collecting ${period} data for ${activeSecurities.length} active securities`,
    );

    // Collect for each security
    const results = await Promise.allSettled(
      activeSecurities.map((security) =>
        this.collectForSecurity(security, period, time),
      ),
    );

    // Log results
    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;

    this.logger.log(
      `Collection completed: ${succeeded} succeeded, ${failed} failed`,
    );

    if (failed > 0) {
      results
        .filter((r) => r.status === 'rejected')
        .forEach((r) => {
          this.logger.error(
            `Collection failed: ${(r as PromiseRejectedResult).reason.message}`,
          );
        });
    }
  }

  /**
   * Collect data for a specific security
   */
  async collectForSecurity(
    security: Security,
    period: Period,
    time?: Date,
  ): Promise<void> {
    // Get data source for this security
    const dataSource = await this.getDataSourceForSecurity(security);

    // Get collection strategy
    const strategy = this.strategies.get(dataSource);
    if (!strategy) {
      this.logger.warn(`No collection strategy found for ${dataSource}`);
      return;
    }

    // Only process polling-mode strategies
    if (strategy.mode !== 'polling') {
      this.logger.debug(
        `Skipping ${security.code}: ${dataSource} uses streaming mode`,
      );
      return;
    }

    // Execute collection
    await strategy.collectForSecurity(security, period, time);
  }

  /**
   * Update trading day status
   */
  setIsTradingDay(isTradingDay: boolean): void {
    this.isTradingDay = isTradingDay;
    this.logger.log(`Trading day updated: ${isTradingDay}`);
  }

  /**
   * Get data source for a security
   * TODO: Implement 方案B logic - query SecuritySourceConfig
   */
  private async getDataSourceForSecurity(security: Security): Promise<string> {
    // TODO: Query SecuritySourceConfig with priority
    // For now, return default
    return DataSource.EAST_MONEY;
  }

  /**
   * Start all streaming strategies
   */
  async startStreamingStrategies(): Promise<void> {
    for (const [source, strategy] of this.strategies) {
      if (strategy.mode === 'streaming' && strategy.start) {
        try {
          await strategy.start();
          this.logger.log(`Started streaming strategy for ${source}`);
        } catch (error) {
          this.logger.error(
            `Failed to start streaming strategy for ${source}: ${error.message}`,
          );
        }
      }
    }
  }

  /**
   * Stop all streaming strategies
   */
  async stopStreamingStrategies(): Promise<void> {
    for (const [source, strategy] of this.strategies) {
      if (strategy.mode === 'streaming' && strategy.stop) {
        try {
          await strategy.stop();
          this.logger.log(`Stopped streaming strategy for ${source}`);
        } catch (error) {
          this.logger.error(
            `Failed to stop streaming strategy for ${source}: ${error.message}`,
          );
        }
      }
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test data-collection.scheduler.spec.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/schedule/src/schedulers/data-collection.scheduler.ts
git add apps/schedule/src/schedulers/data-collection.scheduler.spec.ts
git commit -m "feat: implement data collection scheduler"
```

---

## Task 9: Implement Schedule Controller with Cron Jobs

**Files:**
- Create: `apps/schedule/src/schedulers/schedule.controller.ts`
- Create: `apps/schedule/src/schedulers/schedule.module.ts`

**Goal:** Wire up everything with cron jobs for scheduled collection

- [ ] **Step 1: Create schedule module**

```typescript
// schedule.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule as NestScheduleModule } from '@nestjs/schedule';
import { Security, SecuritySourceConfig } from '@app/shared-data';
import { DataCollectionScheduler } from './data-collection.scheduler';
import { ScheduleController } from './schedule.controller';
// NOTE: These imports assume the modules are properly exported from their respective libraries
// If CollectorModule and SecurityModule are not yet exported as libraries, use relative imports
import { TimezoneModule } from '@app/timezone';
import { UtilsModule } from '@app/utils';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([Security, SecuritySourceConfig]),
    NestScheduleModule.forRoot(),
    // TODO: Import CollectorModule and SecurityModule when they are exported as libraries
    // For now, we'll instantiate strategies directly in the controller
    TimezoneModule,
    UtilsModule,
  ],
  controllers: [ScheduleController],
  providers: [DataCollectionScheduler],
  exports: [DataCollectionScheduler],
})
export class ScheduleModule {}
```

- [ ] **Step 2: Create schedule controller with cron jobs**

```typescript
// schedule.controller.ts
import { Controller, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataCollectionScheduler } from './data-collection.scheduler';
import { TimezoneService } from '@app/timezone';
import { EastMoneyCollectionStrategy } from '../../../mist/src/collector/strategies/east-money-collection.strategy';
import { CollectorService } from '../../../mist/src/collector/collector.service';
import { EastMoneyTimeWindowStrategy } from '../../../mist/src/collector/time-window/east-money-time-window.strategy';
import { EastMoneyKLineMergeService } from '../../../mist/src/collector/kline-merge/east-money-kline-merge.service';
import { Period } from '@app/shared-data';
import { Logger } from '@nestjs/common';

/**
 * Schedule controller
 *
 * Registers cron jobs for periodic data collection
 *
 * NOTE: Cron jobs use mutex locks to prevent overlapping executions
 * If a collection takes longer than the cron interval, the next execution will be skipped
 */
@Controller('schedule')
export class ScheduleController implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(ScheduleController.name);
  private isTradingDay = false;

  constructor(
    private readonly dataCollectionScheduler: DataCollectionScheduler,
    private readonly timezoneService: TimezoneService,
    private readonly collectorService: CollectorService,
  ) {}

  async onApplicationBootstrap() {
    this.logger.log('Initializing data collection scheduler...');

    // 1. Register collection strategies
    this.dataCollectionScheduler.registerStrategy(
      new EastMoneyCollectionStrategy(
        this.collectorService,
        new EastMoneyTimeWindowStrategy(this.timezoneService),
        new EastMoneyKLineMergeService(),
        new Logger('EastMoneyStrategy'),
      ),
    );

    // 2. Start streaming strategies (if any)
    await this.dataCollectionScheduler.startStreamingStrategies();

    // 3. Check trading day immediately
    await this.handleTradingDayCheck();

    // 4. Register cron jobs
    this.logger.log('Cron jobs registered successfully');
  }

  async onModuleDestroy() {
    this.logger.log('Shutting down scheduler...');
    await this.dataCollectionScheduler.stopStreamingStrategies();
  }

  /**
   * Check if today is a trading day
   * Runs every day at 9:00 AM
   */
  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async handleTradingDayCheck(): Promise<void> {
    const now = new Date();
    this.isTradingDay = await this.timezoneService.isTradingDay(now);
    this.dataCollectionScheduler.setIsTradingDay(this.isTradingDay);
    this.logger.log(`Trading day check: ${this.isTradingDay}`);
  }

  /**
   * Collect 1-minute K-line data
   * Runs every minute but only during trading hours
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async handle1MinCollection(): Promise<void> {
    if (!this.isTradingDay) return;
    await this.dataCollectionScheduler.collectForAllSecurities(
      Period.ONE_MIN,
      new Date(),
    );
  }

  /**
   * Collect 5-minute K-line data
   * Runs every 5 minutes but only during trading hours
   */
  @Cron('*/5 * * * *')
  async handle5MinCollection(): Promise<void> {
    if (!this.isTradingDay) return;
    await this.dataCollectionScheduler.collectForAllSecurities(
      Period.FIVE_MIN,
      new Date(),
    );
  }

  /**
   * Collect 15-minute K-line data
   * Runs every 15 minutes but only during trading hours
   */
  @Cron('*/15 * * * *')
  async handle15MinCollection(): Promise<void> {
    if (!this.isTradingDay) return;
    await this.dataCollectionScheduler.collectForAllSecurities(
      Period.FIFTEEN_MIN,
      new Date(),
    );
  }

  /**
   * Collect 30-minute K-line data
   * Runs every 30 minutes but only during trading hours
   */
  @Cron('*/30 * * * *')
  async handle30MinCollection(): Promise<void> {
    if (!this.isTradingDay) return;
    await this.dataCollectionScheduler.collectForAllSecurities(
      Period.THIRTY_MIN,
      new Date(),
    );
  }

  /**
   * Collect 60-minute K-line data
   * Runs at specific times: 10:31, 11:31, 14:01, 15:01
   */
  @Cron('31 10,11 * * *')
  @Cron('1 14,15 * * *')
  async handle60MinCollection(): Promise<void> {
    if (!this.isTradingDay) return;
    await this.dataCollectionScheduler.collectForAllSecurities(
      Period.SIXTY_MIN,
      new Date(),
    );
  }

  /**
   * Collect daily K-line data
   * Runs every day at 5:00 PM
   */
  @Cron(CronExpression.EVERY_DAY_AT_5PM)
  async handleDailyCollection(): Promise<void> {
    if (!this.isTradingDay) return;
    await this.dataCollectionScheduler.collectForAllSecurities(
      Period.DAY,
      new Date(),
    );
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/schedule/src/schedulers/schedule.module.ts
git add apps/schedule/src/schedulers/schedule.controller.ts
git commit -m "feat: implement schedule controller with cron jobs"
```

---

## Task 10: Update DataCollectionScheduler to Use Shared Service

**Files:**
- Modify: `apps/schedule/src/schedulers/data-collection.scheduler.ts`
- Modify: `apps/schedule/src/schedulers/schedule.module.ts`

**Goal:** Use DataSourceSelectionService instead of duplicating logic

- [ ] **Step 1: Update DataCollectionScheduler to inject DataSourceSelectionService**

```typescript
// data-collection.scheduler.ts
import { DataSourceSelectionService } from '@app/utils';

@Injectable()
export class DataCollectionScheduler {
  // ... existing code ...

  constructor(
    @InjectRepository(Security)
    private readonly securityRepository: Repository<Security>,
    private readonly dataSourceSelectionService: DataSourceSelectionService, // Use shared service
    private readonly logger: Logger,
  ) {}

  // ... existing code ...

  /**
   * Get data source for a security
   * Uses shared DataSourceSelectionService (方案B implementation)
   */
  private async getDataSourceForSecurity(security: Security): Promise<string> {
    const dataSource = await this.dataSourceSelectionService.getDataSourceForSecurity(security);
    return dataSource;
  }
}
```

- [ ] **Step 2: Update ScheduleModule to import UtilsModule**

```typescript
// schedule.module.ts
@Module({
  imports: [
    // ... existing imports ...
    UtilsModule, // Already imported, ensure it exports DataSourceSelectionService
    // ... other imports ...
  ],
  // ... rest of module ...
})
```

- [ ] **Step 3: Commit**

```bash
git add apps/schedule/src/schedulers/data-collection.scheduler.ts
git commit -m "refactor: use shared DataSourceSelectionService in scheduler"
```

---

## Task 11: Integration Testing and Documentation

**Files:**
- Create: `apps/schedule/test/integration/scheduled-collection.e2e-spec.ts`
- Update: `CLAUDE.md`

**Goal:** End-to-end testing and documentation

- [ ] **Step 0: Add test database cleanup to all test suites**

```typescript
// Add to all test files that use database
import { Repository } from 'typeorm';

describe('Test Suite Name', () => {
  // ... existing setup ...

  beforeEach(async () => {
    // Clear database before each test
    await repository.clear(); // or query with DELETE
  });

  afterEach(async () => {
    // Clean up after each test
    await repository.clear();
  });
});
```

- [ ] **Step 1: Write integration test**

```typescript
// scheduled-collection.e2e-spec.ts
describe('Scheduled Collection E2E', () => {
  it('should complete full collection cycle', async () => {
    // 1. Initialize a security with source config
    const initDto: InitStockDto = {
      code: 'TEST001.SH',
      name: 'Test Security',
      type: StockType.STOCK,
      periods: [5],
      source: {
        type: 'eastmoney',
        config: '{}',
      },
    };

    await securityService.initStock(initDto);

    // 2. Simulate cron job execution at 9:36
    const time = new Date('2024-03-25T09:36:00+08:00');

    await scheduler.collectForAllSecurities(Period.FIVE_MIN, time);

    // 3. Verify data was collected
    const kLines = await kRepository.find({
      where: {
        security: { code: 'TEST001.SH' },
        period: Period.FIVE_MIN,
      },
    });

    expect(kLines.length).toBeGreaterThan(0);
    expect(kLines[0].source).toBe(DataSource.EAST_MONEY);
  });
});
```

- [ ] **Step 2: Update CLAUDE.md with new architecture**

```markdown
## Data Collection Architecture

### Strategy Pattern
- **Polling**: East Money (scheduled via cron)
- **Streaming**: TDX, miniQMT (WebSocket, future)

### Components
- `DataCollectionScheduler`: Central orchestrator
- `IDataCollectionStrategy`: Interface for data source strategies
- `EastMoneyCollectionStrategy`: Polling with time window + merge
- `WebSocketCollectionStrategy`: Streaming (stub)

### Configuration (方案B)
Each security can have its own data source configurations via `SecuritySourceConfig`:
- `source`: Data source type
- `priority`: Higher values preferred
- `enabled`: Activate/deactivate

### Time Window (East Money only)
- 1min: 9:32-11:31, 13:01-15:01
- 5min: 9:36-11:31, 13:06-15:01
- Calculates window: `endTime = now - 1min`, `startTime = endTime - period`
```

- [ ] **Step 3: Run integration tests**

```bash
pnpm test:e2e scheduled-collection
```

- [ ] **Step 4: Commit**

```bash
git add apps/schedule/test/integration/
git add CLAUDE.md
git commit -m "test: add integration tests and update documentation"
```

---

## Task 12: Generate and Run Database Migration

**Files:**
- Generate: `mist/migration/<timestamp>-AddSecuritySourceConfig.ts`

**Goal:** Create database table for SecuritySourceConfig entity

- [ ] **Step 1: Verify SecuritySourceConfig entity is exported**

```bash
# Check if SecuritySourceConfig is exported from shared-data module
cat libs/shared-data/src/entities/index.ts | grep SecuritySourceConfig
```

Expected: Should see `export { SecuritySourceConfig } from './security-source-config.entity';`

If not exported, add it:
```typescript
// libs/shared-data/src/entities/index.ts
export * from './security.entity';
export * from './security-source-config.entity'; // ADD THIS LINE
export * from './k.entity';
```

- [ ] **Step 2: Generate migration**

```bash
cd mist
pnpm run migration:generate -- -n AddSecuritySourceConfig
```

Expected: Creates migration file in `mist/migrations/` or `mist/src/migrations/`

- [ ] **Step 3: Review generated migration**

```typescript
// Generated migration should include:
// - Table: security_source_configs
// - Columns: id, security_id, source, formatCode, priority, enabled, create_time, update_time
// - Foreign key: security_id -> securities.id (ON DELETE CASCADE)
// - Index: security_id
```

- [ ] **Step 4: Run migration**

```bash
pnpm run migration:run
```

Expected: SUCCESS message

- [ ] **Step 5: Verify table created**

```sql
-- Connect to MySQL and run:
DESCRIBE security_source_configs;
SHOW INDEX FROM security_source_configs;
```

Expected: Should see table structure and indexes

- [ ] **Step 6: Commit migration**

```bash
git add migrations/
git commit -m "feat: add migration for SecuritySourceConfig table"
```

---

## Task 13: Final Review and Cleanup

**Files:**
- Various

- [ ] **Step 1: Run all tests**

```bash
pnpm test
pnpm test:e2e
```

- [ ] **Step 2: Lint and format**

```bash
pnpm lint --fix
pnpm format
```

- [ ] **Step 3: Verify build**

```bash
pnpm build
```

- [ ] **Step 4: Create summary commit**

```bash
git add .
git commit -m "chore: final cleanup and verify all tests passing"
```

---

## Summary

This plan implements:

1. **方案B (Security-level data source configuration)**: SecuritySourceConfig queried in CollectorService and DataCollectionScheduler
2. **Scheduled data collection**: Cron jobs for all periods, only for East Money (polling mode)
3. **East Money-specific logic**: Time window calculation and K-line merging
4. **WebSocket interface**: Stub for future TDX/miniQMT streaming support
5. **Error handling**: Graceful degradation, individual security failures don't affect others

**Total estimated time**: 4-6 hours for implementation
**Test coverage**: Unit tests for all components + integration tests
**Documentation**: Updated CLAUDE.md with new architecture
