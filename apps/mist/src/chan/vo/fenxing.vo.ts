import { FenxingType } from '../enums/fenxing.enum';

export class FenxingVo {
  // 这三个是实际的id，用于查询实际的数据
  leftIds: number[];
  middleIds: number[];
  rightIds: number[];

  // 这三个是mergedK的index
  leftIndex: number;
  middleIndex: number;
  rightIndex: number;

  // 最中间的未合并前的真实id
  middleOriginId: number;

  type: FenxingType;
  highest: number;
  lowest: number;
}
