import {
  DataSource,
  Period,
  Security,
  StrategyDefinition,
  StrategyKind,
  StrategyRuleSchemaVersion,
  StrategySignalKind,
  StrategyStatus,
  StrategyVersion,
} from '@app/shared-data';
import type { Repository } from 'typeorm';
import { SignalHealthStateService } from './signal-health-state.service';
import { SignalRegistryService } from './signal-registry.service';
import { SignalRuntimeMutex } from './signal-runtime-mutex.service';

describe('SignalRegistryService', () => {
  const originalMode = process.env.REALTIME_STRATEGY_MODE;

  afterEach(() => {
    if (originalMode === undefined) {
      delete process.env.REALTIME_STRATEGY_MODE;
    } else {
      process.env.REALTIME_STRATEGY_MODE = originalMode;
    }
  });

  it('publishes generation one from one full enabled-definition query', async () => {
    process.env.REALTIME_STRATEGY_MODE = 'off';
    const repository = {
      find: jest.fn().mockResolvedValue([definition(1, 11)]),
      findOne: jest.fn(),
    } as unknown as Repository<StrategyDefinition>;
    const health = new SignalHealthStateService();
    const registry = new SignalRegistryService(
      repository,
      securityRepository(),
      health,
      new SignalRuntimeMutex(),
    );

    await registry.onApplicationBootstrap();

    expect(repository.find).toHaveBeenCalledTimes(1);
    expect(registry.capture().generation).toBe(1);
    expect([...registry.capture().definitions.keys()]).toEqual([1]);
    expect(registry.executionPlansFor(9, 'tdx')).toHaveLength(1);
    expect(registry.executionPlansFor(10, 'tdx')).toEqual([]);
    expect(registry.executionPlansFor(9, 'qmt')).toEqual([]);
    expect(health.snapshot().registry).toMatchObject({
      ready: true,
      generation: 1,
      definitionCount: 1,
      executionPlanCount: 1,
    });
  });

  it('copy-on-write refreshes one definition and preserves captured snapshots', async () => {
    process.env.REALTIME_STRATEGY_MODE = 'off';
    const repository = {
      find: jest.fn().mockResolvedValue([definition(1, 11)]),
      findOne: jest.fn().mockResolvedValue(definition(2, 22)),
    } as unknown as Repository<StrategyDefinition>;
    const registry = new SignalRegistryService(
      repository,
      securityRepository(),
      new SignalHealthStateService(),
      new SignalRuntimeMutex(),
    );
    await registry.onApplicationBootstrap();
    const captured = registry.capture();

    await expect(registry.refreshDefinition(2)).resolves.toEqual({
      strategyDefinitionId: 2,
      registryGeneration: 2,
      action: 'upserted',
    });

    expect([...captured.definitions.keys()]).toEqual([1]);
    expect([...registry.capture().definitions.keys()]).toEqual([1, 2]);
    expect(repository.findOne).toHaveBeenCalledTimes(1);
  });

  it('compiles a chan_bsp definition into a chan_bsp execution plan', async () => {
    process.env.REALTIME_STRATEGY_MODE = 'off';
    const repository = {
      find: jest.fn().mockResolvedValue([chanBspDefinition(1, 11)]),
      findOne: jest.fn(),
    } as unknown as Repository<StrategyDefinition>;
    const registry = new SignalRegistryService(
      repository,
      securityRepository(),
      new SignalHealthStateService(),
      new SignalRuntimeMutex(),
    );

    await registry.onApplicationBootstrap();

    const plans = registry.executionPlansFor(9, 'tdx');
    expect(plans).toHaveLength(1);
    expect(plans[0]).toMatchObject({
      kind: 'chan_bsp',
      definitionId: 1,
      period: 30,
      source: 'tdx',
      plan: {
        units: 'duan',
        points: { first: true, second: true, third: false },
        direction: 'buy',
        requiredBarCount: 200,
      },
    });
  });

  it('rejects a chan_bsp definition with an invalid configuration', async () => {
    process.env.REALTIME_STRATEGY_MODE = 'off';
    const invalid = chanBspDefinition(2, 22);
    invalid.currentVersion!.rule = { units: 'wave' };
    const repository = {
      find: jest.fn().mockResolvedValue([invalid]),
      findOne: jest.fn(),
    } as unknown as Repository<StrategyDefinition>;
    const registry = new SignalRegistryService(
      repository,
      securityRepository(),
      new SignalHealthStateService(),
      new SignalRuntimeMutex(),
    );

    await expect(registry.onApplicationBootstrap()).rejects.toThrow(
      'chan_bsp strategy config is invalid',
    );
    expect(registry.capture().generation).toBe(0);
  });

  it('retains the prior pointer and generation when refresh compilation fails', async () => {
    process.env.REALTIME_STRATEGY_MODE = 'off';
    const invalid = definition(2, 22);
    invalid.currentVersion!.rule = {};
    const repository = {
      find: jest.fn().mockResolvedValue([definition(1, 11)]),
      findOne: jest.fn().mockResolvedValue(invalid),
    } as unknown as Repository<StrategyDefinition>;
    const health = new SignalHealthStateService();
    const registry = new SignalRegistryService(
      repository,
      securityRepository(),
      health,
      new SignalRuntimeMutex(),
    );
    await registry.onApplicationBootstrap();
    const captured = registry.capture();

    await expect(registry.refreshDefinition(2)).rejects.toThrow();

    expect(registry.capture()).toBe(captured);
    expect(health.snapshot().registry).toMatchObject({
      ready: true,
      generation: 1,
      lastRefreshOutcome: 'failed',
      lastFailureCode: 'REGISTRY_REFRESH_FAILED',
    });
  });

  it('normalizes market-suffixed target universe to plain security codes', async () => {
    process.env.REALTIME_STRATEGY_MODE = 'off';
    const repository = {
      find: jest.fn().mockResolvedValue([definition(1, 11)]),
      findOne: jest.fn(),
    } as unknown as Repository<StrategyDefinition>;
    const health = new SignalHealthStateService();
    const registry = new SignalRegistryService(
      repository,
      securityRepository(),
      health,
      new SignalRuntimeMutex(),
    );

    await registry.onApplicationBootstrap();

    // definition(1) targets ['000001.SZ']; Security.code is '000001' (plain).
    // Resolution must succeed and map to security id 9.
    expect(registry.capture().definitions.get(1)).toBeDefined();
    expect(registry.executionPlansFor(9, 'tdx')).toHaveLength(1);
  });
});

