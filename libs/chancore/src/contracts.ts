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
  readonly expanded: boolean; // 中枢扩张合并产物=true；普通同级中枢=false
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

/**
 * 段级中枢（Duan-level Channel）—— 以段为构成单元的中枢，镜像 ChanChannel。
 * 中枢是"至少三个连续次级别走势类型所重叠的部分"（缠论原典17课）：无方向（无 trend）、
 * 几何为对称重叠（zg=min 段高点、zd=max 段低点、gg/dd 极值）。
 */
export interface ChanDuanChannel {
  readonly duans: readonly ChanDuan[]; // 构成中枢的段（枚举窗口/延伸后）
  readonly zg: number; // 中枢上沿 = min(duans 高点)
  readonly zd: number; // 中枢下沿 = max(duans 低点)
  readonly gg: number; // 中枢最高 = max(duans 高点)
  readonly dd: number; // 中枢最低 = min(duans 低点)
  readonly level: ChannelLevel; // = ChannelLevel.Duan（接线）
  readonly type: ChannelType;
  readonly status: ChannelStatus;
  readonly expanded: boolean; // 中枢扩张合并产物=true；普通同级中枢=false
  readonly startId: number; // 原始 K id（首段起点）
  readonly endId: number; // 原始 K id（末段终点）
  readonly displayStartId: number; // 首段中间位置原始 K id
  readonly displayEndId: number; // 末段中间位置原始 K id
}

export interface ChanDuanChannelTwoPhaseResult {
  readonly phaseA: readonly ChanDuanChannel[];
  readonly phaseB: readonly ChanDuanChannel[];
}

// ---------------------------------------------------------------------------
// 背驰（Divergence，缠论24/25课）— 共享纯函数，笔级/段级复用。
// 力度（forces）由调用方经 @app/indicators 计算传入；chancore 不计算指标。
// ---------------------------------------------------------------------------

export enum ChanDivergenceType {
  Trend = 'trend', // 趋势背驰（24课标准背驰）
  Consolidation = 'consolidation', // 盘整背驰
}

/** 背驰单元（笔或段皆可，最小结构接口）。 */
export interface ChanDivergenceUnit {
  readonly startTime: Date;
  readonly endTime: Date;
  readonly trend: TrendDirection;
}

/**
 * 背驰中枢（笔级 ChanChannel 或段级 ChanDuanChannel 皆可）——最小结构接口。
 * 中枢扩张已由 chan-central-extension（Phase C）解决：phaseB 相邻中枢波动区间严格不重叠；
 * 扩张合并产物（expanded=true）为同级别中枢，背驰不读 expanded、当普通中枢看待。
 */
export interface ChanDivergenceZhongshu {
  readonly firstUnitTime: Date; // 中枢首单元起点（≡ units[0].startTime）
  readonly lastUnitTime: Date; // 中枢末单元终点（≡ units.at(-1).endTime）
  readonly zg: number; // 中枢上沿
  readonly zd: number; // 中枢下沿
  readonly gg: number; // 中枢最高（位置递进用）
  readonly dd: number; // 中枢最低
}

/** 每单元力度（双分量，均为"越大越强"正向标量）：area=方向柱面积、peak=黄白线(DIF)极值绝对值。 */
export interface ChanUnitForce {
  readonly area: number;
  readonly peak: number;
}

/** 背驰判定入参：units 与 forces 按索引一一对齐。 */
export interface ChanDivergenceInput {
  readonly units: readonly ChanDivergenceUnit[];
  readonly zhongshus: readonly ChanDivergenceZhongshu[];
  readonly forces: readonly ChanUnitForce[];
}

export interface ChanDivergence {
  readonly type: ChanDivergenceType;
  readonly zhongshuIndex: number; // 相关中枢在 zhongshus 中的位置
  readonly enterIndex: number; // 进入段在 units 中的位置
  readonly leaveIndex: number; // 离开段在 units 中的位置
  readonly enterForce: ChanUnitForce;
  readonly leaveForce: ChanUnitForce;
}
