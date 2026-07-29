import {
  DataSource,
  Period,
  StrategyAlertEvent,
  StrategyAlertStatus,
  StrategySignal,
  StrategySignalSource,
  StrategyStatus,
} from '@app/shared-data';
import { QueryFailedError } from 'typeorm';
import { StrategyEvaluationContextBuilder } from './strategy-evaluation-context.builder';
import { StrategyScanService } from './strategy-scan.service';
import { StrategyRuleEvaluator } from '../rules/strategy-rule-evaluator';

describe('StrategyScanService', () => {
  const signalTime = new Date('2026-07-07T09:30:00.000Z');
  const mysqlDriverError = (fields: Record<string, string | number>): Error =>
    Object.assign(new Error(String(fields.sqlMessage ?? '')), fields);
  const createHarness = (
    existingAlert = false,
    alertSaveError: Error | null = null,
  ) => {
    const strategy: any = {
      id: 1,
      status: StrategyStatus.ENABLED,
      targetUniverse: ['600519'],
      periods: [Period.DAY],
      sources: [DataSource.TDX],
      currentVersionId: 7,
    };
    const version = {
      id: 7,
      strategyDefinitionId: 1,
      rule: { field: 'k.close', operator: 'gt', value: 100 },
    };
    const k = {
      id: 10,
      security: { code: '600519', type: 'STOCK' },
      source: DataSource.TDX,
      period: Period.DAY,
      timestamp: signalTime,
      open: 101,
      high: 125,
      low: 99,
      close: 120,
      volume: 1000n,
      amount: 120000,
    };
    const definitionRepository = {
      find: jest.fn().mockResolvedValue([strategy]),
    };
    const versionRepository = {
      findOne: jest.fn().mockResolvedValue(version),
    };
    const kRepository = {
      findOne: jest.fn().mockResolvedValue(k),
    };
    const signalRepository = {
      create: jest.fn((input) => ({ ...input })),
      save: jest.fn(async (input) => ({ id: 2, ...input })),
      manager: undefined as unknown,
    };
    const alertEventRepository = {
      findOne: jest
        .fn()
        .mockResolvedValue(existingAlert ? { id: 9 } : undefined),
      create: jest.fn((input) => ({ ...input })),
      save: alertSaveError
        ? jest.fn().mockRejectedValue(alertSaveError)
        : jest.fn(async (input) => ({ id: 3, ...input })),
    };
    let rolledBack = false;
    const transactionManager = {
      getRepository: jest.fn((entity) => {
        if (entity === StrategySignal) return signalRepository;
        if (entity === StrategyAlertEvent) return alertEventRepository;
        throw new Error('unexpected transaction repository');
      }),
    };
    const manager = {
      transaction: jest.fn(async (callback) => {
        try {
          return await callback(transactionManager);
        } catch (error) {
          rolledBack = true;
          throw error;
        }
      }),
    };
    signalRepository.manager = manager;
    const service = new StrategyScanService(
      definitionRepository as any,
      versionRepository as any,
      kRepository as any,
      signalRepository as any,
      alertEventRepository as any,
      new StrategyEvaluationContextBuilder(),
      new StrategyRuleEvaluator(),
    );

    return {
      service,
      strategy,
      version,
      definitionRepository,
      versionRepository,
      kRepository,
      signalRepository,
      alertEventRepository,
      manager,
      transactionManager,
      wasRolledBack: () => rolledBack,
    };
  };

  it('persists a live signal and pending alert event when an enabled strategy matches', async () => {
    const {
      service,
      versionRepository,
      signalRepository,
      alertEventRepository,
    } = createHarness();

    const result = await service.runScan({});

    expect(result).toEqual({
      scannedStrategies: 1,
      evaluatedContexts: 1,
      createdSignals: 1,
      createdAlertEvents: 1,
      skippedDuplicates: 0,
    });
    expect(signalRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        strategyDefinitionId: 1,
        strategyVersionId: 7,
        securityCode: '600519',
        period: Period.DAY,
        source: DataSource.TDX,
        signalTime,
        signalSource: StrategySignalSource.LIVE,
      }),
    );
    expect(alertEventRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        strategySignalId: 2,
        status: StrategyAlertStatus.PENDING,
        dedupeKey: '1:7:600519:1440:tdx:2026-07-07T09:30:00.000Z',
      }),
    );
    expect(versionRepository.findOne).toHaveBeenCalledWith({
      where: { id: 7, strategyDefinitionId: 1 },
    });
  });

  it('fails closed when an enabled strategy has no current version', async () => {
    const { service, strategy } = createHarness();
    strategy.currentVersionId = null;

    await expect(service.runScan({})).rejects.toThrow(/has no current version/);
  });

  it('fails closed when the current version is missing or foreign', async () => {
    const { service, versionRepository } = createHarness();
    versionRepository.findOne.mockResolvedValue(undefined);

    await expect(service.runScan({})).rejects.toThrow(
      /missing or belongs to another definition/,
    );
  });

  it('skips duplicate alert candidates without creating another signal', async () => {
    const { service, signalRepository, alertEventRepository } =
      createHarness(true);

    const result = await service.runScan({});

    expect(result).toMatchObject({
      createdSignals: 0,
      createdAlertEvents: 0,
      skippedDuplicates: 1,
    });
    expect(signalRepository.save).not.toHaveBeenCalled();
    expect(alertEventRepository.save).not.toHaveBeenCalled();
  });

  it('rolls back and reports no partial success when alert persistence fails', async () => {
    const failure = new Error('alert write failed');
    const {
      service,
      signalRepository,
      alertEventRepository,
      manager,
      wasRolledBack,
    } = createHarness(false, failure);

    await expect(service.runScan({})).rejects.toThrow(failure);

    expect(manager.transaction).toHaveBeenCalledTimes(1);
    expect(signalRepository.save).toHaveBeenCalledTimes(1);
    expect(alertEventRepository.save).toHaveBeenCalledTimes(1);
    expect(wasRolledBack()).toBe(true);
  });

  it('classifies the exact dedupe-index race as a skipped duplicate after rollback', async () => {
    const duplicate = new QueryFailedError(
      'INSERT INTO strategy_alert_events ...',
      [],
      mysqlDriverError({
        code: 'ER_DUP_ENTRY',
        errno: 1062,
        sqlMessage:
          "Duplicate entry 'key' for key 'strategy_alert_events.uq_strategy_alert_events_dedupe_key'",
      }),
    );
    const { service, manager, wasRolledBack } = createHarness(false, duplicate);

    const result = await service.runScan({});

    expect(result).toMatchObject({
      createdSignals: 0,
      createdAlertEvents: 0,
      skippedDuplicates: 1,
    });
    expect(manager.transaction).toHaveBeenCalledTimes(1);
    expect(wasRolledBack()).toBe(true);
  });

  it.each([
    new QueryFailedError(
      'INSERT ...',
      [],
      mysqlDriverError({
        code: 'ER_DUP_ENTRY',
        errno: 1062,
        sqlMessage: "Duplicate entry 'key' for key 'some_other_unique_index'",
      }),
    ),
    new QueryFailedError(
      'INSERT ...',
      [],
      mysqlDriverError({
        code: 'ER_LOCK_DEADLOCK',
        errno: 1213,
        sqlMessage: 'Deadlock found when trying to get lock',
      }),
    ),
    new Error(
      'ER_DUP_ENTRY uq_strategy_alert_events_dedupe_key text without driver shape',
    ),
  ])('propagates non-dedupe database errors unchanged', async (failure) => {
    const { service } = createHarness(false, failure);

    await expect(service.runScan({})).rejects.toBe(failure);
  });

  it('allows one concurrent candidate and classifies the losing insert as duplicate', async () => {
    const { service, alertEventRepository } = createHarness();
    const duplicate = new QueryFailedError(
      'INSERT INTO strategy_alert_events ...',
      [],
      mysqlDriverError({
        code: 'ER_DUP_ENTRY',
        errno: 1062,
        sqlMessage:
          "Duplicate entry 'key' for key 'uq_strategy_alert_events_dedupe_key'",
      }),
    );
    alertEventRepository.save
      .mockResolvedValueOnce({ id: 3 })
      .mockRejectedValueOnce(duplicate);

    const results = await Promise.all([
      service.runScan({}),
      service.runScan({}),
    ]);

    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          createdAlertEvents: 1,
          skippedDuplicates: 0,
        }),
        expect.objectContaining({
          createdAlertEvents: 0,
          skippedDuplicates: 1,
        }),
      ]),
    );
  });
});
