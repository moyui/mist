import { ConfigService } from '@nestjs/config';
import { DataSource } from '@app/shared-data';
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

const emptyAllowlist = {
  list: jest.fn().mockReturnValue([]),
} as any;

function makeRedisHarness() {
  const chain = {
    zadd: jest.fn().mockReturnThis(),
    hset: jest.fn().mockReturnThis(),
    expire: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue([]),
  };
  const client = {
    multi: jest.fn().mockReturnValue(chain),
    zrangebyscore: jest.fn().mockResolvedValue([]),
    hgetall: jest.fn().mockResolvedValue({}),
    zrem: jest.fn().mockResolvedValue(1),
  };
  return {
    chain,
    client,
    redis: { isAvailable: jest.fn().mockReturnValue(true), client } as any,
  };
}

async function scanAndDrain(service: RealtimeMarketDataProductService) {
  await (service as unknown as { scanDue: () => Promise<void> }).scanDue();
  await (
    service as unknown as { queue: { drain: () => Promise<void> } }
  ).queue.drain();
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
      emptyAllowlist,
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
      emptyAllowlist,
    );

    service.handleSnapshot(makeSnapshot({ eventTime: sh(9, 30, 0) }));
    await new Promise((r) => setTimeout(r, 50));

    expect(aggregator.peekOpen(1, 'tdx')).not.toBeNull();
    expect(fakeMulti.exec).toHaveBeenCalled();
  });

  it('keeps a rolled-over bucket pending for its due finalizer', async () => {
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
      emptyAllowlist,
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

    expect(finalizer.seal).not.toHaveBeenCalled();
    expect(aggregator.candidateBuckets(1, 'tdx')).toHaveLength(2);
  });

  it('retries a failed due registration on the next accepted snapshot', async () => {
    const harness = makeRedisHarness();
    harness.chain.exec
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValueOnce([]);
    const aggregator = new OpenCandleAggregator();
    const service = new RealtimeMarketDataProductService(
      makeConfig('shadow'),
      { now: () => Date.parse('2026-07-28T01:30:30.000Z') } as any,
      harness.redis,
      aggregator,
      { seal: jest.fn(), discardDue: jest.fn() } as any,
      emptyAllowlist,
    );

    service.handleSnapshot(makeSnapshot({ eventTime: sh(9, 30) }));
    await (
      service as unknown as { queue: { drain: () => Promise<void> } }
    ).queue.drain();
    expect(aggregator.peekOpen(1, 'tdx')).toMatchObject({
      validity: 'invalid',
      invalidReason: 'redis_due_registration_failed',
    });

    service.handleSnapshot(makeSnapshot({ eventTime: sh(9, 30, 10) }));
    await (
      service as unknown as { queue: { drain: () => Promise<void> } }
    ).queue.drain();
    expect(harness.chain.exec).toHaveBeenCalledTimes(2);
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
      emptyAllowlist,
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
      Date.parse('2026-07-28T01:30:00.000Z'),
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
      emptyAllowlist,
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
          emptyAllowlist,
        ),
    ).toThrow('maxPendingGlobal must be greater than or equal');
  });

  it('registers an active listener at the next complete bucket and scans at most 64 due members', async () => {
    const harness = makeRedisHarness();
    let clockMs = Date.parse('2026-07-28T01:29:59.000Z');
    const allowlist = {
      list: jest.fn((source: DataSource) =>
        source === DataSource.TDX
          ? [{ securityId: 1, formatCode: '600030.SH' }]
          : [],
      ),
    } as any;
    const service = new RealtimeMarketDataProductService(
      makeConfig('shadow'),
      { now: () => clockMs } as any,
      harness.redis,
      new OpenCandleAggregator(),
      { seal: jest.fn(), discardDue: jest.fn() } as any,
      allowlist,
    );

    await scanAndDrain(service);
    expect(harness.chain.zadd).not.toHaveBeenCalled();

    clockMs = Date.parse('2026-07-28T01:30:00.000Z');
    await scanAndDrain(service);
    expect(harness.chain.zadd).toHaveBeenCalledWith(
      expect.stringContaining('20260728:candle:1m:due'),
      Date.parse('2026-07-28T01:31:05.000Z'),
      `1:tdx:600030.SH:${clockMs}`,
    );
    expect(harness.client.zrangebyscore).toHaveBeenLastCalledWith(
      expect.stringContaining('20260728:candle:1m:due'),
      0,
      clockMs,
      'LIMIT',
      0,
      64,
    );
  });

  it('does not register a listener added mid-bucket until the next full minute', async () => {
    const harness = makeRedisHarness();
    let entries: Array<{ securityId: number; formatCode: string }> = [];
    let clockMs = Date.parse('2026-07-28T01:30:10.000Z');
    const allowlist = {
      list: jest.fn((source: DataSource) =>
        source === DataSource.TDX ? entries : [],
      ),
    } as any;
    const service = new RealtimeMarketDataProductService(
      makeConfig('shadow'),
      { now: () => clockMs } as any,
      harness.redis,
      new OpenCandleAggregator(),
      { seal: jest.fn(), discardDue: jest.fn() } as any,
      allowlist,
    );

    await scanAndDrain(service);
    entries = [{ securityId: 1, formatCode: '600030.SH' }];
    await scanAndDrain(service);
    expect(harness.chain.zadd).not.toHaveBeenCalled();

    clockMs = Date.parse('2026-07-28T01:31:00.000Z');
    await scanAndDrain(service);
    expect(harness.chain.zadd).toHaveBeenCalledWith(
      expect.any(String),
      Date.parse('2026-07-28T01:32:05.000Z'),
      `1:tdx:600030.SH:${clockMs}`,
    );
  });

  it('does not cancel an already registered due when a listener is removed mid-bucket', async () => {
    const harness = makeRedisHarness();
    let entries = [{ securityId: 1, formatCode: '600030.SH' }];
    let clockMs = Date.parse('2026-07-28T01:29:59.000Z');
    const allowlist = {
      list: jest.fn((source: DataSource) =>
        source === DataSource.TDX ? entries : [],
      ),
    } as any;
    const service = new RealtimeMarketDataProductService(
      makeConfig('shadow'),
      { now: () => clockMs } as any,
      harness.redis,
      new OpenCandleAggregator(),
      { seal: jest.fn(), discardDue: jest.fn() } as any,
      allowlist,
    );

    await scanAndDrain(service);
    clockMs = Date.parse('2026-07-28T01:30:00.000Z');
    await scanAndDrain(service);
    expect(harness.chain.zadd).toHaveBeenCalledTimes(1);

    entries = [];
    clockMs = Date.parse('2026-07-28T01:30:30.000Z');
    await scanAndDrain(service);
    expect(harness.client.zrem).not.toHaveBeenCalled();
    expect(harness.chain.zadd).toHaveBeenCalledTimes(1);
  });

  it('discards an expected bucket with no snapshot without inventing a candle', async () => {
    const harness = makeRedisHarness();
    let clockMs = Date.parse('2026-07-28T01:29:59.000Z');
    const allowlist = {
      list: jest.fn((source: DataSource) =>
        source === DataSource.TDX
          ? [{ securityId: 1, formatCode: '600030.SH' }]
          : [],
      ),
    } as any;
    const finalizer = {
      seal: jest.fn(),
      discardDue: jest.fn().mockResolvedValue(true),
    } as any;
    const aggregator = new OpenCandleAggregator();
    const service = new RealtimeMarketDataProductService(
      makeConfig('shadow'),
      { now: () => clockMs } as any,
      harness.redis,
      aggregator,
      finalizer,
      allowlist,
    );

    await scanAndDrain(service);
    clockMs = Date.parse('2026-07-28T01:30:00.000Z');
    await scanAndDrain(service);
    const member = `1:tdx:600030.SH:${clockMs}`;
    harness.client.zrangebyscore.mockResolvedValue([member]);
    clockMs = Date.parse('2026-07-28T01:31:05.000Z');
    await scanAndDrain(service);

    expect(finalizer.seal).not.toHaveBeenCalled();
    expect(finalizer.discardDue).toHaveBeenCalledWith(
      harness.client,
      {
        securityId: 1,
        source: 'tdx',
        providerSymbol: '600030.SH',
        bucketStartMs: Date.parse('2026-07-28T01:30:00.000Z'),
      },
      'no_snapshot',
      clockMs,
    );
    expect(aggregator.peekCandidate(1, 'tdx', clockMs - 65_000)).toBeNull();
  });

  it('retries the same immutable candidate after finalizer failure', async () => {
    const harness = makeRedisHarness();
    const aggregator = new OpenCandleAggregator();
    const bucketStartMs = Date.parse('2026-07-28T01:30:00.000Z');
    aggregator.applySnapshot(
      makeSnapshot({ eventTime: sh(9, 30), cumulativeVolume: '100' }),
    );
    const finalizer = {
      seal: jest.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true),
      discardDue: jest.fn(),
    } as any;
    const service = new RealtimeMarketDataProductService(
      makeConfig('shadow'),
      { now: () => bucketStartMs + 65_000 } as any,
      harness.redis,
      aggregator,
      finalizer,
      emptyAllowlist,
    );
    const member = `1:tdx:600030.SH:${bucketStartMs}`;
    const decoded = {
      securityId: 1,
      source: 'tdx' as const,
      providerSymbol: '600030.SH',
      bucketStartMs,
    };
    const process = (
      service as unknown as {
        processDueMember: (
          client: unknown,
          tradingDay: string,
          member: string,
          decoded: {
            securityId: number;
            source: 'tdx';
            providerSymbol: string;
            bucketStartMs: number;
          },
          now: number,
        ) => Promise<void>;
      }
    ).processDueMember.bind(service);

    await process(
      harness.client,
      '20260728',
      member,
      decoded,
      bucketStartMs + 65_000,
    );
    expect(aggregator.peekCandidate(1, 'tdx', bucketStartMs)).not.toBeNull();
    await process(
      harness.client,
      '20260728',
      member,
      decoded,
      bucketStartMs + 66_000,
    );

    expect(finalizer.seal).toHaveBeenCalledTimes(2);
    expect(finalizer.seal.mock.calls[0][1]).toBe(
      finalizer.seal.mock.calls[1][1],
    );
    expect(aggregator.peekCandidate(1, 'tdx', bucketStartMs)).toBeNull();
  });

  it('classifies a due without local expected state as restart open-state loss', async () => {
    const harness = makeRedisHarness();
    const bucketStartMs = Date.parse('2026-07-28T01:30:00.000Z');
    const member = `1:tdx:600030.SH:${bucketStartMs}`;
    harness.client.zrangebyscore.mockResolvedValue([member]);
    const finalizer = {
      seal: jest.fn(),
      discardDue: jest.fn().mockResolvedValue(true),
    } as any;
    const service = new RealtimeMarketDataProductService(
      makeConfig('shadow'),
      { now: () => bucketStartMs + 65_000 } as any,
      harness.redis,
      new OpenCandleAggregator(),
      finalizer,
      emptyAllowlist,
    );

    await scanAndDrain(service);
    expect(finalizer.discardDue).toHaveBeenCalledWith(
      harness.client,
      expect.objectContaining({ bucketStartMs }),
      'backend_restart_open_state_lost',
      bucketStartMs + 65_000,
    );
  });

  it('leaves a due untouched when due queue admission overflows', async () => {
    const harness = makeRedisHarness();
    const bucketStartMs = Date.parse('2026-07-28T01:30:00.000Z');
    harness.client.zrangebyscore.mockResolvedValue([
      `1:tdx:600030.SH:${bucketStartMs}`,
    ]);
    const finalizer = { seal: jest.fn(), discardDue: jest.fn() } as any;
    const service = new RealtimeMarketDataProductService(
      makeConfig('shadow'),
      { now: () => bucketStartMs + 65_000 } as any,
      harness.redis,
      new OpenCandleAggregator(),
      finalizer,
      emptyAllowlist,
    );
    (
      service as unknown as {
        queue: { enqueue: jest.Mock; drain: () => Promise<void> };
      }
    ).queue = {
      enqueue: jest.fn().mockReturnValue(false),
      drain: jest.fn().mockResolvedValue(undefined),
    };

    await scanAndDrain(service);
    expect(finalizer.seal).not.toHaveBeenCalled();
    expect(finalizer.discardDue).not.toHaveBeenCalled();
    expect(harness.client.zrem).not.toHaveBeenCalled();
  });

  it('releases a candidate at hard horizon without writing a discard', async () => {
    const harness = makeRedisHarness();
    const aggregator = new OpenCandleAggregator();
    const bucketStartMs = Date.parse('2026-07-28T01:30:00.000Z');
    aggregator.applySnapshot(makeSnapshot({ eventTime: sh(9, 30) }));
    const finalizer = { seal: jest.fn(), discardDue: jest.fn() } as any;
    const service = new RealtimeMarketDataProductService(
      makeConfig('shadow'),
      { now: () => bucketStartMs + 120_000 } as any,
      harness.redis,
      aggregator,
      finalizer,
      emptyAllowlist,
    );
    const member = `1:tdx:600030.SH:${bucketStartMs}`;
    await (
      service as unknown as {
        processDueMember: (
          client: unknown,
          tradingDay: string,
          member: string,
          decoded: {
            securityId: number;
            source: 'tdx';
            providerSymbol: string;
            bucketStartMs: number;
          },
          now: number,
        ) => Promise<void>;
      }
    ).processDueMember(
      harness.client,
      '20260728',
      member,
      {
        securityId: 1,
        source: 'tdx',
        providerSymbol: '600030.SH',
        bucketStartMs,
      },
      bucketStartMs + 120_000,
    );

    expect(harness.client.zrem).toHaveBeenCalledWith(
      expect.stringContaining('20260728:candle:1m:due'),
      member,
    );
    expect(finalizer.seal).not.toHaveBeenCalled();
    expect(finalizer.discardDue).not.toHaveBeenCalled();
    expect(aggregator.peekCandidate(1, 'tdx', bucketStartMs)).toBeNull();
  });
});
