import { ConfigService } from '@nestjs/config';
import WebSocket from 'ws';
import { QmtRealtimeClient } from '../sources/qmt/realtime/realtime.client';
import { QmtRealtimeStore } from '../sources/qmt/realtime/realtime.store';
import { TdxRealtimeClient } from '../sources/tdx/realtime/realtime.client';
import { TdxRealtimeStore } from '../sources/tdx/realtime/realtime.store';

const timestamp = '2026-07-26T10:00:00+08:00';

describe.each(['qmt', 'tdx'] as const)(
  '%s in-process subscription control',
  (provider) => {
    it('executes all four exact requests without automatic ready sync', async () => {
      const { client, send } = buildClient(provider);
      emit(client, ready(provider));
      expect(send).not.toHaveBeenCalled();

      const operations = [
        {
          promise: client.syncSubscriptions(['600030.SH', '300502.SZ']),
          request: {
            type: 'sync_subscriptions',
            symbols: ['300502.SZ', '600030.SH'],
          },
          responseType: 'subscriptions_synced',
          success: null,
        },
        {
          promise: () => client.subscribe('300502.SZ'),
          request: { type: 'subscribe', symbol: '300502.SZ' },
          responseType: 'subscribed',
          success: provider === 'qmt' ? 0 : null,
        },
        {
          promise: () => client.unsubscribe('300502.SZ'),
          request: { type: 'unsubscribe', symbol: '300502.SZ' },
          responseType: 'unsubscribed',
          success: null,
        },
        {
          promise: () => client.getSubscriptions(),
          request: { type: 'get_subscriptions' },
          responseType: 'subscriptions',
          success: provider === 'qmt' ? { whole: null, singles: {} } : [],
        },
      ];

      for (const [index, operation] of operations.entries()) {
        const promise =
          typeof operation.promise === 'function'
            ? operation.promise()
            : operation.promise;
        expect(JSON.parse(send.mock.calls[index][0] as string)).toEqual(
          operation.request,
        );
        emit(
          client,
          response(provider, operation.responseType, {
            success: operation.success,
          }),
        );
        await expect(promise).resolves.toEqual({
          success: operation.success,
        });
      }
    });

    it('rejects busy, mismatched response, and unauthorized targets', async () => {
      const { client } = buildClient(provider);
      emit(client, ready(provider));

      const first = client.subscribe('300502.SZ');
      await expect(client.subscribe('600030.SH')).resolves.toEqual({
        failure: {
          symbol: '600030.SH',
          reason: `${provider.toUpperCase()}_SUBSCRIPTION_CONTROL_BUSY`,
        },
      });
      emit(client, response(provider, 'subscriptions', { success: [] }));
      expect(
        provider === 'qmt'
          ? (client as QmtRealtimeClient)
          : (client as TdxRealtimeClient),
      ).toBeDefined();
      emit(client, response(provider, 'subscribed', { success: 7 }));
      await expect(first).resolves.toEqual({ success: 7 });

      await expect(client.subscribe('000001.SZ')).resolves.toEqual({
        failure: {
          symbol: '000001.SZ',
          reason: `${provider.toUpperCase()}_SUBSCRIPTION_SYMBOL_NOT_AUTHORIZED`,
        },
      });
    });

    it('does not send while closed or before ready', async () => {
      const { client, send } = buildClient(provider, false);

      await expect(client.getSubscriptions()).resolves.toEqual({
        failure: {
          symbol: null,
          reason: `${provider.toUpperCase()}_SUBSCRIPTION_CONTROL_NOT_READY`,
        },
      });
      expect(send).not.toHaveBeenCalled();
    });

    it('settles timeout/disconnect as unknown and rejects late responses', async () => {
      const { client } = buildClient(provider, true, 5);
      emit(client, ready(provider));

      const timedOut = client.subscribe('300502.SZ');
      await expect(timedOut).resolves.toEqual({
        failure: {
          symbol: '300502.SZ',
          reason: `${provider.toUpperCase()}_SUBSCRIPTION_CONTROL_TIMEOUT`,
        },
      });
      emit(client, response(provider, 'subscribed', { success: 99 }));

      const disconnected = client.subscribe('600030.SH');
      (
        client as unknown as { settleDisconnected(): void }
      ).settleDisconnected();
      await expect(disconnected).resolves.toEqual({
        failure: {
          symbol: '600030.SH',
          reason: `${provider.toUpperCase()}_SUBSCRIPTION_CONTROL_DISCONNECTED`,
        },
      });
    });

    it('requires exact response keys before settling the pending call', async () => {
      const { client } = buildClient(provider);
      emit(client, ready(provider));

      const pending = client.getSubscriptions();
      emit(client, {
        ...response(provider, 'subscriptions', { success: [] }),
        revision: 1,
      });
      emit(client, response(provider, 'subscriptions', { success: [] }));
      await expect(pending).resolves.toEqual({ success: [] });
    });
  },
);

type ControlClient = QmtRealtimeClient | TdxRealtimeClient;

function buildClient(provider: 'qmt' | 'tdx', open = true, timeoutMs = 1_000) {
  const entries = new Map([
    ['300502.SZ', { formatCode: '300502.SZ', securityId: 300502 }],
    ['600030.SH', { formatCode: '600030.SH', securityId: 600030 }],
  ]);
  const allowlist = {
    resolve: (symbol: string) => entries.get(symbol) ?? null,
    entriesList: [...entries.values()],
  };
  const client =
    provider === 'qmt'
      ? new QmtRealtimeClient(
          new ConfigService({ QMT_SUBSCRIPTION_CONTROL_TIMEOUT_MS: timeoutMs }),
          new QmtRealtimeStore(),
          allowlist as never,
        )
      : new TdxRealtimeClient(
          new ConfigService({ TDX_SUBSCRIPTION_CONTROL_TIMEOUT_MS: timeoutMs }),
          new TdxRealtimeStore(),
          allowlist as never,
        );
  const send = jest.fn();
  (
    client as unknown as {
      ws: { readyState: number; send: jest.Mock; close: jest.Mock };
    }
  ).ws = {
    readyState: open ? WebSocket.OPEN : WebSocket.CLOSED,
    send,
    close: jest.fn(),
  };
  return { client, send };
}

function emit(client: ControlClient, message: Record<string, unknown>) {
  (client as unknown as { handleMessage(raw: string): void }).handleMessage(
    JSON.stringify(message),
  );
}

function ready(provider: 'qmt' | 'tdx') {
  return {
    type: 'realtime.ready',
    provider,
    timestamp,
    data: {
      mode: 'builtin',
      schemaVersion: 2,
      source: provider,
      quality: 'latest-state',
    },
  };
}

function response(
  provider: 'qmt' | 'tdx',
  type: string,
  data: Record<string, unknown>,
) {
  return { type, provider, timestamp, data };
}
