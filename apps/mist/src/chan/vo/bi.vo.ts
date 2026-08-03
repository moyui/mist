import { ApiProperty } from '@nestjs/swagger';
import { KVo } from '../../indicator/vo/k.vo';
import { BiType, BiStatus } from '../enums/bi.enum';
import { TrendDirection } from '../enums/trend-direction.enum';
import type {
  ChanBi,
  ChanBiTwoPhaseResult,
} from '../types/chan-analysis.types';
import { FenxingVo } from './fenxing.vo';

export class BiVo implements ChanBi {
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
  @ApiProperty({ enum: BiType })
  type!: BiType;
  @ApiProperty({ enum: BiStatus })
  status!: BiStatus; // 笔的状态
  @ApiProperty()
  independentCount!: number; // 独立k线数量
  @ApiProperty({ type: [Number] })
  originIds!: number[];
  @ApiProperty({ type: () => [KVo] })
  originData!: KVo[];
  @ApiProperty({ type: () => FenxingVo, nullable: true })
  startFenxing: FenxingVo | null = null;
  @ApiProperty({ type: () => FenxingVo, nullable: true })
  endFenxing: FenxingVo | null = null;
}

export class BiTwoPhaseVo implements ChanBiTwoPhaseResult {
  @ApiProperty({ type: () => [BiVo] })
  phaseA!: BiVo[];

  @ApiProperty({ type: () => [BiVo] })
  phaseB!: BiVo[];
}
