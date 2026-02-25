import { Body, Controller, Post } from '@nestjs/common';
import { ChanService } from './chan.service';
import { CreateBiDto } from './dto/create-bi.dto';
import { CreateChannelDto } from './dto/create-channel.dto';
import { MergeKDto } from './dto/merge-k.dto';
import { ChannelService } from './services/channel.service';
import { KMergeService } from './services/k-merge.service';

@Controller('chan')
export class ChanController {
  constructor(
    private readonly chanService: ChanService,
    private readonly kMergeService: KMergeService,
    private readonly channelService: ChannelService,
  ) {}

  @Post('merge-k')
  async postMergeK(@Body() mergeKDto: MergeKDto) {
    return this.kMergeService.merge(mergeKDto.k);
  }

  @Post('bi')
  async postIndexBi(@Body() createBiDto: CreateBiDto) {
    return this.chanService.createBi(createBiDto);
  }

  @Post('channel')
  async postChannel(@Body() createChannelDto: CreateChannelDto) {
    return this.channelService.createChannel(createChannelDto);
  }
}
