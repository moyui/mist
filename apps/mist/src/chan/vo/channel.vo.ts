import { ApiProperty } from '@nestjs/swagger';
import { BiVo } from './bi.vo';
import { TrendDirection } from '../enums/trend-direction.enum';
import {
  ChannelLevel,
  ChannelStatus,
  ChannelType,
} from '../enums/channel.enum';

export class ChannelVo {
  @ApiProperty({ type: () => [BiVo] })
  bis!: BiVo[];
  @ApiProperty()
  zg!: number; // 中枢上沿
  @ApiProperty()
  zd!: number; // 中枢下沿
  @ApiProperty()
  gg!: number; // 中枢最高
  @ApiProperty()
  dd!: number; // 中枢最低
  @ApiProperty({ enum: ChannelLevel })
  level!: ChannelLevel; // 中枢级别
  @ApiProperty({ enum: ChannelType })
  type!: ChannelType; // 中枢类型
  @ApiProperty({ enum: ChannelStatus })
  status!: ChannelStatus; // 中枢状态（Valid/Invalid，Phase B 用）
  @ApiProperty()
  startId!: number; // 起始的k线索引
  @ApiProperty()
  endId!: number; // 结束的k线索引
  @ApiProperty({ enum: TrendDirection })
  trend!: TrendDirection; // 趋势
  @ApiProperty()
  expanded!: boolean; // 中枢扩张合并产物标志（true=更高级别中枢）
  @ApiProperty()
  displayStartId!: number; // 第一笔的中间位置K线ID
  @ApiProperty()
  displayEndId!: number; // 最后一笔的中间位置K线ID
}

export class ChannelTwoPhaseVo {
  @ApiProperty({ type: () => [ChannelVo] })
  phaseA!: ChannelVo[];

  @ApiProperty({ type: () => [ChannelVo] })
  phaseB!: ChannelVo[];
}
