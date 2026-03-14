import { Injectable, Logger } from '@nestjs/common';
import { MCPTool, MCPToolParam } from '@rekog/mcp-nest';
import { IndicatorService } from '../../mist/src/indicator/indicator.service';

/**
 * MCP Service for Technical Indicators
 *
 * Provides tools for calculating technical indicators:
 * - MACD (Moving Average Convergence Divergence)
 * - RSI (Relative Strength Index)
 * - KDJ (Stochastic Oscillator)
 * - ADX (Average Directional Index)
 * - ATR (Average True Range)
 */
@Injectable()
export class IndicatorMcpService {
  private readonly logger = new Logger(IndicatorMcpService.name);

  constructor(private readonly indicatorService: IndicatorService) {}

  /**
   * Calculate MACD (Moving Average Convergence Divergence)
   *
   * @param prices - Array of close prices
   * @returns MACD values with MACD line, signal line, and histogram
   */
  @MCPTool('calculate_macd', '计算MACD指标（移动平均收敛发散）')
  async calculateMacd(
    @MCPToolParam('prices', '收盘价数组', 'array')
    prices: number[],
  ) {
    this.logger.debug(`Calculating MACD for ${prices.length} prices`);
    const result = await this.indicatorService.runMACD(prices);
    this.logger.debug(`Calculated MACD for ${result.nbElement} elements`);
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

  /**
   * Calculate RSI (Relative Strength Index)
   *
   * @param prices - Array of close prices
   * @param period - RSI period (default: 14)
   * @returns RSI values
   */
  @MCPTool('calculate_rsi', '计算RSI指标（相对强弱指数）')
  async calculateRsi(
    @MCPToolParam('prices', '收盘价数组', 'array')
    prices: number[],
    @MCPToolParam('period', 'RSI周期', 'number')
    period: number = 14,
  ) {
    this.logger.debug(
      `Calculating RSI for ${prices.length} prices with period ${period}`,
    );
    const result = await this.indicatorService.runRSI(prices, period);
    this.logger.debug(`Calculated RSI for ${result.nbElement} elements`);
    return {
      success: true,
      data: result,
      params: { period },
    };
  }

  /**
   * Calculate KDJ (Stochastic Oscillator)
   *
   * @param highs - Array of high prices
   * @param lows - Array of low prices
   * @param closes - Array of close prices
   * @param period - K line period (default: 9)
   * @param kSmoothing - K line smoothing (default: 3)
   * @param dSmoothing - D line smoothing (default: 3)
   * @returns KDJ values with K, D, and J lines
   */
  @MCPTool('calculate_kdj', '计算KDJ指标（随机振荡器）')
  async calculateKdj(
    @MCPToolParam('highs', '最高价数组', 'array')
    highs: number[],
    @MCPToolParam('lows', '最低价数组', 'array')
    lows: number[],
    @MCPToolParam('closes', '收盘价数组', 'array')
    closes: number[],
    @MCPToolParam('period', 'K线周期', 'number')
    period: number = 9,
    @MCPToolParam('kSmoothing', 'K线平滑', 'number')
    kSmoothing: number = 3,
    @MCPToolParam('dSmoothing', 'D线平滑', 'number')
    dSmoothing: number = 3,
  ) {
    this.logger.debug(`Calculating KDJ for ${closes.length} candles`);
    const result = await this.indicatorService.runKDJ({
      high: highs,
      low: lows,
      close: closes,
      period,
      kSmoothing,
      dSmoothing,
    });
    this.logger.debug(`Calculated KDJ for ${result.nbElement} elements`);
    return {
      success: true,
      data: result,
      params: { period, kSmoothing, dSmoothing },
    };
  }

  /**
   * Calculate ADX (Average Directional Index)
   *
   * @param highs - Array of high prices
   * @param lows - Array of low prices
   * @param closes - Array of close prices
   * @param period - ADX period (default: 14)
   * @returns ADX values
   */
  @MCPTool('calculate_adx', '计算ADX指标（平均趋向指数）')
  async calculateAdx(
    @MCPToolParam('highs', '最高价数组', 'array')
    highs: number[],
    @MCPToolParam('lows', '最低价数组', 'array')
    lows: number[],
    @MCPToolParam('closes', '收盘价数组', 'array')
    closes: number[],
    @MCPToolParam('period', 'ADX周期', 'number')
    period: number = 14,
  ) {
    this.logger.debug(
      `Calculating ADX for ${closes.length} candles with period ${period}`,
    );
    const result = await this.indicatorService.runADX({
      high: highs,
      low: lows,
      close: closes,
      period,
    });
    this.logger.debug(`Calculated ADD for ${result.length} elements`);
    return {
      success: true,
      data: result,
      params: { period },
    };
  }

  /**
   * Calculate ATR (Average True Range)
   *
   * @param highs - Array of high prices
   * @param lows - Array of low prices
   * @param closes - Array of close prices
   * @param period - ATR period (default: 14)
   * @returns ATR values
   */
  @MCPTool('calculate_atr', '计算ATR指标（平均真实波幅）')
  async calculateAtr(
    @MCPToolParam('highs', '最高价数组', 'array')
    highs: number[],
    @MCPToolParam('lows', '最低价数组', 'array')
    lows: number[],
    @MCPToolParam('closes', '收盘价数组', 'array')
    closes: number[],
    @MCPToolParam('period', 'ATR周期', 'number')
    period: number = 14,
  ) {
    this.logger.debug(
      `Calculating ATR for ${closes.length} candles with period ${period}`,
    );
    const result = await this.indicatorService.runATR({
      high: highs,
      low: lows,
      close: closes,
      period,
    });
    this.logger.debug(`Calculated ATR for ${result.length} elements`);
    return {
      success: true,
      data: result,
      params: { period },
    };
  }

  /**
   * Perform complete technical indicator analysis
   *
   * @param highs - Array of high prices
   * @param lows - Array of low prices
   * @param closes - Array of close prices
   * @returns Complete indicator analysis with MACD, RSI, KDJ, ADX, ATR
   */
  @MCPTool('analyze_indicators', '完整的技术指标分析：MACD、RSI、KDJ、ADX、ATR')
  async analyzeIndicators(
    @MCPToolParam('highs', '最高价数组', 'array')
    highs: number[],
    @MCPToolParam('lows', '最低价数组', 'array')
    lows: number[],
    @MCPToolParam('closes', '收盘价数组', 'array')
    closes: number[],
  ) {
    this.logger.log(
      `Starting complete indicator analysis for ${closes.length} candles`,
    );

    const [macd, rsi, kdj, adx, atr] = await Promise.all([
      this.indicatorService.runMACD(closes),
      this.indicatorService.runRSI(closes),
      this.indicatorService.runKDJ({ high: highs, low: lows, close: closes }),
      this.indicatorService.runADX({ high: highs, low: lows, close: closes }),
      this.indicatorService.runATR({ high: highs, low: lows, close: closes }),
    ]);

    this.logger.log('Complete indicator analysis finished');

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
