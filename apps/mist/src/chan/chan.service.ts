import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ChanCore } from '@app/chancore';
import { ERROR_MESSAGES } from '@app/constants';
import { CreateBiDto } from './dto/create-bi.dto';
import {
  toChanK,
  toLegacyBi,
  toLegacyChannel,
  toLegacyFenxing,
  toLegacyMergedK,
  type LegacyChanKInput,
} from './chan-core.mapper';

@Injectable()
export class ChanService {
  mergeK(data: readonly LegacyChanKInput[]) {
    return ChanCore.mergeK(data.map(toChanK)).map(toLegacyMergedK);
  }

  // 画笔
  createBi(createBiDto: CreateBiDto) {
    const result = ChanCore.createBi(createBiDto.k.map(toChanK));
    return {
      phaseA: result.phaseA.map(toLegacyBi),
      phaseB: result.phaseB.map(toLegacyBi),
    };
  }

  // 获取分型数据
  getFenxings(createBiDto: CreateBiDto) {
    return ChanCore.findFenxings(createBiDto.k.map(toChanK)).map(
      (fenxing) => toLegacyFenxing(fenxing)!,
    );
  }

  createChannels(createBiDto: CreateBiDto) {
    if (createBiDto.k.length === 0) {
      throw new HttpException(
        ERROR_MESSAGES.BI_ARRAY_EMPTY,
        HttpStatus.BAD_REQUEST,
      );
    }

    const result = ChanCore.createChannels(createBiDto.k.map(toChanK));
    return {
      phaseA: result.phaseA.map(toLegacyChannel),
      phaseB: result.phaseB.map(toLegacyChannel),
    };
  }

  analyze(createBiDto: CreateBiDto) {
    return {
      bis: this.createBi(createBiDto),
      fenxings: this.getFenxings(createBiDto),
    };
  }
}
