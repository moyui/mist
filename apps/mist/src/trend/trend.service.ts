import { UtilsService } from '@app/utils';
import { Inject, Injectable } from '@nestjs/common';
import { TrendDirection } from '../chan/enums/trend-direction.enum';
import { IndicatorService } from '../indicator/indicator.service';
import { KVo } from '../indicator/vo/k.vo';
import { JudgeTrendVo } from './vo/judge-trend.vo';

@Injectable()
export class TrendService {
  @Inject()
  private readonly utilsService: UtilsService;

  @Inject()
  private readonly indicatorService: IndicatorService;

  async judgeTrend(data: KVo[]): Promise<JudgeTrendVo> {
    const { latest, ma } = await this.calculateAllTrendIndicators(data);
    const adx = latest.adx;
    const atrRatio = latest.atrRatio;

    // 2. 分步逻辑判断
    let primaryTrend: TrendDirection = TrendDirection.None;
    let confidence = 0.5; // 基础置信度

    if (adx < 20) {
      // 震荡期，无明显趋势
      return {
        trend: TrendDirection.None,
        confidence,
      };
    }

    const lastShort = ma.short[ma.short.length - 1];
    const lastLong = ma.long[ma.long.length - 1];
    const prevShort = ma.short[ma.short.length - 2];
    const prevLong = ma.long[ma.long.length - 2];

    // 是否金叉
    const isGoldenCross = prevShort <= prevLong && lastShort > lastLong;
    // 是否死叉
    const isDeathCross = prevShort >= prevLong && lastShort < lastLong;

    if (isGoldenCross || lastShort > lastLong) {
      primaryTrend = TrendDirection.Up;
    } else if (isDeathCross || lastShort < lastLong) {
      primaryTrend = TrendDirection.Down;
    } else {
      primaryTrend = TrendDirection.None;
    }

    if (atrRatio > 1.2) {
      confidence = 0.3;
    } else if (atrRatio < 0.3) {
      confidence = 0.4;
    } else {
      confidence = 0.8;
    }

    return {
      trend: primaryTrend,
      confidence,
    };
  }

  judgeSimpleTrend(
    prev: KVo,
    now: KVo,
    prevTrend: TrendDirection,
  ): TrendDirection {
    // 只有高点抬高, 低点也抬高, 则判断为上涨趋势
    if (now.highest > prev.highest && now.lowest > prev.lowest) {
      return TrendDirection.Up;
    } else if (now.highest < prev.highest && now.lowest < prev.lowest) {
      return TrendDirection.Down;
    } else {
      // 如果前面一段趋势是上涨趋势, 则判断为继续上涨
      if (prevTrend === TrendDirection.Up) return TrendDirection.Up;
      // 如果前面一段趋势是下跌趋势, 则判断为继续下跌
      if (prevTrend === TrendDirection.Down) return TrendDirection.Down;
      return TrendDirection.None;
    }
  }

  async calculateAllTrendIndicators(data: KVo[]) {
    // todo 这里的限制先解除
    // const minDataLength = Math.max(60 + 30, 14 * 3);
    // if (data.length < minDataLength) {
    //   throw new HttpException(
    //     `数据长度不足, 需要至少 ${minDataLength} 个数据点, 当前 ${data.length} 个数据点`,
    //     HttpStatus.BAD_REQUEST,
    //   );
    // }
    const [adx, ma, atrRatio] = await Promise.all([
      this.calculateADX(data),
      this.calculateMA(data),
      this.calculateATRRatio(data),
    ]);

    const lastADX = this.utilsService.getLatestValidValue(adx);
    const lastATR = this.utilsService.getLatestValidValue(atrRatio);
    const lastData = data[data.length - 1];
    const lastDataSize = lastData.close - lastData.open; // 这里的算法是用实体来计算的
    const lastAtrRadio = lastATR ? lastDataSize / lastATR : null;

    return {
      ma: {
        short: ma.shortMA,
        long: ma.longMA,
      },
      latest: {
        atrRatio: lastAtrRadio,
        adx: lastADX,
        atr: lastATR,
      },
    };
  }

  private async calculateADX(data: KVo[]) {
    const low = data.map((index) => index.lowest);
    const high = data.map((index) => index.highest);
    const close = data.map((index) => index.close);
    return this.indicatorService.runADX({ close, high, low });
  }

  private async calculateMA(data: KVo[]) {
    const close = data.map((index) => index.close);
    return this.indicatorService.runDualMA({ close });
  }

  private async calculateATRRatio(data: KVo[]) {
    const low = data.map((index) => index.lowest);
    const high = data.map((index) => index.highest);
    const close = data.map((index) => index.close);
    return this.indicatorService.runATR({ low, high, close });
  }
}
