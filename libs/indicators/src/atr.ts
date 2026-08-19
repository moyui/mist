import { ATR } from 'technicalindicators';

export interface AtrSeriesResult {
  readonly begIndex: number;
  readonly atr: number[];
}

/** ATR(14) full series. Warm-up positions carry no value; `out[i]` aligns to `in[i + begIndex]`. */
export function computeAtrSeries(
  high: readonly number[],
  low: readonly number[],
  close: readonly number[],
  period: number = 14,
): AtrSeriesResult {
  const highs = [...high];
  const lows = [...low];
  const closes = [...close];
  const atr = ATR.calculate({
    high: highs,
    low: lows,
    close: closes,
    period,
  });

  return {
    begIndex: closes.length - atr.length,
    atr,
  };
}
