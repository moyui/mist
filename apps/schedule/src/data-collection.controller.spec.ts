import { Period } from '@app/shared-data';
import { DataCollectionController } from './data-collection.controller';

describe('DataCollectionController dual-window scheduling', () => {
  const createHarness = (
    currentBeijingTime = new Date('2026-08-25T14:30:00Z'),
  ) => {
    const postCloseSyncService = {
      syncPostClose: jest.fn().mockResolvedValue({
        targetDate: '2026-08-25',
        window: 'nightly_2230',
        totalSecurities: 2,
        totalTasks: 12,
        succeededTasks: 12,
        notReadyTasks: 0,
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

  it('triggers nightly 22:30 sync for core periods on ordinary weekday', async () => {
    // 2026-08-25 is Tuesday
    const tuesday = new Date('2026-08-25T14:30:00Z');
    const { postCloseSyncService, controller, logger } = createHarness(tuesday);

    await controller.handleNightlyPostCloseSync();

    expect(postCloseSyncService.syncPostClose).toHaveBeenCalledWith({
      targetDate: tuesday,
      periods: [
        Period.DAY,
        Period.ONE_MIN,
        Period.FIVE_MIN,
        Period.FIFTEEN_MIN,
        Period.THIRTY_MIN,
        Period.SIXTY_MIN,
      ],
      window: 'nightly_2230',
    });
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('automatically appends WEEK period on Friday trading day at 22:30', async () => {
    // 2026-08-28 is Friday
    const friday = new Date('2026-08-28T14:30:00Z');
    const { postCloseSyncService, controller } = createHarness(friday);

    await controller.handleNightlyPostCloseSync();

    expect(postCloseSyncService.syncPostClose).toHaveBeenCalledWith({
      targetDate: friday,
      periods: [
        Period.DAY,
        Period.ONE_MIN,
        Period.FIVE_MIN,
        Period.FIFTEEN_MIN,
        Period.THIRTY_MIN,
        Period.SIXTY_MIN,
        Period.WEEK,
      ],
      window: 'nightly_2230',
    });
  });

  it('triggers morning retry at 06:30 for previous trading day', async () => {
    // 2026-08-26 Wednesday morning 06:30 -> previous trading day is 2026-08-25 Tuesday
    const wednesdayMorning = new Date('2026-08-25T22:30:00Z'); // 06:30 Beijing
    const { postCloseSyncService, controller, logger } =
      createHarness(wednesdayMorning);

    await controller.handleMorningRetrySync();

    expect(postCloseSyncService.syncPostClose).toHaveBeenCalledWith({
      targetDate: expect.any(Date),
      periods: [
        Period.DAY,
        Period.ONE_MIN,
        Period.FIVE_MIN,
        Period.FIFTEEN_MIN,
        Period.THIRTY_MIN,
        Period.SIXTY_MIN,
      ],
      window: 'morning_0630',
    });
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('skips nightly sync on non-trading days', async () => {
    const { postCloseSyncService, timezoneService, controller, logger } =
      createHarness();
    timezoneService.isTradingDay.mockResolvedValueOnce(false);

    await controller.handleNightlyPostCloseSync();

    expect(postCloseSyncService.syncPostClose).not.toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalledWith(
      'Skipping nightly post-close sync: not an A-share trading day',
    );
  });
});
