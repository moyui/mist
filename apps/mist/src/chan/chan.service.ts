import { Injectable } from '@nestjs/common';
import { CreateBiDto } from './dto/create-bi.dto';
import { BiService } from './services/bi.service';
import { KMergeService } from './services/k-merge.service';

@Injectable()
export class ChanService {
  constructor(
    private readonly biService: BiService,
    private readonly kMergeService: KMergeService,
  ) {}

  // 画笔
  createBi(createBiDto: CreateBiDto) {
    // 首先进行合并k线操作
    const mergedK = this.kMergeService.merge(createBiDto.k);
    // 接下来进行画笔操作
    return this.biService.getBi(mergedK);
  }

  // 获取分型数据
  getFenxings(createBiDto: CreateBiDto) {
    // 首先进行合并k线操作
    const mergedK = this.kMergeService.merge(createBiDto.k);
    // 返回分型数据
    return this.biService.getFenxings(mergedK);
  }
}
