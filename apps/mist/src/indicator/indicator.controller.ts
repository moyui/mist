import { TimezoneService } from '@app/timezone';
import { Body, Controller, Inject, Post } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IndexVo } from '../../../../libs/shared-data/src/vo/index.vo';
import { DataService } from '../data/data.service';
import { KDto } from './dto/k.dto';
import { KDJDto } from './dto/kdj.dto';
import { MACDDto } from './dto/macd.dto';
import { RSIDto } from './dto/rsi.dto';
import { RunKDJDto } from './dto/run-kdj.dto';
import { IndicatorService } from './indicator.service';
import { KVo } from './vo/k.vo';
import { KDJVo } from './vo/kdj.vo';
import { MACDVo } from './vo/macd.vo';
import { RSIVo } from './vo/rsi.vo';

export function formatIndicator(
  begIndex: number,
  index: number,
  data: number[],
) {
  if (index < begIndex) return NaN;
  return data[index - begIndex];
}

@ApiTags('indicator')
@Controller('indicator')
export class IndicatorController {
  constructor(private readonly indicatorService: IndicatorService) {}

  @Inject()
  private dataService: DataService;

  @Inject()
  private timezoneService: TimezoneService;

  @Post('macd')
  @Throttle({ default: { limit: 40, ttl: 60000 } }) // 40 requests per minute for MACD
  @ApiOperation({
    summary: 'Calculate MACD indicator',
    description:
      'Computes MACD (Moving Average Convergence Divergence) with default parameters: fast=12, slow=26, signal=9',
  })
  @ApiResponse({
    status: 200,
    description:
      'Returns array of MACD values with MACD line, signal line, and histogram',
    type: [MACDVo],
  })
  async macd(@Body() MACDDto: MACDDto): Promise<MACDVo[]> {
    const startDate = this.timezoneService.convertTimestamp2Date(
      MACDDto.startDate,
    );
    const endDate = this.timezoneService.convertTimestamp2Date(MACDDto.endDate);
    let data = [] as IndexVo[];
    if (MACDDto.daily) {
      data = await this.dataService.findIndexDailyById({
        symbol: MACDDto.symbol,
        code: MACDDto.code,
        startDate,
        endDate,
      });
    }
    if (MACDDto.period) {
      data = await this.dataService.findIndexPeriodById({
        symbol: MACDDto.symbol,
        period: MACDDto.period,
        startDate,
        endDate,
      });
    }
    const macdResult = await this.indicatorService.runMACD(
      data.map((item) => item.close),
    );
    // Need to skip begIndex values, these are invalid
    return data.map((item, index) => ({
      macd: formatIndicator(macdResult.begIndex, index, macdResult.macd),
      signal: formatIndicator(macdResult.begIndex, index, macdResult.signal),
      histogram: formatIndicator(
        macdResult.begIndex,
        index,
        macdResult.histogram,
      ),
      symbol: item.symbol,
      time: item.time,
      close: item.close,
    }));
  }

  @Post('kdj')
  @Throttle({ default: { limit: 40, ttl: 60000 } }) // 40 requests per minute for KDJ
  @ApiOperation({
    summary: 'Calculate KDJ indicator',
    description:
      'Computes KDJ (Stochastic) indicator with default parameters: period=9, kSmoothing=3, dSmoothing=3',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns array of KDJ values with K, D, and J lines',
    type: [KDJVo],
  })
  async kdj(@Body() KDJDto: KDJDto): Promise<KDJVo[]> {
    const startDate = this.timezoneService.convertTimestamp2Date(
      KDJDto.startDate,
    );
    const endDate = this.timezoneService.convertTimestamp2Date(KDJDto.endDate);

    let data = [] as IndexVo[];

    if (KDJDto.daily) {
      data = await this.dataService.findIndexDailyById({
        symbol: KDJDto.symbol,
        code: KDJDto.code,
        startDate,
        endDate,
      });
    }
    if (KDJDto.period) {
      data = await this.dataService.findIndexPeriodById({
        symbol: KDJDto.symbol,
        period: KDJDto.period,
        startDate,
        endDate,
      });
    }
    const KDJParams = data.reduce<RunKDJDto>(
      (prev, cur) => {
        prev.high.push(cur.highest);
        prev.low.push(cur.lowest);
        prev.close.push(cur.close);
        return prev;
      },
      {
        high: [],
        low: [],
        close: [],
      },
    );
    const kdjResult = await this.indicatorService.runKDJ(KDJParams);

    return data.map((item, index) => ({
      k: formatIndicator(kdjResult.begIndex, index, kdjResult.K),
      d: formatIndicator(kdjResult.begIndex, index, kdjResult.D),
      j: formatIndicator(kdjResult.begIndex, index, kdjResult.J),
      symbol: item.symbol,
      time: item.time,
      close: item.close,
    }));
  }

  @Post('rsi')
  @Throttle({ default: { limit: 40, ttl: 60000 } }) // 40 requests per minute for RSI
  @ApiOperation({
    summary: 'Calculate RSI indicator',
    description:
      'Computes RSI (Relative Strength Index) with default period of 14',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns array of RSI values (0-100 range)',
    type: [RSIVo],
  })
  async rsi(@Body() RSIDto: RSIDto): Promise<RSIVo[]> {
    const startDate = this.timezoneService.convertTimestamp2Date(
      RSIDto.startDate,
    );
    const endDate = this.timezoneService.convertTimestamp2Date(RSIDto.endDate);

    let data = [] as IndexVo[];

    if (RSIDto.daily) {
      data = await this.dataService.findIndexDailyById({
        symbol: RSIDto.symbol,
        code: RSIDto.code,
        startDate,
        endDate,
      });
    }
    if (RSIDto.period) {
      data = await this.dataService.findIndexPeriodById({
        symbol: RSIDto.symbol,
        period: RSIDto.period,
        startDate,
        endDate,
      });
    }
    const rsiResult = await this.indicatorService.runRSI(
      data.map((item) => item.close),
    );

    return data.map((item, index) => ({
      rsi: formatIndicator(rsiResult.begIndex, index, rsiResult.rsi),
      symbol: item.symbol,
      time: item.time,
      close: item.close,
    }));
  }

  @Post('k')
  @Throttle({ default: { limit: 60, ttl: 60000 } }) // 60 requests per minute for K-line data
  @ApiOperation({
    summary: 'Get K-line data',
    description:
      'Retrieves K-line (candlestick) data for the specified symbol and time range',
  })
  @ApiResponse({
    status: 200,
    description:
      'Returns array of K-line data with open, high, low, close, and volume',
    type: [KVo],
  })
  async k(@Body() KDto: KDto): Promise<KVo[]> {
    const startDate = this.timezoneService.convertTimestamp2Date(
      KDto.startDate,
    );
    const endDate = this.timezoneService.convertTimestamp2Date(KDto.endDate);

    let data = [] as IndexVo[];

    if (KDto.daily) {
      data = await this.dataService.findIndexDailyById({
        symbol: KDto.symbol,
        code: KDto.code,
        startDate,
        endDate,
      });
    }
    if (KDto.period) {
      data = await this.dataService.findIndexPeriodById({
        symbol: KDto.symbol,
        period: KDto.period,
        startDate,
        endDate,
      });
    }

    return data.map((item) => ({
      id: item.id,
      highest: item.highest,
      lowest: item.lowest,
      open: item.open,
      close: item.close,
      symbol: item.symbol,
      time: item.time,
      amount: item.amount,
    }));
  }
}
