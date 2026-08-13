export enum TrendDirection {
  Up = 'up',
  Down = 'down',
  None = 'none',
}

export enum FenxingType {
  Top = 'top',
  Bottom = 'bottom',
  None = 'none',
}

export enum BiType {
  UnComplete = 'uncomplete',
  Complete = 'complete',
}

export enum BiStatus {
  Unknown = 0,
  Valid = 1,
  Invalid = 2,
}

export enum ChannelLevel {
  Bi = 'bi',
  Duan = 'duan',
}

export enum ChannelType {
  UnComplete = 'uncomplete',
  Complete = 'complete',
}

export enum ChannelStatus {
  Unknown = 0,
  Valid = 1,
  Invalid = 2,
}

export enum DuanType {
  UnComplete = 'uncomplete',
  Complete = 'complete',
}

export enum DuanStatus {
  Unknown = 0,
  Valid = 1,
  Invalid = 2,
}

export interface ChanK {
  readonly id: number;
  readonly symbol: string;
  readonly time: Date;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: string | null;
  readonly amount: string | null;
}

export interface ChanMergedK {
  readonly startTime: Date;
  readonly endTime: Date;
  readonly high: number;
  readonly low: number;
  readonly trend: TrendDirection;
  readonly mergedCount: number;
  readonly mergedIds: readonly number[];
  readonly mergedData: readonly ChanK[];
}

export interface ChanFenxing {
  readonly leftIds: readonly number[];
  readonly middleIds: readonly number[];
  readonly rightIds: readonly number[];
  readonly middleIndex: number;
  readonly middleOriginId: number;
  readonly type: FenxingType;
  readonly high: number;
  readonly low: number;
}

export interface ChanBi {
  readonly startTime: Date;
  readonly endTime: Date;
  readonly high: number;
  readonly low: number;
  readonly trend: TrendDirection;
  readonly type: BiType;
  readonly status: BiStatus;
  readonly independentCount: number;
  readonly originIds: readonly number[];
  readonly originData: readonly ChanK[];
  readonly startFenxing: ChanFenxing | null;
  readonly endFenxing: ChanFenxing | null;
}

export interface ChanBiTwoPhaseResult {
  readonly phaseA: readonly ChanBi[];
  readonly phaseB: readonly ChanBi[];
}

export interface ChanChannel {
  readonly bis: readonly ChanBi[];
  readonly zg: number;
  readonly zd: number;
  readonly gg: number;
  readonly dd: number;
  readonly level: ChannelLevel;
  readonly type: ChannelType;
  readonly status: ChannelStatus;
  readonly trend: TrendDirection;
  readonly startId: number;
  readonly endId: number;
  readonly displayStartId: number;
  readonly displayEndId: number;
}

export interface ChanChannelTwoPhaseResult {
  readonly phaseA: readonly ChanChannel[];
  readonly phaseB: readonly ChanChannel[];
}

/**
 * 段（Duan / 线段）—— 笔的上一层，与 ChanBi 同构。
 * 端点从分型（Fenxing）升为笔（Bi），构成单元从原始 K 升为笔。
 */
export interface ChanDuan {
  readonly startTime: Date;
  readonly endTime: Date;
  readonly high: number;
  readonly low: number;
  readonly trend: TrendDirection;
  readonly type: DuanType;
  readonly status: DuanStatus;
  readonly independentCount: number;
  readonly originIds: readonly number[];
  readonly originBis: readonly ChanBi[];
  readonly startBi: ChanBi | null;
  readonly endBi: ChanBi | null;
}

export interface ChanDuanTwoPhaseResult {
  readonly phaseA: readonly ChanDuan[];
  readonly phaseB: readonly ChanDuan[];
}
