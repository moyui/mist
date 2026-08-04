import { ConfigService } from '@nestjs/config';
import { QmtRealtimeClient } from '../sources/qmt/realtime/realtime.client';
import { QmtRealtimeStore } from '../sources/qmt/realtime/realtime.store';
import { TdxRealtimeClient } from '../sources/tdx/realtime/realtime.client';
import { TdxRealtimeStore } from '../sources/tdx/realtime/realtime.store';
import { RealtimeSnapshotIngressService } from './realtime-snapshot-ingress.service';
import type { CanonicalRealtimeSnapshot } from './realtime.types';

const capturedAt = new Date().toISOString();

describe('formal realtime schema-v2 ingress contract', () => {
  it('retains independent latest state for the same security across sources', () => {
    const ingress = new RealtimeSnapshotIngressService();
    const tdx = canonicalSnapshot('tdx', 7);
    const qmt = canonicalSnapshot('qmt', 7);

    ingress.handleSnapshot(tdx);
    ingress.handleSnapshot(qmt);

    expect(ingress.readSeries(7, 'tdx')).toBe(tdx);
    expect(ingress.readSeries(7, 'qmt')).toBe(qmt);
    expect(ingress.read(7)).toBe(qmt);
  });

  it('drops prior-day source projections before accepting a new trading day', () => {
    const ingress = new RealtimeSnapshotIngressService();
    const prior = canonicalSnapshot('tdx', 7);
    prior.eventTime = '2026-07-28T14:59:00+08:00';
    const current = canonicalSnapshot('qmt', 7);
    current.eventTime = '2026-07-29T09:30:00+08:00';

    ingress.handleSnapshot(prior);
    ingress.handleSnapshot(current);

    expect(ingress.readSeries(7, 'tdx')).toBeNull();
    expect(ingress.readSeries(7, 'qmt')).toBe(current);
    expect(ingress.read(7)).toBe(current);
  });

  it('publishes latest-memory state before invoking the optional candle sink', () => {
    const product = {
      handleSnapshot: jest.fn((snapshot: CanonicalRealtimeSnapshot) => {
        expect(ingress.readSeries(snapshot.securityId, snapshot.source)).toBe(
          snapshot,
        );
      }),
    };
    const ingress = new RealtimeSnapshotIngressService(product as never);
    const snapshot = canonicalSnapshot('tdx', 7);

    expect(ingress.handleSnapshot(snapshot)).toBe(snapshot);
    expect(product.handleSnapshot).toHaveBeenCalledWith(snapshot);
  });

  it('keeps latest-memory acceptance when the optional candle sink fails', () => {
    const product = {
      handleSnapshot: jest.fn(() => {
        throw new Error('REDIS_UNAVAILABLE');
      }),
    };
    const ingress = new RealtimeSnapshotIngressService(product as never);
    const snapshot = canonicalSnapshot('tdx', 7);

    expect(() => ingress.handleSnapshot(snapshot)).not.toThrow();
    expect(ingress.readSeries(7, 'tdx')).toBe(snapshot);
    expect(ingress.read(7)).toBe(snapshot);
  });

  it('funnels a TDX one-entry native map through the common ingress', () => {
    const store = new TdxRealtimeStore();
    const ingress = new RealtimeSnapshotIngressService();
    const client = new TdxRealtimeClient(
      new ConfigService({ TDX_BASE_URL: 'http://127.0.0.1:9001' }),
      store,
      resolver({ '600030.SH': 600030 }) as never,
      undefined,
      ingress,
    );

    emit(client, ready('tdx'));
    emit(
      client,
      frame('tdx', {
        '600030.SH': {
          Now: 31.25,
          AsOf: '2026-07-22T10:01:02.000+08:00',
        },
      }),
    );

    expect(ingress.read(600030)?.prices.last).toBe(31.25);
    expect(ingress.read(600030)?.providerSymbol).toBe('600030.SH');
  });

  it('parses a snapshot frame exactly once before routing and decoding', () => {
    const store = new TdxRealtimeStore();
    const ingress = new RealtimeSnapshotIngressService();
    const client = new TdxRealtimeClient(
      new ConfigService({ TDX_BASE_URL: 'http://127.0.0.1:9001' }),
      store,
      resolver({ '600030.SH': 600030 }) as never,
      undefined,
      ingress,
    );

    emit(client, ready('tdx'));
    const parseSpy = jest.spyOn(JSON, 'parse');
    try {
      emit(
        client,
        frame('tdx', {
          '600030.SH': {
            Now: 31.25,
            AsOf: '2026-07-22T10:01:02.000+08:00',
          },
        }),
      );
      expect(parseSpy).toHaveBeenCalledTimes(1);
    } finally {
      parseSpy.mockRestore();
    }
  });

  it.each(['tdx', 'qmt'] as const)(
    'rejects oversized %s input before parsing',
    (provider) => {
      const store =
        provider === 'tdx' ? new TdxRealtimeStore() : new QmtRealtimeStore();
      const ingress = new RealtimeSnapshotIngressService();
      const client =
        provider === 'tdx'
          ? new TdxRealtimeClient(
              new ConfigService({ TDX_BASE_URL: 'http://127.0.0.1:9001' }),
              store as TdxRealtimeStore,
              resolver({ '600030.SH': 600030 }) as never,
              undefined,
              ingress,
            )
          : new QmtRealtimeClient(
              new ConfigService({ QMT_BASE_URL: 'http://127.0.0.1:9002' }),
              store as QmtRealtimeStore,
              resolver({ '300502.SZ': 300502 }) as never,
              Date.now,
              ingress,
            );
      const parseSpy = jest.spyOn(JSON, 'parse');
      try {
        (
          client as unknown as { handleMessage(raw: string): void }
        ).handleMessage('x'.repeat(1_048_577));
        expect(parseSpy).not.toHaveBeenCalled();
        expect(store.status().lastReject).toMatchObject({
          errorCode: 'REALTIME_FRAME_BYTES_EXCEEDED',
        });
      } finally {
        parseSpy.mockRestore();
      }
    },
  );

  it('isolates member-but-business-unauthorized QMT entries in one native map', () => {
    const store = new QmtRealtimeStore();
    const ingress = new RealtimeSnapshotIngressService();
    const client = new QmtRealtimeClient(
      new ConfigService({ QMT_BASE_URL: 'http://127.0.0.1:9002' }),
      store,
      resolver({ '300502.SZ': 300502, '000001.SZ': 1 }) as never,
      Date.now,
      ingress,
    );

    emit(client, ready('qmt'));
    const native = {
      '300502.SZ': qmtNative(541.2),
      '000001.SZ': qmtNative(12.34),
      '600030.SH': qmtNative(31.25),
      'BAD.SYMBOL': 'not-an-object',
    };
    emit(client, frame('qmt', native));
    emit(client, frame('qmt', { '300502.SZ': qmtNative(541.2) }));

    expect(ingress.read(300502)?.prices.last).toBe(541.2);
    expect(ingress.read(1)?.prices.last).toBe(12.34);
    expect(ingress.read(600030)).toBeNull();
    expect(store.status().rejectCounts).toMatchObject({
      symbolNotAuthorized: 1,
    });
    expect(store.status().lastAcceptedAt).not.toBeNull();
  });

  it.each(['tdx', 'qmt'] as const)(
    'rejects every retired %s ready-field shape without setting transportReady',
    (provider) => {
      const store =
        provider === 'tdx' ? new TdxRealtimeStore() : new QmtRealtimeStore();
      const ingress = new RealtimeSnapshotIngressService();
      const client =
        provider === 'tdx'
          ? new TdxRealtimeClient(
              new ConfigService({ TDX_BASE_URL: 'http://127.0.0.1:9001' }),
              store as TdxRealtimeStore,
              resolver({ '600030.SH': 600030 }) as never,
              undefined,
              ingress,
            )
          : new QmtRealtimeClient(
              new ConfigService({ QMT_BASE_URL: 'http://127.0.0.1:9002' }),
              store as QmtRealtimeStore,
              resolver({ '300502.SZ': 300502 }) as never,
              Date.now,
              ingress,
            );

      for (const retired of [
        'ready',
        'tdxRealtimeBridgeReady',
        'collectorReady',
        'generation',
        'ownerId',
        'datasourceBuildId',
        'bridge',
      ]) {
        const message = ready(provider);
        (message.data as Record<string, unknown>)[retired] =
          retired === 'ownerId' ? 'legacy-owner' : true;
        emit(client, message);
      }

      expect(store.status().transportReady).toBe(false);
      expect(store.status().rejectCounts).toMatchObject({
        contractMismatch: 7,
      });
    },
  );
});

