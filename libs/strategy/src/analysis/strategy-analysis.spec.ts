import type { StrategyBar } from '../market-data/strategy-bar';
import {
  STRATEGY_KDJ_CALCULATION_BAR_COUNT,
  calculateStrategyKdj,
} from './strategy-kdj';
import {
  STRATEGY_MACD_CALCULATION_BAR_COUNT,
  calculateStrategyMacd,
} from './strategy-macd';
import { computeMacdObservation, computeKdjObservation } from '@app/indicators';

describe('Strategy-owned fixed-window analysis', () => {
  const bars = buildBars(131);

  it('calculates the accepted KDJ(9,3,3) observation from exactly 13 bars', () => {
    const observation = calculateStrategyKdj(
      bars.slice(-STRATEGY_KDJ_CALCULATION_BAR_COUNT),
    );

    expect(observation.k).toBeCloseTo(42.3151543767, 10);
    expect(observation.d).toBeCloseTo(30.3967192863, 10);
    expect(observation.j).toBeCloseTo(66.1520245574, 10);
  });

  it('calculates the accepted MACD(12,26,9) observation from exactly 130 bars', () => {
    const observation = calculateStrategyMacd(
      bars.slice(-STRATEGY_MACD_CALCULATION_BAR_COUNT),
    );

    expect(observation.line).toBeCloseTo(1.432729931, 10);
    expect(observation.signal).toBeCloseTo(2.0518905648, 10);
    expect(observation.histogram).toBeCloseTo(-0.6191606338, 10);
  });

  it('recalculates current and prior MACD from adjacent 130-bar windows', () => {
    const prior = calculateStrategyMacd(bars.slice(0, 130));
    const current = calculateStrategyMacd(bars.slice(1, 131));

    expect(prior).not.toEqual(current);
    expect(prior.line).toBeCloseTo(1.4187074506, 10);
    expect(current.line).toBeCloseTo(1.432729931, 10);
  });

  it('produces identical values for independently materialized replay and realtime bars', () => {
    const replayBars = bars.slice(-130);
    const realtimeBars = replayBars.map((bar) => ({ ...bar }));

    expect(calculateStrategyMacd(replayBars)).toEqual(
      calculateStrategyMacd(realtimeBars),
    );
    expect(calculateStrategyKdj(replayBars.slice(-13))).toEqual(
      calculateStrategyKdj(realtimeBars.slice(-13)),
    );
  });

  it('delegates to the shared indicator core with the exact catalog window', () => {
    const macdBars = bars.slice(-130);
    const kdjBars = bars.slice(-13);

    expect(calculateStrategyMacd(macdBars)).toEqual(
      computeMacdObservation(
        macdBars.map((bar) => bar.close),
        {
          windowSize: STRATEGY_MACD_CALCULATION_BAR_COUNT,
        },
      ),
    );
    expect(calculateStrategyKdj(kdjBars)).toEqual(
      computeKdjObservation(
        kdjBars.map((bar) => bar.high),
        kdjBars.map((bar) => bar.low),
        kdjBars.map((bar) => bar.close),
        { windowSize: STRATEGY_KDJ_CALCULATION_BAR_COUNT },
      ),
    );
  });

  it.each([
    ['KDJ', () => calculateStrategyKdj(bars.slice(-12))],
    ['MACD', () => calculateStrategyMacd(bars.slice(-129))],
  ])('rejects an implicit or insufficient %s seed window', (_name, run) => {
    expect(run).toThrow(RangeError);
  });

  it('rejects unordered or non-finite bar input instead of returning unavailable', () => {
    const unordered = bars.slice(-13).map((bar) => ({ ...bar }));
    unordered[12] = { ...unordered[12], timestamp: unordered[11].timestamp };
    const invalid = bars.slice(-130).map((bar) => ({ ...bar }));
    invalid[129] = { ...invalid[129], close: Number.NaN };

    expect(() => calculateStrategyKdj(unordered)).toThrow(TypeError);
    expect(() => calculateStrategyMacd(invalid)).toThrow(TypeError);
  });

  it('does not mutate the canonical bars supplied by a runtime adapter', () => {
    const input = bars.slice(-130);
    const before = input.map((bar) => ({ ...bar }));

    calculateStrategyMacd(input);
    calculateStrategyKdj(input.slice(-13));

    expect(input).toEqual(before);
  });
});

function buildBars(count: number): StrategyBar[] {
  return Array.from({ length: count }, (_, index) => {
    const close = 100 + Math.sin(index / 3) * 5 + index * 0.37;
    return {
      securityId: 1,
      source: 'tdx',
      period: 1,
      timestamp: new Date(Date.UTC(2026, 0, 1, 0, index)),
      open: close - 0.2,
      high: close + 2 + (index % 4) * 0.1,
      low: close - 2 - (index % 3) * 0.1,
      close,
      volume: String(index),
      amount: null,
      type: 'complete',
    } satisfies StrategyBar;
  });
}
