import { ERROR_MESSAGES } from '@app/constants';
import {
  HttpException,
  HttpStatus,
  Injectable,
  OnModuleInit,
} from '@nestjs/common';
import { RunADXDto } from './dto/run-adx.dto';
import { RunATRDto } from './dto/run-atr.dto';
import { RunDualMADto } from './dto/run-dualma.dto';
import { RunKDJDto } from './dto/run-kdj.dto';

@Injectable()
export class IndicatorService implements OnModuleInit {
  private talib: any = null;

  onModuleInit() {
    this.talib = this.initTalib();
  }

  // 初始化函数
  private initTalib() {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('talib');
  }

  async runMACD(prices: number[]): Promise<{
    begIndex: number;
    nbElement: number;
    macd: number[];
    signal: number[];
    histogram: number[];
  }> {
    if (!this.talib) {
      throw new HttpException(
        ERROR_MESSAGES.INDICATOR_NOT_INITIALIZED,
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    const macdResult = this.talib.execute({
      name: 'MACD',
      startIdx: 0,
      endIdx: prices.length - 1,
      inReal: prices,
      optInFastPeriod: 12,
      optInSlowPeriod: 26,
      optInSignalPeriod: 9,
    });
    return {
      begIndex: macdResult.begIndex,
      nbElement: macdResult.nbElement,
      macd: macdResult.result.outMACD,
      signal: macdResult.result.outMACDSignal,
      histogram: macdResult.result.outMACDHist,
    };
  }

  async runRSI(
    prices: number[],
    period: number = 14,
  ): Promise<{
    begIndex: number;
    nbElement: number;
    rsi: number[];
  }> {
    if (!this.talib) {
      throw new HttpException(
        ERROR_MESSAGES.INDICATOR_NOT_INITIALIZED,
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    const rsiResult = this.talib.execute({
      name: 'RSI',
      startIdx: 0,
      endIdx: prices.length - 1,
      inReal: prices,
      optInTimePeriod: period,
    });

    return {
      begIndex: rsiResult.begIndex,
      nbElement: rsiResult.nbElement,
      rsi: rsiResult.result.outReal,
    };
  }

  async runKDJ(data: RunKDJDto): Promise<{
    begIndex: number;
    nbElement: number;
    K: number[];
    D: number[];
    J: number[];
  }> {
    if (!this.talib) {
      throw new HttpException(
        ERROR_MESSAGES.INDICATOR_NOT_INITIALIZED,
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    const stochasticResult = this.talib.execute({
      name: 'STOCH',
      startIdx: 0,
      endIdx: data.high.length - 1,
      high: data.high,
      low: data.low,
      close: data.close,
      optInFastK_Period: data.period || 9,
      optInSlowK_Period: data.kSmoothing || 3,
      optInSlowK_MAType: 0, // 简单移动平均
      optInSlowD_Period: data.dSmoothing || 3,
      optInSlowD_MAType: 0, // 简单移动平均
    });

    const K = stochasticResult.result.outSlowK;
    const D = stochasticResult.result.outSlowD;

    // 计算 J 线
    const J = K.map(
      (kValue: number, index: number) => 3 * kValue - 2 * D[index],
    );

    return {
      K,
      D,
      J,
      begIndex: stochasticResult.begIndex,
      nbElement: stochasticResult.nbElement,
    };
  }

  async runADX(data: RunADXDto): Promise<number[]> {
    if (!this.talib) {
      throw new HttpException(
        ERROR_MESSAGES.INDICATOR_NOT_INITIALIZED,
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const adxResult = this.talib.execute({
      name: 'ADX',
      startIdx: 0,
      endIdx: data.close.length - 1,
      high: data.high,
      low: data.low,
      close: data.close,
      optInTimePeriod: data.period || 14,
    });

    // talib返回的结果中，result.result.outReal 是ADX值数组
    // 前面 period*2-1 个值是null（因为ADX计算需要足够的数据）
    return adxResult.result.outReal;
  }

  async runDualMA(
    data: RunDualMADto,
  ): Promise<{ shortMA: number[]; longMA: number[] }> {
    if (!this.talib) {
      throw new HttpException(
        ERROR_MESSAGES.INDICATOR_NOT_INITIALIZED,
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    // 并行计算两条均线
    const [shortMAResult, longMA] = await Promise.all([
      this.talib.execute({
        name: 'SMA',
        startIdx: 0,
        endIdx: data.close.length - 1,
        inReal: data.close,
        optInTimePeriod: data.shortPeriod || 13,
      }),
      this.talib.execute({
        name: 'SMA',
        startIdx: 0,
        endIdx: data.close.length - 1,
        inReal: data.close,
        optInTimePeriod: data.longPeriod || 60,
      }),
    ]);

    return {
      shortMA: shortMAResult.result.outReal,
      longMA: longMA.result.outReal,
    };
  }

  async runATR(data: RunATRDto): Promise<number[]> {
    if (!this.talib) {
      throw new HttpException(
        ERROR_MESSAGES.INDICATOR_NOT_INITIALIZED,
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const atrResult = this.talib.execute({
      name: 'ATR',
      startIdx: 0,
      endIdx: data.close.length - 1,
      high: data.high,
      low: data.low,
      close: data.close,
      optInTimePeriod: data.period || 14,
    });

    return atrResult.result.outReal;
  }
}
