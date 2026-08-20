import { ApiProperty } from '@nestjs/swagger';
import { DuanVo } from './duan.vo';
import {
  ChannelLevel,
  ChannelStatus,
  ChannelType,
} from '../enums/channel.enum';
import type {
  ChanDuanChannel,
  ChanDuanChannelTwoPhaseResult,
} from '../types/chan-analysis.types';

export class DuanChannelVo implements ChanDuanChannel {
  @ApiProperty({ type: () => [DuanVo] })
  duans!: DuanVo[]; // 构成中枢的段
  @ApiProperty()
  zg!: number; // 中枢上沿
  @ApiProperty()
  zd!: number; // 中枢下沿
  @ApiProperty()
  gg!: number; // 中枢最高
  @ApiProperty()
  dd!: number; // 中枢最低
  @ApiProperty({ enum: ChannelLevel })
  level!: ChannelLevel; // 中枢级别（段级 = Duan）
  @ApiProperty({ enum: ChannelType })
  type!: ChannelType;
  @ApiProperty({ enum: ChannelStatus })
  status!: ChannelStatus;
  @ApiProperty()
  expanded!: boolean; // 中枢扩张合并产物标志（true=更高级别中枢）
  @ApiProperty()
  startId!: number;
  @ApiProperty()
  endId!: number;
  @ApiProperty()
  displayStartId!: number;
  @ApiProperty()
  displayEndId!: number;
}

export class DuanChannelTwoPhaseVo implements ChanDuanChannelTwoPhaseResult {
  @ApiProperty({ type: () => [DuanChannelVo] })
  phaseA!: DuanChannelVo[];

  @ApiProperty({ type: () => [DuanChannelVo] })
  phaseB!: DuanChannelVo[];
}
