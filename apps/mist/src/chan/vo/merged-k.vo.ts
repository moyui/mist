import { KVo } from '../../indicator/vo/k.vo';
import { TrendDirection } from '../enums/trend-direction.enum';
import type { ChanMergedK } from '../types/chan-analysis.types';

export class MergedKVo implements ChanMergedK {
  startTime!: Date;
  endTime!: Date;
  highest!: number;
  lowest!: number;
  trend!: TrendDirection;
  mergedCount!: number;
  mergedIds!: number[];
  mergedData!: KVo[];
}
