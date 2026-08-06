import { DataSource } from '@app/shared-data';
import { RealtimeMarketObservabilityService } from '../realtime-market-observability.service';
import type { RealtimeCandleRuntimeObservation } from './realtime-candle-health.types';
import { RealtimeCandleHealthService } from './realtime-candle-health.service';

function runtime(
  mode: RealtimeCandleRuntimeObservation['mode'],
  overrides: {
    queue?: Partial<RealtimeCandleRuntimeObservation['queue']>;
    candle?: Partial<RealtimeCandleRuntimeObservation['candle']>;
    due?: Partial<RealtimeCandleRuntimeObservation['due']>;
  } = {},
): RealtimeCandleRuntimeObservation {
  const base: RealtimeCandleRuntimeObservation = {
    mode,
    graceMs: 5000,
    queue: {
      pendingGlobal: 0,
      maximumPendingPerSeries: 0,
      snapshotOverflowTotal: 0,
      snapshotOverflowLastFailureAtMs: null,
      dueAdmissionOverflowTotal: 0,
      dueAdmissionOverflowLastFailureAtMs: null,
    },
    candle: {
      seriesCount: 0,
      candidateCount: 0,
      invalidCandidateCount: 0,
      frozenCandidateCount: 0,
      sealedTotal: 0,
      discardTotals: [],
      lateAfterGraceTotal: 0,
      candidateCapacityExceededTotal: 0,
      finalizationFailureTotal: 0,
      finalizationLastFailureAtMs: null,
      finalizationHorizonExceededTotal: 0,
      finalizationHorizonExceededLastFailureAtMs: null,
      recordLimitBreachTotal: 0,
      recoveryGapTotal: 0,
      recoveryGapLastFailureAtMs: null,
      maxSealedRecordBytes: 0,
      maxManifestBytes: 0,
    },
    due: {
      scanFailureTotal: 0,
      scanLastFailureAtMs: null,
      registrationFailureTotal: 0,
      registrationLastFailureAtMs: null,
    },
  };
  return {
    ...base,
    queue: { ...base.queue, ...overrides.queue },
    candle: { ...base.candle, ...overrides.candle },
    due: { ...base.due, ...overrides.due },
  };
}

const CONFIG = {
  REALTIME_CANDLE_DEGRADED_RECOVERY_WINDOW_MS: 300_000,
};

function makeConfigService() {
  return {
    get: jest.fn((key: string) => CONFIG[key as keyof typeof CONFIG]),
  } as any;
}

