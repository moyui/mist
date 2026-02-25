import { UtilsService } from '@app/utils';
import { Inject, Injectable } from '@nestjs/common';
import { TrendDirection } from '../chan/enums/trend-direction.enum';
import { KVo } from '../indicator/vo/k.vo';
import { BiVo } from '../chan/vo/bi.vo';

@Injectable()
export class TrendService {
  @Inject()
  private readonly utilsService: UtilsService;

  /**
   * Judges the trend direction based on two consecutive K-line data points
   * @param prev Previous K-line data
   * @param now Current K-line data
   * @param prevTrend Previous trend direction
   * @returns TrendDirection - Up if highs and lows are rising, Down if both are falling
   */
  judgeSimpleTrend(
    prev: KVo,
    now: KVo,
    prevTrend: TrendDirection,
  ): TrendDirection {
    // Only Up trend when both high and low are rising
    if (now.highest > prev.highest && now.lowest > prev.lowest) {
      return TrendDirection.Up;
    } else if (now.highest < prev.highest && now.lowest < prev.lowest) {
      return TrendDirection.Down;
    } else {
      // Continue previous trend if current pattern is unclear
      if (prevTrend === TrendDirection.Up) return TrendDirection.Up;
      if (prevTrend === TrendDirection.Down) return TrendDirection.Down;
      return TrendDirection.None;
    }
  }

  /**
   * Judges if two consecutive Bi (stroke) segments form a consistent trend
   * @param prev Previous Bi segment
   * @param now Current Bi segment
   * @returns true if both Bi segments form a consistent trend pattern
   */
  judgeBiTrend(prev: BiVo, now: BiVo) {
    if (prev.trend !== now.trend) return false; // Different trends, cannot form pattern
    if (now.trend === TrendDirection.Up) {
      return prev.highest <= now.highest && prev.lowest <= now.lowest;
    }
    if (now.trend === TrendDirection.Down) {
      return prev.highest >= now.highest && prev.lowest >= now.lowest;
    }
    return false;
  }
}
