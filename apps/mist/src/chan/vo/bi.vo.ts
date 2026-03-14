import { KVo } from '../../indicator/vo/k.vo';
import { BiType, BiStatus } from '../enums/bi.enum';
import { TrendDirection } from '../enums/trend-direction.enum';
import { FenxingVo } from './fenxing.vo';

export class BiVo {
  startTime!: Date;
  endTime!: Date;
  highest!: number;
  lowest!: number;
  trend!: TrendDirection;
  type!: BiType;
  status!: BiStatus; // 笔的状态
  independentCount!: number; // 独立k线数量
  originIds!: number[];
  originData!: KVo[];
  startFenxing: FenxingVo | null = null;
  endFenxing: FenxingVo | null = null;
}
