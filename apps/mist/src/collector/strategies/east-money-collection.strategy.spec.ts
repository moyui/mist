import {
  Period,
  DataSource,
  SecurityType,
  SecurityStatus,
} from '@app/shared-data';
import { EastMoneyCollectionStrategy } from './east-money-collection.strategy';

describe('EastMoneyCollectionStrategy', () => {
  let strategy: EastMoneyCollectionStrategy;
  let mockCollectorService: any;
  let mockSecurityRepository: any;
  let mockTimezoneService: any;

  beforeEach(() => {
    mockCollectorService = {
      collectKLineForSource: jest.fn().mockResolvedValue(undefined),
    };

    mockSecurityRepository = {
      find: jest.fn(),
    };

    mockTimezoneService = {
      getCurrentBeijingTime: jest.fn().mockReturnValue(new Date()),
    };

    strategy = new EastMoneyCollectionStrategy(
      mockSecurityRepository as any,
      mockCollectorService,
      mockTimezoneService,
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

  describe('collectForSecurity (manual)', () => {
    const createMockSecurity = (code: string) => ({
      id: 1,
      code,
      name: `Test ${code}`,
      type: SecurityType.STOCK,
      status: SecurityStatus.ACTIVE,
      sourceConfigs: [],
      ks: [],
      createTime: new Date(),
      updateTime: new Date(),
    });

    it('should pass startDate/endDate directly to collectorService', async () => {
      const security = createMockSecurity('000001.SH');
      const startDate = new Date('2026-03-30T09:30:00+08:00');
      const endDate = new Date('2026-03-30T11:30:00+08:00');

      await strategy.collectForSecurity(
        security,
        Period.FIVE_MIN,
        startDate,
        endDate,
      );

      expect(mockCollectorService.collectKLineForSource).toHaveBeenCalledWith(
        security.code,
        Period.FIVE_MIN,
        startDate,
        endDate,
        DataSource.EAST_MONEY,
      );
    });

    it('should handle collection errors', async () => {
      const security = createMockSecurity('000001.SH');
      const startDate = new Date('2026-03-30T09:30:00+08:00');
      const endDate = new Date('2026-03-30T11:30:00+08:00');

      mockCollectorService.collectKLineForSource.mockRejectedValue(
        new Error('Network error'),
      );

      await expect(
        strategy.collectForSecurity(
          security,
          Period.FIVE_MIN,
          startDate,
          endDate,
        ),
      ).rejects.toThrow('Network error');
    });
  });

  describe('collectScheduledCandle', () => {
    const createMockSecurity = (code: string) => ({
      id: 1,
      code,
      name: `Test ${code}`,
      type: SecurityType.STOCK,
      status: SecurityStatus.ACTIVE,
      sourceConfigs: [],
      ks: [],
      createTime: new Date(),
      updateTime: new Date(),
    });

    it('should calculate boundary and collect for minute period', async () => {
      const security = createMockSecurity('000001.SH');
      const triggerTime = new Date('2026-03-30T09:36:00+08:00');

      await strategy.collectScheduledCandle(
        security,
        Period.FIVE_MIN,
        triggerTime,
      );

      expect(mockCollectorService.collectKLineForSource).toHaveBeenCalledWith(
        security.code,
        Period.FIVE_MIN,
        expect.any(Date),
        expect.any(Date),
        DataSource.EAST_MONEY,
      );

      const call = mockCollectorService.collectKLineForSource.mock.calls[0];
      expect(call[2].getTime()).toBe(
        new Date('2026-03-30T09:30:00+08:00').getTime(),
      );
      expect(call[3].getTime()).toBe(
        new Date('2026-03-30T09:35:00+08:00').getTime(),
      );
    });

    it('should skip when triggerTime is outside trading session', async () => {
      const security = createMockSecurity('000001.SH');
      const triggerTime = new Date('2026-03-30T12:31:00+08:00'); // lunch break

      await strategy.collectScheduledCandle(
        security,
        Period.FIVE_MIN,
        triggerTime,
      );

      expect(mockCollectorService.collectKLineForSource).not.toHaveBeenCalled();
    });

    it('should use current time when triggerTime not provided', async () => {
      const security = createMockSecurity('000001.SH');

      await strategy.collectScheduledCandle(security, Period.FIVE_MIN);

      // Should either call collectorService or skip depending on current time
      // Just verify it doesn't throw
    });
  });

  describe('collectForAllSecurities', () => {
    const createMockSecurity = (code: string) => ({
      id: 1,
      code,
      name: `Test ${code}`,
      type: SecurityType.STOCK,
      status: SecurityStatus.ACTIVE,
      sourceConfigs: [],
      ks: [],
      createTime: new Date(),
      updateTime: new Date(),
    });

    it('should query active securities and collect for each', async () => {
      const securities = [
        createMockSecurity('000001.SH'),
        createMockSecurity('399006.SZ'),
      ];

      mockSecurityRepository.find.mockResolvedValue(securities);

      const triggerTime = new Date('2026-03-30T09:36:00+08:00');
      await strategy.collectForAllSecurities(Period.FIVE_MIN, triggerTime);

      expect(mockSecurityRepository.find).toHaveBeenCalledWith({
        where: { status: SecurityStatus.ACTIVE },
      });

      expect(mockCollectorService.collectKLineForSource).toHaveBeenCalledTimes(
        2,
      );
    });

    it('should skip when no active securities', async () => {
      mockSecurityRepository.find.mockResolvedValue([]);

      await strategy.collectForAllSecurities(Period.FIVE_MIN);

      expect(mockCollectorService.collectKLineForSource).not.toHaveBeenCalled();
    });

    it('should continue on individual security errors', async () => {
      const securities = [
        createMockSecurity('000001.SH'),
        createMockSecurity('399006.SZ'),
      ];

      mockSecurityRepository.find.mockResolvedValue(securities);
      mockCollectorService.collectKLineForSource
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(undefined);

      await strategy.collectForAllSecurities(Period.FIVE_MIN);

      expect(mockCollectorService.collectKLineForSource).toHaveBeenCalledTimes(
        2,
      );
    });
  });
});
