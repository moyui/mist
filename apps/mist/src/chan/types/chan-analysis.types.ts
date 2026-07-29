import type { KVo } from '../../indicator/vo/k.vo';
import type { BiStatus, BiType } from '../enums/bi.enum';
import type { FenxingType } from '../enums/fenxing.enum';
import type { TrendDirection } from '../enums/trend-direction.enum';

export interface ChanMergedK {
  startTime: Date;
  endTime: Date;
  highest: number;
  lowest: number;
  trend: TrendDirection;
  mergedCount: number;
  mergedIds: number[];
  mergedData: KVo[];
}

export interface ChanFenxing {
  leftIds: number[];
  middleIds: number[];
  rightIds: number[];
  middleIndex: number;
  middleOriginId: number;
  type: FenxingType;
  highest: number;
  lowest: number;
}

export interface ChanBi {
  startTime: Date;
  endTime: Date;
  highest: number;
  lowest: number;
  trend: TrendDirection;
  type: BiType;
  status: BiStatus;
  independentCount: number;
  originIds: number[];
  originData: KVo[];
  startFenxing: ChanFenxing | null;
  endFenxing: ChanFenxing | null;
}

export interface ChanBiTwoPhaseResult {
  phaseA: ChanBi[];
  phaseB: ChanBi[];
}
