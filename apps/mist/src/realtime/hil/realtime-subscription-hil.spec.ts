import { RealtimeSubscriptionControl } from '../realtime-subscription-control';
import { runControlSequence } from './realtime-subscription-hil';

describe('realtime subscription HIL operation sequence', () => {
  it('uses all four typed methods in deterministic order', async () => {
    const calls: string[] = [];
    const client: RealtimeSubscriptionControl = {
      getSubscriptions: async () => {
        calls.push('get');
        return { success: { whole: null, singles: {} } };
      },
      syncSubscriptions: async (symbols) => {
        calls.push(`sync:${symbols.join(',')}`);
        return { success: null };
      },
      subscribe: async (symbol) => {
        calls.push(`subscribe:${symbol}`);
        return { success: 7 };
      },
      unsubscribe: async (symbol) => {
        calls.push(`unsubscribe:${symbol}`);
        return { success: null };
      },
    };

    const evidence = await runControlSequence(client, '300502.SZ');

    expect(calls).toEqual([
      'get',
      'sync:300502.SZ',
      'get',
      'subscribe:300502.SZ',
      'get',
      'unsubscribe:300502.SZ',
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
          symbol: '300502.SZ',
          reason: 'QMT_UNSUBSCRIBE_UNCONFIRMED',
          subscriptionState: 'unknown',
        },
      }),
      unsubscribe: async () => ({ success: null }),
    };

    const evidence = await runControlSequence(client, '300502.SZ');

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
    expect(JSON.stringify(evidence)).not.toContain('provider detail');
  });
});
