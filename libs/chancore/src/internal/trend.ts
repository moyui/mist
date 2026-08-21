import { TrendDirection } from '../contracts';
import type { ChanK } from '../contracts';

type PriceRange = Pick<ChanK, 'high' | 'low'>;

export class TrendCalculator {
  /**
   * Judges the trend direction based on two consecutive K-line data points
   * @param prev Previous K-line data
   * @param now Current K-line data
   * @param prevTrend Previous trend direction
   * @returns TrendDirection - Up if highs and lows are rising, Down if both are falling
   */
  judgeSimpleTrend(
    prev: PriceRange,
    now: PriceRange,
    prevTrend: TrendDirection,
  ): TrendDirection {
    // Only Up trend when both high and low are rising
    if (now.high > prev.high && now.low > prev.low) {
      return TrendDirection.Up;
    } else if (now.high < prev.high && now.low < prev.low) {
      return TrendDirection.Down;
    } else {
      // Continue previous trend if current pattern is unclear
      if (prevTrend === TrendDirection.Up) return TrendDirection.Up;
      if (prevTrend === TrendDirection.Down) return TrendDirection.Down;
      return TrendDirection.None;
    }
  }
}
