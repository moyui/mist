import { DataSource, K, Period, Security } from '@app/shared-data';
import type Redis from 'ioredis';
import type { Repository } from 'typeorm';
import { SignalRealtimeRedisService } from './signal-realtime-redis.service';
import { SignalStrategyMarketDataAdapter } from './signal-strategy-market-data.adapter';

describe('SignalStrategyMarketDataAdapter', () => {
  it('resolves one exact sealed Redis record into a canonical 1m bar', async () => {
    const redis = fakeRedis({ hget: JSON.stringify(record(10.5)) });
    const adapter = new SignalStrategyMarketDataAdapter(
      repository([]),
      redis.service,
    );

    await expect(
      adapter.resolveRealtimeObservation({
        securityId: 9,
        source: 'tdx',
        period: 1,
        timestamp: new Date('2026-08-04T01:30:00.000Z'),
        outcome: 'sealed',
      }),
    ).resolves.toEqual({
      outcome: 'sealed',
      bar: {
        securityId: 9,
        source: 'tdx',
        period: 1,
        timestamp: new Date('2026-08-04T01:30:00.000Z'),
        open: 10.5,
        high: 10.5,
        low: 10.5,
        close: 10.5,
        volume: '100',
        amount: '200',
        type: 'complete',
      },
    });
    expect(redis.client.hget).toHaveBeenCalledWith(
      'mist:realtime:v1:day:20260804:tdx:9:candle:1m:closed',
      String(Date.parse('2026-08-04T01:30:00.000Z')),
    );
  });

  it('hydrates one source-exact window from pre-day MySQL and current-day Redis', async () => {
    const anchor = new Date('2026-08-04T01:32:00.000Z');
    const redis = fakeRedis({
      hgetall: {
        [String(Date.parse('2026-08-04T01:30:00.000Z'))]: JSON.stringify(
          record(10),
        ),
        [String(Date.parse('2026-08-04T01:31:00.000Z'))]: JSON.stringify(
          record(11),
        ),
        [String(Date.parse('2026-08-04T01:32:00.000Z'))]: JSON.stringify(
          record(12),
        ),
      },
    });
    const rows = [historicalK('2026-08-03T01:30:00.000Z')];
    const kRepository = repository(rows);
    const adapter = new SignalStrategyMarketDataAdapter(
      kRepository,
      redis.service,
    );

    const result = await adapter.loadRealtimeWindow({
      securityId: 9,
      source: 'tdx',
      period: 1,
      anchorAt: anchor,
      requiredBars: 3,
    });

    expect(result.bars.map((bar) => bar.timestamp.toISOString())).toEqual([
      '2026-08-03T01:30:00.000Z',
      '2026-08-04T01:30:00.000Z',
      '2026-08-04T01:31:00.000Z',
    ]);
    expect(result.bars[0].amount).toBe('10000');
    expect(kRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          securityId: 9,
          source: DataSource.TDX,
          period: 1,
        }),
        order: { timestamp: 'DESC' },
        take: 2,
      }),
    );
  });

  it('returns one pre-window same-day bar so quantity projection can seed forward fill', async () => {
    const redis = fakeRedis({
      hgetall: {
        [String(Date.parse('2026-08-04T01:30:00.000Z'))]: JSON.stringify(
          record(10, '80'),
        ),
        [String(Date.parse('2026-08-04T01:31:00.000Z'))]: JSON.stringify(
          record(11, null),
        ),
      },
    });
    const adapter = new SignalStrategyMarketDataAdapter(
      repository([]),
      redis.service,
    );

    const result = await adapter.loadRealtimeWindow({
      securityId: 9,
      source: 'tdx',
      period: 1,
      anchorAt: new Date('2026-08-04T01:32:00.000Z'),
      requiredBars: 1,
    });

    expect(result.bars.map((bar) => bar.volume)).toEqual(['80', null]);
  });

  it('rebuilds an incomplete higher-period bar from bounded current-day 1m records', async () => {
    const redis = fakeRedis({
      hgetall: {
        [String(Date.parse('2026-08-04T01:30:00.000Z'))]: JSON.stringify(
          record(10),
        ),
        [String(Date.parse('2026-08-04T01:32:00.000Z'))]: JSON.stringify(
          record(12),
        ),
      },
    });
    const kRepository = repository([]);
    const adapter = new SignalStrategyMarketDataAdapter(
      kRepository,
      redis.service,
    );

    const result = await adapter.loadRealtimeWindow({
      securityId: 9,
      source: 'tdx',
      period: 5,
      anchorAt: new Date('2026-08-04T01:35:00.000Z'),
      requiredBars: 1,
    });

    expect(result.bars).toEqual([
      expect.objectContaining({
        period: 5,
        timestamp: new Date('2026-08-04T01:30:00.000Z'),
        open: 10,
        close: 12,
        type: 'incomplete',
      }),
    ]);
    expect(kRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({ take: 1 }),
    );
  });

  it('propagates malformed Redis record failures without fallback', async () => {
    const redis = fakeRedis({
      hget: JSON.stringify({ ...record(10), v: 100 }),
    });
    const adapter = new SignalStrategyMarketDataAdapter(
      repository([]),
      redis.service,
    );

    await expect(
      adapter.resolveRealtimeObservation({
        securityId: 9,
        source: 'tdx',
        period: 1,
        timestamp: new Date('2026-08-04T01:30:00.000Z'),
        outcome: 'sealed',
      }),
    ).rejects.toThrow('closed-candle v must be a string or null');
  });

  it('derives a 15:00 terminal sealed bar into the afternoon window without throwing', async () => {
    // 15:00 CST = 07:00:00Z. Anchor after close so the window load derives
    // the current-day bars including the terminal 15:00 bar.
    const redis = fakeRedis({
      hgetall: {
        [String(Date.parse('2026-08-04T06:59:00.000Z'))]: JSON.stringify(
          record(40),
        ),
        [String(Date.parse('2026-08-04T07:00:00.000Z'))]: JSON.stringify(
          record(41),
        ),
      },
    });
    const adapter = new SignalStrategyMarketDataAdapter(
      repository([]),
      redis.service,
    );

    await expect(
      adapter.loadRealtimeWindow({
        securityId: 9,
        source: 'tdx',
        period: 5,
        anchorAt: new Date('2026-08-04T07:02:00.000Z'),
        requiredBars: 1,
      }),
    ).resolves.toMatchObject({
      bars: [
        expect.objectContaining({
          period: 5,
          timestamp: new Date('2026-08-04T06:55:00.000Z'),
          close: 40,
          type: 'incomplete',
        }),
        expect.objectContaining({
          period: 5,
          timestamp: new Date('2026-08-04T07:00:00.000Z'),
          close: 41,
          type: 'incomplete',
        }),
      ],
    });
  });

  it('tolerates a legacy 15:02 dead sealed bar during window load', async () => {
    // Legacy dead-time bar (pre-fix Redis residue) at 15:02 CST = 07:02:00Z.
    const redis = fakeRedis({
      hgetall: {
        [String(Date.parse('2026-08-04T06:59:00.000Z'))]: JSON.stringify(
          record(40),
        ),
        [String(Date.parse('2026-08-04T07:00:00.000Z'))]: JSON.stringify(
          record(41),
        ),
        [String(Date.parse('2026-08-04T07:02:00.000Z'))]: JSON.stringify(
          record(41),
        ),
      },
    });
    const adapter = new SignalStrategyMarketDataAdapter(
      repository([]),
      redis.service,
    );

    await expect(
      adapter.loadRealtimeWindow({
        securityId: 9,
        source: 'tdx',
        period: 5,
        anchorAt: new Date('2026-08-04T07:05:00.000Z'),
        requiredBars: 1,
      }),
    ).resolves.toBeDefined();
  });
});

