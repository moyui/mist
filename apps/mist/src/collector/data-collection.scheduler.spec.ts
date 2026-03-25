import { Test, TestingModule } from '@nestjs/testing';
import { DataSourceSelectionService } from '@app/utils';
import { DataCollectionScheduler } from './data-collection.scheduler';
import { CollectorService } from './collector.service';
import { Period, DataSource, SecurityType } from '@app/shared-data';
import { IDataCollectionStrategy } from './strategies/data-collection.strategy.interface';
import { CollectionWindow } from './time-window/time-window.strategy.interface';

const mockCollectorService = {
  collectKLineForSource: jest.fn(),
  findSecurityByCode: jest.fn(),
};

const mockDataSourceSelectionService = {
  getDataSourceForSecurity: jest.fn(),
};

const mockStrategy = {
  collect: jest.fn(),
  getTimeWindowStrategy: jest.fn(),
  getKLineMergeService: jest.fn(),
  getCollectionMode: jest.fn(),
  canCollect: jest.fn(),
};

describe('DataCollectionScheduler', () => {
  let scheduler: DataCollectionScheduler;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DataCollectionScheduler,
        {
          provide: CollectorService,
          useValue: mockCollectorService,
        },
        {
          provide: DataSourceSelectionService,
          useValue: mockDataSourceSelectionService,
        },
      ],
    }).compile();

    scheduler = module.get<DataCollectionScheduler>(DataCollectionScheduler);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('registerStrategy', () => {
    it('should register a collection strategy for a period', () => {
      const strategy = mockStrategy;

      scheduler.registerStrategy(Period.FIVE_MIN, strategy);

      expect(scheduler['strategies'].get(Period.FIVE_MIN)).toBe(strategy);
    });

    it('should allow overriding existing strategy', () => {
      const strategy1 = mockStrategy as unknown as IDataCollectionStrategy;
      const strategy2 = {
        ...mockStrategy,
      } as unknown as IDataCollectionStrategy;

      scheduler.registerStrategy(Period.FIVE_MIN, strategy1);
      scheduler.registerStrategy(Period.FIVE_MIN, strategy2);

      expect(scheduler['strategies'].get(Period.FIVE_MIN)).toBe(strategy2);
    });
  });

  describe('collectForAllSecurities', () => {
    beforeEach(() => {
      mockDataSourceSelectionService.getDataSourceForSecurity.mockResolvedValue(
        DataSource.EAST_MONEY,
      );
      mockCollectorService.collectKLineForSource.mockResolvedValue(undefined);
      mockCollectorService.findSecurityByCode.mockResolvedValue({
        id: 1,
        code: '000001',
        name: 'Test Security',
        type: SecurityType.STOCK,
        status: 1,
        sourceConfigs: [],
        ks: [],
        createTime: new Date(),
        updateTime: new Date(),
      });
    });

    it('should collect data for all active securities for a given period', async () => {
      const securityCodes = ['000001', '000002', '600000'];
      const strategy = mockStrategy;
      strategy.canCollect.mockReturnValue(true);

      scheduler.registerStrategy(Period.FIVE_MIN, strategy);

      await scheduler.collectForAllSecurities(securityCodes, Period.FIVE_MIN);

      expect(mockCollectorService.collectKLineForSource).toHaveBeenCalledTimes(
        3,
      );
      expect(mockCollectorService.collectKLineForSource).toHaveBeenCalledWith(
        '000001',
        Period.FIVE_MIN,
        expect.any(Date),
        expect.any(Date),
        DataSource.EAST_MONEY,
      );
    });

    it('should skip securities that cannot be collected by the strategy', async () => {
      const securityCodes = ['000001', '000002'];
      const strategy = mockStrategy;
      strategy.canCollect.mockImplementation(
        (code: string) => code === '000001',
      );

      scheduler.registerStrategy(Period.FIVE_MIN, strategy);

      await scheduler.collectForAllSecurities(securityCodes, Period.FIVE_MIN);

      expect(mockCollectorService.collectKLineForSource).toHaveBeenCalledTimes(
        1,
      );
      expect(mockCollectorService.collectKLineForSource).toHaveBeenCalledWith(
        '000001',
        Period.FIVE_MIN,
        expect.any(Date),
        expect.any(Date),
        DataSource.EAST_MONEY,
      );
    });

    it('should handle errors for individual securities gracefully', async () => {
      const securityCodes = ['000001', '000002'];
      const strategy = mockStrategy;
      strategy.canCollect.mockReturnValue(true);

      mockCollectorService.collectKLineForSource.mockRejectedValueOnce(
        new Error('Network error'),
      );

      scheduler.registerStrategy(Period.FIVE_MIN, strategy);

      await scheduler.collectForAllSecurities(securityCodes, Period.FIVE_MIN);

      // Should continue with next security even if one fails
      expect(mockCollectorService.collectKLineForSource).toHaveBeenCalledTimes(
        2,
      );
    });
  });

  describe('collectForSecurity', () => {
    beforeEach(() => {
      mockDataSourceSelectionService.getDataSourceForSecurity.mockResolvedValue(
        DataSource.EAST_MONEY,
      );
      mockCollectorService.collectKLineForSource.mockResolvedValue(undefined);
      mockCollectorService.findSecurityByCode.mockResolvedValue({
        id: 1,
        code: '000001',
        name: 'Test Security',
        type: SecurityType.STOCK,
        status: 1,
        sourceConfigs: [],
        ks: [],
        createTime: new Date(),
        updateTime: new Date(),
      });
    });

    it('should collect data for a single security', async () => {
      const strategy = mockStrategy;
      strategy.canCollect.mockReturnValue(true);

      scheduler.registerStrategy(Period.FIVE_MIN, strategy);

      await scheduler.collectForSecurity('000001', Period.FIVE_MIN);

      expect(mockCollectorService.collectKLineForSource).toHaveBeenCalledWith(
        '000001',
        Period.FIVE_MIN,
        expect.any(Date),
        expect.any(Date),
        DataSource.EAST_MONEY,
      );
    });

    it('should use DataSourceSelectionService to get data source', async () => {
      const strategy = mockStrategy;
      strategy.canCollect.mockReturnValue(true);

      scheduler.registerStrategy(Period.FIVE_MIN, strategy);

      await scheduler.collectForSecurity('000001', Period.FIVE_MIN);

      expect(
        mockDataSourceSelectionService.getDataSourceForSecurity,
      ).toHaveBeenCalled();
    });

    it('should skip if strategy cannot collect for the security', async () => {
      const strategy = mockStrategy;
      strategy.canCollect.mockReturnValue(false);

      scheduler.registerStrategy(Period.FIVE_MIN, strategy);

      await scheduler.collectForSecurity('000001', Period.FIVE_MIN);

      expect(mockCollectorService.collectKLineForSource).not.toHaveBeenCalled();
    });

    it('should skip if security not found', async () => {
      const strategy = mockStrategy;
      strategy.canCollect.mockReturnValue(true);

      mockCollectorService.findSecurityByCode.mockResolvedValue(null);

      scheduler.registerStrategy(Period.FIVE_MIN, strategy);

      await scheduler.collectForSecurity('999999', Period.FIVE_MIN);

      expect(mockCollectorService.collectKLineForSource).not.toHaveBeenCalled();
    });

    it('should use strategy-provided time window if available', async () => {
      const strategy = mockStrategy;
      strategy.canCollect.mockReturnValue(true);

      const mockWindow: CollectionWindow = {
        startTime: new Date('2024-01-01'),
        endTime: new Date('2024-01-02'),
        ensureRecentCount: 0,
      };

      strategy.getTimeWindowStrategy.mockReturnValue({
        calculateCollectionWindow: jest.fn().mockReturnValue(mockWindow),
      } as any);

      scheduler.registerStrategy(Period.FIVE_MIN, strategy);

      await scheduler.collectForSecurity('000001', Period.FIVE_MIN);

      expect(mockCollectorService.collectKLineForSource).toHaveBeenCalledWith(
        '000001',
        Period.FIVE_MIN,
        mockWindow.startTime,
        mockWindow.endTime,
        DataSource.EAST_MONEY,
      );
    });
  });

  describe('getDataSourceForSecurity', () => {
    it('should use DataSourceSelectionService to get data source', async () => {
      const mockSecurity = {
        id: 1,
        code: '000001',
        name: 'Test Security',
        type: SecurityType.STOCK,
        status: 1,
        sourceConfigs: [],
        ks: [],
        createTime: new Date(),
        updateTime: new Date(),
      };

      mockDataSourceSelectionService.getDataSourceForSecurity.mockResolvedValue(
        DataSource.TDX,
      );

      const result = await scheduler['getDataSourceForSecurity'](mockSecurity);

      expect(result).toBe(DataSource.TDX);
      expect(
        mockDataSourceSelectionService.getDataSourceForSecurity,
      ).toHaveBeenCalledWith(mockSecurity);
    });
  });
});
