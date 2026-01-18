import { KVo } from '../../indicator/vo/k.vo';
import { TrendDirection } from '../enums/trend-direction.enum';

export class MergedKVo {
  startTime: Date;
  endTime: Date;
  highest: number;
  lowest: number;
  trend: TrendDirection;
  mergedCount: number;
  mergedIds: number[];
  mergedData: KVo[];
}
