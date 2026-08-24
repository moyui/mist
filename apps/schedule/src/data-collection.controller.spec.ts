import { Period } from '@app/shared-data';
import { DataCollectionController } from './data-collection.controller';

describe('DataCollectionController collection scheduling', () => {
  const createHarness = () => {
    const collectionStrategy = {
      collectForAllSecurities: jest.fn().mockResolvedValue(undefined),
    };
    const timezoneService = {
      getCurrentBeijingTime: jest.fn(() => new Date('2026-07-07T10:00:00Z')),
      isTradingDay: jest.fn().mockResolvedValue(true),
    };
    const controller = new (DataCollectionController as any)(
      collectionStrategy,
      timezoneService,
    ) as DataCollectionController;
    const logger = controller as any;
    jest.spyOn(logger.logger, 'log').mockImplementation(() => undefined);
    jest.spyOn(logger.logger, 'error').mockImplementation(() => undefined);

    return {
      collectionStrategy,
      timezoneService,
      controller,
      logger: logger.logger,
    };
  };

  it('collects the scheduled period without invoking a strategy runtime', async () => {
    const { collectionStrategy, controller, logger } = createHarness();

    await controller.handleDailyCollection();

    expect(collectionStrategy.collectForAllSecurities).toHaveBeenCalledWith(
      Period.DAY,
    );
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('reports collection failures without invoking another subsystem', async () => {
    const { collectionStrategy, controller, logger } = createHarness();
    collectionStrategy.collectForAllSecurities.mockRejectedValueOnce(
      new Error('collector offline'),
    );

    await controller.handleDailyCollection();

    expect(logger.error).toHaveBeenCalledWith(
      'Daily collection failed: collector offline',
    );
  });
});
