import {
  DataSource,
  K,
  Period,
  Security,
  SecurityType,
} from '@app/shared-data';
import type Redis from 'ioredis';
import type { Repository } from 'typeorm';
import { SignalRealtimeRedisService } from './signal-realtime-redis.service';
import { SignalStrategyMarketDataAdapter } from './signal-strategy-market-data.adapter';

describe('SignalIndexPeriodAggregation Mock Suite', () => {
  it('aggregates 1m candles into 5m index bars and joins with historical 5m bars', async () => {
    // 构造今日 09:30 ~ 09:40 间 10 根 1m sealed candles (对应 2 根完整 5m bars: 09:30 和 09:35)
    // 09:30 桶: 01:30:00Z ~ 01:34:00Z
    // 09:35 桶: 01:35:00Z ~ 01:39:00Z
    const redisCandles: Record<string, string> = {};
    for (let minute = 0; minute < 10; minute++) {
      const ts =
        new Date('2026-08-26T01:30:00.000Z').getTime() + minute * 60_000;
      redisCandles[String(ts)] = JSON.stringify({
        o: 3000 + minute,
        h: 3005 + minute,
        l: 2995 + minute,
        c: 3002 + minute,
        v: '1000',
        a: '20000',
        cv: String(1000 * (minute + 1)),
        ca: String(20000 * (minute + 1)),
        cs: null,
        fe: new Date(ts).toISOString(),
        le: new Date(ts + 59000).toISOString(),
        q: 'provisional',
      });
    }

    const redis = fakeRedis({ hgetall: redisCandles });

    // 构造 498 根历史 5m K 线（前一交易日 2026-08-25 及以前）
    const historicalBars: K[] = [];
    for (let i = 0; i < 498; i++) {
      const ts =
        new Date('2026-08-25T01:30:00.000Z').getTime() - i * 5 * 60_000;
      historicalBars.push(
        Object.assign(new K(), {
          security: Object.assign(new Security(), {
            id: 1,
            code: '000001',
            type: SecurityType.INDEX,
          }),
          securityId: 1,
          source: DataSource.QMT,
          period: Period.FIVE_MIN,
          timestamp: new Date(ts),
          open: '3000.00',
          high: '3010.00',
          low: '2990.00',
          close: '3005.00',
          volume: '5000.00000000',
          amount: '100000.00000000',
        }),
      );
    }

    const kRepository = {
      find: jest.fn().mockResolvedValue(historicalBars),
    } as unknown as Repository<K>;

    const adapter = new SignalStrategyMarketDataAdapter(
      kRepository,
      redis.service,
    );

    const anchorAt = new Date('2026-08-26T01:40:00.000Z'); // 09:40
    const result = await adapter.loadRealtimeWindow({
      securityId: 1,
      source: 'qmt',
      period: 5,
      anchorAt,
      requiredBars: 500,
    });

    // 历史 498 根 + 今日 2 根 (09:30, 09:35) = 500 根满足预算
    expect(result.bars.length).toBe(500);
    // 第一根为历史数据
    expect(result.bars[0].period).toBe(5);
    // 最后一根为今日 09:35 桶 (01:35:00.000Z)
    const lastBar = result.bars.at(-1)!;
    expect(lastBar.period).toBe(5);
    expect(lastBar.timestamp.toISOString()).toBe('2026-08-26T01:35:00.000Z');
    expect(lastBar.type).toBe('complete');
  });

  it('aggregates 1m candles into 30m index bars and joins with historical 30m bars', async () => {
    // 构造今日 09:30 ~ 10:00 间 30 根 1m sealed candles (对应 1 根完整 30m bar: 09:30)
    const redisCandles: Record<string, string> = {};
    for (let minute = 0; minute < 30; minute++) {
      const ts =
        new Date('2026-08-26T01:30:00.000Z').getTime() + minute * 60_000;
      redisCandles[String(ts)] = JSON.stringify({
        o: 1600 + minute * 0.1,
        h: 1605 + minute * 0.1,
        l: 1595 + minute * 0.1,
        c: 1602 + minute * 0.1,
        v: '500',
        a: '10000',
        cv: String(500 * (minute + 1)),
        ca: String(10000 * (minute + 1)),
        cs: null,
        fe: new Date(ts).toISOString(),
        le: new Date(ts + 59000).toISOString(),
        q: 'provisional',
      });
    }

    const redis = fakeRedis({ hgetall: redisCandles });

    // 构造 199 根历史 30m K 线
    const historicalBars: K[] = [];
    for (let i = 0; i < 199; i++) {
      const ts =
        new Date('2026-08-25T01:30:00.000Z').getTime() - i * 30 * 60_000;
      historicalBars.push(
        Object.assign(new K(), {
          security: Object.assign(new Security(), {
            id: 2,
            code: '399006',
            type: SecurityType.INDEX,
          }),
          securityId: 2,
          source: DataSource.QMT,
          period: Period.THIRTY_MIN,
          timestamp: new Date(ts),
          open: '1600.00',
          high: '1610.00',
          low: '1590.00',
          close: '1605.00',
          volume: '15000.00000000',
          amount: '300000.00000000',
        }),
      );
    }

    const kRepository = {
      find: jest.fn().mockResolvedValue(historicalBars),
    } as unknown as Repository<K>;

    const adapter = new SignalStrategyMarketDataAdapter(
      kRepository,
      redis.service,
    );

    const anchorAt = new Date('2026-08-26T02:00:00.000Z'); // 10:00
    const result = await adapter.loadRealtimeWindow({
      securityId: 2,
      source: 'qmt',
      period: 30,
      anchorAt,
      requiredBars: 200,
    });

    // 历史 199 根 + 今日 1 根 (09:30~10:00) = 200 根满足预算
    expect(result.bars.length).toBe(200);
    const lastBar = result.bars.at(-1)!;
    expect(lastBar.period).toBe(30);
    expect(lastBar.timestamp.toISOString()).toBe('2026-08-26T01:30:00.000Z');
    expect(lastBar.type).toBe('complete');
  });
});

function fakeRedis(options: { hgetall?: Record<string, string> }) {
  const client = {
    hget: jest.fn().mockResolvedValue(null),
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
