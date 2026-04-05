import { Body, Controller, Post, UseFilters } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ChanService } from './chan.service';
import { CreateBiDto } from './dto/create-bi.dto';
import { CreateChannelDto } from './dto/create-channel.dto';
import { MergeKDto } from './dto/merge-k.dto';
import { IndicatorQueryDto } from '../indicator/dto/query/indicator-query.dto';
import { ChannelService } from './services/channel.service';
import { KMergeService } from './services/k-merge.service';
import { TimezoneService } from '@app/timezone';
import { IndicatorService } from '../indicator/indicator.service';
import { AllExceptionsFilter } from '../filters/all-exceptions.filter';

@ApiTags('chan')
@Controller('chan')
@UseFilters(AllExceptionsFilter)
export class ChanController {
  constructor(
    private readonly chanService: ChanService,
    private readonly kMergeService: KMergeService,
    private readonly channelService: ChannelService,
    private readonly indicatorService: IndicatorService,
    private readonly timezoneService: TimezoneService,
  ) {}

  @Post('merge-k')
  @Throttle({ default: { limit: 50, ttl: 60000 } }) // 50 requests per minute for K-line merge
  @ApiOperation({
    summary: 'Merge K-lines',
    description:
      'Merges K-lines based on containment relationships and trend direction',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns merged K-line data',
    type: [MergeKDto],
  })
  async postMergeK(@Body() queryDto: IndicatorQueryDto) {
    const startDate = this.timezoneService.parseDateString(queryDto.startDate);
    const endDate = this.timezoneService.parseDateString(queryDto.endDate);

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
      timestamp: k.timestamp.getTime(),
      open: k.open,
      highest: k.high,
      lowest: k.low,
      close: k.close,
      amount: k.amount,
    }));

    return this.kMergeService.merge(kData);
  }

  @Post('bi')
  @Throttle({ default: { limit: 30, ttl: 60000 } }) // 30 requests per minute for Bi creation
  @ApiOperation({
    summary: 'Create Bi (strokes)',
    description:
      'Identifies and creates Bi (strokes) from K-line data using Chan Theory',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns array of Bi data',
    type: [CreateBiDto],
  })
  async postIndexBi(@Body() queryDto: IndicatorQueryDto) {
    const startDate = this.timezoneService.parseDateString(queryDto.startDate);
    const endDate = this.timezoneService.parseDateString(queryDto.endDate);

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
      timestamp: k.timestamp.getTime(),
      open: k.open,
      highest: k.high,
      lowest: k.low,
      close: k.close,
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
  @ApiResponse({
    status: 200,
    description: 'Returns array of fenxing data',
  })
  async postFenxing(@Body() queryDto: IndicatorQueryDto) {
    const startDate = this.timezoneService.parseDateString(queryDto.startDate);
    const endDate = this.timezoneService.parseDateString(queryDto.endDate);

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
      timestamp: k.timestamp.getTime(),
      open: k.open,
      highest: k.high,
      lowest: k.low,
      close: k.close,
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
      'Identifies and creates channels (central regions) from Bi data',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns array of channel data',
    type: [CreateChannelDto],
  })
  async postChannel(@Body() queryDto: IndicatorQueryDto) {
    const startDate = this.timezoneService.parseDateString(queryDto.startDate);
    const endDate = this.timezoneService.parseDateString(queryDto.endDate);

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
      timestamp: k.timestamp.getTime(),
      open: k.open,
      highest: k.high,
      lowest: k.low,
      close: k.close,
      amount: k.amount,
    }));
    const createBiDto: CreateBiDto = { k: kData };
    const biData = await this.chanService.createBi(createBiDto);
    const createChannelDto: CreateChannelDto = { bi: biData };
    return this.channelService.createChannel(createChannelDto);
  }
}
