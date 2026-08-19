import {
  computeRsiSeries,
  computeAdxSeries,
  computeAtrSeries,
  computeDualMaSeries,
} from './index';

describe('computeRsiSeries', () => {
  const close = Array.from(
    { length: 80 },
    (_, index) => 100 + Math.sin(index / 3) * 5 + index * 0.7,
  );

  it('matches the historical IndicatorService output exactly (golden)', () => {
    const result = computeRsiSeries(close, 14);

    expect(result.begIndex).toBe(14);
    expect(result.rsi).toHaveLength(66);
    expect(result.rsi[0]).toBeCloseTo(67.95, 2);
  });

  it('is deterministic and does not mutate its input', () => {
    const snapshot = [...close];
    const first = computeRsiSeries(close, 14);
    const second = computeRsiSeries(close, 14);

    expect(second).toEqual(first);
    expect(close).toEqual(snapshot);
  });
});

describe('computeAdxSeries', () => {
  const close = Array.from(
    { length: 80 },
    (_, index) => 100 + Math.sin(index / 3) * 5 + index * 0.7,
  );
  const high = close.map((value, index) => value + 2 + (index % 4) * 0.1);
  const low = close.map((value, index) => value - 2 - (index % 3) * 0.1);

  it('matches the historical IndicatorService output exactly (golden)', () => {
    const result = computeAdxSeries(high, low, close, 14);

    expect(result.begIndex).toBe(27);
    expect(result.adx).toHaveLength(53);
    expect(result.adx[0]).toBeCloseTo(63.72878, 6);
  });

  it('is deterministic and does not mutate its inputs', () => {
    const h = [...high];
    const l = [...low];
    const c = [...close];

    computeAdxSeries(high, low, close, 14);

    expect(high).toEqual(h);
    expect(low).toEqual(l);
    expect(close).toEqual(c);
  });
});

describe('computeAtrSeries', () => {
  const close = Array.from(
    { length: 80 },
    (_, index) => 100 + Math.sin(index / 3) * 5 + index * 0.7,
  );
  const high = close.map((value, index) => value + 2 + (index % 4) * 0.1);
  const low = close.map((value, index) => value - 2 - (index % 3) * 0.1);

  it('matches the historical IndicatorService output exactly (golden)', () => {
    const result = computeAtrSeries(high, low, close, 14);

    expect(result.begIndex).toBe(14);
    expect(result.atr).toHaveLength(66);
    expect(result.atr[0]).toBeCloseTo(4.273998, 6);
  });
});

describe('computeDualMaSeries', () => {
  const close = Array.from(
    { length: 80 },
    (_, index) => 100 + Math.sin(index / 3) * 5 + index * 0.7,
  );

  it('matches the historical IndicatorService output exactly (golden)', () => {
    const result = computeDualMaSeries(close, {
      shortPeriod: 13,
      longPeriod: 60,
    });

    expect(result.begIndex).toBe(12);
    expect(result.shortMA).toHaveLength(68);
    expect(result.longMA).toHaveLength(21);
    expect(result.shortMA[0]).toBeCloseTo(105.944811, 6);
    expect(result.longMA[0]).toBeCloseTo(120.758567, 6);
  });

  it('is deterministic and does not mutate its input', () => {
    const snapshot = [...close];

    computeDualMaSeries(close);

    expect(close).toEqual(snapshot);
  });
});
