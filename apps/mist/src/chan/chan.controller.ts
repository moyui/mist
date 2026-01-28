import { Body, Controller, Post } from '@nestjs/common';
import { ChanService } from './chan.service';
import { MergeKDto } from './dto/merge-k.dto';
import { CreateBiDto } from './dto/create-bi.dto';

@Controller('chan')
export class ChanController {
  constructor(private readonly chanService: ChanService) {}

  @Post('merge-k')
  async postMergeK(@Body() mergeKDto: MergeKDto) {
    return this.chanService.mergeK(mergeKDto.k);
  }

  @Post('bi')
  async postIndexBi(@Body() createBiDto: CreateBiDto) {
    return this.chanService.createBi(createBiDto);
  }
}
