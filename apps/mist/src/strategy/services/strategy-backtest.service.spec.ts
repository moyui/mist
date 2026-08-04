import {
  BacktestRunStatus,
  DataSource,
  Period,
  StrategyRuleSchemaVersion,
  StrategySignalKind,
} from '@app/shared-data';
import { StrategyExecutionPlanService } from '../rules/strategy-execution-plan.service';
import { StrategyBacktestService } from './strategy-backtest.service';

describe('StrategyBacktestService', () => {
  const createHarness = (options?: {
    kFindShouldThrow?: boolean;
    rule?: Record<string, unknown>;
    rows?: any[];
  }) => {
    const strategyVersion = {
      id: 9,
      strategyDefinitionId: 3,
      ruleSchemaVersion: StrategyRuleSchemaVersion.V1,
      rule: options?.rule ?? { field: 'k.close', operator: 'gt', value: 100 },
      signalKind: StrategySignalKind.ENTRY,
    };
    const kRows = options?.rows ?? [
      historicalK({
        id: 1,
        timestamp: new Date('2026-01-02T00:00:00.000Z'),
        close: '120.00',
      }),
      historicalK({
        id: 2,
        timestamp: new Date('2026-01-03T00:00:00.000Z'),
        close: '88.00',
      }),
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
    const persistedResults: any[] = [];
    const resultRepository = {
      create: jest.fn((input) => ({ ...input })),
      save: jest.fn(async (input) => {
        const result = { id: persistedResults.length + 10, ...input };
        persistedResults.push(result);
        return result;
      }),
      find: jest.fn(),
    };
    const service = new StrategyBacktestService(
      strategyVersionRepository as any,
      backtestRunRepository as any,
      resultRepository as any,
      kRepository as any,
      new StrategyExecutionPlanService(),
    );

    return {
      service,
      backtestRunRepository,
      kRepository,
      resultRepository,
      persistedResults,
      savedRuns,
    };
  };

  it('evaluates a compiled plan and persists only matching signal evidence', async () => {
    const { service, kRepository, persistedResults } = createHarness();

    const run = await service.createRun(createRunDto());

    expect(run).toMatchObject({
      id: 1,
      strategyDefinitionId: 3,
      strategyVersionId: 9,
      status: BacktestRunStatus.COMPLETED,
      signalCount: 1,
      matchedSecurityCount: 1,
    });
    expect(kRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        relations: ['security'],
        order: { timestamp: 'ASC' },
      }),
    );
    expect(persistedResults).toHaveLength(1);
    expect(persistedResults[0]).toMatchObject({
      backtestRun: expect.objectContaining({ id: 1 }),
      backtestRunId: 1,
      securityCode: '600519',
      signalTime: new Date('2026-01-02T00:00:00.000Z'),
      contextSnapshot: {
        k: { type: 'complete', close: 120 },
      },
      ruleSnapshot: { field: 'k.close', operator: 'gt', value: 100 },
    });
    expect(run).not.toHaveProperty('cash');
    expect(run).not.toHaveProperty('positions');
    expect(run).not.toHaveProperty('orders');
    expect(run).not.toHaveProperty('slippage');
  });

  it('uses same-day forward fill and persists raw/effective/resolution evidence', async () => {
    const { service, persistedResults } = createHarness({
      rule: { field: 'k.volume', operator: 'gt', value: '90' },
      rows: [
        historicalK({
          id: 1,
          period: Period.ONE_MIN,
          timestamp: new Date('2026-01-02T01:31:00.000Z'),
          volume: '100',
        }),
        historicalK({
          id: 2,
          period: Period.ONE_MIN,
          timestamp: new Date('2026-01-02T01:32:00.000Z'),
          volume: null,
        }),
      ],
    });

    const run = await service.createRun(
      createRunDto({ period: Period.ONE_MIN }),
    );

    expect(run.signalCount).toBe(2);
    expect(persistedResults[1].contextSnapshot).toEqual({
      k: { type: 'complete', volume: '100' },
      quantityEvidence: {
        current: {
          volume: {
            raw: null,
            effective: '100',
            resolution: 'forwardFilled',
          },
        },
      },
    });
  });

  it('does not persist an unavailable indicator warmup as a non-match result', async () => {
    const { service, persistedResults } = createHarness({
      rule: {
        field: 'indicator.macd.histogram',
        operator: 'gt',
        value: 0,
      },
    });

    const run = await service.createRun(createRunDto());

    expect(run).toMatchObject({
      status: BacktestRunStatus.COMPLETED,
      signalCount: 0,
    });
    expect(persistedResults).toEqual([]);
  });

  it('marks the run failed when stored immutable rule compilation fails', async () => {
    const { service, savedRuns } = createHarness({
      rule: { field: 'k.volume', operator: 'gt', value: '01.00' },
    });

    await expect(service.createRun(createRunDto())).rejects.toThrow(
      /canonical/,
    );

    expect(savedRuns.at(-1)).toMatchObject({
      id: 1,
      status: BacktestRunStatus.FAILED,
    });
  });

  it('marks the run failed when replay cannot complete', async () => {
    const { service, savedRuns } = createHarness({ kFindShouldThrow: true });

    await expect(service.createRun(createRunDto())).rejects.toThrow(
      'K query failed',
    );

    expect(savedRuns.at(-1)).toMatchObject({
      id: 1,
      status: BacktestRunStatus.FAILED,
      errorMessage: 'K query failed',
    });
  });
});

function historicalK(
  overrides: Record<string, unknown>,
): Record<string, unknown> {
  return {
    id: 1,
    security: { id: 11, code: '600519', type: 'STOCK' },
    source: DataSource.TDX,
    period: Period.DAY,
    timestamp: new Date('2026-01-02T00:00:00.000Z'),
    open: '98.00',
    high: '121.00',
    low: '95.00',
    close: '120.00',
    volume: '1000',
    amount: '120000',
    ...overrides,
  };
}

function createRunDto(overrides?: Record<string, unknown>) {
  return {
    strategyVersionId: 9,
    targetUniverse: ['600519'],
    period: Period.DAY,
    source: DataSource.TDX,
    startDate: '2026-01-01',
    endDate: '2026-06-30',
    ...overrides,
  };
}
