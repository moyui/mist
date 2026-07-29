import {
  BacktestRunStatus,
  DataSource,
  Period,
  StrategyRuleSchemaVersion,
} from '@app/shared-data';
import { StrategyEvaluationContextBuilder } from '../scanner/strategy-evaluation-context.builder';
import { StrategyRuleEvaluator } from '../rules/strategy-rule-evaluator';
import { StrategyBacktestService } from './strategy-backtest.service';

describe('StrategyBacktestService', () => {
  const createHarness = (options?: { kFindShouldThrow?: boolean }) => {
    const strategyVersion = {
      id: 9,
      strategyDefinitionId: 3,
      ruleSchemaVersion: StrategyRuleSchemaVersion.V1,
      rule: { field: 'k.close', operator: 'gt', value: 100 },
    };
    const kRows = [
      {
        id: 1,
        security: { code: '600519', type: 'STOCK' },
        source: DataSource.TDX,
        period: Period.DAY,
        timestamp: new Date('2026-01-02T00:00:00.000Z'),
        open: 98,
        high: 121,
        low: 95,
        close: 120,
        volume: 1000n,
        amount: 120000,
      },
      {
        id: 2,
        security: { code: '600519', type: 'STOCK' },
        source: DataSource.TDX,
        period: Period.DAY,
        timestamp: new Date('2026-01-03T00:00:00.000Z'),
        open: 80,
        high: 90,
        low: 75,
        close: 88,
        volume: 800n,
        amount: 70400,
      },
    ];
    const strategyVersionRepository = {
      findOne: jest.fn().mockResolvedValue(strategyVersion),
    };
    const savedRuns: any[] = [];
    const backtestRunRepository = {
      create: jest.fn((input) => ({ ...input })),
      save: jest.fn(async (input) => {
        const run = input.id ? input : { id: 1, ...input };
        savedRuns.push({ ...run });
        return run;
      }),
      findOne: jest.fn(),
    };
    const kRepository = {
      find: options?.kFindShouldThrow
        ? jest.fn().mockRejectedValue(new Error('K query failed'))
        : jest.fn().mockResolvedValue(kRows),
    };
    const resultRepository = {
      create: jest.fn((input) => ({ ...input })),
      save: jest.fn(async (input) => ({ id: 10, ...input })),
      find: jest.fn(),
    };
    const service = new StrategyBacktestService(
      strategyVersionRepository as any,
      backtestRunRepository as any,
      resultRepository as any,
      kRepository as any,
      new StrategyEvaluationContextBuilder(),
      new StrategyRuleEvaluator(),
    );

    return {
      service,
      backtestRunRepository,
      kRepository,
      resultRepository,
      savedRuns,
    };
  };

  it('executes a signal-level backtest run and persists matching signal results', async () => {
    const { service, kRepository, resultRepository } = createHarness();

    const run = await service.createRun({
      strategyVersionId: 9,
      targetUniverse: ['600519'],
      period: Period.DAY,
      source: DataSource.TDX,
      startDate: '2026-01-01',
      endDate: '2026-06-30',
    });

    expect(run).toMatchObject({
      id: 1,
      strategyDefinitionId: 3,
      strategyVersionId: 9,
      status: BacktestRunStatus.COMPLETED,
      signalCount: 1,
      matchedSecurityCount: 1,
    });
    expect(run.startedAt).toBeInstanceOf(Date);
    expect(run.completedAt).toBeInstanceOf(Date);
    expect(kRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        relations: ['security'],
        order: { timestamp: 'ASC' },
      }),
    );
    expect(resultRepository.save).toHaveBeenCalledTimes(1);
    expect(resultRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        backtestRun: expect.objectContaining({ id: 1 }),
        backtestRunId: 1,
        securityCode: '600519',
        signalTime: new Date('2026-01-02T00:00:00.000Z'),
        ruleSnapshot: { field: 'k.close', operator: 'gt', value: 100 },
      }),
    );
    const persistedResult = resultRepository.save.mock.calls[0][0];
    expect(persistedResult).not.toHaveProperty('strategyDefinitionId');
    expect(persistedResult).not.toHaveProperty('strategyVersionId');
    expect(persistedResult).not.toHaveProperty('period');
    expect(persistedResult).not.toHaveProperty('source');
    expect(run).not.toHaveProperty('cash');
    expect(run).not.toHaveProperty('positions');
    expect(run).not.toHaveProperty('orders');
    expect(run).not.toHaveProperty('slippage');
  });

  it('marks the run failed when replay cannot complete', async () => {
    const { service, savedRuns } = createHarness({ kFindShouldThrow: true });

    await expect(
      service.createRun({
        strategyVersionId: 9,
        targetUniverse: ['600519'],
        period: Period.DAY,
        source: DataSource.TDX,
        startDate: '2026-01-01',
        endDate: '2026-06-30',
      }),
    ).rejects.toThrow('K query failed');

    expect(savedRuns.at(-1)).toMatchObject({
      id: 1,
      status: BacktestRunStatus.FAILED,
      errorMessage: 'K query failed',
    });
  });
});
