import {
  computeKdjSeries,
  computeKdjObservation,
  IndicatorInputError,
  IndicatorValueError,
} from './index';

describe('computeKdjSeries', () => {
  const close = Array.from(
    { length: 80 },
    (_, index) => 100 + Math.sin(index / 3) * 5 + index * 0.7,
  );
  const high = close.map((value, index) => value + 2 + (index % 4) * 0.1);
  const low = close.map((value, index) => value - 2 - (index % 3) * 0.1);

  it('reproduces the historical API (14,3,3) output exactly (golden)', () => {
    const result = computeKdjSeries(high, low, close, {
      period: 14,
      kSmoothing: 3,
      dSmoothing: 3,
    });

    expect(result.begIndex).toBe(17);
    expect(result.K).toHaveLength(63);
    expect(result.D).toHaveLength(63);
    expect(result.J).toHaveLength(63);
    expect(result.K[0]).toBeCloseTo(57.023495, 6);
    expect(result.D[0]).toBeCloseTo(48.972518, 6);
    expect(result.J[0]).toBeCloseTo(3 * result.K[0] - 2 * result.D[0], 10);
  });

  it('uses the catalog default (9,3,3) when params are omitted (KDJ fix)', () => {
    const result = computeKdjSeries(high, low, close);

    expect(result.begIndex).toBe(12);
    expect(result.K).toHaveLength(68);
    expect(result.K[0]).toBeCloseTo(31.687287, 6);
    expect(result.D[0]).toBeCloseTo(45.808939, 6);
    expect(result.J[0]).toBeCloseTo(3.443984, 6);
    expect(result.J[0]).toBeCloseTo(3 * result.K[0] - 2 * result.D[0], 10);
  });

  it('is deterministic and does not mutate its inputs', () => {
    const h = [...high];
    const l = [...low];
    const c = [...close];

    const first = computeKdjSeries(high, low, close);
    const second = computeKdjSeries(high, low, close);

    expect(second).toEqual(first);
    expect(high).toEqual(h);
    expect(low).toEqual(l);
    expect(close).toEqual(c);
  });

  it('returns empty output for empty input', () => {
    const result = computeKdjSeries([], [], []);

    expect(result.begIndex).toBe(0);
    expect(result.K).toEqual([]);
    expect(result.D).toEqual([]);
    expect(result.J).toEqual([]);
  });
});

describe('computeKdjObservation', () => {
  const close = Array.from(
    { length: 13 },
    (_, index) => 100 + Math.sin(index / 2) * 3 + index * 0.5,
  );
  const high = close.map((value) => value + 1);
  const low = close.map((value) => value - 1);

  it('matches the trailing series value (invariant)', () => {
    const series = computeKdjSeries(high, low, close);
    const observation = computeKdjObservation(high, low, close, {
      windowSize: 13,
    });

    expect(observation.k).toBeCloseTo(series.K.at(-1) as number, 12);
    expect(observation.d).toBeCloseTo(series.D.at(-1) as number, 12);
    expect(observation.j).toBeCloseTo(series.J.at(-1) as number, 12);
  });

  it('enforces an exact window size', () => {
    expect(() =>
      computeKdjObservation(high, low, close.slice(0, 12), { windowSize: 13 }),
    ).toThrow(IndicatorInputError);
  });

  it('rejects unequal high/low/close lengths', () => {
    expect(() => computeKdjSeries(high, low, close.slice(0, 12))).toThrow(
      IndicatorInputError,
    );
  });

  it('throws IndicatorValueError when the trailing value is unavailable', () => {
    expect(() =>
      computeKdjObservation(
        high.slice(0, 3),
        low.slice(0, 3),
        close.slice(0, 3),
        { windowSize: 3 },
      ),
    ).toThrow(IndicatorValueError);
  });
});
