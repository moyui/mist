import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ApiEnvelopeResponse } from '@app/transport/http';
import { Throttle } from '@nestjs/throttler';
import { ChanService } from './chan.service';
import { CreateBiDto } from './dto/create-bi.dto';
import { ChannelTwoPhaseVo } from './vo/channel.vo';
import { BiTwoPhaseVo } from './vo/bi.vo';
import { MergedKVo } from './vo/merged-k.vo';
import { FenxingVo } from './vo/fenxing.vo';
import { IndicatorQueryDto } from '../indicator/dto/query/indicator-query.dto';
import { TimezoneService } from '@app/timezone';
import { IndicatorService } from '../indicator/indicator.service';

@ApiTags('chan')
@Controller('v1/chan')
export class ChanController {
  constructor(
    private readonly chanService: ChanService,
    private readonly indicatorService: IndicatorService,
    private readonly timezoneService: TimezoneService,
  ) {}

  private parseQueryDateRange(queryDto: IndicatorQueryDto): {
    startDate: Date;
    endDate: Date;
  } {
    return {
      startDate: this.timezoneService.parseDateString(queryDto.startDate),
      endDate: this.timezoneService.parseDateString(queryDto.endDate),
    };
  }

  @Post('merge-k')
  @Throttle({ default: { limit: 50, ttl: 60000 } }) // 50 requests per minute for K-line merge
  @ApiOperation({
    summary: 'Merge K-lines',
    description:
      'Merges K-lines based on containment relationships and trend direction',
  })
  @ApiEnvelopeResponse({
    status: 200,
    description: 'Returns merged K-line data',
    type: MergedKVo,
    isArray: true,
  })
  async postMergeK(@Body() queryDto: IndicatorQueryDto) {
    const { startDate, endDate } = this.parseQueryDateRange(queryDto);

    const kData = (
      await this.indicatorService.findKData({
        code: queryDto.code,
        period: queryDto.period,
        startDate,
        endDate,
        source: queryDto.source,
      })
    ).map((k) => ({
      id: k.id,
      symbol: k.security.code,
      time: k.timestamp,
      open: k.open,
      high: k.high,
      low: k.low,
      close: k.close,
      volume: k.volume,
      amount: k.amount,
    }));

    return this.chanService.mergeK(kData);
  }

  @Post('bi')
  @Throttle({ default: { limit: 30, ttl: 60000 } }) // 30 requests per minute for Bi creation
  @ApiOperation({
    summary: 'Create Bi (strokes)',
    description:
      'Identifies and creates Bi (strokes) from K-line data using Chan Theory',
  })
  @ApiEnvelopeResponse({
    status: 200,
    description:
      'Returns an API envelope whose data contains the two-phase Bi result { phaseA, phaseB }',
    type: BiTwoPhaseVo,
  })
  async postIndexBi(@Body() queryDto: IndicatorQueryDto) {
    const { startDate, endDate } = this.parseQueryDateRange(queryDto);

    const kData = (
      await this.indicatorService.findKData({
        code: queryDto.code,
        period: queryDto.period,
        startDate,
        endDate,
        source: queryDto.source,
      })
    ).map((k) => ({
      id: k.id,
      symbol: k.security.code,
      time: k.timestamp,
      open: k.open,
      high: k.high,
      low: k.low,
      close: k.close,
      volume: k.volume,
      amount: k.amount,
    }));
    const createBiDto: CreateBiDto = { k: kData };

    return this.chanService.createBi(createBiDto);
  }

  @Post('fenxing')
  @Throttle({ default: { limit: 30, ttl: 60000 } }) // 30 requests per minute for Fenxing retrieval
  @ApiOperation({
    summary: 'Get Fenxing (fractals)',
    description:
      'Returns all fenxing (fractal) data identified from merged K-lines',
  })
  @ApiEnvelopeResponse({
    status: 200,
    description: 'Returns array of fenxing data',
    type: FenxingVo,
    isArray: true,
  })
  async postFenxing(@Body() queryDto: IndicatorQueryDto) {
    const { startDate, endDate } = this.parseQueryDateRange(queryDto);

    const kData = (
      await this.indicatorService.findKData({
        code: queryDto.code,
        period: queryDto.period,
        startDate,
        endDate,
        source: queryDto.source,
      })
    ).map((k) => ({
      id: k.id,
      symbol: k.security.code,
      time: k.timestamp,
      open: k.open,
      high: k.high,
      low: k.low,
      close: k.close,
      volume: k.volume,
      amount: k.amount,
    }));
    const createBiDto: CreateBiDto = { k: kData };

    return this.chanService.getFenxings(createBiDto);
  }

  @Post('channel')
  @Throttle({ default: { limit: 20, ttl: 60000 } }) // 20 requests per minute for channel creation
  @ApiOperation({
    summary: 'Create Channels (Zhongshu)',
    description:
      'Identifies and creates channels (central regions) from Bi data. Returns a two-phase result: phaseA (all enumerated base channels) and phaseB (merged final channels).',
  })
  @ApiEnvelopeResponse({
    status: 200,
    description:
      'Returns an API envelope whose data contains the two-phase channel result { phaseA, phaseB }',
    type: ChannelTwoPhaseVo,
  })
  async postChannel(@Body() queryDto: IndicatorQueryDto) {
    const { startDate, endDate } = this.parseQueryDateRange(queryDto);

    const kData = (
      await this.indicatorService.findKData({
        code: queryDto.code,
        period: queryDto.period,
        startDate,
        endDate,
        source: queryDto.source,
      })
    ).map((k) => ({
      id: k.id,
      symbol: k.security.code,
      time: k.timestamp,
      open: k.open,
      high: k.high,
      low: k.low,
      close: k.close,
      volume: k.volume,
      amount: k.amount,
    }));
    const createBiDto: CreateBiDto = { k: kData };
    return this.chanService.createChannels(createBiDto);
  }
}
