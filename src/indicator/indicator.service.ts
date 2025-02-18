import {
  HttpException,
  HttpStatus,
  Injectable,
  OnModuleInit,
} from '@nestjs/common';
import * as path from 'path';
import { KDJDto } from './dto/kdj-dto';
import { KDJVo } from './vo/kdj-vo';

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

  async runMACD(prices: number[]) {
    if (!this.talib) {
      throw new HttpException(
        'IndicatorService 服务尚未初始化完成，请稍后执行任务',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return this.talib.execute({
      name: 'MACD',
      startIdx: 0,
      endIdx: prices.length - 1,
      inReal: prices,
      optInFastPeriod: 12,
      optInSlowPeriod: 26,
      optInSignalPeriod: 9,
    });
  }

  async runRSI(prices: number[], period: number = 14) {
    if (!this.talib) {
      throw new HttpException(
        'IndicatorService 服务尚未初始化完成，请稍后执行任务',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return this.talib.execute({
      name: 'RSI',
      startIdx: 0,
      endIdx: prices.length - 1,
      inReal: prices,
      optInTimePeriod: period,
    });
  }

  async runKDJ(data: KDJDto): Promise<KDJVo> {
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

    return { K, D, J };
  }
}
