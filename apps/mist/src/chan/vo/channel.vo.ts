import { BiVo } from './bi.vo';
import { TrendDirection } from '../enums/trend-direction.enum';
import { ChannelLevel, ChannelType } from '../enums/channel.enum';

export class ChannelVo {
  id: number;
  bis: BiVo[];
  zg: number; // 中枢上沿
  zd: number; // 中枢下沿
  gg: number; // 中枢最高
  dd: number; // 中枢最低
  level: ChannelLevel; // 中枢级别
  type: ChannelType; // 中枢类型
  startId: number; // 起始的k线索引
  endId: number; // 结束的k线索引
  trend: TrendDirection; // 趋势
}
