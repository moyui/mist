import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ChanCore } from '@app/chancore';
import { ERROR_MESSAGES } from '@app/constants';
import { CreateBiDto } from './dto/create-bi.dto';
import {
  toBiVo,
  toChanK,
  toChannelVo,
  toDuanVo,
  toFenxingVo,
  toMergedKVo,
  type ChanKSource,
} from './chan-core.mapper';

@Injectable()
export class ChanService {
  mergeK(data: readonly ChanKSource[]) {
    return ChanCore.mergeK(data.map(toChanK)).map(toMergedKVo);
  }

  // 画笔
  createBi(createBiDto: CreateBiDto) {
    const result = ChanCore.createBi(createBiDto.k.map(toChanK));
    return {
      phaseA: result.phaseA.map(toBiVo),
      phaseB: result.phaseB.map(toBiVo),
    };
  }

  // 获取分型数据
  getFenxings(createBiDto: CreateBiDto) {
    return ChanCore.findFenxings(createBiDto.k.map(toChanK)).map(
      (fenxing) => toFenxingVo(fenxing)!,
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
      phaseA: result.phaseA.map(toChannelVo),
      phaseB: result.phaseB.map(toChannelVo),
    };
  }

  // 画段（线段，特征序列法；入参 = createBi 返回值的 phaseB ChanBi[]，返回确认后的段数组）
  createDuan(createBiDto: CreateBiDto) {
    const bis = ChanCore.createBi(createBiDto.k.map(toChanK));
    return ChanCore.createDuan(bis.phaseB).map(toDuanVo);
  }

  analyze(createBiDto: CreateBiDto) {
    return {
      bis: this.createBi(createBiDto),
      fenxings: this.getFenxings(createBiDto),
    };
  }
}
