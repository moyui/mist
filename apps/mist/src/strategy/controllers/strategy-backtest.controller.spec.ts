import { HttpBusinessRejection } from '@app/transport/http';
import { StrategyBacktestController } from './strategy-backtest.controller';

describe('StrategyBacktestController', () => {
  it('returns an accepted receipt and Location without querying current state', async () => {
    const command = {
      createRun: jest
        .fn()
        .mockResolvedValue({ runId: 1, initialStatus: 'PENDING' }),
    };
    const query = {
      findRun: jest.fn(),
      listSignals: jest.fn(),
    };
    const response = { setHeader: jest.fn() };
    const controller = new StrategyBacktestController(
      command as any,
      query as any,
    );

    await expect(
      controller.createRun({} as any, response as any),
    ).resolves.toEqual({
      runId: 1,
      initialStatus: 'PENDING',
    });
    expect(command.createRun).toHaveBeenCalledTimes(1);
    expect(query.findRun).not.toHaveBeenCalled();
    expect(response.setHeader).toHaveBeenCalledWith(
      'Location',
      '/v1/strategy-backtests/1',
    );
  });

  it('keeps the Location header for a 200 business rejection', async () => {
    const command = {
      createRun: jest.fn().mockResolvedValue(
        new HttpBusinessRejection('BACKTEST_RUN_ALREADY_FAILED', 'failed', {
          runId: 2,
          status: 'failed',
        }),
      ),
    };
    const response = { setHeader: jest.fn() };
    const controller = new StrategyBacktestController(
      command as any,
      {} as any,
    );

    await controller.createRun({} as any, response as any);
    expect(response.setHeader).toHaveBeenCalledWith(
      'Location',
      '/v1/strategy-backtests/2',
    );
  });

  it('delegates listRuns to queryService', async () => {
    const query = {
      listRuns: jest.fn().mockResolvedValue([{ id: 10 }]),
    };
    const controller = new StrategyBacktestController({} as any, query as any);
    const dto = { strategyDefinitionId: 22, limit: 50 };
    await expect(controller.listRuns(dto)).resolves.toEqual([{ id: 10 }]);
    expect(query.listRuns).toHaveBeenCalledWith(dto);
  });
});
