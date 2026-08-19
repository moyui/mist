import { RSI } from 'technicalindicators';

export interface RsiSeriesResult {
  readonly begIndex: number;
  readonly rsi: number[];
}

/** RSI(14) full series. Warm-up positions carry no value; `out[i]` aligns to `in[i + begIndex]`. */
export function computeRsiSeries(
  closes: readonly number[],
  period: number = 14,
): RsiSeriesResult {
  const values = [...closes];
  const rsi = RSI.calculate({ values, period });

  return {
    begIndex: values.length - rsi.length,
    rsi,
  };
}
