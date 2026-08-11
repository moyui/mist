import { QueryFailedError } from 'typeorm';
import {
  DataSource,
  RealtimeSubscriptionAssignment,
  Security,
  SecuritySourceConfig,
  SecurityStatus,
  SecurityType,
} from '@app/shared-data';
import { HttpBusinessRejection } from '@app/transport/http';
import {
  namedDuplicateConstraint,
  RealtimeSubscriptionService,
} from './realtime-subscription.service';
import { RealtimeSubscriptionLifecycleObservationStore } from './realtime-subscription-lifecycle-observation.store';

function chain(final: Record<string, jest.Mock>) {
  const builder: Record<string, jest.Mock> = {};
  for (const name of [
    'select',
    'addSelect',
    'innerJoin',
    'where',
    'andWhere',
    'groupBy',
    'orderBy',
    'setLock',
  ]) {
    builder[name] = jest.fn(() => builder);
  }
  return Object.assign(builder, final);
}

function assignmentFixture(
  overrides: Partial<RealtimeSubscriptionAssignment> = {},
): RealtimeSubscriptionAssignment {
  const security = Object.assign(new Security(), {
    id: 1,
    code: '600519',
    name: '贵州茅台',
    type: SecurityType.STOCK,
    status: SecurityStatus.ACTIVE,
  });
  const sourceConfig = Object.assign(new SecuritySourceConfig(), {
    id: 17,
    securityId: 1,
    security,
    source: DataSource.QMT,
    formatCode: '600519.SH',
    enabled: true,
  });
  return Object.assign(new RealtimeSubscriptionAssignment(), {
    id: 8,
    securityId: 1,
    security,
    sourceConfigId: 17,
    sourceConfig,
    createdAt: new Date('2026-08-04T15:00:00.000Z'),
    updatedAt: new Date('2026-08-04T15:00:00.000Z'),
    ...overrides,
  });
}

