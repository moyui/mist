import { Injectable } from '@nestjs/common';
import { Tool } from '@rekog/mcp-nest';
import { z } from 'zod';
import { IndicatorService } from '../../../mist/src/indicator/indicator.service';
import { BaseMcpToolService } from '../base/base-mcp-tool.service';
import { ValidationHelper } from '../utils/validation.helpers';

// Zod schemas
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const PricesSchema = z.array(z.number());

@Injectable()
export class IndicatorMcpService extends BaseMcpToolService {
  constructor(private readonly indicatorService: IndicatorService) {
    super(IndicatorMcpService.name);
  }

  @Tool({
    name: 'calculate_macd',
    description: '计算MACD指标（移动平均收敛发散）',
  })
  async calculateMacd(prices: z.infer<typeof PricesSchema>) {
    return this.executeTool('calculate_macd', async () => {
      // Validate prices array
      const pricesError = ValidationHelper.validatePrices(prices);
      if (pricesError) {
        throw new Error(pricesError);
      }

      const result = await this.indicatorService.runMACD(prices);
      return {
        data: result,
        params: {
          fastPeriod: 12,
          slowPeriod: 26,
          signalPeriod: 9,
        },
      };
    });
  }

  @Tool({
    name: 'calculate_rsi',
    description: '计算RSI指标（相对强弱指数）',
  })
  async calculateRsi(
    prices: z.infer<typeof PricesSchema>,
    period: number = 14,
  ) {
    return this.executeTool('calculate_rsi', async () => {
      // Validate prices array
      const pricesError = ValidationHelper.validatePrices(prices);
      if (pricesError) {
        throw new Error(pricesError);
      }

      // Validate period
      const periodError = ValidationHelper.validatePeriod(period, 'period', 2);
      if (periodError) {
        throw new Error(periodError);
      }

      const result = await this.indicatorService.runRSI(prices, period);
      return {
        data: result,
        params: { period },
      };
    });
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
    return this.executeTool('calculate_kdj', async () => {
      // Validate prices arrays
      const highsError = ValidationHelper.validatePrices(highs, 'highs');
      if (highsError) {
        throw new Error(highsError);
      }

      const lowsError = ValidationHelper.validatePrices(lows, 'lows');
      if (lowsError) {
        throw new Error(lowsError);
      }

      const closesError = ValidationHelper.validatePrices(closes, 'closes');
      if (closesError) {
        throw new Error(closesError);
      }

      // Validate array lengths match
      const lengthError = ValidationHelper.validateMatchingLengths(
        [highs, lows, closes],
        ['highs', 'lows', 'closes'],
      );
      if (lengthError) {
        throw new Error(lengthError);
      }

      // Validate period parameters
      const periodError = ValidationHelper.validatePeriod(period, 'period', 2);
      if (periodError) {
        throw new Error(periodError);
      }

      const kSmoothingError = ValidationHelper.validatePeriod(
        kSmoothing,
        'kSmoothing',
        1,
      );
      if (kSmoothingError) {
        throw new Error(kSmoothingError);
      }

      const dSmoothingError = ValidationHelper.validatePeriod(
        dSmoothing,
        'dSmoothing',
        1,
      );
      if (dSmoothingError) {
        throw new Error(dSmoothingError);
      }

      const result = await this.indicatorService.runKDJ({
        high: highs,
        low: lows,
        close: closes,
        period,
        kSmoothing,
        dSmoothing,
      });
      return {
        data: result,
        params: { period, kSmoothing, dSmoothing },
      };
    });
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
    return this.executeTool('calculate_adx', async () => {
      const result = await this.indicatorService.runADX({
        high: highs,
        low: lows,
        close: closes,
        period,
      });
      return {
        data: result,
        params: { period },
      };
    });
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
    return this.executeTool('calculate_atr', async () => {
      const result = await this.indicatorService.runATR({
        high: highs,
        low: lows,
        close: closes,
        period,
      });
      return {
        data: result,
        params: { period },
      };
    });
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
    return this.executeTool('analyze_indicators', async () => {
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
    });
  }
}
