import { format } from 'date-fns';
import { DataSource, Period, Security, SecurityStatus } from '@app/shared-data';
import { PostCloseSyncService } from './post-close-sync.service';
import { DataFreshnessStatus } from './types/post-close-sync.types';

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
      formatDate: jest.fn((date: Date) => format(date, 'yyyy-MM-dd')),
    };

    const freshnessValidator = {
      validateFreshness: jest.fn().mockImplementation((bars: any[]) => ({
        status:
          bars && bars.length > 0
            ? DataFreshnessStatus.READY
            : DataFreshnessStatus.NOT_LATEST,
        barCount: bars?.length ?? 0,
        expectedBarCount: 240,
      })),
    };

    const syncMetrics = {
      recordTask: jest.fn(),
      recordKLinesSaved: jest.fn(),
      recordDuration: jest.fn(),
      recordSuccessfulRun: jest.fn(),
    };

    const service = new PostCloseSyncService(
      securityRepository as any,
      collectorService as any,
      dataSourceSelectionService as any,
      timezoneService as any,
      freshnessValidator as any,
      syncMetrics as any,
    );

    return {
      service,
      securityRepository,
      collectorService,
      dataSourceSelectionService,
      timezoneService,
      freshnessValidator,
      syncMetrics,
      activeSecurities,
    };
  };

  it('syncs default all core periods for active securities and logs metrics', async () => {
    const {
      service,
      collectorService,
      dataSourceSelectionService,
      syncMetrics,
    } = createHarness();

    const report = await service.syncPostClose({ window: 'nightly_2230' });

    expect(report.targetDate).toBe('2026-08-24');
    expect(report.window).toBe('nightly_2230');
    expect(report.totalSecurities).toBe(2);
    // 2 securities x 4 default periods (DAY, 1m, 5m, 30m) = 8 tasks
    expect(report.totalTasks).toBe(8);
    expect(report.succeededTasks).toBe(8);
    expect(report.failedTasks).toBe(0);
    expect(report.notReadyTasks).toBe(0);
    expect(report.totalKLinesSaved).toBe(240 * 8);

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
    expect(syncMetrics.recordTask).toHaveBeenCalledWith(
      'succeeded',
      DataSource.QMT,
      Period.DAY,
    );
    expect(syncMetrics.recordSuccessfulRun).toHaveBeenCalledWith(
      'nightly_2230',
    );
  });

  it('records not_ready when collector returns 0 bars for an active security', async () => {
    const { service, collectorService, syncMetrics } = createHarness();
    collectorService.collectKForSource.mockImplementation(
      (code: string, period: Period) => {
        if (code === '300059' && period === Period.DAY) {
          return Promise.resolve(0); // not ready yet
        }
        return Promise.resolve(100);
      },
    );

    const report = await service.syncPostClose();

    expect(report.totalTasks).toBe(8);
    expect(report.succeededTasks).toBe(7);
    expect(report.notReadyTasks).toBe(1);
    expect(report.failedTasks).toBe(0);

    expect(syncMetrics.recordTask).toHaveBeenCalledWith(
      'not_ready',
      DataSource.TDX,
      Period.DAY,
    );
  });

  it('isolates task errors without aborting other securities', async () => {
    const { service, collectorService, syncMetrics } = createHarness();
    collectorService.collectKForSource.mockImplementation(
      (code: string, period: Period) => {
        if (code === '600519' && period === Period.ONE_MIN) {
          throw new Error('QMT network socket closed');
        }
        return Promise.resolve(100);
      },
    );

    const report = await service.syncPostClose();

    expect(report.totalTasks).toBe(8);
    expect(report.succeededTasks).toBe(7);
    expect(report.failedTasks).toBe(1);

    expect(syncMetrics.recordTask).toHaveBeenCalledWith(
      'failed',
      DataSource.QMT,
      Period.ONE_MIN,
    );
  });

  it('correctly resolves targetDate for late evening Beijing time (22:30) without jumping to next day', async () => {
    const { service, timezoneService } = createHarness();
    // Simulate Beijing time 2026-08-24 22:30:00
    timezoneService.getCurrentBeijingTime.mockReturnValue(
      new Date('2026-08-24T22:30:00+08:00'),
    );

    const report = await service.syncPostClose({ window: 'nightly_2230' });
    expect(report.targetDate).toBe('2026-08-24');
  });
});
