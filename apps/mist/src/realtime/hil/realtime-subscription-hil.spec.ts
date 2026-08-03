import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { DataSource as TypeOrmDataSource } from 'typeorm';

import { RealtimeSubscriptionControl } from '../realtime-subscription-control';
import {
  extractBridgeHealth,
  realtimeSubscriptionHilEntities,
  requireMatchingRawFixtureSymbol,
  runControlSequence,
  toCanonicalReadbackEvidence,
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

  it('records a sanitized canonical readback without native provider data', () => {
    const evidence = toCanonicalReadbackEvidence({
      source: 'tdx',
      securityId: 42,
      providerSymbol: '600030.SH',
      eventTime: null,
      capturedAt: '2026-07-28T10:34:01+08:00',
      prices: {
        last: 10.25,
        open: 10,
        high: 10.3,
        low: 9.95,
        lastClose: 10.05,
      },
      cumulativeVolume: '123456',
      cumulativeAmount: '1234567',
      quality: {
        level: 'latest-state',
        eventTimeAvailable: false,
        aggregationEligible: false,
        partialPrices: false,
      },
      native: {
        privateProviderField: 'must-not-enter-HIL-evidence',
      },
    });

    expect(evidence).toEqual({
      source: 'tdx',
      securityId: 42,
      providerSymbol: '600030.SH',
      eventTime: null,
      capturedAt: '2026-07-28T10:34:01+08:00',
      quality: {
        level: 'latest-state',
        eventTimeAvailable: false,
        aggregationEligible: false,
        partialPrices: false,
      },
    });
    expect(JSON.stringify(evidence)).not.toContain('privateProviderField');
    expect(JSON.stringify(evidence)).not.toContain('must-not-enter');
  });

  it('reads bridge authority from datasource root health', () => {
    expect(
      extractBridgeHealth(
        {
          status: 'ok',
          bridge: {
            ready: true,
            ownerId: 'tdx-bridge-pid-123',
            bridgeBuildId: 'mist-tdx-realtime-bridge-v2.1',
            desiredRevision: 7,
            convergedRevision: 7,
            privateField: 'must-not-enter-evidence',
          },
        },
        'tdx',
      ),
    ).toEqual({
      ready: true,
      ownerId: 'tdx-bridge-pid-123',
      bridgeBuildId: 'mist-tdx-realtime-bridge-v2.1',
      desiredRevision: 7,
      convergedRevision: 7,
    });
  });

  it('accepts an explicitly supplied scoped bridge health object', () => {
    expect(
      extractBridgeHealth(
        {
          ready: true,
          ownerId: 'qmt-owner-123',
          bridgeBuildId: 'mist-qmt-realtime-bridge-v2.0',
        },
        'qmt',
      ),
    ).toEqual({
      ready: true,
      ownerId: 'qmt-owner-123',
      bridgeBuildId: 'mist-qmt-realtime-bridge-v2.0',
    });
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

  it('classifies QMT callback cessation, replacement capacity and later ID reuse', async () => {
    let state: 'before' | 'whole' | 'overlay' = 'before';
    let nextOverlayId = 7;
    let observation:
      | {
          callbackStoppedDuringWindow: boolean;
          releasedSubscriptionId: number | null;
          laterSubscriptionId: number | null;
          laterIdReused: boolean | null;
          replacementSubscriptionSucceeded: boolean;
          quotaReleaseEvidence: string;
          runtimeActiveSubscriptionObservation: string;
        }
      | undefined;
    const client: RealtimeSubscriptionControl = {
      getSubscriptions: async () => ({
        success:
          state === 'before'
            ? { whole: null, singles: {} }
            : {
                whole: { subId: 6, symbols: ['300502.SZ'] },
                singles:
                  state === 'overlay' ? { '000001.SZ': nextOverlayId } : {},
              },
      }),
      syncSubscriptions: async () => {
        state = 'whole';
        return { success: 6 };
      },
      subscribe: async () => {
        state = 'overlay';
        return { success: nextOverlayId };
      },
      unsubscribe: async () => {
        state = 'whole';
        nextOverlayId = 8;
        return { success: null };
      },
    };

    const evidence = await runControlSequence(
      client,
      'qmt',
      '300502.SZ',
      '000001.SZ',
      undefined,
      {
        observationWindowMs: 1,
        readCapturedAt: () => '2026-07-30T10:00:00+08:00',
        onObservation: (value) => {
          observation = value;
        },
      },
    );

    expect(observation).toEqual(
      expect.objectContaining({
        callbackStoppedDuringWindow: true,
        releasedSubscriptionId: 7,
        laterSubscriptionId: 8,
        laterIdReused: false,
        replacementSubscriptionSucceeded: true,
        quotaReleaseEvidence: 'replacement_subscription_succeeded',
        runtimeActiveSubscriptionObservation: 'platform_unavailable',
      }),
    );
    expect(evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          operation: 'observeCallbackCessation.overlay',
          result: 'success',
        }),
        expect.objectContaining({
          operation: 'subscribe.overlayReplacement',
          success: 8,
        }),
        expect.objectContaining({
          operation: 'classifyQmtQuotaAndIdReuse',
          result: 'success',
        }),
        expect.objectContaining({
          operation: 'unsubscribe.overlayReplacement',
          result: 'success',
        }),
        expect.objectContaining({
          operation: 'validateSubscriptions.exactState',
          result: 'success',
        }),
      ]),
    );
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
      unsubscribe: async (symbol) => {
        active = active.filter((item) => item !== symbol);
        return { success: null };
      },
    };

    const evidence = await runControlSequence(
      client,
      'tdx',
      '600030.SH',
      '600519.SH',
    );

    expect(
      evidence
        .filter((item) =>
          item.operation.startsWith('getSubscriptions.afterUnsubscribe.cycle'),
        )
        .map((item) => item.operation),
    ).toEqual([
      'getSubscriptions.afterUnsubscribe.cycle1',
      'getSubscriptions.afterUnsubscribe.cycle2',
      'getSubscriptions.afterUnsubscribe.cycle3',
    ]);
    expect(evidence.at(-1)).toEqual({
      operation: 'validateSubscriptions.exactState',
      result: 'success',
      reason: 'none',
    });
  });

  it('fails TDX exact-state validation when a later native-list cycle resubscribes overlay', async () => {
    let state: 'before' | 'whole' | 'overlay' | 'unsubscribed' = 'before';
    let afterUnsubscribeReads = 0;
    const client: RealtimeSubscriptionControl = {
      getSubscriptions: async () => {
        if (state === 'overlay') {
          return { success: ['600030.SH', '600519.SH'] };
        }
        if (state === 'whole') {
          return { success: ['600030.SH'] };
        }
        if (state === 'unsubscribed') {
          afterUnsubscribeReads += 1;
          return {
            success:
              afterUnsubscribeReads === 2
                ? ['600030.SH', '600519.SH']
                : ['600030.SH'],
          };
        }
        return { success: [] };
      },
      syncSubscriptions: async () => {
        state = 'whole';
        return { success: null };
      },
      subscribe: async () => {
        state = 'overlay';
        return { success: null };
      },
      unsubscribe: async () => {
        state = 'unsubscribed';
        return { success: null };
      },
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
