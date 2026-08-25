import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { DataSource, SecurityStatus, SecurityType } from '@app/shared-data';
import { RealtimeSubscriptionControl } from '../realtime/realtime-subscription-control';
import {
  isIntradayAddWindow,
  RealtimeSubscriptionLifecycleCoordinator,
} from './realtime-subscription-lifecycle.coordinator';
import { RealtimeSubscriptionRuntimeRegistry } from './realtime-subscription-runtime.registry';
import { RealtimeSubscriptionLifecycleObservationStore } from './realtime-subscription-lifecycle-observation.store';
import { ASIA_SHANGHAI_TIMEZONE } from '@app/timezone';

describe('RealtimeSubscriptionLifecycleCoordinator', () => {
  it('skips convergence when auto_reconcile is off', async () => {
    const runtime = new RealtimeSubscriptionRuntimeRegistry();
    const control = buildControl();
    runtime.registerControl(DataSource.TDX, control);
    const coordinator = buildCoordinator(runtime, ['600030.SH'], false);
    await coordinator.onModuleInit();

    runtime.observeAcceptedReady(DataSource.TDX, 1);
    await settleRounds();

    expect(control.getSubscriptions).not.toHaveBeenCalled();
    await coordinator.onModuleDestroy();
  });

  it('refreshes database desired evidence without provider I/O', async () => {
    const runtime = new RealtimeSubscriptionRuntimeRegistry();
    const control = buildControl();
    runtime.registerControl(DataSource.TDX, control);
    const observations = new RealtimeSubscriptionLifecycleObservationStore();
    const allowlist = {
      replaceAssigned: jest.fn(),
      replaceEffective: jest.fn().mockReturnValue([]),
    };
    const coordinator = new RealtimeSubscriptionLifecycleCoordinator(
      { createQueryBuilder: () => buildQuery(['600030.SH']) } as never,
      new ConfigService({}),
      runtime,
      fixedClock('2026-08-04T02:00:00Z'),
      observations,
      allowlist as never,
      ingressBoundary(),

      runtimeConfigMock(true),

      new SchedulerRegistry(),
    );

    await coordinator.refreshDesiredState(DataSource.TDX);

    expect(allowlist.replaceAssigned).toHaveBeenCalledWith(DataSource.TDX, [
      { securityId: 1, formatCode: '600030.SH' },
    ]);
    expect(observations.health('off').sources[0].desiredCount).toBe(1);
    expect(control.getSubscriptions).not.toHaveBeenCalled();
    expect(control.syncSubscriptions).not.toHaveBeenCalled();
  });

  it('reads authoritative desired then performs get-sync-get on accepted ready', async () => {
    const runtime = new RealtimeSubscriptionRuntimeRegistry();
    const calls: string[] = [];
    const control = buildControl(calls);
    runtime.registerControl(DataSource.TDX, control);
    const query = buildQuery(['600030.SH', '300502.SZ']);
    const coordinator = new RealtimeSubscriptionLifecycleCoordinator(
      { createQueryBuilder: () => query } as never,
      new ConfigService({}),
      runtime,
      fixedClock('2026-08-04T02:00:00Z'),
      new RealtimeSubscriptionLifecycleObservationStore(),
      allowlistBoundary(),
      ingressBoundary(),

      runtimeConfigMock(true),

      new SchedulerRegistry(),
    );
    await coordinator.onModuleInit();

    runtime.observeAcceptedReady(DataSource.TDX, 11);
    await settleRounds();

    expect(calls).toEqual(['get', 'sync:600030.SH,300502.SZ', 'get']);
    expect(query.where).toHaveBeenCalledWith('security.type = :stock', {
      stock: SecurityType.STOCK,
    });
    expect(query.andWhere).toHaveBeenCalledWith(
      'source_config.source = :source',
      { source: DataSource.TDX },
    );
    await coordinator.onModuleDestroy();
  });

  it('runs sources independently while coalescing repeated ready into one dirty rerun', async () => {
    const runtime = new RealtimeSubscriptionRuntimeRegistry();
    let releaseFirstGet: (() => void) | undefined;
    const firstGet = new Promise<void>((resolve) => {
      releaseFirstGet = resolve;
    });
    const tdx = buildControl();
    (tdx.getSubscriptions as jest.Mock)
      .mockImplementationOnce(async () => {
        await firstGet;
        return { success: [] };
      })
      .mockResolvedValue({ success: [] });
    const qmt = buildControl([], true);
    runtime.registerControl(DataSource.TDX, tdx);
    runtime.registerControl(DataSource.QMT, qmt);
    const coordinator = buildCoordinator(runtime, []);
    await coordinator.onModuleInit();

    runtime.observeAcceptedReady(DataSource.TDX, 1);
    runtime.observeAcceptedReady(DataSource.TDX, 2);
    runtime.observeAcceptedReady(DataSource.TDX, 3);
    runtime.observeAcceptedReady(DataSource.QMT, 1);
    await settleRounds();
    expect(qmt.syncSubscriptions).toHaveBeenCalledTimes(1);

    releaseFirstGet?.();
    await waitFor(() => expect(tdx.getSubscriptions).toHaveBeenCalledTimes(2));

    expect(tdx.syncSubscriptions).toHaveBeenCalledTimes(1);
    expect(tdx.getSubscriptions).toHaveBeenCalledTimes(2);
    await coordinator.onModuleDestroy();
  });

  it('stops the round when the accepted connection becomes stale', async () => {
    const runtime = new RealtimeSubscriptionRuntimeRegistry();
    const control = buildControl();
    (control.getSubscriptions as jest.Mock).mockImplementationOnce(async () => {
      runtime.observeDisconnected(DataSource.QMT, 9);
      return { success: { whole: null, singles: {} } };
    });
    runtime.registerControl(DataSource.QMT, control);
    const coordinator = buildCoordinator(runtime, ['300502.SZ']);
    await coordinator.onModuleInit();

    runtime.observeAcceptedReady(DataSource.QMT, 9);
    await settleRounds();

    expect(control.getSubscriptions).toHaveBeenCalledTimes(1);
    expect(control.syncSubscriptions).not.toHaveBeenCalled();
    await coordinator.onModuleDestroy();
  });

  it('atomically replaces effective inventory and cleans removed latest state', async () => {
    const runtime = new RealtimeSubscriptionRuntimeRegistry();
    const control = buildControl();
    (control.getSubscriptions as jest.Mock)
      .mockResolvedValueOnce({ success: ['600030.SH'] })
      .mockResolvedValueOnce({ success: [] });
    runtime.registerControl(DataSource.TDX, control);
    const allowlist = {
      replaceAssigned: jest.fn(),
      replaceEffective: jest
        .fn()
        .mockReturnValueOnce([])
        .mockReturnValueOnce([{ formatCode: '600030.SH', securityId: 7 }]),
    };
    const ingress = { removeSeries: jest.fn() };
    const coordinator = new RealtimeSubscriptionLifecycleCoordinator(
      { createQueryBuilder: () => buildQuery([]) } as never,
      new ConfigService({}),
      runtime,
      fixedClock('2026-08-04T02:00:00Z'),
      new RealtimeSubscriptionLifecycleObservationStore(),
      allowlist as never,
      ingress as never,
      runtimeConfigMock(true),
      new SchedulerRegistry(),
    );
    await coordinator.onModuleInit();

    runtime.observeAcceptedReady(DataSource.TDX, 1);
    await waitFor(() =>
      expect(control.getSubscriptions).toHaveBeenCalledTimes(2),
    );

    expect(allowlist.replaceAssigned).toHaveBeenCalledWith(DataSource.TDX, []);
    expect(allowlist.replaceEffective).toHaveBeenNthCalledWith(
      1,
      DataSource.TDX,
      ['600030.SH'],
    );
    expect(allowlist.replaceEffective).toHaveBeenNthCalledWith(
      2,
      DataSource.TDX,
      [],
    );
    expect(ingress.removeSeries).toHaveBeenCalledWith(7, DataSource.TDX);
    await coordinator.onModuleDestroy();
  });

  it('uses add-only reconciliation in the weekday intraday window', async () => {
    const runtime = new RealtimeSubscriptionRuntimeRegistry();
    const control = buildControl();
    (control.getSubscriptions as jest.Mock).mockResolvedValue({
      success: ['600030.SH'],
    });
    runtime.registerControl(DataSource.TDX, control);
    const coordinator = new RealtimeSubscriptionLifecycleCoordinator(
      {
        createQueryBuilder: () => buildQuery(['300502.SZ', '600030.SH']),
      } as never,
      new ConfigService({}),
      runtime,
      fixedClock('2026-08-04T02:00:00Z'),
      new RealtimeSubscriptionLifecycleObservationStore(),
      allowlistBoundary(),
      ingressBoundary(),

      runtimeConfigMock(true),

      new SchedulerRegistry(),
    );
    await coordinator.onModuleInit();
    runtime.observeAcceptedReady(DataSource.TDX, 1);
    await waitFor(() =>
      expect(control.getSubscriptions).toHaveBeenCalledTimes(2),
    );
    jest.clearAllMocks();

    coordinator.requestIncrementalReconciliation(DataSource.TDX);
    await waitFor(() =>
      expect(control.getSubscriptions).toHaveBeenCalledTimes(2),
    );

    expect(control.subscribe).toHaveBeenCalledTimes(1);
    expect(control.subscribe).toHaveBeenCalledWith('300502.SZ');
    expect(control.syncSubscriptions).not.toHaveBeenCalled();
    expect(control.unsubscribe).not.toHaveBeenCalled();
    await coordinator.onModuleDestroy();
  });

  it('coalesces activation during a reset into one add-only rerun', async () => {
    const runtime = new RealtimeSubscriptionRuntimeRegistry();
    let releaseSync: (() => void) | undefined;
    const syncGate = new Promise<void>((resolve) => {
      releaseSync = resolve;
    });
    const control = buildControl();
    (control.getSubscriptions as jest.Mock).mockResolvedValue({
      success: ['600030.SH'],
    });
    (control.syncSubscriptions as jest.Mock).mockImplementationOnce(
      async () => {
        await syncGate;
        return { success: null };
      },
    );
    runtime.registerControl(DataSource.TDX, control);
    const query = buildQuery(['600030.SH']);
    (query.getRawMany as jest.Mock)
      .mockResolvedValueOnce([providerRoute('600030.SH', 1)])
      .mockResolvedValue([
        providerRoute('600030.SH', 1),
        providerRoute('300502.SZ', 2),
      ]);
    const coordinator = new RealtimeSubscriptionLifecycleCoordinator(
      { createQueryBuilder: () => query } as never,
      new ConfigService({}),
      runtime,
      fixedClock('2026-08-04T02:00:00Z'),
      new RealtimeSubscriptionLifecycleObservationStore(),
      allowlistBoundary(),
      ingressBoundary(),

      runtimeConfigMock(true),

      new SchedulerRegistry(),
    );
    await coordinator.onModuleInit();

    runtime.observeAcceptedReady(DataSource.TDX, 1);
    await waitFor(() =>
      expect(control.syncSubscriptions).toHaveBeenCalledTimes(1),
    );
    coordinator.requestIncrementalReconciliation(DataSource.TDX);
    coordinator.requestIncrementalReconciliation(DataSource.TDX);
    releaseSync?.();
    await waitFor(() =>
      expect(control.subscribe).toHaveBeenCalledWith('300502.SZ'),
    );

    expect(control.syncSubscriptions).toHaveBeenCalledTimes(1);
    expect(control.subscribe).toHaveBeenCalledTimes(1);
    await coordinator.onModuleDestroy();
  });

  it('keeps fresh pre-reset evidence on failure and retries only after reconnect', async () => {
    const runtime = new RealtimeSubscriptionRuntimeRegistry();
    const observations = new RealtimeSubscriptionLifecycleObservationStore();
    const control = buildControl();
    (control.getSubscriptions as jest.Mock).mockResolvedValue({
      success: ['600030.SH'],
    });
    (control.syncSubscriptions as jest.Mock)
      .mockResolvedValueOnce({
        failure: { reason: 'TDX_SUBSCRIBE_NOT_CONVERGED' },
      })
      .mockResolvedValue({ success: null });
    runtime.registerControl(DataSource.TDX, control);
    const coordinator = new RealtimeSubscriptionLifecycleCoordinator(
      { createQueryBuilder: () => buildQuery(['600030.SH']) } as never,
      new ConfigService({}),
      runtime,
      fixedClock('2026-08-04T02:00:00Z'),
      observations,
      allowlistBoundary(),
      ingressBoundary(),

      runtimeConfigMock(true),

      new SchedulerRegistry(),
    );
    await coordinator.onModuleInit();

    runtime.observeAcceptedReady(DataSource.TDX, 1);
    await waitFor(() =>
      expect(observations.health('on').sources[0]).toMatchObject({
        activeCount: 1,
        result: 'failure',
        convergence: 'drifted',
        reason: 'control_failed',
      }),
    );
    expect(control.syncSubscriptions).toHaveBeenCalledTimes(1);

    runtime.observeAcceptedReady(DataSource.TDX, 2);
    await waitFor(() =>
      expect(observations.health('on').sources[0]).toMatchObject({
        result: 'success',
        convergence: 'converged',
      }),
    );
    expect(control.syncSubscriptions).toHaveBeenCalledTimes(2);
    expect(observations.health('on').sources[0].resultTotals).toEqual([
      expect.objectContaining({
        result: 'failure',
        reason: 'control_failed',
        value: 1,
      }),
      expect.objectContaining({ result: 'success', reason: 'none', value: 1 }),
    ]);
    await coordinator.onModuleDestroy();
  });

  it('does not enqueue incremental work outside the weekday intraday window', async () => {
    const runtime = new RealtimeSubscriptionRuntimeRegistry();
    const control = buildControl();
    runtime.registerControl(DataSource.TDX, control);
    const coordinator = new RealtimeSubscriptionLifecycleCoordinator(
      { createQueryBuilder: () => buildQuery(['600030.SH']) } as never,
      new ConfigService({}),
      runtime,
      fixedClock('2026-08-04T08:00:00Z'),
      new RealtimeSubscriptionLifecycleObservationStore(),
      allowlistBoundary(),
      ingressBoundary(),

      runtimeConfigMock(true),

      new SchedulerRegistry(),
    );
    await coordinator.onModuleInit();
    runtime.observeAcceptedReady(DataSource.TDX, 1);
    await waitFor(() =>
      expect(control.getSubscriptions).toHaveBeenCalledTimes(2),
    );
    jest.clearAllMocks();

    coordinator.requestIncrementalReconciliation(DataSource.TDX);
    await settleRounds();

    expect(control.getSubscriptions).not.toHaveBeenCalled();
    await coordinator.onModuleDestroy();
  });

  it('pins the destructive barrier to weekday 09:15 Asia/Shanghai', () => {
    const options = Reflect.getMetadata(
      'SCHEDULE_CRON_OPTIONS',
      RealtimeSubscriptionLifecycleCoordinator.prototype.runWeekday0915Barrier,
    ) as Record<string, unknown>;
    expect(options).toMatchObject({
      cronTime: '0 15 9 * * 1-5',
      timeZone: ASIA_SHANGHAI_TIMEZONE,
      name: 'realtime-subscription-weekday-0915-reset',
    });
  });

  it('stops after the current bounded call during shutdown and rejects new ready work', async () => {
    const runtime = new RealtimeSubscriptionRuntimeRegistry();
    let releaseGet: (() => void) | undefined;
    const pendingGet = new Promise<void>((resolve) => {
      releaseGet = resolve;
    });
    const control = buildControl();
    (control.getSubscriptions as jest.Mock).mockImplementationOnce(async () => {
      await pendingGet;
      return { success: [] };
    });
    runtime.registerControl(DataSource.TDX, control);
    const coordinator = buildCoordinator(runtime, ['600030.SH']);
    await coordinator.onModuleInit();
    runtime.observeAcceptedReady(DataSource.TDX, 1);
    await settleRounds();

    const shutdown = coordinator.onModuleDestroy();
    runtime.observeAcceptedReady(DataSource.TDX, 2);
    releaseGet?.();
    await shutdown;

    expect(control.getSubscriptions).toHaveBeenCalledTimes(1);
    expect(control.syncSubscriptions).not.toHaveBeenCalled();
  });

  it('scheduled round picks up external DB writes (add/remove) within one interval', async () => {
    const runtime = new RealtimeSubscriptionRuntimeRegistry();
    const calls: string[] = [];
    const control = buildControl(calls);
    runtime.registerControl(DataSource.TDX, control);
    const symbols = ['600030.SH', '300502.SZ'];
    const coordinator = buildCoordinator(runtime, symbols);
    await coordinator.onModuleInit();
    runtime.observeAcceptedReady(DataSource.TDX, 1);
    await settleRounds();
    expect(calls).toContain('sync:600030.SH,300502.SZ');

    // external DB write: 300502.SZ removed from assignments; the scheduled
    // round must converge the full desired set (reset policy) without a
    // restart or HTTP control endpoint
    calls.length = 0;
    symbols.length = 0;
    symbols.push('600030.SH');
    await (
      coordinator as unknown as {
        runScheduledReconciliation(): Promise<void>;
      }
    ).runScheduledReconciliation();
    await settleRounds();

    expect(calls).toContain('sync:600030.SH');
    await coordinator.onModuleDestroy();
  });

  it('flipping auto_reconcile false→true triggers an immediate full alignment', async () => {
    const runtime = new RealtimeSubscriptionRuntimeRegistry();
    const calls: string[] = [];
    const control = buildControl(calls);
    runtime.registerControl(DataSource.TDX, control);
    const flip = { value: false };
    const runtimeConfig = {
      getAutoReconcileCached: jest.fn(() => flip.value),
      refresh: jest.fn().mockResolvedValue(undefined),
    } as never;
    const coordinator = new RealtimeSubscriptionLifecycleCoordinator(
      { createQueryBuilder: () => buildQuery(['600030.SH']) } as never,
      new ConfigService({}),
      runtime,
      fixedClock('2026-08-04T02:00:00Z'),
      new RealtimeSubscriptionLifecycleObservationStore(),
      allowlistBoundary(),
      ingressBoundary(),
      runtimeConfig,
      new SchedulerRegistry(),
    );
    await coordinator.onModuleInit();
    runtime.observeAcceptedReady(DataSource.TDX, 1);
    await settleRounds();
    expect(calls).not.toContain('sync:');

    flip.value = true; // DB switch flips
    await (
      coordinator as unknown as {
        runScheduledReconciliation(): Promise<void>;
      }
    ).runScheduledReconciliation();
    await settleRounds();

    expect(calls).toContain('sync:600030.SH');
    await coordinator.onModuleDestroy();
  });

  it('flipping auto_reconcile true→false stops rounds and keeps existing subscriptions', async () => {
    const runtime = new RealtimeSubscriptionRuntimeRegistry();
    const calls: string[] = [];
    const control = buildControl(calls);
    runtime.registerControl(DataSource.TDX, control);
    const flip = { value: true };
    const runtimeConfig = {
      getAutoReconcileCached: jest.fn(() => flip.value),
      refresh: jest.fn().mockResolvedValue(undefined),
    } as never;
    const coordinator = new RealtimeSubscriptionLifecycleCoordinator(
      { createQueryBuilder: () => buildQuery(['600030.SH']) } as never,
      new ConfigService({}),
      runtime,
      fixedClock('2026-08-04T02:00:00Z'),
      new RealtimeSubscriptionLifecycleObservationStore(),
      allowlistBoundary(),
      ingressBoundary(),
      runtimeConfig,
      new SchedulerRegistry(),
    );
    await coordinator.onModuleInit();
    runtime.observeAcceptedReady(DataSource.TDX, 1);
    await settleRounds();
    expect(calls).toContain('sync:600030.SH');

    flip.value = false;
    calls.length = 0;
    await (
      coordinator as unknown as {
        runScheduledReconciliation(): Promise<void>;
      }
    ).runScheduledReconciliation();
    await settleRounds();

    // no further convergence, existing subscription untouched (manual takeover)
    expect(calls).not.toContain('sync:');
    expect(calls).not.toContain('unsubscribe:');
    await coordinator.onModuleDestroy();
  });
});

