import { DataSource } from '@app/shared-data';
import { RealtimeMarketObservabilityService } from '../realtime-market-observability.service';
import type { RealtimeCandleRuntimeObservation } from './realtime-candle-health.types';
import { RealtimeCandleHealthService } from './realtime-candle-health.service';

function runtime(
  mode: RealtimeCandleRuntimeObservation['mode'],
): RealtimeCandleRuntimeObservation {
  return {
    mode,
    graceMs: 5000,
    queue: {
      pendingGlobal: 0,
      maximumPendingPerSeries: 0,
      snapshotOverflowTotal: 0,
      dueAdmissionOverflowTotal: 0,
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
      finalizationHorizonExceededTotal: 0,
      recordLimitBreachTotal: 0,
      recoveryGapTotal: 0,
      maxSealedRecordBytes: 0,
      maxManifestBytes: 0,
    },
    due: {
      scanFailureTotal: 0,
      registrationFailureTotal: 0,
    },
  };
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
      { list: jest.fn() } as any,
      new RealtimeMarketObservabilityService(),
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

  it('keeps quantity rejection labels bounded and degrades promotion health', async () => {
    const observability = new RealtimeMarketObservabilityService();
    observability.recordQuantityRejection(
      'qmt',
      'amount',
      'precision_exceeded',
    );
    const service = new RealtimeCandleHealthService(
      { runtimeObservation: () => runtime('shadow') } as any,
      { isAvailable: () => false, client: null } as any,
      { now: jest.fn() } as any,
      { list: jest.fn() } as any,
      observability,
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
        },
      ],
    });
  });
});
