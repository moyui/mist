import { DataSource, Period, Security, SecurityStatus } from '@app/shared-data';
import { PostCloseSyncService } from './post-close-sync.service';

describe('PostCloseSyncService', () => {
  const createHarness = () => {
    const activeSecurities: Security[] = [
      { id: 1, code: '600519', status: SecurityStatus.ACTIVE } as Security,
      { id: 2, code: '300059', status: SecurityStatus.ACTIVE } as Security,
    ];

    const securityRepository = {
      find: jest.fn().mockResolvedValue(activeSecurities),
    };

    const collectorService = {
      collectKForSource: jest.fn().mockResolvedValue(240),
    };

    const dataSourceSelectionService = {
      getDataSourceForSecurity: jest
        .fn()
        .mockImplementation((sec: Security) =>
          sec.code === '600519' ? DataSource.QMT : DataSource.TDX,
        ),
    };

    const timezoneService = {
      getCurrentBeijingTime: jest
        .fn()
        .mockReturnValue(new Date('2026-08-24T14:30:00Z')),
      parseDateString: jest.fn(
        (str: string) => new Date(str.replace(' ', 'T') + '+08:00'),
      ),
    };

    const service = new PostCloseSyncService(
      securityRepository as any,
      collectorService as any,
      dataSourceSelectionService as any,
      timezoneService as any,
    );

    return {
      service,
      securityRepository,
      collectorService,
      dataSourceSelectionService,
      timezoneService,
      activeSecurities,
    };
  };

  it('syncs default DAY and ONE_MIN periods for all active securities', async () => {
    const { service, collectorService, dataSourceSelectionService } =
      createHarness();

    const report = await service.syncPostClose();

    expect(report.targetDate).toBe('2026-08-24');
    expect(report.totalSecurities).toBe(2);
    expect(report.totalTasks).toBe(4); // 2 securities x 2 periods
    expect(report.succeededTasks).toBe(4);
    expect(report.failedTasks).toBe(0);
    expect(report.totalKLinesSaved).toBe(240 * 4);
    expect(report.details).toHaveLength(4);

    // Verify dynamic data source routing per security
    expect(
      dataSourceSelectionService.getDataSourceForSecurity,
    ).toHaveBeenCalledWith(expect.objectContaining({ code: '600519' }));
    expect(collectorService.collectKForSource).toHaveBeenCalledWith(
      '600519',
      Period.DAY,
      expect.any(Date),
      expect.any(Date),
      DataSource.QMT,
    );
    expect(collectorService.collectKForSource).toHaveBeenCalledWith(
      '300059',
      Period.ONE_MIN,
      expect.any(Date),
      expect.any(Date),
      DataSource.TDX,
    );
  });

  it('supports custom periods, securityCodes, and sourceOverride', async () => {
    const { service, securityRepository, collectorService } = createHarness();
    securityRepository.find.mockResolvedValue([
      { id: 1, code: '600519', status: SecurityStatus.ACTIVE } as Security,
    ]);

    const report = await service.syncPostClose({
      targetDate: new Date('2026-08-22T00:00:00Z'),
      periods: [Period.WEEK],
      securityCodes: ['600519'],
      sourceOverride: DataSource.EAST_MONEY,
    });

    expect(report.targetDate).toBe('2026-08-22');
    expect(report.totalSecurities).toBe(1);
    expect(report.totalTasks).toBe(1);
    expect(report.succeededTasks).toBe(1);

    expect(collectorService.collectKForSource).toHaveBeenCalledWith(
      '600519',
      Period.WEEK,
      expect.any(Date),
      expect.any(Date),
      DataSource.EAST_MONEY,
    );
  });

  it('isolates single task failure without affecting others', async () => {
    const { service, collectorService } = createHarness();
    collectorService.collectKForSource.mockImplementation(
      (code: string, period: Period) => {
        if (code === '600519' && period === Period.ONE_MIN) {
          throw new Error('QMT network socket closed');
        }
        return Promise.resolve(100);
      },
    );

    const report = await service.syncPostClose();

    expect(report.totalTasks).toBe(4);
    expect(report.succeededTasks).toBe(3);
    expect(report.failedTasks).toBe(1);
    expect(report.totalKLinesSaved).toBe(300);

    const failedDetail = report.details.find(
      (d) => d.code === '600519' && d.period === Period.ONE_MIN,
    );
    expect(failedDetail).toBeDefined();
    expect(failedDetail?.success).toBe(false);
    expect(failedDetail?.error).toBe('QMT network socket closed');
    expect(failedDetail?.freshnessVerified).toBe(false);
  });

  it('handles empty securities gracefully', async () => {
    const { service, securityRepository } = createHarness();
    securityRepository.find.mockResolvedValue([]);

    const report = await service.syncPostClose();

    expect(report.totalSecurities).toBe(0);
    expect(report.totalTasks).toBe(0);
    expect(report.succeededTasks).toBe(0);
    expect(report.failedTasks).toBe(0);
    expect(report.totalKLinesSaved).toBe(0);
    expect(report.details).toHaveLength(0);
  });
});
