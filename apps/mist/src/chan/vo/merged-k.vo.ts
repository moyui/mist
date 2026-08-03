import { ApiProperty } from '@nestjs/swagger';
import { KVo } from '../../indicator/vo/k.vo';
import { TrendDirection } from '../enums/trend-direction.enum';
import type { ChanMergedK } from '../types/chan-analysis.types';

export class MergedKVo implements ChanMergedK {
  @ApiProperty({ type: String, format: 'date-time' })
  startTime!: Date;
  @ApiProperty({ type: String, format: 'date-time' })
  endTime!: Date;
  @ApiProperty()
  high!: number;
  @ApiProperty()
  low!: number;
  @ApiProperty({ enum: TrendDirection })
  trend!: TrendDirection;
  @ApiProperty()
  mergedCount!: number;
  @ApiProperty({ type: [Number] })
  mergedIds!: number[];
  @ApiProperty({ type: () => [KVo] })
  mergedData!: KVo[];
}
