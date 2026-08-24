import { Period } from '@app/shared-data';
import { DataCollectionController } from './data-collection.controller';

describe('DataCollectionController nightly post-close scheduling', () => {
  const createHarness = (
    currentBeijingTime = new Date('2026-08-25T14:30:00Z'),
  ) => {
    const postCloseSyncService = {
      syncPostClose: jest.fn().mockResolvedValue({
        targetDate: '2026-08-25',
        totalSecurities: 2,
        totalTasks: 4,
        succeededTasks: 4,
        failedTasks: 0,
        totalKLinesSaved: 480,
        durationMs: 200,
        details: [],
      }),
    };
    const timezoneService = {
      getCurrentBeijingTime: jest.fn(() => currentBeijingTime),
      isTradingDay: jest.fn().mockResolvedValue(true),
    };
    const controller = new DataCollectionController(
      postCloseSyncService as any,
      timezoneService as any,
    );
    const logger = controller as any;
    jest.spyOn(logger.logger, 'log').mockImplementation(() => undefined);
    jest.spyOn(logger.logger, 'debug').mockImplementation(() => undefined);
    jest.spyOn(logger.logger, 'error').mockImplementation(() => undefined);

    return {
      postCloseSyncService,
      timezoneService,
      controller,
      logger: logger.logger,
    };
  };

  it('triggers nightly post-close sync for DAY and ONE_MIN on ordinary weekday', async () => {
    // 2026-08-25 is Tuesday
    const tuesday = new Date('2026-08-25T14:30:00Z');
    const { postCloseSyncService, controller, logger } = createHarness(tuesday);

    await controller.handleNightlyPostCloseSync();

    expect(postCloseSyncService.syncPostClose).toHaveBeenCalledWith({
      targetDate: tuesday,
      periods: [Period.DAY, Period.ONE_MIN],
    });
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('automatically appends WEEK period on Friday trading day', async () => {
    // 2026-08-28 is Friday
    const friday = new Date('2026-08-28T14:30:00Z');
    const { postCloseSyncService, controller } = createHarness(friday);

    await controller.handleNightlyPostCloseSync();

    expect(postCloseSyncService.syncPostClose).toHaveBeenCalledWith({
      targetDate: friday,
      periods: [Period.DAY, Period.ONE_MIN, Period.WEEK],
    });
  });

  it('automatically appends MONTH period on last day of month', async () => {
    // 2026-08-31 is Monday and last day of August
    const lastDayOfMonth = new Date('2026-08-31T14:30:00Z');
    const { postCloseSyncService, controller } = createHarness(lastDayOfMonth);

    await controller.handleNightlyPostCloseSync();

    expect(postCloseSyncService.syncPostClose).toHaveBeenCalledWith({
      targetDate: lastDayOfMonth,
      periods: [Period.DAY, Period.ONE_MIN, Period.MONTH],
    });
  });

  it('skips sync on non-trading days', async () => {
    const { postCloseSyncService, timezoneService, controller, logger } =
      createHarness();
    timezoneService.isTradingDay.mockResolvedValueOnce(false);

    await controller.handleNightlyPostCloseSync();

    expect(postCloseSyncService.syncPostClose).not.toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalledWith(
      'Skipping nightly post-close sync: not an A-share trading day',
    );
  });

  it('reports errors when sync service throws', async () => {
    const { postCloseSyncService, controller, logger } = createHarness();
    postCloseSyncService.syncPostClose.mockRejectedValueOnce(
      new Error('database unavailable'),
    );

    await controller.handleNightlyPostCloseSync();

    expect(logger.error).toHaveBeenCalledWith(
      'Nightly post-close sync failed: database unavailable',
    );
  });
});
