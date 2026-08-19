import { SMA } from 'technicalindicators';

export interface DualMaSeriesResult {
  readonly begIndex: number;
  readonly shortMA: number[];
  readonly longMA: number[];
}

export interface DualMaSeriesParams {
  readonly shortPeriod?: number;
  readonly longPeriod?: number;
}

/** Dual moving average (SMA 13/60) full series. `out[i]` aligns to `in[i + begIndex]`. */
export function computeDualMaSeries(
  closes: readonly number[],
  params?: DualMaSeriesParams,
): DualMaSeriesResult {
  const values = [...closes];
  const shortPeriod = params?.shortPeriod ?? 13;
  const longPeriod = params?.longPeriod ?? 60;

  const shortMA = SMA.calculate({ values, period: shortPeriod });
  const longMA = SMA.calculate({ values, period: longPeriod });

  return {
    begIndex: values.length - shortMA.length,
    shortMA,
    longMA,
  };
}
