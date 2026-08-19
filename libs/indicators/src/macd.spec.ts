import {
  computeMacdSeries,
  computeMacdObservation,
  IndicatorInputError,
  IndicatorValueError,
} from './index';

describe('computeMacdSeries', () => {
  const close = Array.from(
    { length: 80 },
    (_, index) => 100 + Math.sin(index / 3) * 5 + index * 0.7,
  );

  it('matches the historical IndicatorService output exactly (golden)', () => {
    const result = computeMacdSeries(close);

    expect(result.begIndex).toBe(33);
    expect(result.macd).toHaveLength(47);
    expect(result.signal).toHaveLength(47);
    expect(result.histogram).toHaveLength(47);
    expect(result.macd[0]).toBeCloseTo(4.010272, 6);
    expect(result.signal[0]).toBeCloseTo(5.290475, 6);
    expect(result.histogram[0]).toBeCloseTo(-1.280203, 6);
  });

  it('aligns output so that out[i] corresponds to in[i + begIndex]', () => {
    const result = computeMacdSeries(close);

    expect(close[result.begIndex]).toBe(close[33]);
    expect(result.macd.length + result.begIndex).toBe(close.length);
  });

  it('is deterministic and does not mutate its input', () => {
    const snapshot = [...close];
    const first = computeMacdSeries(close);
    const second = computeMacdSeries(close);

    expect(second).toEqual(first);
    expect(close).toEqual(snapshot);
    expect(Object.isFrozen(close)).toBe(false); // caller's array untouched
  });

  it('returns empty output with begIndex == input length for empty input', () => {
    const result = computeMacdSeries([]);

    expect(result.begIndex).toBe(0);
    expect(result.macd).toEqual([]);
    expect(result.signal).toEqual([]);
    expect(result.histogram).toEqual([]);
  });

  it('returns empty output for insufficient warm-up (no error)', () => {
    const result = computeMacdSeries(close.slice(0, 10));

    expect(result.macd).toEqual([]);
    expect(result.begIndex).toBe(10);
  });
});

describe('computeMacdObservation', () => {
  const close = Array.from(
    { length: 130 },
    (_, index) => 100 + Math.sin(index / 3) * 5 + index * 0.7,
  );

  it('matches the trailing series value (invariant)', () => {
    const series = computeMacdSeries(close);
    const observation = computeMacdObservation(close, { windowSize: 130 });

    expect(observation.line).toBeCloseTo(series.macd.at(-1) as number, 12);
    expect(observation.signal).toBeCloseTo(series.signal.at(-1) as number, 12);
    expect(observation.histogram).toBeCloseTo(
      series.histogram.at(-1) as number,
      12,
    );
  });

  it('enforces an exact window size', () => {
    expect(() =>
      computeMacdObservation(close.slice(0, 129), { windowSize: 130 }),
    ).toThrow(IndicatorInputError);
  });

  it('accepts any sufficient window when windowSize is omitted', () => {
    const observation = computeMacdObservation(close);

    expect(Number.isFinite(observation.line)).toBe(true);
    expect(Number.isFinite(observation.signal)).toBe(true);
    expect(Number.isFinite(observation.histogram)).toBe(true);
  });

  it('throws IndicatorValueError when the trailing value is unavailable', () => {
    expect(() =>
      computeMacdObservation(close.slice(0, 10), { windowSize: 10 }),
    ).toThrow(IndicatorValueError);
  });
});
