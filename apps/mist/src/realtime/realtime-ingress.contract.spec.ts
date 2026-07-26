import { ConfigService } from '@nestjs/config';
import { QmtRealtimeClient } from '../sources/qmt/realtime/realtime.client';
import { QmtRealtimeStore } from '../sources/qmt/realtime/realtime.store';
import { TdxRealtimeClient } from '../sources/tdx/realtime/realtime.client';
import { TdxRealtimeStore } from '../sources/tdx/realtime/realtime.store';
import { RealtimeSnapshotIngressService } from './realtime-snapshot-ingress.service';

const capturedAt = new Date().toISOString();

describe('formal realtime schema-v2 ingress contract', () => {
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

  it('isolates malformed and unauthorized QMT entries in one native map', () => {
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
    expect(store.status().rejectCounts).toMatchObject({
      symbolNotAuthorized: 1,
    });
    expect(store.status().lastAcceptedAt).not.toBeNull();
  });
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
      source: provider,
      quality: 'latest-state',
      generation: 1,
      ownerId: 'owner-1',
      bridgeBuildId: 'bridge-v2',
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
