import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ChanService } from './chan.service';
import { CreateBiDto } from './dto/create-bi.dto';
import { CreateChannelDto } from './dto/create-channel.dto';
import { MergeKDto } from './dto/merge-k.dto';
import { ChannelService } from './services/channel.service';
import { KMergeService } from './services/k-merge.service';

@ApiTags('chan')
@Controller('chan')
export class ChanController {
  constructor(
    private readonly chanService: ChanService,
    private readonly kMergeService: KMergeService,
    private readonly channelService: ChannelService,
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
  async postMergeK(@Body() mergeKDto: MergeKDto) {
    return this.kMergeService.merge(mergeKDto.k);
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
  async postIndexBi(@Body() createBiDto: CreateBiDto) {
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
  async postFenxing(@Body() createBiDto: CreateBiDto) {
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
  async postChannel(@Body() createChannelDto: CreateChannelDto) {
    return this.channelService.createChannel(createChannelDto);
  }
}
