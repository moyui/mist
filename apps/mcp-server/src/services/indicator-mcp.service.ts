import { Injectable } from '@nestjs/common';
import { Tool } from '@rekog/mcp-nest';
import { z } from 'zod';
import { IndicatorService } from '../../../mist/src/indicator/indicator.service';
import { McpErrorCode, McpError } from '@app/constants';
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

  /**
   * Map validation error messages to error codes
   */
  private getValidationErrorCode(errorMsg: string): McpErrorCode {
    if (
      errorMsg.includes('must contain at least') ||
      errorMsg.includes('elements')
    ) {
      return McpErrorCode.INSUFFICIENT_DATA;
    }
    if (errorMsg.includes('Array length mismatch')) {
      return McpErrorCode.ARRAY_LENGTH_MISMATCH;
    }
    if (errorMsg.includes('period') && errorMsg.includes('must be at least')) {
      return McpErrorCode.INVALID_PERIOD;
    }
    if (errorMsg.includes('limit') && errorMsg.includes('must be at least')) {
      return McpErrorCode.INVALID_PARAMETER;
    }
    if (errorMsg.includes('symbol') || errorMsg.includes('Symbol cannot')) {
      return McpErrorCode.INVALID_SYMBOL;
    }
    if (
      errorMsg.includes('date range') ||
      errorMsg.includes('must be before') ||
      errorMsg.includes('Invalid date format')
    ) {
      return McpErrorCode.INVALID_DATE_RANGE;
    }
    if (errorMsg.includes('not a valid number')) {
      return McpErrorCode.INVALID_DATA_FORMAT;
    }
    return McpErrorCode.INVALID_PARAMETER;
  }

  @Tool({
    name: 'calculate_macd',
    description: `Calculate MACD (Moving Average Convergence Divergence) indicator.

PURPOSE: Trend-following momentum indicator showing relationship between
two moving averages.

WHEN TO USE: Analyzing trend strength, identifying crossover signals,
confirming reversals.

REQUIRES: Array of closing prices. Min 26 data points.
RETURNS: Object with MACD line, Signal line, Histogram values.

INTERPRETATION: MACD above Signal = bullish, below = bearish.`,
  })
  async calculateMacd(prices: z.infer<typeof PricesSchema>) {
    return this.executeTool('calculate_macd', async () => {
      // Validate prices array
      const pricesError = ValidationHelper.validatePrices(prices);
      if (pricesError) {
        throw new McpError(
          pricesError,
          this.getValidationErrorCode(pricesError),
        );
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
    description: `Calculate RSI (Relative Strength Index) indicator.

PURPOSE: Momentum oscillator measuring speed and change of price movements.
Identifies overbought and oversold conditions.

WHEN TO USE: Detecting overbought (RSI > 70) or oversold (RSI < 30) conditions,
identifying reversals, measuring momentum.

REQUIRES: Array of closing prices. Default period 14, min 2.
RETURNS: Array of RSI values (0-100 scale).

INTERPRETATION: >70 overbought, <30 oversold, ~50 neutral.`,
  })
  async calculateRsi(
    prices: z.infer<typeof PricesSchema>,
    period: number = 14,
  ) {
    return this.executeTool('calculate_rsi', async () => {
      // Validate prices array
      const pricesError = ValidationHelper.validatePrices(prices);
      if (pricesError) {
        throw new McpError(
          pricesError,
          this.getValidationErrorCode(pricesError),
        );
      }

      // Validate period
      const periodError = ValidationHelper.validatePeriod(period, 'period', 2);
      if (periodError) {
        throw new McpError(
          periodError,
          this.getValidationErrorCode(periodError),
        );
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
    description: `Calculate KDJ (Stochastic Oscillator) indicator.

PURPOSE: Momentum indicator comparing close price to price range.

WHEN TO USE: Identifying overbought/oversold, timing entries/exits.

REQUIRES: Three arrays (highs, lows, closes) with matching lengths.
Default period 9, min 50 data points recommended.

RETURNS: Object with K, D, and J line values.
INTERPRETATION: K/D >80 overbought, <20 oversold.`,
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
        throw new McpError(highsError, this.getValidationErrorCode(highsError));
      }

      const lowsError = ValidationHelper.validatePrices(lows, 'lows');
      if (lowsError) {
        throw new McpError(lowsError, this.getValidationErrorCode(lowsError));
      }

      const closesError = ValidationHelper.validatePrices(closes, 'closes');
      if (closesError) {
        throw new McpError(
          closesError,
          this.getValidationErrorCode(closesError),
        );
      }

      // Validate array lengths match
      const lengthError = ValidationHelper.validateMatchingLengths(
        [highs, lows, closes],
        ['highs', 'lows', 'closes'],
      );
      if (lengthError) {
        throw new McpError(lengthError, McpErrorCode.ARRAY_LENGTH_MISMATCH);
      }

      // Validate period parameters
      const periodError = ValidationHelper.validatePeriod(period, 'period', 2);
      if (periodError) {
        throw new McpError(
          periodError,
          this.getValidationErrorCode(periodError),
        );
      }

      const kSmoothingError = ValidationHelper.validatePeriod(
        kSmoothing,
        'kSmoothing',
        1,
      );
      if (kSmoothingError) {
        throw new McpError(kSmoothingError, McpErrorCode.INVALID_PARAMETER);
      }

      const dSmoothingError = ValidationHelper.validatePeriod(
        dSmoothing,
        'dSmoothing',
        1,
      );
      if (dSmoothingError) {
        throw new McpError(dSmoothingError, McpErrorCode.INVALID_PARAMETER);
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
    description: `Calculate ADX (Average Directional Index) indicator.

PURPOSE: Measures trend strength regardless of direction.

WHEN TO USE: Determining if trend is strong enough to trade,
filtering ranging vs trending markets.

REQUIRES: Three arrays (highs, lows, closes) with matching lengths.
Default period 14, min 30 data points recommended.

RETURNS: Array of ADX values (0-100 scale).
INTERPRETATION: >25 strong trend, <20 weak/no trend.`,
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
    description: `Calculate ATR (Average True Range) indicator.

PURPOSE: Measures market volatility by analyzing price range.
Useful for position sizing and stop loss placement.

WHEN TO USE: Measuring volatility, setting stop loss levels,
position sizing (risk management).

REQUIRES: Three arrays (highs, lows, closes) with matching lengths.
Default period 14, min 14 data points needed.

RETURNS: Array of ATR values in price units.
INTERPRETATION: Higher ATR = higher volatility, wider stops.`,
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
    description: `Calculate all major technical indicators in one call.

PURPOSE: Comprehensive analysis using 5 key indicators: MACD, RSI,
KDJ, ADX, and ATR. More efficient than calling each separately.

WHEN TO USE: Complete technical overview, comparing multiple indicators,
avoiding multiple API calls.

REQUIRES: Three arrays (highs, lows, closes) with matching lengths.
Recommended 100+ data points.

RETURNS: Object with all 5 indicators: macd, rsi, kdj, adx, atr.`,
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
