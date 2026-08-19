import { ADX } from 'technicalindicators';

export interface AdxSeriesResult {
  readonly begIndex: number;
  readonly adx: number[];
}

/** ADX(14) full series. Warm-up positions carry no value; `out[i]` aligns to `in[i + begIndex]`. */
export function computeAdxSeries(
  high: readonly number[],
  low: readonly number[],
  close: readonly number[],
  period: number = 14,
): AdxSeriesResult {
  const highs = [...high];
  const lows = [...low];
  const closes = [...close];
  const adx = ADX.calculate({
    high: highs,
    low: lows,
    close: closes,
    period,
  }).map((value) => value.adx);

  return {
    begIndex: closes.length - adx.length,
    adx,
  };
}