function securityRepository(): Repository<Security> {
  return {
    find: jest
      .fn()
      .mockResolvedValue([
        Object.assign(new Security(), { id: 9, code: '000001' }),
      ]),
  } as unknown as Repository<Security>;
}

function definition(id: number, versionId: number): StrategyDefinition {
  const version = Object.assign(new StrategyVersion(), {
    id: versionId,
    strategyDefinitionId: id,
    ruleSchemaVersion: StrategyRuleSchemaVersion.V1,
    rule: { field: 'k.close', operator: 'gt', value: 10 },
    signalKind: StrategySignalKind.ENTRY,
  });
  return Object.assign(new StrategyDefinition(), {
    id,
    status: StrategyStatus.ENABLED,
    targetUniverse: ['000001.SZ'],
    periods: [Period.ONE_MIN],
    sources: [DataSource.TDX],
    currentVersionId: versionId,
    currentVersion: version,
  });
}

function chanBspDefinition(id: number, versionId: number): StrategyDefinition {
  const version = Object.assign(new StrategyVersion(), {
    id: versionId,
    strategyDefinitionId: id,
    ruleSchemaVersion: StrategyRuleSchemaVersion.V1,
    rule: {
      units: 'duan',
      points: { first: true, second: true, third: false },
      direction: 'buy',
    },
    signalKind: StrategySignalKind.ENTRY,
  });
  return Object.assign(new StrategyDefinition(), {
    id,
    status: StrategyStatus.ENABLED,
    targetUniverse: ['000001.SZ'],
    periods: [Period.THIRTY_MIN],
    sources: [DataSource.TDX],
    currentVersionId: versionId,
    currentVersion: version,
    kind: StrategyKind.CHAN_BSP,
  });
}
