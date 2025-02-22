import {
  HttpException,
  HttpStatus,
  Injectable,
  OnModuleInit,
} from '@nestjs/common';
import * as path from 'path';
import { RunKDJDto } from './dto/run-kdj-dto';

@Injectable()
export class IndicatorService implements OnModuleInit {
  private talib: any | null = null;

  async onModuleInit() {
    this.talib = await this.initTalib();
  }

  // 初始化函数
  private async initTalib() {
    return await import(
      path.resolve(
        __dirname,
        '../../',
        'node_modules/talib/build/Release/talib.node',
      )
    );
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
        'IndicatorService 服务尚未初始化完成，请稍后执行任务',
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
        'IndicatorService 服务尚未初始化完成，请稍后执行任务',
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
        'IndicatorService 服务尚未初始化完成，请稍后执行任务',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    const stochasticResult = await this.talib.execute({
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
    const J = K.map((kValue, index) => 3 * kValue - 2 * D[index]);

    return {
      K,
      D,
      J,
      begIndex: stochasticResult.begIndex,
      nbElement: stochasticResult.nbElement,
    };
  }
}
