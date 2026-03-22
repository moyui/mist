import { TimezoneService } from '@app/timezone';
import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { DataService } from '../data/data.service';
import { IndicatorQueryDto } from './dto/query/indicator-query.dto';
import { RunKDJDto } from './dto/run-kdj.dto';
import { IndicatorService } from './indicator.service';
import { KDJVo } from './vo/kdj.vo';
import { MACDVo } from './vo/macd.vo';
import { RSIVo } from './vo/rsi.vo';
import { KVo } from './vo/k.vo';

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
  constructor(
    private readonly indicatorService: IndicatorService,
    private readonly dataService: DataService,
    private readonly timezoneService: TimezoneService,
  ) {}

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
  async macd(@Body() queryDto: IndicatorQueryDto): Promise<MACDVo[]> {
    const startDate = this.timezoneService.convertTimestamp2Date(
      queryDto.startDate,
    );
    const endDate = this.timezoneService.convertTimestamp2Date(
      queryDto.endDate,
    );

    const data = await this.dataService.findBars({
      symbol: queryDto.symbol,
      period: queryDto.period,
      startDate,
      endDate,
      source: queryDto.source,
    });

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
      symbol: item.security.code,
      time: item.timestamp,
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
  async kdj(@Body() queryDto: IndicatorQueryDto): Promise<KDJVo[]> {
    const startDate = this.timezoneService.convertTimestamp2Date(
      queryDto.startDate,
    );
    const endDate = this.timezoneService.convertTimestamp2Date(
      queryDto.endDate,
    );

    const data = await this.dataService.findBars({
      symbol: queryDto.symbol,
      period: queryDto.period,
      startDate,
      endDate,
      source: queryDto.source,
    });

    const KDJParams = data.reduce<RunKDJDto>(
      (prev, cur) => {
        prev.high.push(cur.high);
        prev.low.push(cur.low);
        prev.close.push(cur.close);
        return prev;
      },
      {
        high: [],
        low: [],
        close: [],
        period: 14,
        kSmoothing: 3,
        dSmoothing: 3,
      },
    );
    const kdjResult = await this.indicatorService.runKDJ(KDJParams);

    return data.map((item, index) => ({
      k: formatIndicator(kdjResult.begIndex, index, kdjResult.K),
      d: formatIndicator(kdjResult.begIndex, index, kdjResult.D),
      j: formatIndicator(kdjResult.begIndex, index, kdjResult.J),
      symbol: item.security.code,
      time: item.timestamp,
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
  async rsi(@Body() queryDto: IndicatorQueryDto): Promise<RSIVo[]> {
    const startDate = this.timezoneService.convertTimestamp2Date(
      queryDto.startDate,
    );
    const endDate = this.timezoneService.convertTimestamp2Date(
      queryDto.endDate,
    );

    const data = await this.dataService.findBars({
      symbol: queryDto.symbol,
      period: queryDto.period,
      startDate,
      endDate,
      source: queryDto.source,
    });

    const rsiResult = await this.indicatorService.runRSI(
      data.map((item) => item.close),
    );

    return data.map((item, index) => ({
      rsi: formatIndicator(rsiResult.begIndex, index, rsiResult.rsi),
      symbol: item.security.code,
      time: item.timestamp,
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
  async k(@Body() queryDto: IndicatorQueryDto): Promise<KVo[]> {
    const startDate = this.timezoneService.convertTimestamp2Date(
      queryDto.startDate,
    );
    const endDate = this.timezoneService.convertTimestamp2Date(
      queryDto.endDate,
    );

    const data = await this.dataService.findBars({
      symbol: queryDto.symbol,
      period: queryDto.period,
      startDate,
      endDate,
      source: queryDto.source,
    });

    return data.map((item) => ({
      id: item.id,
      highest: item.high,
      lowest: item.low,
      open: item.open,
      close: item.close,
      symbol: item.security.code,
      time: item.timestamp,
      amount: item.amount,
    }));
  }
}
