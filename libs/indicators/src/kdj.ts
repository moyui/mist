import { SMA, Stochastic } from 'technicalindicators';
import { IndicatorInputError, IndicatorValueError } from './errors';

export interface KdjSeriesResult {
  readonly begIndex: number;
  readonly K: number[];
  readonly D: number[];
  readonly J: number[];
}

export interface KdjObservation {
  readonly k: number;
  readonly d: number;
  readonly j: number;
}

export interface KdjSeriesParams {
  readonly period?: number;
  readonly kSmoothing?: number;
  readonly dSmoothing?: number;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** KDJ(9,3,3) full series. Warm-up positions carry no value; `out[i]` aligns to `in[i + begIndex]`. */
export function computeKdjSeries(
  high: readonly number[],
  low: readonly number[],
  close: readonly number[],
  params?: KdjSeriesParams,
): KdjSeriesResult {
  if (high.length !== low.length || low.length !== close.length) {
    throw new IndicatorInputError(
      `computeKdjSeries requires equal-length high/low/close arrays; got ${high.length}/${low.length}/${close.length}`,
    );
  }
  const highs = [...high];
  const lows = [...low];
  const closes = [...close];

  const period = params?.period ?? 9;
  const kSmoothing = params?.kSmoothing ?? 3;
  const dSmoothing = params?.dSmoothing ?? 3;

  const raw = Stochastic.calculate({
    high: highs,
    low: lows,
    close: closes,
    period,
    signalPeriod: kSmoothing,
  });
  const slowK = raw
    .filter((value) => isFiniteNumber(value.d))
    .map((value) => value.d);
  const D = SMA.calculate({ values: slowK, period: dSmoothing });
  const K = slowK.slice(slowK.length - D.length);
  const J = K.map((kValue, index) => 3 * kValue - 2 * D[index]);

  return {
    begIndex: closes.length - K.length,
    K,
    D,
    J,
  };
}

/** KDJ anchor observation: the trailing scalar value over the supplied window. */
export function computeKdjObservation(
  high: readonly number[],
  low: readonly number[],
  close: readonly number[],
  opts?: { readonly windowSize?: number },
): KdjObservation {
  if (opts?.windowSize !== undefined && close.length !== opts.windowSize) {
    throw new IndicatorInputError(
      `computeKdjObservation requires exactly ${opts.windowSize} closes; got ${close.length}`,
    );
  }

  const series = computeKdjSeries(high, low, close);
  if (series.K.length === 0) {
    throw new IndicatorValueError(
      'computeKdjObservation did not produce a finite trailing value',
    );
  }

  return {
    k: series.K.at(-1) as number,
    d: series.D.at(-1) as number,
    j: series.J.at(-1) as number,
  };
}
