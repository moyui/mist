import { Injectable } from '@nestjs/common';
import { Tool } from '@rekog/mcp-nest';
import { z } from 'zod';
import { IndicatorService } from '../../../mist/src/indicator/indicator.service';

// Zod schemas
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const PricesSchema = z.array(z.number());

@Injectable()
export class IndicatorMcpService {
  constructor(private readonly indicatorService: IndicatorService) {}

  @Tool({
    name: 'calculate_macd',
    description: '计算MACD指标（移动平均收敛发散）',
  })
  async calculateMacd(prices: z.infer<typeof PricesSchema>) {
    const result = await this.indicatorService.runMACD(prices);
    return {
      success: true,
      data: result,
      params: {
        fastPeriod: 12,
        slowPeriod: 26,
        signalPeriod: 9,
      },
    };
  }

  @Tool({
    name: 'calculate_rsi',
    description: '计算RSI指标（相对强弱指数）',
  })
  async calculateRsi(
    prices: z.infer<typeof PricesSchema>,
    period: number = 14,
  ) {
    const result = await this.indicatorService.runRSI(prices, period);
    return {
      success: true,
      data: result,
      params: { period },
    };
  }

  @Tool({
    name: 'calculate_kdj',
    description: '计算KDJ指标（随机振荡器）',
  })
  async calculateKdj(
    highs: z.infer<typeof PricesSchema>,
    lows: z.infer<typeof PricesSchema>,
    closes: z.infer<typeof PricesSchema>,
    period: number = 9,
    kSmoothing: number = 3,
    dSmoothing: number = 3,
  ) {
    const result = await this.indicatorService.runKDJ({
      high: highs,
      low: lows,
      close: closes,
      period,
      kSmoothing,
      dSmoothing,
    });
    return {
      success: true,
      data: result,
      params: { period, kSmoothing, dSmoothing },
    };
  }

  @Tool({
    name: 'calculate_adx',
    description: '计算ADX指标（平均趋向指数）',
  })
  async calculateAdx(
    highs: z.infer<typeof PricesSchema>,
    lows: z.infer<typeof PricesSchema>,
    closes: z.infer<typeof PricesSchema>,
    period: number = 14,
  ) {
    const result = await this.indicatorService.runADX({
      high: highs,
      low: lows,
      close: closes,
      period,
    });
    return {
      success: true,
      data: result,
      params: { period },
    };
  }

  @Tool({
    name: 'calculate_atr',
    description: '计算ATR指标（平均真实波幅）',
  })
  async calculateAtr(
    highs: z.infer<typeof PricesSchema>,
    lows: z.infer<typeof PricesSchema>,
    closes: z.infer<typeof PricesSchema>,
    period: number = 14,
  ) {
    const result = await this.indicatorService.runATR({
      high: highs,
      low: lows,
      close: closes,
      period,
    });
    return {
      success: true,
      data: result,
      params: { period },
    };
  }

  @Tool({
    name: 'analyze_indicators',
    description: '完整的技术指标分析：MACD、RSI、KDJ、ADX、ATR',
  })
  async analyzeIndicators(
    highs: z.infer<typeof PricesSchema>,
    lows: z.infer<typeof PricesSchema>,
    closes: z.infer<typeof PricesSchema>,
  ) {
    const [macd, rsi, kdj, adx, atr] = await Promise.all([
      this.indicatorService.runMACD(closes),
      this.indicatorService.runRSI(closes),
      this.indicatorService.runKDJ({
        high: highs,
        low: lows,
        close: closes,
      }),
      this.indicatorService.runADX({
        high: highs,
        low: lows,
        close: closes,
      }),
      this.indicatorService.runATR({
        high: highs,
        low: lows,
        close: closes,
      }),
    ]);

    return {
      success: true,
      data: {
        macd: { nbElement: macd.nbElement, data: macd },
        rsi: { nbElement: rsi.nbElement, data: rsi },
        kdj: { nbElement: kdj.nbElement, data: kdj },
        adx: { count: adx.length, data: adx },
        atr: { count: atr.length, data: atr },
      },
      summary: {
        candleCount: closes.length,
        indicatorsCalculated: 5,
      },
    };
  }
}
