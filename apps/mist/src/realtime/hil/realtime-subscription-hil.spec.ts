import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { DataSource as TypeOrmDataSource } from 'typeorm';

import { RealtimeSubscriptionControl } from '../realtime-subscription-control';
import {
  realtimeSubscriptionHilEntities,
  requireMatchingRawFixtureSymbol,
  runControlSequence,
} from './realtime-subscription-hil';

describe('realtime subscription HIL operation sequence', () => {
  it('rejects a raw fixture captured for a different symbol', () => {
    const directory = mkdtempSync(join(tmpdir(), 'mist-hil-fixture-'));
    const fixturePath = join(directory, 'raw.json');
    try {
      writeFileSync(
        fixturePath,
        JSON.stringify({ symbol: '600519.SH', nativePayload: {} }),
      );

      expect(() =>
        requireMatchingRawFixtureSymbol(fixturePath, '600030.SH'),
      ).toThrow(
        'HIL raw fixture symbol 600519.SH does not match requested symbol 600030.SH',
      );
      expect(requireMatchingRawFixtureSymbol(fixturePath, '600519.SH')).toBe(
        '600519.SH',
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('registers a closed TypeORM metadata graph for the allowlist entities', async () => {
    const dataSource = new TypeOrmDataSource({
      type: 'mysql',
      entities: [...realtimeSubscriptionHilEntities],
      database: 'metadata-only',
    });

    await (
      dataSource as unknown as { buildMetadatas(): Promise<void> }
    ).buildMetadatas();

    expect(
      dataSource
        .getMetadata('Security')
        .relations.map(({ propertyName }) => propertyName),
    ).toEqual(expect.arrayContaining(['sourceConfigs', 'ks']));
    expect(dataSource.getMetadata('K').relations).toHaveLength(4);
  });

  it('uses all four typed methods in deterministic order', async () => {
    const calls: string[] = [];
    let state: 'before' | 'whole' | 'overlay' = 'before';
    const client: RealtimeSubscriptionControl = {
      getSubscriptions: async () => {
        calls.push('get');
        if (state === 'whole') {
          return {
            success: {
              whole: { subId: 6, symbols: ['300502.SZ'] },
              singles: {},
            },
          };
        }
        if (state === 'overlay') {
          return {
            success: {
              whole: { subId: 6, symbols: ['300502.SZ'] },
              singles: { '000001.SZ': 7 },
            },
          };
        }
        return { success: { whole: null, singles: {} } };
      },
      syncSubscriptions: async (symbols) => {
        calls.push(`sync:${symbols.join(',')}`);
        state = 'whole';
        return { success: null };
      },
      subscribe: async (symbol) => {
        calls.push(`subscribe:${symbol}`);
        state = 'overlay';
        return { success: 7 };
      },
      unsubscribe: async (symbol) => {
        calls.push(`unsubscribe:${symbol}`);
        state = 'whole';
        return { success: null };
      },
    };

    const evidence = await runControlSequence(
      client,
      'qmt',
      '300502.SZ',
      '000001.SZ',
    );

    expect(calls).toEqual([
      'get',
      'sync:300502.SZ',
      'get',
      'subscribe:000001.SZ',
      'get',
      'unsubscribe:000001.SZ',
      'get',
    ]);
    expect(evidence).toEqual([
      expect.objectContaining({
        operation: 'getSubscriptions.before',
        result: 'success',
      }),
      expect.objectContaining({
        operation: 'syncSubscriptions.target',
        result: 'success',
      }),
      expect.objectContaining({
        operation: 'getSubscriptions.afterSync',
        result: 'success',
      }),
      {
        operation: 'subscribe.overlay',
        result: 'success',
        reason: 'none',
        success: 7,
      },
      expect.objectContaining({
        operation: 'getSubscriptions.afterSubscribe',
        result: 'success',
      }),
      expect.objectContaining({
        operation: 'unsubscribe.overlay',
        result: 'success',
      }),
      expect.objectContaining({
        operation: 'getSubscriptions.afterUnsubscribe',
        result: 'success',
      }),
      {
        operation: 'validateSubscriptions.exactState',
        result: 'success',
        reason: 'none',
      },
    ]);
  });

  it('records a bounded failure and continues the sequence', async () => {
    let getCalls = 0;
    const client: RealtimeSubscriptionControl = {
      getSubscriptions: async () => {
        getCalls += 1;
        return { success: [] };
      },
      syncSubscriptions: async () => {
        throw new Error('provider detail must not enter evidence');
      },
      subscribe: async () => ({
        failure: {
          symbol: '000001.SZ',
          reason: 'QMT_UNSUBSCRIBE_UNCONFIRMED',
          subscriptionState: 'unknown',
        },
      }),
      unsubscribe: async () => ({ success: null }),
    };

    const evidence = await runControlSequence(
      client,
      'qmt',
      '300502.SZ',
      '000001.SZ',
    );

    expect(getCalls).toBe(4);
    expect(evidence[1]).toEqual({
      operation: 'syncSubscriptions.target',
      result: 'failure',
      reason: 'HIL_OPERATION_THROWN',
    });
    expect(evidence[3]).toEqual({
      operation: 'subscribe.overlay',
      result: 'failure',
      reason: 'QMT_UNSUBSCRIBE_UNCONFIRMED',
      subscriptionState: 'unknown',
    });
    expect(evidence.at(-1)).toEqual({
      operation: 'validateSubscriptions.exactState',
      result: 'failure',
      reason: 'HIL_SUBSCRIPTION_STATE_INVALID',
    });
    expect(JSON.stringify(evidence)).not.toContain('provider detail');
  });

  it('requires the exact TDX active list after each mutation', async () => {
    let active: string[] = [];
    const client: RealtimeSubscriptionControl = {
      getSubscriptions: async () => ({ success: [...active] }),
      syncSubscriptions: async (symbols) => {
        active = [...symbols];
        return { success: null };
      },
      subscribe: async (symbol) => {
        active = [...active, symbol];
        return { success: null };
      },
      unsubscribe: async () => ({ success: null }),
    };

    const evidence = await runControlSequence(
      client,
      'tdx',
      '600030.SH',
      '600519.SH',
    );

    expect(evidence.at(-1)).toEqual({
      operation: 'validateSubscriptions.exactState',
      result: 'failure',
      reason: 'HIL_SUBSCRIPTION_STATE_INVALID',
    });
  });
});