describe('isIntradayAddWindow', () => {
  it.each([
    ['2026-08-03T01:15:00Z', true],
    ['2026-08-03T06:59:59Z', true],
    ['2026-08-03T07:00:00Z', false],
    ['2026-08-02T02:00:00Z', false],
  ])('%s => %s', (iso, expected) => {
    expect(isIntradayAddWindow(new Date(iso))).toBe(expected);
  });
});

function buildCoordinator(
  runtime: RealtimeSubscriptionRuntimeRegistry,
  symbols: string[],
  autoReconcile = true,
) {
  return new RealtimeSubscriptionLifecycleCoordinator(
    { createQueryBuilder: () => buildQuery(symbols) } as never,
    new ConfigService({}),
    runtime,
    fixedClock('2026-08-04T02:00:00Z'),
    new RealtimeSubscriptionLifecycleObservationStore(),
    allowlistBoundary(),
    ingressBoundary(),
    runtimeConfigMock(autoReconcile),
    new SchedulerRegistry(),
  );
}

function runtimeConfigMock(autoReconcile: boolean) {
  return {
    getAutoReconcileCached: jest.fn(() => autoReconcile),
    refresh: jest.fn().mockResolvedValue(undefined),
  } as never;
}

function buildQuery(symbols: string[]) {
  const query = {
    select: jest.fn(),
    addSelect: jest.fn(),
    innerJoin: jest.fn(),
    where: jest.fn(),
    andWhere: jest.fn(),
    orderBy: jest.fn(),
    getRawMany: jest.fn().mockResolvedValue(
      symbols.map((providerSymbol, index) => ({
        providerSymbol,
        securityId: index + 1,
        securityStatus: SecurityStatus.ACTIVE,
      })),
    ),
  };
  for (const method of [
    query.select,
    query.addSelect,
    query.innerJoin,
    query.where,
    query.andWhere,
    query.orderBy,
  ]) {
    method.mockReturnValue(query);
  }
  return query;
}

function providerRoute(providerSymbol: string, securityId: number) {
  return {
    providerSymbol,
    securityId,
    securityStatus: SecurityStatus.ACTIVE,
  };
}

function buildControl(
  calls: string[] = [],
  qmt = false,
): RealtimeSubscriptionControl {
  return {
    getSubscriptions: jest.fn(async () => {
      calls.push('get');
      return { success: qmt ? { whole: null, singles: {} } : [] };
    }),
    syncSubscriptions: jest.fn(async (symbols: readonly string[]) => {
      calls.push(`sync:${symbols.join(',')}`);
      return { success: null };
    }),
    subscribe: jest.fn(async () => ({ success: null })),
    unsubscribe: jest.fn(async () => ({ success: null })),
  };
}

function fixedClock(iso: string) {
  return { nowDate: () => new Date(iso) } as never;
}

function allowlistBoundary() {
  return {
    replaceAssigned: jest.fn(),
    replaceEffective: jest.fn().mockReturnValue([]),
  } as never;
}

function ingressBoundary() {
  return { removeSeries: jest.fn() } as never;
}

async function settleRounds(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

async function waitFor(assertion: () => void): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await settleRounds();
    }
  }
  throw lastError;
}
