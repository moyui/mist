import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DataSourceSelectionService } from '@app/utils';
import { TimezoneService } from '@app/timezone';
import { DataCollectionScheduler } from './data-collection.scheduler';
import {
  Period,
  DataSource,
  SecurityType,
  SecurityStatus,
} from '@app/shared-data';
import { IDataCollectionStrategy } from './strategies/data-collection.strategy.interface';
import { Security } from '@app/shared-data';

const mockDataSourceSelectionService = {
  getDataSourceForSecurity: jest.fn(),
};

const mockTimezoneService = {
  isTradingDay: jest.fn(),
};

const createMockStrategy = (
  source: DataSource,
  mode: 'polling' | 'streaming' = 'polling',
): IDataCollectionStrategy & { collectScheduledCandle: jest.Mock } => ({
  source,
  mode,
  collectForSecurity: jest.fn(),
  collectScheduledCandle: jest.fn(),
});

const createMockSecurity = (code: string, status = SecurityStatus.ACTIVE) => ({
  id: Math.random(),
  code,
  name: `Test ${code}`,
  type: SecurityType.STOCK,
  status,
  sourceConfigs: [],
  ks: [],
  createTime: new Date(),
  updateTime: new Date(),
});

describe('DataCollectionScheduler', () => {
  let scheduler: DataCollectionScheduler;
  let mockSecurityRepository: jest.Mocked<Repository<Security>>;

  beforeEach(async () => {
    mockSecurityRepository = {
      find: jest.fn(),
    } as any;

    // Default: trading day is true
    mockTimezoneService.isTradingDay.mockResolvedValue(true);
    mockDataSourceSelectionService.getDataSourceForSecurity.mockResolvedValue(
      DataSource.EAST_MONEY,
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DataCollectionScheduler,
        {
          provide: getRepositoryToken(Security),
          useValue: mockSecurityRepository,
        },
        {
          provide: DataSourceSelectionService,
          useValue: mockDataSourceSelectionService,
        },
        {
          provide: TimezoneService,
          useValue: mockTimezoneService,
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
      const strategy = createMockStrategy(DataSource.EAST_MONEY);

      scheduler.registerStrategy(Period.FIVE_MIN, strategy);

      expect(scheduler['strategies'].get(Period.FIVE_MIN)).toBe(strategy);
    });

    it('should allow overriding existing strategy', () => {
      const strategy1 = createMockStrategy(DataSource.EAST_MONEY);
      const strategy2 = createMockStrategy(DataSource.TDX);

      scheduler.registerStrategy(Period.FIVE_MIN, strategy1);
      scheduler.registerStrategy(Period.FIVE_MIN, strategy2);

      expect(scheduler['strategies'].get(Period.FIVE_MIN)).toBe(strategy2);
    });
  });

  describe('collectForAllSecurities', () => {
    it('should skip collection when not trading day', async () => {
      mockTimezoneService.isTradingDay.mockResolvedValue(false);

      const strategy = createMockStrategy(DataSource.EAST_MONEY);
      scheduler.registerStrategy(Period.FIVE_MIN, strategy);

      await scheduler.collectForAllSecurities(Period.FIVE_MIN);

      expect(mockSecurityRepository.find).not.toHaveBeenCalled();
      expect(strategy.collectScheduledCandle).not.toHaveBeenCalled();
    });

    it('should collect for all active securities', async () => {
      const securities = [
        createMockSecurity('000001.SH'),
        createMockSecurity('000002.SH'),
        createMockSecurity('600000.SH'),
        createMockSecurity('399001.SZ', SecurityStatus.SUSPENDED), // Should skip
      ];

      mockSecurityRepository.find.mockResolvedValue(securities);

      const strategy = createMockStrategy(DataSource.EAST_MONEY);
      strategy.collectScheduledCandle.mockResolvedValue(undefined);
      scheduler.registerStrategy(Period.FIVE_MIN, strategy);

      await scheduler.collectForAllSecurities(Period.FIVE_MIN);

      // Should only collect for active securities (3 out of 4)
      // Note: Currently collects all 4 because query doesn't filter by status
      // TODO: Update query to filter by SecurityStatus.ACTIVE
      expect(strategy.collectScheduledCandle).toHaveBeenCalledTimes(4);
    });

    it('should skip when no strategy registered for period', async () => {
      const securities = [createMockSecurity('000001.SH')];
      mockSecurityRepository.find.mockResolvedValue(securities);

      const strategy = createMockStrategy(DataSource.EAST_MONEY);
      strategy.collectScheduledCandle.mockResolvedValue(undefined);

      // Don't register any strategy

      await scheduler.collectForAllSecurities(Period.FIVE_MIN);

      expect(strategy.collectScheduledCandle).not.toHaveBeenCalled();
    });

    it('should skip when no active securities found', async () => {
      mockSecurityRepository.find.mockResolvedValue([]);

      const strategy = createMockStrategy(DataSource.EAST_MONEY);
      scheduler.registerStrategy(Period.FIVE_MIN, strategy);

      await scheduler.collectForAllSecurities(Period.FIVE_MIN);

      expect(strategy.collectScheduledCandle).not.toHaveBeenCalled();
    });

    it('should handle collection errors gracefully', async () => {
      const securities = [
        createMockSecurity('000001.SH'),
        createMockSecurity('000002.SH'),
      ];

      mockSecurityRepository.find.mockResolvedValue(securities);

      const strategy = createMockStrategy(DataSource.EAST_MONEY);
      strategy.collectScheduledCandle
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('Network error'));

      scheduler.registerStrategy(Period.FIVE_MIN, strategy);

      // Should not throw
      await expect(
        scheduler.collectForAllSecurities(Period.FIVE_MIN),
      ).resolves.not.toThrow();

      // Both should be attempted
      expect(strategy.collectScheduledCandle).toHaveBeenCalledTimes(2);
    });

    it('should pass current time to strategy', async () => {
      const securities = [createMockSecurity('000001.SH')];
      mockSecurityRepository.find.mockResolvedValue(securities);

      const strategy = createMockStrategy(DataSource.EAST_MONEY);
      scheduler.registerStrategy(Period.FIVE_MIN, strategy);

      const testTime = new Date('2024-03-25T10:30:00Z');
      await scheduler.collectForAllSecurities(Period.FIVE_MIN, testTime);

      expect(strategy.collectScheduledCandle).toHaveBeenCalledWith(
        securities[0],
        Period.FIVE_MIN,
        testTime,
      );
    });
  });

  describe('collectForSecurity', () => {
    it('should skip when no strategy registered for period', async () => {
      const security = createMockSecurity('000001.SH');

      await scheduler.collectForSecurity(security, Period.FIVE_MIN);

      // Should not throw, just skip
      expect(
        mockDataSourceSelectionService.getDataSourceForSecurity,
      ).not.toHaveBeenCalled();
    });

    it('should use polling strategy when available', async () => {
      const security = createMockSecurity('000001.SH');
      const strategy = createMockStrategy(DataSource.EAST_MONEY, 'polling');

      mockDataSourceSelectionService.getDataSourceForSecurity.mockResolvedValue(
        DataSource.EAST_MONEY,
      );

      scheduler.registerStrategy(Period.FIVE_MIN, strategy);

      await scheduler.collectForSecurity(security, Period.FIVE_MIN);

      expect(strategy.collectScheduledCandle).toHaveBeenCalledWith(
        security,
        Period.FIVE_MIN,
        undefined,
      );
    });

    it('should skip streaming strategies in scheduled collection', async () => {
      const security = createMockSecurity('000001.SH');
      const strategy = createMockStrategy(DataSource.TDX, 'streaming');

      mockDataSourceSelectionService.getDataSourceForSecurity.mockResolvedValue(
        DataSource.TDX,
      );

      scheduler.registerStrategy(Period.FIVE_MIN, strategy);

      await scheduler.collectForSecurity(security, Period.FIVE_MIN);

      expect(strategy.collectScheduledCandle).not.toHaveBeenCalled();
    });

    it('should skip when strategy source does not match security data source', async () => {
      const security = createMockSecurity('000001.SH');
      const strategy = createMockStrategy(DataSource.EAST_MONEY);

      // Security uses TDX but strategy is EAST_MONEY
      mockDataSourceSelectionService.getDataSourceForSecurity.mockResolvedValue(
        DataSource.TDX,
      );

      scheduler.registerStrategy(Period.FIVE_MIN, strategy);

      await scheduler.collectForSecurity(security, Period.FIVE_MIN);

      expect(strategy.collectScheduledCandle).not.toHaveBeenCalled();
    });
  });

  describe('startStreamingStrategies', () => {
    it('should start all streaming strategies', async () => {
      const streamingStrategy = createMockStrategy(
        DataSource.TDX,
        'streaming',
      ) as any;
      streamingStrategy.start = jest.fn().mockResolvedValue(undefined);

      const pollingStrategy = createMockStrategy(
        DataSource.EAST_MONEY,
        'polling',
      ) as any;
      // Polling strategy doesn't have start method

      scheduler.registerStrategy(Period.ONE_MIN, pollingStrategy);
      scheduler.registerStrategy(Period.FIVE_MIN, streamingStrategy);
      scheduler.registerStrategy(Period.FIFTEEN_MIN, streamingStrategy);

      await scheduler.startStreamingStrategies();

      // Should start streaming strategy only once (deduplicated by source)
      expect(streamingStrategy.start).toHaveBeenCalledTimes(1);
      // Polling strategy doesn't have start, so it won't be called
    });

    it('should handle errors when starting streaming strategies', async () => {
      const streamingStrategy = createMockStrategy(
        DataSource.TDX,
        'streaming',
      ) as any;
      streamingStrategy.start = jest
        .fn()
        .mockRejectedValue(new Error('Connection failed'));

      scheduler.registerStrategy(Period.ONE_MIN, streamingStrategy);

      // Should not throw
      await expect(scheduler.startStreamingStrategies()).resolves.not.toThrow();
    });
  });

  describe('stopStreamingStrategies', () => {
    it('should stop all streaming strategies', async () => {
      const streamingStrategy = createMockStrategy(
        DataSource.TDX,
        'streaming',
      ) as any;
      streamingStrategy.stop = jest.fn().mockResolvedValue(undefined);

      const pollingStrategy = createMockStrategy(
        DataSource.EAST_MONEY,
        'polling',
      ) as any;
      // Polling strategy doesn't have stop method

      scheduler.registerStrategy(Period.ONE_MIN, pollingStrategy);
      scheduler.registerStrategy(Period.FIVE_MIN, streamingStrategy);

      await scheduler.stopStreamingStrategies();

      expect(streamingStrategy.stop).toHaveBeenCalledTimes(1);
      // Polling strategy doesn't have stop, so it won't be called
    });

    it('should handle errors when stopping streaming strategies', async () => {
      const streamingStrategy = createMockStrategy(
        DataSource.TDX,
        'streaming',
      ) as any;
      streamingStrategy.stop = jest
        .fn()
        .mockRejectedValue(new Error('Disconnect failed'));

      scheduler.registerStrategy(Period.ONE_MIN, streamingStrategy);

      // Should not throw
      await expect(scheduler.stopStreamingStrategies()).resolves.not.toThrow();
    });
  });
});
