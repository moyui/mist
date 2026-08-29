import type { ChanK } from '@app/chancore';
import type { ProjectedStrategyBar } from '@app/market-data';

/**
 * Map a projected evaluation window into the ChanCore input series.
 *
 * The window is the imputed evaluation view (StrategySeriesImputer output):
 * - OHLC comes from `ohlc.effective` (consistent with the DSL `k.*` fields);
 *   a bar whose effective OHLC is null (unavailable — no anchor anywhere) is
 *   dropped defensively: Chan structure requires complete OHLC, and dropping
 *   is safe because ChanCore only requires strictly increasing times, not
 *   continuity. An empty or structurally insufficient series simply yields no
 *   points (not an error).
 * - volume/amount come from the projected effective values; only an
 *   unavailable resolution leaves null, which ChanK accepts natively. No
 *   re-imputation, no zero-filling happens here.
 */
export function toChanKSeries(
  window: readonly ProjectedStrategyBar[],
): readonly ChanK[] {
  const series: ChanK[] = [];
  for (let index = 0; index < window.length; index += 1) {
    const projected = window[index];
    const ohlc = projected.ohlc.effective;
    if (ohlc === null) continue;
    series.push(
      Object.freeze({
        id: index + 1,
        symbol: String(projected.rawBar.securityId),
        time: projected.rawBar.timestamp,
        open: ohlc.open,
        high: ohlc.high,
        low: ohlc.low,
        close: ohlc.close,
        volume: projected.volume.effective,
        amount: projected.amount.effective,
      }),
    );
  }
  return Object.freeze(series);
}
