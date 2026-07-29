import { ApiProperty } from '@nestjs/swagger';
import { FenxingType } from '../enums/fenxing.enum';
import type { ChanFenxing } from '../types/chan-analysis.types';

export class FenxingVo implements ChanFenxing {
  // 这三个是实际的id，用于查询实际的数据
  @ApiProperty({ type: [Number] })
  leftIds!: number[];
  @ApiProperty({ type: [Number] })
  middleIds!: number[];
  @ApiProperty({ type: [Number] })
  rightIds!: number[];

  // 中间的index
  @ApiProperty()
  middleIndex!: number;
  // 最中间的未合并前的真实id
  @ApiProperty()
  middleOriginId!: number;

  @ApiProperty({ enum: FenxingType })
  type!: FenxingType;
  @ApiProperty()
  highest!: number;
  @ApiProperty()
  lowest!: number;
}
