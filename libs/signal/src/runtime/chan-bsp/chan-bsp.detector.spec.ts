import { createChanFullOutputFixture } from '../../../../../libs/chancore/src/chan-full-output.characterization.fixture';
import type { ProjectedStrategyBar } from '@app/market-data';
import { ChanBspDetector, matchesChanBspPlan } from './chan-bsp.detector';
import type { ChanBspEvent, ChanBspPlan } from './chan-bsp.types';

function projectedWindow(): ProjectedStrategyBar[] {
  return createChanFullOutputFixture().map((k) => ({
    rawBar: {
      securityId: 9,
      source: 'tdx',
      period: 30,
      timestamp: k.time,
      open: k.open,
      high: k.high,
      low: k.low,
      close: k.close,
      volume: k.volume,
      amount: k.amount,
      type: 'complete',
    },
    tradingDay: '2024-08-04',
    ohlc: {
      raw: { open: k.open, high: k.high, low: k.low, close: k.close },
      effective: { open: k.open, high: k.high, low: k.low, close: k.close },
      resolution: 'observed',
    },
    volume: {
      raw: k.volume,
      effective: k.volume,
      resolution: k.volume === null ? 'unavailable' : 'observed',
    },
    amount: { raw: k.amount, effective: k.amount, resolution: 'observed' },
  }));
}

function plan(overrides: Partial<ChanBspPlan> = {}): ChanBspPlan {
  return {
    units: 'duan',
    points: { first: true, second: true, third: true },
    direction: 'both',
    requiredBarCount: 1,
    ...overrides,
  };
}

function event(type: ChanBspEvent['type'], unitIndex = 0): ChanBspEvent {
  return {
    type,
    units: 'duan',
    time: new Date('2024-08-04T01:30:00.000Z'),
    price: 10,
    zhongshuIndex: type === 'second_buy' || type === 'second_sell' ? null : 0,
    zg: type === 'second_buy' || type === 'second_sell' ? null : 11,
    zd: type === 'second_buy' || type === 'second_sell' ? null : 9,
    unitIndex,
  };
}

describe('ChanBspDetector', () => {
  const detector = new ChanBspDetector();
  const window = projectedWindow();

  it('returns an empty list when the window is shorter than the plan budget', () => {
    expect(
      detector.evaluate(window.slice(0, 5), plan({ requiredBarCount: 10 })),
    ).toEqual([]);
  });

  it('is deterministic across repeated calls', () => {
    expect(detector.evaluate(window, plan())).toEqual(
      detector.evaluate(window, plan()),
    );
  });

  it('returns an empty list when the structure confirms no point', () => {
    // 87 根真实日线不足以形成段级结构（duans < 3）：空结果不是错误
    expect(detector.evaluate(window, plan())).toEqual([]);
  });
});

describe('matchesChanBspPlan', () => {
  it('filters by point selection', () => {
    const firstOnly = plan({
      points: { first: true, second: false, third: false },
    });
    const secondOnly = plan({
      points: { first: false, second: true, third: false },
    });
    const thirdOnly = plan({
      points: { first: false, second: false, third: true },
    });

    expect(matchesChanBspPlan(event('first_buy'), firstOnly)).toBe(true);
    expect(matchesChanBspPlan(event('first_sell'), firstOnly)).toBe(true);
    expect(matchesChanBspPlan(event('second_buy'), firstOnly)).toBe(false);
    expect(matchesChanBspPlan(event('second_buy'), secondOnly)).toBe(true);
    expect(matchesChanBspPlan(event('second_sell'), secondOnly)).toBe(true);
    expect(matchesChanBspPlan(event('third_buy'), thirdOnly)).toBe(true);
    expect(matchesChanBspPlan(event('first_buy'), thirdOnly)).toBe(false);
  });

  it('filters by direction', () => {
    const buys = plan({ direction: 'buy' });
    const sells = plan({ direction: 'sell' });
    const both = plan({ direction: 'both' });

    expect(matchesChanBspPlan(event('third_buy'), buys)).toBe(true);
    expect(matchesChanBspPlan(event('third_sell'), buys)).toBe(false);
    expect(matchesChanBspPlan(event('third_sell'), sells)).toBe(true);
    expect(matchesChanBspPlan(event('first_buy'), sells)).toBe(false);
    expect(matchesChanBspPlan(event('first_buy'), both)).toBe(true);
    expect(matchesChanBspPlan(event('first_sell'), both)).toBe(true);
  });
});
