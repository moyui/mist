import { Body, Controller, Post } from '@nestjs/common';
import { ChanService } from './chan.service';
import { CreateBiDto } from './dto/create-bi.dto';
import { MergeKDto } from './dto/merge-k.dto';
import { KMergeService } from './services/k-merge.service';

@Controller('chan')
export class ChanController {
  constructor(
    private readonly chanService: ChanService,
    private readonly kMergeService: KMergeService,
  ) {}

  @Post('merge-k')
  async postMergeK(@Body() mergeKDto: MergeKDto) {
    debugger;
    return this.kMergeService.merge(mergeKDto.k);
  }

  @Post('bi')
  async postIndexBi(@Body() createBiDto: CreateBiDto) {
    return this.chanService.createBi(createBiDto);
  }
}
