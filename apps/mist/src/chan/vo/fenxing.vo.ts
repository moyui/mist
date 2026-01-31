import { FenxingType } from '../enums/fenxing.enum';

export class FenxingVo {
  // 这三个是实际的id，用于查询实际的数据
  leftIds: number[];
  middleIds: number[];
  rightIds: number[];

  // 中间的index
  middleIndex: number;
  // 最中间的未合并前的真实id
  middleOriginId: number;

  type: FenxingType;
  highest: number;
  lowest: number;
}

export class FenxingWithStateVo extends FenxingVo {
  leftValid: boolean; // 左侧的笔是否有效
  rightValid: boolean; // 右侧的笔是否有效
  erased: boolean; // 是否被完全擦除（两侧都无效）
}
