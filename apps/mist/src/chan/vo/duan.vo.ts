import { ApiProperty } from '@nestjs/swagger';
import { BiVo } from './bi.vo';
import { DuanStatus, DuanType } from '../enums/duan.enum';
import { TrendDirection } from '../enums/trend-direction.enum';
import type {
  ChanDuan,
  ChanDuanTwoPhaseResult,
} from '../types/chan-analysis.types';

export class DuanVo implements ChanDuan {
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
  @ApiProperty({ enum: DuanType })
  type!: DuanType;
  @ApiProperty({ enum: DuanStatus })
  status!: DuanStatus;
  @ApiProperty()
  independentCount!: number; // 段覆盖独立 K 数
  @ApiProperty({ type: [Number] })
  originIds!: number[];
  @ApiProperty({ type: () => [BiVo] })
  originBis!: BiVo[]; // 构成段的笔
  @ApiProperty({ type: () => BiVo, nullable: true })
  startBi: BiVo | null = null;
  @ApiProperty({ type: () => BiVo, nullable: true })
  endBi: BiVo | null = null;
}

export class DuanTwoPhaseVo implements ChanDuanTwoPhaseResult {
  @ApiProperty({ type: () => [DuanVo] })
  phaseA!: DuanVo[];

  @ApiProperty({ type: () => [DuanVo] })
  phaseB!: DuanVo[];
}
