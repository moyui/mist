export type StrategyMarketSource = 'ef' | 'tdx' | 'qmt';
export type StrategyRealtimeSource = Exclude<StrategyMarketSource, 'ef'>;
export type StrategyBarType = 'complete' | 'incomplete';

/**
 * Runtime-neutral market fact consumed by shared strategy calculations.
 * Runtime adapters own source-unit normalization before constructing this type.
 */
export interface StrategyBar {
  readonly securityId: number;
  readonly source: StrategyMarketSource;
  readonly period: number;
  readonly timestamp: Date;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: string | null;
  readonly amount: string | null;
  readonly type: StrategyBarType;
}