describe('RealtimeCandleHealthService', () => {
  it('reports disabled health without touching Redis in off mode', async () => {
    const client = { info: jest.fn() };
    const service = new RealtimeCandleHealthService(
      { runtimeObservation: () => runtime('off') } as any,
      {
        isAvailable: jest.fn().mockReturnValue(false),
        client,
      } as any,
      { now: jest.fn() } as any,
      { list: jest.fn().mockReturnValue([]) } as any,
      new RealtimeMarketObservabilityService(),
      makeConfigService(),
    );

    await expect(service.observe()).resolves.toMatchObject({
      status: 'disabled',
      mode: 'off',
      degradedReasons: [],
      redis: { available: false },
    });
    expect(client.info).not.toHaveBeenCalled();
  });

  it('observes shared Redis with bounded exact keys in shadow mode', async () => {
    const client = {
      info: jest
        .fn()
        .mockResolvedValueOnce('used_memory:4096\r\n')
        .mockResolvedValueOnce(
          'aof_enabled:1\r\naof_current_size:2048\r\naof_last_write_status:ok\r\n',
        ),
      config: jest.fn().mockResolvedValue(['maxmemory-policy', 'noeviction']),
      exists: jest.fn().mockResolvedValueOnce(4).mockResolvedValueOnce(0),
      zcard: jest.fn().mockResolvedValue(2),
      zrange: jest.fn().mockResolvedValue(['member', '1785202205000']),
    };
    const now = Date.parse('2026-07-28T01:31:00.000Z');
    const allowlist = {
      list: jest.fn((source: DataSource) =>
        source === DataSource.TDX
          ? [{ securityId: 7, formatCode: '600030.SH' }]
          : [],
      ),
    };
    const service = new RealtimeCandleHealthService(
      { runtimeObservation: () => runtime('shadow') } as any,
      {
        isAvailable: jest.fn().mockReturnValue(true),
        client,
      } as any,
      { now: () => now } as any,
      allowlist as any,
      new RealtimeMarketObservabilityService(),
      makeConfigService(),
    );

    await expect(service.observe()).resolves.toMatchObject({
      status: 'ok',
      mode: 'shadow',
      graceMs: 5000,
      due: { pendingCount: 2, oldestLagMs: 55_000 },
      redis: {
        usedMemoryBytes: 4096,
        aofSizeBytes: 2048,
        aofEnabled: true,
        aofLastWriteStatus: 'ok',
        maxmemoryPolicy: 'noeviction',
        currentDayMarketKeyCount: 4,
        expiredMarketKeyCount: 0,
      },
    });
    const exactKeys = client.exists.mock.calls.flat().join(' ');
    expect(exactKeys).not.toContain('*');
    expect(exactKeys).toContain(':day:20260728:tdx:7:candle:1m:closed');
  });

  it('keeps quantity rejection labels bounded and degrades within the window', async () => {
    const observability = new RealtimeMarketObservabilityService();
    const now = Date.parse('2026-07-28T01:31:00.000Z');
    observability.recordQuantityRejection(
      'qmt',
      'amount',
      'precision_exceeded',
      now - 10_000,
    );
    const service = new RealtimeCandleHealthService(
      { runtimeObservation: () => runtime('shadow') } as any,
      { isAvailable: () => false, client: null } as any,
      { now: () => now } as any,
      { list: jest.fn().mockReturnValue([]) } as any,
      observability,
      makeConfigService(),
    );

    await expect(service.observe()).resolves.toMatchObject({
      status: 'degraded',
      degradedReasons: ['quantity_profile_rejected', 'redis_unavailable'],
      quantityProfileRejections: [
        {
          source: 'qmt',
          field: 'amount',
          reason: 'precision_exceeded',
          total: 1,
          lastFailureAtMs: now - 10_000,
        },
      ],
    });
  });

  it('recovers to OK once the recovery window passes without new failures', async () => {
    const now = Date.parse('2026-07-28T01:31:00.000Z');
    const service = new RealtimeCandleHealthService(
      {
        runtimeObservation: () =>
          runtime('shadow', {
            due: {
              scanFailureTotal: 1,
              scanLastFailureAtMs: now - 400_000, // outside 300s window
              registrationFailureTotal: 0,
              registrationLastFailureAtMs: null,
            },
          }),
      } as any,
      { isAvailable: () => true, client: makeFakeClient() } as any,
      { now: () => now } as any,
      { list: jest.fn().mockReturnValue([]) } as any,
      new RealtimeMarketObservabilityService(),
      makeConfigService(),
    );

    await expect(service.observe()).resolves.toMatchObject({
      status: 'ok',
      degradedReasons: [],
      due: { scanFailureTotal: 1 },
    });
  });

  it('keeps degraded while failures keep refreshing the window', async () => {
    const now = Date.parse('2026-07-28T01:31:00.000Z');
    const service = new RealtimeCandleHealthService(
      {
        runtimeObservation: () =>
          runtime('shadow', {
            due: {
              scanFailureTotal: 3,
              scanLastFailureAtMs: now - 10_000, // inside 300s window
              registrationFailureTotal: 0,
              registrationLastFailureAtMs: null,
            },
          }),
      } as any,
      { isAvailable: () => true, client: makeFakeClient() } as any,
      { now: () => now } as any,
      { list: jest.fn().mockReturnValue([]) } as any,
      new RealtimeMarketObservabilityService(),
      makeConfigService(),
    );

    await expect(service.observe()).resolves.toMatchObject({
      status: 'degraded',
      degradedReasons: ['due_scan_failed'],
    });
  });

  it('drives queue_overflow from the most recent of the two counters', async () => {
    const now = Date.parse('2026-07-28T01:31:00.000Z');
    const service = new RealtimeCandleHealthService(
      {
        runtimeObservation: () =>
          runtime('shadow', {
            queue: {
              pendingGlobal: 0,
              maximumPendingPerSeries: 0,
              snapshotOverflowTotal: 5,
              snapshotOverflowLastFailureAtMs: now - 400_000, // expired
              dueAdmissionOverflowTotal: 1,
              dueAdmissionOverflowLastFailureAtMs: now - 10_000, // fresh
            },
          }),
      } as any,
      { isAvailable: () => true, client: makeFakeClient() } as any,
      { now: () => now } as any,
      { list: jest.fn().mockReturnValue([]) } as any,
      new RealtimeMarketObservabilityService(),
      makeConfigService(),
    );

    await expect(service.observe()).resolves.toMatchObject({
      status: 'degraded',
      degradedReasons: ['queue_overflow'],
    });
  });

  it('does not degrade from deterministic-only counters (expired/record-limit paths)', async () => {
    const now = Date.parse('2026-07-28T01:31:00.000Z');
    const service = new RealtimeCandleHealthService(
      {
        runtimeObservation: () =>
          runtime('shadow', {
            candle: {
              finalizationFailureTotal: 2, // deterministic-only increments
              finalizationLastFailureAtMs: null,
              recordLimitBreachTotal: 2,
            },
          }),
      } as any,
      { isAvailable: () => true, client: makeFakeClient() } as any,
      { now: () => now } as any,
      { list: jest.fn().mockReturnValue([]) } as any,
      new RealtimeMarketObservabilityService(),
      makeConfigService(),
    );

    await expect(service.observe()).resolves.toMatchObject({
      status: 'ok',
      degradedReasons: [],
    });
  });

  it('recovers a single-bucket data loss (recovery_gap) after the window', async () => {
    const now = Date.parse('2026-07-28T01:31:00.000Z');
    const service = new RealtimeCandleHealthService(
      {
        runtimeObservation: () =>
          runtime('shadow', {
            candle: {
              recoveryGapTotal: 1,
              recoveryGapLastFailureAtMs: now - 400_000, // outside window
            },
          }),
      } as any,
      { isAvailable: () => true, client: makeFakeClient() } as any,
      { now: () => now } as any,
      { list: jest.fn().mockReturnValue([]) } as any,
      new RealtimeMarketObservabilityService(),
      makeConfigService(),
    );

    await expect(service.observe()).resolves.toMatchObject({
      status: 'ok',
      degradedReasons: [],
      candle: { recoveryGapTotal: 1 },
    });
  });
});

function makeFakeClient() {
  return {
    info: jest
      .fn()
      .mockResolvedValueOnce('used_memory:4096\r\n')
      .mockResolvedValueOnce(
        'aof_enabled:1\r\naof_current_size:2048\r\naof_last_write_status:ok\r\n',
      ),
    config: jest.fn().mockResolvedValue(['maxmemory-policy', 'noeviction']),
    exists: jest.fn().mockResolvedValue(0),
    zcard: jest.fn().mockResolvedValue(0),
    zrange: jest.fn().mockResolvedValue([]),
  };
}
