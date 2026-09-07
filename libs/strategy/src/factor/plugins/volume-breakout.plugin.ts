import type {
  FactorContext,
  FactorOpinion,
  FactorPlugin,
} from '../factor.types';

export interface VolumeBreakoutPluginParams {
  readonly lookback?: number;
  readonly volumeMultiple?: number;
}

/**
 * 经典量价类示范插件：放量突破因子
 * 判定最新 K 线是否突破过去 N 根 K 线的价格前高，且成交量超过均量 M 倍
 */
export class VolumeBreakoutPlugin implements FactorPlugin {
  public readonly id = 'plugin.technical.volume-breakout';
  public readonly name = '量价放量突破因子插件';
  public readonly category = 'TECHNICAL' as const;
  public readonly version = '1.0.0';
  public readonly description =
    '当最新K线价格突破过去N根K线最高点，且成交量放大至均量指定倍数时看多';

  public readonly paramSchema = {
    lookback: { type: 'number', default: 20, description: '前高回溯K线数' },
    volumeMultiple: {
      type: 'number',
      default: 1.8,
      description: '放量倍数阈值',
    },
  };

  public async evaluate(
    context: FactorContext,
    rawParams?: Record<string, unknown>,
  ): Promise<FactorOpinion> {
    const lookback =
      typeof rawParams?.lookback === 'number' ? rawParams.lookback : 20;
    const volumeMultiple =
      typeof rawParams?.volumeMultiple === 'number'
        ? rawParams.volumeMultiple
        : 1.8;

    const minRequired = lookback + 1;
    if (context.bars.length < minRequired) {
      return {
        action: 'NEUTRAL',
        confidence: 0.0,
        reason: `K线数量不足(${context.bars.length}/${minRequired})，无法计算前高与均量`,
      };
    }

    const currentBar = context.bars[context.bars.length - 1];
    const previousBars = context.bars.slice(
      context.bars.length - 1 - lookback,
      context.bars.length - 1,
    );

    const currentOhlc = currentBar.ohlc.effective;
    const currentVolumeStr = currentBar.volume.effective;
    const currentVolume =
      currentVolumeStr !== null && Number.isFinite(Number(currentVolumeStr))
        ? Number(currentVolumeStr)
        : null;

    if (!currentOhlc || currentVolume === null) {
      return {
        action: 'NEUTRAL',
        confidence: 0.0,
        reason: '最新K线价格或成交量数据缺失',
      };
    }

    // 计算过去 N 根的历史最高价与平均成交量
    let highestHigh = -Infinity;
    let sumVolume = 0;
    let validVolumeCount = 0;

    for (const bar of previousBars) {
      const ohlc = bar.ohlc.effective;
      if (ohlc && ohlc.high > highestHigh) {
        highestHigh = ohlc.high;
      }
      const volStr = bar.volume.effective;
      if (volStr !== null) {
        const v = Number(volStr);
        if (Number.isFinite(v) && v > 0) {
          sumVolume += v;
          validVolumeCount += 1;
        }
      }
    }

    if (highestHigh === -Infinity || validVolumeCount === 0) {
      return {
        action: 'NEUTRAL',
        confidence: 0.0,
        reason: '历史K线有效行情数据不足',
      };
    }

    const avgVolume = sumVolume / validVolumeCount;
    const volumeRatio = currentVolume / avgVolume;
    const isPriceBreakout = currentOhlc.close > highestHigh;
    const isVolumeSurge = volumeRatio >= volumeMultiple;

    if (isPriceBreakout && isVolumeSurge) {
      return {
        action: 'BUY',
        confidence: Math.min(
          0.95,
          0.75 + Math.min(0.2, (volumeRatio - volumeMultiple) * 0.1),
        ),
        reason: `价格突破过去${lookback}根K线最高价(${highestHigh.toFixed(2)})且成交量放量${volumeRatio.toFixed(1)}倍(基准均量${avgVolume.toFixed(0)})`,
        evidence: {
          currentClose: currentOhlc.close,
          highestHigh,
          currentVolume,
          avgVolume,
          volumeRatio,
          lookback,
          isPriceBreakout: true,
          isVolumeSurge: true,
        },
      };
    }

    return {
      action: 'NEUTRAL',
      confidence: 0.0,
      reason: isPriceBreakout
        ? `价格突破前高但成交量未达标(${volumeRatio.toFixed(1)}x < ${volumeMultiple}x)`
        : `未突破前高(${currentOhlc.close.toFixed(2)} <= ${highestHigh.toFixed(2)})`,
      evidence: {
        isPriceBreakout,
        isVolumeSurge,
        volumeRatio,
      },
    };
  }
}
