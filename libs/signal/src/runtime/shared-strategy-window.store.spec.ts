import type { StrategyBar } from '@app/strategy';
import { SharedStrategyWindowStore } from './shared-strategy-window.store';

describe('SharedStrategyWindowStore', () => {
  it('hydrates once, hot-appends without queries and rehydrates only on expansion', async () => {
    const marketData = {
      loadRealtimeWindow: jest
        .fn()
        .mockResolvedValueOnce({ bars: [bar(1, '2026-08-04T01:30:00.000Z')] })
        .mockResolvedValueOnce({
          bars: [
            bar(1, '2026-08-04T01:30:00.000Z'),
            bar(2, '2026-08-04T01:31:00.000Z'),
          ],
        }),
      resolveRealtimeObservation: jest.fn(),
    };
    const store = new SharedStrategyWindowStore();

    await store.prepare(marketData, bar(2, '2026-08-04T01:31:00.000Z'), 2);
    await store.prepare(marketData, bar(3, '2026-08-04T01:32:00.000Z'), 2);
    await store.prepare(marketData, bar(4, '2026-08-04T01:33:00.000Z'), 3);

    expect(marketData.loadRealtimeWindow).toHaveBeenCalledTimes(2);
    expect(marketData.loadRealtimeWindow).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ requiredBars: 2 }),
    );
    expect(marketData.loadRealtimeWindow).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ requiredBars: 3 }),
    );
  });

  it('uses the pre-window bar only as same-day forward-fill seed', async () => {
    const marketData = {
      loadRealtimeWindow: jest.fn().mockResolvedValue({
        bars: [
          bar(1, '2026-08-04T01:30:00.000Z', '80'),
          bar(2, '2026-08-04T01:31:00.000Z', null),
        ],
      }),
      resolveRealtimeObservation: jest.fn(),
    };
    const store = new SharedStrategyWindowStore();

    await store.prepare(
      marketData,
      bar(3, '2026-08-04T01:32:00.000Z', null),
      1,
    );

    expect(store.read(9, 'tdx', 1)).toEqual([
      expect.objectContaining({
        volume: {
          raw: null,
          effective: '80',
          resolution: 'forwardFilled',
        },
      }),
    ]);
  });

  it('treats identical identity/content as no-op and conflicting content as failure', async () => {
    const original = bar(1, '2026-08-04T01:30:00.000Z');
    const marketData = {
      loadRealtimeWindow: jest.fn().mockResolvedValue({ bars: [] }),
      resolveRealtimeObservation: jest.fn(),
    };
    const store = new SharedStrategyWindowStore();

    await expect(store.prepare(marketData, original, 1)).resolves.toBe(
      'appended',
    );
    await expect(store.prepare(marketData, original, 1)).resolves.toBe(
      'duplicate',
    );
    await expect(
      store.prepare(marketData, { ...original, close: 99 }, 1),
    ).rejects.toThrow('conflicting canonical StrategyBar identity');
    expect(marketData.loadRealtimeWindow).toHaveBeenCalledTimes(1);
  });

  it('releases groups that no longer have a registry consumer', async () => {
    const marketData = {
      loadRealtimeWindow: jest.fn().mockResolvedValue({ bars: [] }),
      resolveRealtimeObservation: jest.fn(),
    };
    const store = new SharedStrategyWindowStore();
    await store.prepare(marketData, bar(1, '2026-08-04T01:30:00.000Z'), 1);
    expect(store.groupCount).toBe(1);

    store.retainGroups([]);

    expect(store.groupCount).toBe(0);
  });
});

function bar(
  close: number,
  timestamp: string,
  volume: string | null = '10',
): StrategyBar {
  return {
    securityId: 9,
    source: 'tdx',
    period: 1,
    timestamp: new Date(timestamp),
    open: close,
    high: close,
    low: close,
    close,
    volume,
    amount: null,
    type: 'complete',
  };
}
