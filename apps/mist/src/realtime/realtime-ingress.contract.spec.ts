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
          DateTime: '2026-07-22 10:01:02',
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
            DateTime: '2026-07-22 10:01:02',
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
