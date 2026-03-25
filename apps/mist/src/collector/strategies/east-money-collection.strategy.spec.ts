import { Logger } from '@nestjs/common';
import { Period, DataSource, SecurityType } from '@app/shared-data';
import { EastMoneyCollectionStrategy } from './east-money-collection.strategy';

describe('EastMoneyCollectionStrategy', () => {
  let strategy: EastMoneyCollectionStrategy;
  let mockCollectorService: any;
  let mockTimeWindowStrategy: any;
  let mockKLineMergeService: any;

  beforeEach(() => {
    mockCollectorService = {
      collectKLineForSource: jest.fn().mockResolvedValue(undefined),
    };

    mockTimeWindowStrategy = {
      calculateCollectionWindow: jest.fn().mockReturnValue({
        startTime: new Date('2026-03-25T09:30:00Z'),
        endTime: new Date('2026-03-25T09:35:00Z'),
        ensureRecentCount: 2,
      }),
      isValidCollectionWindow: jest.fn().mockReturnValue(true),
    };

    mockKLineMergeService = {
      mergeKLineData: jest.fn().mockReturnValue([]),
    };

    strategy = new EastMoneyCollectionStrategy(
      mockCollectorService,
      mockTimeWindowStrategy,
      mockKLineMergeService,
      new Logger('EastMoneyStrategy'),
    );
  });

  describe('strategy properties', () => {
    it('should have EAST_MONEY as source', () => {
      expect(strategy.source).toBe(DataSource.EAST_MONEY);
    });

    it('should have polling as mode', () => {
      expect(strategy.mode).toBe('polling');
    });
  });

  describe('collectForSecurity', () => {
    const createMockSecurity = (code: string) => ({
      id: 1,
      code,
      name: `Test ${code}`,
      type: SecurityType.STOCK,
      status: 1,
      sourceConfigs: [],
      ks: [],
      createTime: new Date(),
      updateTime: new Date(),
    });

    it('should calculate collection window and collect data', async () => {
      const security = createMockSecurity('000001.SH');
      const testTime = new Date('2026-03-25T09:35:00Z');

      mockTimeWindowStrategy.calculateCollectionWindow.mockReturnValue({
        startTime: new Date('2026-03-25T09:30:00Z'),
        endTime: new Date('2026-03-25T09:35:00Z'),
        ensureRecentCount: 2,
      });

      await strategy.collectForSecurity(security, Period.FIVE_MIN, testTime);

      expect(
        mockTimeWindowStrategy.calculateCollectionWindow,
      ).toHaveBeenCalledWith(Period.FIVE_MIN, testTime);

      expect(mockCollectorService.collectKLineForSource).toHaveBeenCalledWith(
        security.code,
        Period.FIVE_MIN,
        expect.any(Date),
        expect.any(Date),
        DataSource.EAST_MONEY,
        expect.any(Function),
      );
    });

    it('should skip collection when window is not valid', async () => {
      const security = createMockSecurity('000001.SH');

      mockTimeWindowStrategy.isValidCollectionWindow.mockReturnValue(false);

      await strategy.collectForSecurity(security, Period.FIVE_MIN);

      expect(mockCollectorService.collectKLineForSource).not.toHaveBeenCalled();
    });

    it('should apply K-line merge to collected data', async () => {
      const security = createMockSecurity('000001.SH');
      const rawData = [
        {
          timestamp: new Date('2026-03-25T09:30:00Z'),
          open: 10.0,
          high: 10.5,
          low: 9.8,
          close: 10.2,
          volume: 1000,
          amount: 10000,
        },
        {
          timestamp: new Date('2026-03-25T09:31:00Z'),
          open: 10.2,
          high: 10.6,
          low: 10.0,
          close: 10.4,
          volume: 1200,
          amount: 12000,
        },
      ];

      let postProcessCallback: any;
      mockCollectorService.collectKLineForSource.mockImplementation(
        async (
          _code: string,
          _period: Period,
          _start: Date,
          _end: Date,
          _source: DataSource,
          callback: any,
        ) => {
          postProcessCallback = callback;
        },
      );

      mockKLineMergeService.mergeKLineData.mockReturnValue([
        {
          timestamp: new Date('2026-03-25T09:30:00Z'),
          open: 10.0,
          high: 10.6,
          low: 9.8,
          close: 10.4,
          volume: 2200,
          amount: 22000,
        },
      ]);

      await strategy.collectForSecurity(security, Period.FIVE_MIN);

      // Call the post-process callback
      if (postProcessCallback) {
        await postProcessCallback(rawData);
      }

      expect(mockKLineMergeService.mergeKLineData).toHaveBeenCalledWith(
        rawData,
        Period.FIVE_MIN,
        Period.ONE_MIN,
      );
    });

    it('should handle collection errors', async () => {
      const security = createMockSecurity('000001.SH');

      mockCollectorService.collectKLineForSource.mockRejectedValue(
        new Error('Network error'),
      );

      await expect(
        strategy.collectForSecurity(security, Period.FIVE_MIN),
      ).rejects.toThrow('Network error');
    });

    it('should use current time when time not provided', async () => {
      const security = createMockSecurity('000001.SH');
      const beforeCall = new Date();

      await strategy.collectForSecurity(security, Period.FIVE_MIN);

      const afterCall = new Date();

      expect(
        mockTimeWindowStrategy.calculateCollectionWindow,
      ).toHaveBeenCalledWith(Period.FIVE_MIN, expect.any(Date));

      const callTime =
        mockTimeWindowStrategy.calculateCollectionWindow.mock.calls[0][1];
      expect(callTime.getTime()).toBeGreaterThanOrEqual(beforeCall.getTime());
      expect(callTime.getTime()).toBeLessThanOrEqual(afterCall.getTime());
    });
  });
});
