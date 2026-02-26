import { KVo } from '../../indicator/vo/k.vo';
import { TrendDirection } from '../enums/trend-direction.enum';
import { BiType } from '../enums/bi.enum';
import { FenxingVo } from './fenxing.vo';

export class BiVo {
  startTime: Date;
  endTime: Date;
  highest: number;
  lowest: number;
  trend: TrendDirection;
  type: BiType;
  independentCount: number; // 独立k线数量
  originIds: number[];
  originData: KVo[];
  startFenxing: FenxingVo | null;
  endFenxing: FenxingVo | null;
}
