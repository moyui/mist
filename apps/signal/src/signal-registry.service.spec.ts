import {
  DataSource,
  Period,
  Security,
  StrategyDefinition,
  StrategyRuleSchemaVersion,
  StrategySignalKind,
  StrategyStatus,
  StrategyVersion,
} from '@app/shared-data';
import type { Repository } from 'typeorm';
import { SignalHealthStateService } from './signal-health-state.service';
import { SignalRegistryService } from './signal-registry.service';

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
    );

    await registry.onApplicationBootstrap();

    expect(repository.find).toHaveBeenCalledTimes(1);
    expect(registry.capture().generation).toBe(1);
    expect([...registry.capture().definitions.keys()]).toEqual([1]);
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
});

function securityRepository(): Repository<Security> {
  return {
    find: jest
      .fn()
      .mockResolvedValue([
        Object.assign(new Security(), { id: 9, code: '000001.SZ' }),
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