describe('RealtimeSubscriptionService', () => {
  const runtimeConfigTrue = {
    getAutoReconcileCached: jest.fn(() => true),
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('initializes a new ACTIVE STOCK route in one transaction', async () => {
    const lifecycleCoordinator = {
      refreshDesiredState: jest.fn().mockResolvedValue(undefined),
      requestIncrementalReconciliation: jest.fn(),
    };
    const lockBuilder = chain({ getMany: jest.fn().mockResolvedValue([]) });
    const countBuilder = chain({ getCount: jest.fn().mockResolvedValue(0) });
    const manager = {
      findOne: jest.fn().mockResolvedValue(null),
      getRepository: jest.fn((entity) => ({
        createQueryBuilder: () =>
          entity === SecuritySourceConfig ? lockBuilder : countBuilder,
      })),
      create: jest.fn((entity, value) => Object.assign(new entity(), value)),
      save: jest.fn(async (value) => {
        if (value instanceof Security) value.id = 1;
        if (value instanceof SecuritySourceConfig) value.id = 17;
        if (value instanceof RealtimeSubscriptionAssignment) {
          value.id = 8;
          value.createdAt = new Date('2026-08-04T15:00:00.000Z');
          value.updatedAt = new Date('2026-08-04T15:00:00.000Z');
        }
        return value;
      }),
    };
    const dataSource = {
      transaction: jest.fn((callback) => callback(manager)),
    };
    const service = new RealtimeSubscriptionService(
      dataSource as never,
      {} as never,
      lifecycleCoordinator as never,
      undefined,
    );

    const result = await service.initialize({
      mode: 'new',
      securityCode: '600519',
      securityName: '贵州茅台',
      securityType: SecurityType.STOCK,
      source: DataSource.QMT,
      providerSymbol: '600519.SH',
    });

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      assignmentId: 8,
      securityId: 1,
      securitySourceConfigId: 17,
      securityCode: '600519',
      source: DataSource.QMT,
      providerSymbol: '600519.SH',
      desired: true,
      active: null,
      activeEvidence: null,
      convergence: 'unknown',
      convergenceReason: 'lifecycle_disabled',
    });
    expect(manager.save).toHaveBeenCalledTimes(3);
    expect(lockBuilder.setLock).toHaveBeenCalledWith('pessimistic_write');
    expect(lifecycleCoordinator.refreshDesiredState).toHaveBeenCalledWith(
      DataSource.QMT,
    );
    expect(
      lifecycleCoordinator.requestIncrementalReconciliation,
    ).toHaveBeenCalledWith(DataSource.QMT);
  });

  it('rejects an existing non-STOCK source config without writing', async () => {
    const security = Object.assign(new Security(), {
      id: 4,
      code: '000300',
      type: SecurityType.INDEX,
      status: SecurityStatus.ACTIVE,
    });
    const config = Object.assign(new SecuritySourceConfig(), {
      id: 19,
      securityId: 4,
      security,
      source: DataSource.TDX,
      formatCode: '000300.SH',
      enabled: true,
    });
    const lockBuilder = chain({ getMany: jest.fn().mockResolvedValue([]) });
    const manager = {
      findOne: jest.fn().mockResolvedValue(config),
      getRepository: jest.fn(() => ({ createQueryBuilder: () => lockBuilder })),
      save: jest.fn(),
    };
    const service = new RealtimeSubscriptionService(
      {
        transaction: (callback: (value: typeof manager) => unknown) =>
          callback(manager),
      } as never,
      {} as never,
      undefined,
    );

    const result = await service.initialize({
      mode: 'existing',
      securitySourceConfigId: 19,
    });

    expect(result).toBeInstanceOf(HttpBusinessRejection);
    expect(result).toMatchObject({
      code: 'REALTIME_SECURITY_NOT_ELIGIBLE',
      data: { securityId: 4, reason: 'security_not_stock' },
    });
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('returns a typed rejection for an unknown source config', async () => {
    const manager = { findOne: jest.fn().mockResolvedValue(null) };
    const service = new RealtimeSubscriptionService(
      {
        transaction: (callback: (value: typeof manager) => unknown) =>
          callback(manager),
      } as never,
      {} as never,
      undefined,
    );

    const result = await service.initialize({
      mode: 'existing',
      securitySourceConfigId: 404,
    });

    expect(result).toMatchObject({
      code: 'REALTIME_SOURCE_CONFIG_NOT_FOUND',
      data: { securitySourceConfigId: 404 },
    });
  });

  it('rejects an existing config with an invalid provider symbol', async () => {
    const security = Object.assign(new Security(), {
      id: 1,
      code: '600519',
      type: SecurityType.STOCK,
      status: SecurityStatus.ACTIVE,
    });
    const config = Object.assign(new SecuritySourceConfig(), {
      id: 19,
      securityId: 1,
      security,
      source: DataSource.QMT,
      formatCode: 'SH600519',
      enabled: true,
    });
    const lockBuilder = chain({ getMany: jest.fn().mockResolvedValue([]) });
    const manager = {
      findOne: jest.fn().mockResolvedValue(config),
      getRepository: jest.fn(() => ({ createQueryBuilder: () => lockBuilder })),
      save: jest.fn(),
    };
    const service = new RealtimeSubscriptionService(
      {
        transaction: (callback: (value: typeof manager) => unknown) =>
          callback(manager),
      } as never,
      {} as never,
      undefined,
    );

    const result = await service.initialize({
      mode: 'existing',
      securitySourceConfigId: 19,
    });

    expect(result).toMatchObject({
      code: 'REALTIME_SOURCE_CONFIG_NOT_ELIGIBLE',
      data: { securitySourceConfigId: 19, reason: 'provider_symbol_invalid' },
    });
    expect(lockBuilder.setLock).toHaveBeenCalledWith('pessimistic_write');
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('binds an eligible existing source config without copying its symbol', async () => {
    const fixture = assignmentFixture();
    const config = fixture.sourceConfig;
    const lockBuilder = chain({ getMany: jest.fn().mockResolvedValue([]) });
    const countBuilder = chain({ getCount: jest.fn().mockResolvedValue(0) });
    const manager = {
      findOne: jest
        .fn()
        .mockResolvedValueOnce(config)
        .mockResolvedValueOnce(config)
        .mockResolvedValueOnce(null),
      getRepository: jest.fn((entity) => ({
        createQueryBuilder: () =>
          entity === SecuritySourceConfig ? lockBuilder : countBuilder,
      })),
      create: jest.fn((_entity, value) =>
        Object.assign(new RealtimeSubscriptionAssignment(), value),
      ),
      save: jest.fn(async (assignment) =>
        Object.assign(assignment, {
          id: 8,
          createdAt: new Date('2026-08-04T15:00:00.000Z'),
          updatedAt: new Date('2026-08-04T15:00:00.000Z'),
        }),
      ),
    };
    const service = new RealtimeSubscriptionService(
      {
        transaction: (callback: (value: typeof manager) => unknown) =>
          callback(manager),
      } as never,
      {} as never,
      undefined,
    );

    const result = await service.initialize({
      mode: 'existing',
      securitySourceConfigId: 17,
    });

    expect(result).toMatchObject({
      assignmentId: 8,
      securitySourceConfigId: 17,
      providerSymbol: '600519.SH',
      source: DataSource.QMT,
    });
    expect(manager.create).toHaveBeenCalledWith(
      RealtimeSubscriptionAssignment,
      expect.not.objectContaining({ providerSymbol: expect.anything() }),
    );
  });

  it('rejects active initialization at the source capacity boundary', async () => {
    const lockBuilder = chain({ getMany: jest.fn().mockResolvedValue([]) });
    const countBuilder = chain({ getCount: jest.fn().mockResolvedValue(5) });
    const manager = {
      findOne: jest.fn().mockResolvedValue(null),
      getRepository: jest.fn((entity) => ({
        createQueryBuilder: () =>
          entity === SecuritySourceConfig ? lockBuilder : countBuilder,
      })),
      create: jest.fn(),
      save: jest.fn(),
    };
    const service = new RealtimeSubscriptionService(
      {
        transaction: (callback: (value: typeof manager) => unknown) =>
          callback(manager),
      } as never,
      {} as never,
      undefined,
    );

    const result = await service.initialize({
      mode: 'new',
      securityCode: '600519',
      securityName: '贵州茅台',
      securityType: SecurityType.STOCK,
      source: DataSource.TDX,
      providerSymbol: '600519.SH',
    });

    expect(result).toMatchObject({
      code: 'REALTIME_ACTIVE_CAPACITY_REACHED',
      data: { source: DataSource.TDX, activeAssignmentCount: 5, limit: 5 },
    });
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('returns pagination-independent source capacity and unknown active state', async () => {
    const assignment = assignmentFixture();
    const capacityBuilder = chain({
      getRawMany: jest
        .fn()
        .mockResolvedValue([
          { source: DataSource.QMT, activeAssignmentCount: '5' },
        ]),
    });
    const repository = {
      find: jest.fn().mockResolvedValue([assignment]),
      createQueryBuilder: jest.fn(() => capacityBuilder),
    };
    const service = new RealtimeSubscriptionService(
      {} as never,
      repository as never,
      undefined,
      undefined,
      runtimeConfigTrue as never,
    );

    const result = await service.list({ afterId: 7, limit: 20 });

    expect(result.nextAfterId).toBeNull();
    expect(result.items[0]).toMatchObject({
      active: null,
      activeEvidence: null,
      convergence: 'unknown',
      convergenceReason: 'transport_not_ready',
    });
    expect(result.sourceCapacities).toEqual([
      { source: DataSource.TDX, activeAssignmentCount: 0, limit: 5 },
      { source: DataSource.QMT, activeAssignmentCount: 5, limit: 5 },
    ]);
    expect(repository.find).toHaveBeenCalledWith(
      expect.objectContaining({ order: { id: 'ASC' }, take: 21 }),
    );
  });

  it('maps provider-specific evidence and deferred removal into the public VO', async () => {
    const assignment = assignmentFixture();
    assignment.security.status = SecurityStatus.SUSPENDED;
    const observations = new RealtimeSubscriptionLifecycleObservationStore();
    observations.replaceActive(DataSource.QMT, ['600519.SH']);
    observations.succeed(DataSource.QMT);
    const repository = {
      find: jest.fn().mockResolvedValue([assignment]),
      createQueryBuilder: jest.fn(() =>
        chain({ getRawMany: jest.fn().mockResolvedValue([]) }),
      ),
    };
    const service = new RealtimeSubscriptionService(
      {} as never,
      repository as never,
      undefined,
      observations,
      runtimeConfigTrue as never,
    );

    const result = await service.list({ limit: 20 });

    expect(result.items[0]).toMatchObject({
      desired: false,
      active: true,
      activeEvidence: 'qmt_durable_registry',
      convergence: 'drifted',
      convergenceReason: 'awaiting_full_reset',
      deferredRemovalReason: 'awaiting_full_reset',
    });
  });

  it('preserves unknown transaction failures', async () => {
    const unknown = new Error('raw database detail');
    const service = new RealtimeSubscriptionService(
      {
        transaction: jest.fn().mockRejectedValue(unknown),
        getRepository: jest.fn(),
      } as never,
      {} as never,
      undefined,
    );
    await expect(
      service.initialize({
        mode: 'existing',
        securitySourceConfigId: 17,
      }),
    ).rejects.toBe(unknown);
  });
});

describe('namedDuplicateConstraint', () => {
  it('accepts only an exact MySQL duplicate constraint name', () => {
    const driver = Object.assign(new Error('duplicate'), {
      code: 'ER_DUP_ENTRY',
      errno: 1062,
      sqlMessage:
        "Duplicate entry '1' for key 'mist.uq_realtime_subscription_assignments_security'",
    });
    expect(
      namedDuplicateConstraint(new QueryFailedError('INSERT', [], driver)),
    ).toBe('uq_realtime_subscription_assignments_security');
    expect(namedDuplicateConstraint(new Error('duplicate'))).toBeNull();
  });
});
