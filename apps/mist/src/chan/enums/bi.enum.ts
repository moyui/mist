export enum BiType {
  UnComplete = 'uncomplete',
  Complete = 'complete',
}

export enum BiStatus {
  Unknown = 0, // 未知状态（初始默认值）
  Valid = 1, // 有效笔（满足所有条件）
  Invalid = 2, // 无效笔（不满足条件）
}