function fakeRedis(options: {
  hget?: string | null;
  hgetall?: Record<string, string>;
}) {
  const client = {
    hget: jest.fn().mockResolvedValue(options.hget ?? null),
    hgetall: jest.fn().mockResolvedValue(options.hgetall ?? {}),
  };
  return {
    client,
    service: new SignalRealtimeRedisService(
      { get: jest.fn() } as never,
      client as unknown as Redis,
    ),
  };
}

function repository(rows: K[]): Repository<K> {
  return {
    find: jest.fn().mockResolvedValue(rows),
  } as unknown as Repository<K>;
}

function historicalK(timestamp: string): K {
  return Object.assign(new K(), {
    security: Object.assign(new Security(), { id: 9 }),
    source: DataSource.TDX,
    period: Period.ONE_MIN,
    timestamp: new Date(timestamp),
    open: '8.00',
    high: '9.00',
    low: '7.00',
    close: '8.50',
    volume: '10.00000000',
    amount: '1.00000000',
  });
}

function record(close: number, volume: string | null = '100') {
  return {
    o: close,
    h: close,
    l: close,
    c: close,
    v: volume,
    a: '200',
    cv: '1000',
    ca: '2000',
    cs: null,
    fe: '2026-08-04T01:30:01.000Z',
    le: '2026-08-04T01:30:59.000Z',
    q: 'provisional',
  };
}
