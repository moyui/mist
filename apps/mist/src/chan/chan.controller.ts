import {
  Body,
  Controller,
  Post,
  UseInterceptors,
  UseFilters,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { subDays } from 'date-fns';
import { ChanService } from './chan.service';
import { CreateBiDto } from './dto/create-bi.dto';
import { CreateChannelDto } from './dto/create-channel.dto';
import { MergeKDto } from './dto/merge-k.dto';
import { ChanQueryDto } from './dto/query/chan-query.dto';
import { ChannelService } from './services/channel.service';
import { KMergeService } from './services/k-merge.service';
import { IndicatorService } from '../indicator/indicator.service';
import { PeriodMappingService } from '@app/utils';
import { TimezoneService } from '@app/timezone';
import { KVo } from '../indicator/vo/k.vo';
import { TransformInterceptor } from '../interceptors/transform.interceptor';
import { AllExceptionsFilter } from '../filters/all-exceptions.filter';

@ApiTags('chan')
@Controller('chan')
@UseInterceptors(TransformInterceptor)
@UseFilters(AllExceptionsFilter)
export class ChanController {
  constructor(
    private readonly chanService: ChanService,
    private readonly kMergeService: KMergeService,
    private readonly channelService: ChannelService,
    private readonly indicatorService: IndicatorService,
    private readonly periodMappingService: PeriodMappingService,
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
  async postMergeK(@Body() chanQueryDto: ChanQueryDto) {
    const kData = await this.fetchKData(chanQueryDto);
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
  async postIndexBi(@Body() chanQueryDto: ChanQueryDto) {
    const kData = await this.fetchKData(chanQueryDto);
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
  async postFenxing(@Body() chanQueryDto: ChanQueryDto) {
    const kData = await this.fetchKData(chanQueryDto);
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
  async postChannel(@Body() chanQueryDto: ChanQueryDto) {
    const kData = await this.fetchKData(chanQueryDto);
    const createBiDto: CreateBiDto = { k: kData };
    const biData = await this.chanService.createBi(createBiDto);
    const createChannelDto: CreateChannelDto = { bi: biData };
    return this.channelService.createChannel(createChannelDto);
  }

  /**
   * Helper method to fetch K-line data using ChanQueryDto parameters
   */
  private async fetchKData(chanQueryDto: ChanQueryDto): Promise<KVo[]> {
    // Parse date strings to Date objects
    const now = this.timezoneService.getCurrentBeijingTime();
    const startDate = chanQueryDto.startDate
      ? new Date(chanQueryDto.startDate)
      : subDays(now, 30); // Default: 30 days ago
    const endDate = chanQueryDto.endDate ? new Date(chanQueryDto.endDate) : now;

    // Fetch K-line data using IndicatorService
    const kEntities = await this.indicatorService.findKData({
      symbol: chanQueryDto.symbol,
      period: chanQueryDto.period,
      startDate,
      endDate,
      source: chanQueryDto.source,
    });

    // Convert K entities to KVo format
    return kEntities.map((k) => ({
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
  }
}
