import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  DataSource,
  Period,
  StrategyDefinition,
  StrategyRuleSchemaVersion,
  StrategySignalKind,
  StrategyStatus,
  StrategyVersion,
} from '@app/shared-data';
import { StrategyExecutionPlanService } from '../rules/strategy-execution-plan.service';
import { StrategyDefinitionService } from './strategy-definition.service';

describe('StrategyDefinitionService', () => {
  const createHarness = () => {
    let nextDefinitionId = 1;
    let nextVersionId = 1;
    const definitions: any[] = [];
    const versions: any[] = [];
    const definitionRepository = {
      manager: undefined as any,
      create: jest.fn((input) => ({ ...input })),
      save: jest.fn(async (entity) => {
        if (!entity.id) {
          entity.id = nextDefinitionId++;
          definitions.push(entity);
        }
        return entity;
      }),
      find: jest.fn(async () => definitions),
      findOne: jest.fn(async ({ where }) =>
        definitions.find((definition) => definition.id === where.id),
      ),
    };
    const versionRepository = {
      create: jest.fn((input) => ({ ...input })),
      save: jest.fn(async (entity) => {
        entity.id = nextVersionId++;
        versions.push(entity);
        return entity;
      }),
      find: jest.fn(async ({ where }) =>
        versions.filter(
          (version) =>
            version.strategyDefinitionId === where.strategyDefinitionId,
        ),
      ),
      findOne: jest.fn(async ({ where }) =>
        versions.find(
          (version) =>
            version.id === where.id &&
            (where.strategyDefinitionId === undefined ||
              version.strategyDefinitionId === where.strategyDefinitionId),
        ),
      ),
    };
    const transaction = jest.fn(async (callback) => {
      const definitionsBefore = definitions.map((value) => ({ ...value }));
      const versionsBefore = versions.map((value) => ({ ...value }));
      const transactionManager = {
        getRepository: jest.fn((entity) => {
          if (entity === StrategyDefinition) return definitionRepository;
          if (entity === StrategyVersion) return versionRepository;
          throw new Error('unexpected transaction repository');
        }),
      };
      try {
        return await callback(transactionManager);
      } catch (error) {
        definitions.splice(0, definitions.length, ...definitionsBefore);
        versions.splice(0, versions.length, ...versionsBefore);
        throw error;
      }
    });
    definitionRepository.manager = { transaction };
    const signalRegistry = {
      refresh: jest.fn().mockImplementation(async (strategyDefinitionId) => ({
        strategyDefinitionId,
        registryGeneration: 1,
        action: 'upserted',
      })),
    };
    const service = new StrategyDefinitionService(
      definitionRepository as any,
      versionRepository as any,
      new StrategyExecutionPlanService(),
      signalRegistry as any,
    );

    return {
      service,
      definitions,
      versions,
      definitionRepository,
      versionRepository,
      transaction,
      signalRegistry,
    };
  };

  const createDto = {
    name: 'MACD histogram breakout',
    description: 'Track MACD histogram crosses above zero',
    targetUniverse: ['600519', '000001'],
    periods: [Period.DAY],
    sources: [DataSource.TDX],
    rule: {
      field: 'indicator.macd.histogram',
      operator: 'crossesAbove',
      value: 0,
    },
    signalKind: StrategySignalKind.ENTRY,
  };

  it('atomically creates a draft definition and its only immutable version', async () => {
    const { service, versions } = createHarness();

    const strategy = await service.create(createDto);

    expect(strategy).toMatchObject({
      id: 1,
      name: createDto.name,
      status: StrategyStatus.DRAFT,
      currentVersionId: 1,
    });
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({
      id: 1,
      strategyDefinitionId: 1,
      versionNumber: 1,
      ruleSchemaVersion: StrategyRuleSchemaVersion.V1,
      rule: createDto.rule,
      signalKind: StrategySignalKind.ENTRY,
      validationSummary: {
        signalKind: StrategySignalKind.ENTRY,
        conditionCount: 1,
        fields: ['indicator.macd.histogram'],
        requiredBarCount: 131,
      },
    });
  });

  it('normalizes a create-only decimal threshold before persistence', async () => {
    const { service, versions } = createHarness();

    await service.create({
      ...createDto,
      rule: { field: 'k.volume', operator: 'gt', value: '001.2300' },
    });

    expect(versions[0].rule).toEqual({
      field: 'k.volume',
      operator: 'gt',
      value: '1.23',
    });
  });

  it('maps create-contract compiler failures to an HTTP 400 error', async () => {
    const { service } = createHarness();

    await expect(
      service.create({
        ...createDto,
        signalKind: 'hold' as StrategySignalKind,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('enables and disables a price strategy without changing versions', async () => {
    const { service, versions, signalRegistry } = createHarness();
    const strategy = await service.create(createDto);

    await expect(service.enable(strategy.id)).resolves.toMatchObject({
      status: StrategyStatus.ENABLED,
      currentVersionId: 1,
    });
    await expect(service.disable(strategy.id)).resolves.toMatchObject({
      status: StrategyStatus.DISABLED,
      currentVersionId: 1,
    });
    expect(versions).toHaveLength(1);
    expect(signalRegistry.refresh).toHaveBeenNthCalledWith(1, strategy.id);
    expect(signalRegistry.refresh).toHaveBeenNthCalledWith(2, strategy.id);
  });

  it('keeps committed status when runtime refresh is unavailable', async () => {
    const { service, definitions, signalRegistry } = createHarness();
    const strategy = await service.create(createDto);
    signalRegistry.refresh.mockRejectedValueOnce(
      new Error('Signal service is unavailable'),
    );

    await expect(service.enable(strategy.id)).rejects.toThrow(
      'Signal service is unavailable',
    );
    expect(definitions[0].status).toBe(StrategyStatus.ENABLED);
  });

  it('keeps quantity strategies out of realtime registration before source HIL', async () => {
    const { service } = createHarness();
    const strategy = await service.create({
      ...createDto,
      rule: { field: 'k.amount', operator: 'gte', value: '100' },
    });

    await expect(service.enable(strategy.id)).rejects.toThrow(
      /quantity profile HIL/,
    );
    await expect(service.disable(strategy.id)).resolves.toMatchObject({
      status: StrategyStatus.DISABLED,
    });
  });

  it('fails closed when stored immutable rule data is not canonical', async () => {
    const { service, versions } = createHarness();
    const strategy = await service.create({
      ...createDto,
      rule: { field: 'k.volume', operator: 'gt', value: '1.23' },
    });
    versions[0].rule = {
      field: 'k.volume',
      operator: 'gt',
      value: '01.2300',
    };

    await expect(service.findById(strategy.id)).rejects.toThrow(TypeError);
  });

  it('throws when the strategy definition does not exist', async () => {
    const { service } = createHarness();

    await expect(service.findById(404)).rejects.toThrow(NotFoundException);
  });

  it('rolls back definition creation when initial version persistence fails', async () => {
    const { service, definitions, versions, versionRepository, transaction } =
      createHarness();
    versionRepository.save.mockRejectedValueOnce(
      new Error('version write failed'),
    );

    await expect(service.create(createDto)).rejects.toThrow(
      'version write failed',
    );

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(definitions).toEqual([]);
    expect(versions).toEqual([]);
  });

  it('rolls back creation when the current-version pointer cannot be saved', async () => {
    const {
      service,
      definitions,
      versions,
      definitionRepository,
      transaction,
    } = createHarness();
    definitionRepository.save
      .mockImplementationOnce(async (entity) => {
        entity.id = 1;
        definitions.push(entity);
        return entity;
      })
      .mockRejectedValueOnce(new Error('definition pointer write failed'));

    await expect(service.create(createDto)).rejects.toThrow(
      'definition pointer write failed',
    );

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(definitions).toEqual([]);
    expect(versions).toEqual([]);
  });

  it('rejects enablement when the current version is missing', async () => {
    const { service, definitions } = createHarness();
    const strategy = await service.create(createDto);
    definitions[0].currentVersionId = null;

    await expect(service.enable(strategy.id)).rejects.toThrow(
      ConflictException,
    );
  });

  it('rejects enablement when the current version belongs to another definition', async () => {
    const { service, versions } = createHarness();
    const strategy = await service.create(createDto);
    versions[0].strategyDefinitionId = 99;

    await expect(service.enable(strategy.id)).rejects.toThrow(
      /missing or belongs to another definition/,
    );
  });
});
