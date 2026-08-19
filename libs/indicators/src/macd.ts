import { MACD } from 'technicalindicators';
import { IndicatorInputError, IndicatorValueError } from './errors';

export interface MacdSeriesResult {
  readonly begIndex: number;
  readonly macd: number[];
  readonly signal: number[];
  readonly histogram: number[];
}

export interface MacdObservation {
  readonly line: number;
  readonly signal: number;
  readonly histogram: number;
}

interface CompleteMacdValue {
  MACD: number;
  signal: number;
  histogram: number;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isCompleteMacdValue(value: {
  MACD?: number;
  signal?: number;
  histogram?: number;
}): value is CompleteMacdValue {
  return (
    isFiniteNumber(value.MACD) &&
    isFiniteNumber(value.signal) &&
    isFiniteNumber(value.histogram)
  );
}

/** MACD(12/26/9 EMA) full series. Warm-up positions carry no value; `out[i]` aligns to `in[i + begIndex]`. */
export function computeMacdSeries(closes: readonly number[]): MacdSeriesResult {
  const values = [...closes];
  const output = MACD.calculate({
    values,
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
    SimpleMAOscillator: false,
    SimpleMASignal: false,
  }).filter(isCompleteMacdValue);

  const macd = output.map((value) => value.MACD);
  const signal = output.map((value) => value.signal);
  const histogram = output.map((value) => value.histogram);

  return {
    begIndex: values.length - macd.length,
    macd,
    signal,
    histogram,
  };
}

/** MACD anchor observation: the trailing scalar value over the supplied window. */
export function computeMacdObservation(
  closes: readonly number[],
  opts?: { readonly windowSize?: number },
): MacdObservation {
  if (opts?.windowSize !== undefined && closes.length !== opts.windowSize) {
    throw new IndicatorInputError(
      `computeMacdObservation requires exactly ${opts.windowSize} closes; got ${closes.length}`,
    );
  }

  const series = computeMacdSeries(closes);
  if (series.macd.length === 0) {
    throw new IndicatorValueError(
      'computeMacdObservation did not produce a finite trailing value',
    );
  }

  return {
    line: series.macd.at(-1) as number,
    signal: series.signal.at(-1) as number,
    histogram: series.histogram.at(-1) as number,
  };
}
