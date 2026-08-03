import { ConfigService } from '@nestjs/config';
import { Clock } from '../clock.service';
import { OpenCandleAggregator } from './open-candle-aggregator';
import { RealtimeMarketDataProductService } from './realtime-market-data-product.service';
import type { CanonicalRealtimeSnapshot } from '../realtime.types';

function makeConfig(
  mode: string,
  overrides: Record<string, number> = {},
): ConfigService {
  return {
    get: (key: string) =>
      overrides[key] ??
      (key === 'REALTIME_PRODUCTIZATION_MODE'
        ? mode
        : key === 'REALTIME_CANDLE_GRACE_MS'
          ? 5000
          : undefined),
  } as any;
}

function makeSnapshot(opts: {
  eventTime: string;
  cumulativeVolume?: string;
  cumulativeAmount?: string;
}): CanonicalRealtimeSnapshot {
  return {
    source: 'tdx',
    securityId: 1,
    providerSymbol: '600030.SH',
    eventTime: opts.eventTime,
    capturedAt: opts.eventTime,
    prices: { last: 10, open: 10, high: 10, low: 10, lastClose: null },
    cumulativeVolume: opts.cumulativeVolume ?? '100',
    cumulativeAmount: opts.cumulativeAmount ?? '1000',
    quality: {
      level: 'latest-state',
      eventTimeAvailable: true,
      aggregationEligible: true,
      partialPrices: false,
    },
    native: {},
  };
}

const sh = (h: number, m: number, s = 0): string => {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `2026-07-28T${pad(h)}:${pad(m)}:${pad(s)}+08:00`;
};

describe('RealtimeMarketDataProductService', () => {
  it('is a no-op when mode=off', () => {
    const redis = { isAvailable: jest.fn(), client: null } as any;
    const aggregator = {
      applySnapshot: jest.fn(),
      markInvalid: jest.fn(),
    } as any;
    const service = new RealtimeMarketDataProductService(
      makeConfig('off'),
      new Clock(),
      redis,
      aggregator,
      {} as any,
    );

    service.handleSnapshot(makeSnapshot({ eventTime: sh(9, 30) }));
    expect(aggregator.applySnapshot).not.toHaveBeenCalled();
  });

  it('enqueues a snapshot when mode=shadow', async () => {
    const fakeMulti = {
      zadd: jest.fn().mockReturnThis(),
      hset: jest.fn().mockReturnThis(),
      expire: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([]),
    };
    const fakeClient = { multi: jest.fn().mockReturnValue(fakeMulti) };
    const redis = {
      isAvailable: jest.fn().mockReturnValue(true),
      client: fakeClient,
    } as any;
    const aggregator = new OpenCandleAggregator();
    const finalizer = { seal: jest.fn().mockResolvedValue(true) } as any;
    const fixedNow = Date.parse('2026-07-28T01:30:30.000Z');
    const fakeClock = { now: () => fixedNow } as any;
    const service = new RealtimeMarketDataProductService(
      makeConfig('shadow'),
      fakeClock,
      redis,
      aggregator,
      finalizer,
    );

    service.handleSnapshot(makeSnapshot({ eventTime: sh(9, 30, 0) }));
    await new Promise((r) => setTimeout(r, 50));

    expect(aggregator.peekOpen(1, 'tdx')).not.toBeNull();
    expect(fakeMulti.exec).toHaveBeenCalled();
  });

  it('seals rolled-over bucket via finalizer', async () => {
    const fakeMulti = {
      zadd: jest.fn().mockReturnThis(),
      hset: jest.fn().mockReturnThis(),
      expire: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([]),
    };
    const fakeClient = { multi: jest.fn().mockReturnValue(fakeMulti) };
    const redis = {
      isAvailable: jest.fn().mockReturnValue(true),
      client: fakeClient,
    } as any;
    const aggregator = new OpenCandleAggregator();
    const finalizer = { seal: jest.fn().mockResolvedValue(true) } as any;
    let clockMs = Date.parse('2026-07-28T01:30:30.000Z');
    const fakeClock = { now: () => clockMs } as any;
    const service = new RealtimeMarketDataProductService(
      makeConfig('shadow'),
      fakeClock,
      redis,
      aggregator,
      finalizer,
    );

    service.handleSnapshot(
      makeSnapshot({
        eventTime: sh(9, 30, 0),
        cumulativeVolume: '100',
        cumulativeAmount: '1000',
      }),
    );
    await new Promise((r) => setTimeout(r, 30));
    clockMs = Date.parse('2026-07-28T01:31:10.000Z');
    service.handleSnapshot(
      makeSnapshot({
        eventTime: sh(9, 31, 0),
        cumulativeVolume: '200',
        cumulativeAmount: '2000',
      }),
    );
    await new Promise((r) => setTimeout(r, 30));

    expect(finalizer.seal).toHaveBeenCalledTimes(1);
  });

  it('marks queue_overflow when the queue rejects', () => {
    const redis = {
      isAvailable: jest.fn().mockReturnValue(true),
      client: { multi: jest.fn() },
    } as any;
    const aggregator = {
      applySnapshot: jest.fn(),
      markInvalid: jest.fn(),
    } as any;
    const finalizer = { seal: jest.fn() } as any;
    const service = new RealtimeMarketDataProductService(
      makeConfig('shadow'),
      new Clock(),
      redis,
      aggregator,
      finalizer,
    );
    (service as unknown as { queue: { enqueue: jest.Mock } }).queue = {
      enqueue: jest.fn().mockReturnValue(false),
    };

    service.handleSnapshot(makeSnapshot({ eventTime: sh(9, 30) }));
    expect(
      (service as unknown as { queue: { enqueue: jest.Mock } }).queue.enqueue,
    ).toHaveBeenCalledWith('1:tdx', expect.any(Function));
    expect(aggregator.markInvalid).toHaveBeenCalledWith(
      1,
      'tdx',
      'queue_overflow',
    );
  });

  it('loads queue limits from config and rejects contradictory values', () => {
    const clock = new Clock();
    const redis = { isAvailable: () => false } as any;
    const aggregator = {} as any;
    const finalizer = {} as any;
    const service = new RealtimeMarketDataProductService(
      makeConfig('off', {
        REALTIME_CANDLE_QUEUE_MAX_PENDING_PER_SERIES: 4,
        REALTIME_CANDLE_QUEUE_MAX_PENDING_GLOBAL: 16,
      }),
      clock,
      redis,
      aggregator,
      finalizer,
    );
    expect(
      (
        service as unknown as {
          queue: { options: Record<string, number> };
        }
      ).queue.options,
    ).toEqual({ maxPendingPerSeries: 4, maxPendingGlobal: 16 });

    expect(
      () =>
        new RealtimeMarketDataProductService(
          makeConfig('off', {
            REALTIME_CANDLE_QUEUE_MAX_PENDING_PER_SERIES: 32,
            REALTIME_CANDLE_QUEUE_MAX_PENDING_GLOBAL: 16,
          }),
          clock,
          redis,
          aggregator,
          finalizer,
        ),
    ).toThrow('maxPendingGlobal must be greater than or equal');
  });
});