function emit(client: object, message: Record<string, unknown>) {
  (
    client as { handleMessage(raw: string): Promise<void> | void }
  ).handleMessage(JSON.stringify(message));
}

function ready(provider: 'tdx' | 'qmt') {
  return {
    type: 'realtime.ready',
    provider,
    timestamp: capturedAt,
    data: {
      mode: 'builtin',
      schemaVersion: 2,
      source: provider.toUpperCase(),
      quality: 'latest-state',
      ...(provider === 'qmt'
        ? { leaderClientId: 'backend-test', active: [] }
        : {}),
    },
  };
}

function frame(provider: 'tdx' | 'qmt', native: Record<string, unknown>) {
  return {
    type: 'realtime.native_snapshot',
    provider,
    timestamp: capturedAt,
    data: {
      schemaVersion: 2,
      capturedAt,
      native,
    },
  };
}

function resolver(entries: Record<string, number>) {
  return {
    resolve: (providerSymbol: string) => {
      const securityId = entries[providerSymbol];
      return securityId === undefined
        ? null
        : { formatCode: providerSymbol, securityId };
    },
    entriesList: Object.entries(entries).map(([formatCode, securityId]) => ({
      formatCode,
      securityId,
    })),
  };
}

function qmtNative(lastPrice: number) {
  return {
    timetag: '20260722 10:01:02',
    lastPrice,
    open: 12,
    high: 13,
    low: 11,
    lastClose: 12,
    volume: 10,
    amount: 100,
  };
}

function canonicalSnapshot(
  source: 'tdx' | 'qmt',
  securityId: number,
): CanonicalRealtimeSnapshot {
  return {
    source,
    securityId,
    providerSymbol: source === 'tdx' ? '600030.SH' : '600030.SZ',
    eventTime: capturedAt,
    capturedAt,
    prices: { last: 10, open: 10, high: 10, low: 10, lastClose: 9 },
    cumulativeVolume: '100',
    cumulativeAmount: '1000',
    quality: {
      level: 'latest-state',
      eventTimeAvailable: true,
      aggregationEligible: true,
      partialPrices: false,
    },
    native: {},
  };
}
