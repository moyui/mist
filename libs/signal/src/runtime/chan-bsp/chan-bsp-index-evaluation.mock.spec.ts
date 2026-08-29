import { createChanFullOutputFixture } from '../../../../../libs/chancore/src/chan-full-output.characterization.fixture';
import type { ProjectedStrategyBar } from '@app/market-data';
import { ChanBspDetector } from './chan-bsp.detector';
import { ChanBspEpisodeCursor } from './chan-bsp.episode';
import { serializeChanBspContextSnapshot } from './chan-bsp.snapshot.serializer';
import type { ChanBspEvent, ChanBspPlan } from './chan-bsp.types';

function buildMockIndexProjectedBars(
  count: number,
  securityId: number,
  basePrice: number,
  period: 5 | 30,
): ProjectedStrategyBar[] {
  const fixture = createChanFullOutputFixture();
  const bars: ProjectedStrategyBar[] = [];
  const startTs = new Date('2026-08-01T01:30:00.000Z').getTime();

  for (let i = 0; i < count; i++) {
    const k = fixture[i % fixture.length];
    const ts = new Date(startTs + i * period * 60_000);
    // 缩放到目标指数的基础价格
    const scale = basePrice / 10.0;
    const open = Number((k.open * scale).toFixed(2));
    const high = Number((k.high * scale).toFixed(2));
    const low = Number((k.low * scale).toFixed(2));
    const close = Number((k.close * scale).toFixed(2));

    bars.push({
      rawBar: {
        securityId,
        source: 'qmt',
        period,
        timestamp: ts,
        open,
        high,
        low,
        close,
        volume: '10000',
        amount: '200000',
        type: 'complete',
      },
      tradingDay: '2026-08-26',
      ohlc: {
        raw: { open, high, low, close },
        effective: { open, high, low, close },
        resolution: 'observed',
      },
      volume: { raw: '10000', effective: '10000', resolution: 'observed' },
      amount: { raw: '200000', effective: '20000', resolution: 'observed' },
    });
  }
  return bars;
}

describe('ChanBspIndexEvaluation Mock Suite', () => {
  const detector = new ChanBspDetector();

  const plan5mBi: ChanBspPlan = {
    units: 'bi',
    points: { first: true, second: true, third: true },
    direction: 'both',
    requiredBarCount: 500,
  };

  const plan5mDuan: ChanBspPlan = {
    units: 'duan',
    points: { first: true, second: true, third: true },
    direction: 'both',
    requiredBarCount: 500,
  };

  const plan30mBi: ChanBspPlan = {
    units: 'bi',
    points: { first: true, second: true, third: true },
    direction: 'both',
    requiredBarCount: 200,
  };

  const plan30mDuan: ChanBspPlan = {
    units: 'duan',
    points: { first: true, second: true, third: true },
    direction: 'both',
    requiredBarCount: 200,
  };

  it('evaluates 5m bi and 5m duan plans on ShangHai Composite Index (000001)', () => {
    const bars500 = buildMockIndexProjectedBars(500, 1, 3050, 5);

    // 1. 5m 笔级策略求值
    const biEvents = detector.evaluate(bars500, plan5mBi);
    expect(Array.isArray(biEvents)).toBe(true);
    for (const ev of biEvents) {
      expect(ev.units).toBe('bi');
      expect(typeof ev.price).toBe('number');
      expect(ev.time).toBeInstanceOf(Date);
      expect(ev.type).toMatch(/^(first|second|third)_(buy|sell)$/);
    }

    // 2. 5m 段级策略求值
    const duanEvents = detector.evaluate(bars500, plan5mDuan);
    expect(Array.isArray(duanEvents)).toBe(true);
    for (const ev of duanEvents) {
      expect(ev.units).toBe('duan');
      expect(typeof ev.price).toBe('number');
    }
  });

  it('evaluates 30m bi and 30m duan plans on ChiNext Index (399006)', () => {
    const bars200 = buildMockIndexProjectedBars(200, 2, 1620, 30);

    // 1. 30m 笔级求值
    const biEvents = detector.evaluate(bars200, plan30mBi);
    expect(Array.isArray(biEvents)).toBe(true);

    // 2. 30m 段级求值
    const duanEvents = detector.evaluate(bars200, plan30mDuan);
    expect(Array.isArray(duanEvents)).toBe(true);
  });

  it('advances ChanBspEpisodeCursor monotonically without emitting duplicates', () => {
    const cursor = new ChanBspEpisodeCursor();
    const identity = {
      definitionId: 101,
      securityId: 1,
      source: 'qmt' as const,
      level: 5,
      units: 'bi' as const,
    };

    const eventA: ChanBspEvent = {
      type: 'first_buy',
      units: 'bi',
      time: new Date('2026-08-26T01:35:00.000Z'),
      price: 3045.5,
      zhongshuIndex: 0,
      zg: 3060,
      zd: 3040,
      unitIndex: 12,
    };

    const eventB: ChanBspEvent = {
      type: 'second_buy',
      units: 'bi',
      time: new Date('2026-08-26T01:50:00.000Z'),
      price: 3048.0,
      zhongshuIndex: null,
      zg: null,
      zd: null,
      unitIndex: 14,
    };

    // 第一次 evaluation: 发现 eventA
    const fresh1 = cursor.advance(identity, [eventA]);
    expect(fresh1).toEqual([eventA]);

    // 第二次 evaluation (同一 tick 或下一分钟，eventA 仍在窗口内): 不重复发射
    const fresh2 = cursor.advance(identity, [eventA]);
    expect(fresh2).toEqual([]);

    // 第三次 evaluation: 新增 eventB (unitIndex: 14 > 12)
    const fresh3 = cursor.advance(identity, [eventA, eventB]);
    expect(fresh3).toEqual([eventB]);
  });

  it('serializes ChanBspContextSnapshot with triggerPrice for 5m bi and 30m duan events', () => {
    const eventBi: ChanBspEvent = {
      type: 'first_buy',
      units: 'bi',
      time: new Date('2026-08-26T01:35:00.000Z'),
      price: 3050.25,
      zhongshuIndex: 0,
      zg: 3060,
      zd: 3040,
      unitIndex: 10,
    };

    const snapshotBi = serializeChanBspContextSnapshot(eventBi, 5);
    expect(snapshotBi).toEqual({
      triggerPrice: 3050.25,
      chanBsp: {
        type: 'first_buy',
        units: 'bi',
        level: 5,
        zhongshuIndex: 0,
        zg: 3060,
        zd: 3040,
      },
    });

    const eventDuan: ChanBspEvent = {
      type: 'third_sell',
      units: 'duan',
      time: new Date('2026-08-26T06:00:00.000Z'),
      price: 1620.1,
      zhongshuIndex: 1,
      zg: 1650,
      zd: 1630,
      unitIndex: 8,
    };

    const snapshotDuan = serializeChanBspContextSnapshot(eventDuan, 30);
    expect(snapshotDuan).toEqual({
      triggerPrice: 1620.1,
      chanBsp: {
        type: 'third_sell',
        units: 'duan',
        level: 30,
        zhongshuIndex: 1,
        zg: 1650,
        zd: 1630,
      },
    });
  });
});
