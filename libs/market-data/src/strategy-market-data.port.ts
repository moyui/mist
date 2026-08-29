import type {
  StrategyBar,
  StrategyMarketSource,
  StrategyRealtimeSource,
} from './strategy-bar';

export interface StrategyReplayPageCriteria {
  readonly securityId: number;
  readonly source: StrategyMarketSource;
  readonly period: number;
  readonly startAt: Date;
  readonly endAt: Date;
  readonly afterTimestamp?: Date;
}

export interface StrategyReplayPage {
  readonly bars: readonly StrategyBar[];
  readonly nextAfterTimestamp: Date | null;
}

export interface StrategyRealtimeWindowCriteria {
  readonly securityId: number;
  readonly source: StrategyRealtimeSource;
  readonly period: number;
  readonly anchorAt: Date;
  readonly requiredBars: number;
}

export interface StrategyRealtimeWindow {
  readonly bars: readonly StrategyBar[];
}

/**
 * Decoded internal wake-up reference. Queue serialization/versioning belongs
 * to the realtime runtime boundary, not this domain interface.
 */
export interface StrategyTrigger {
  readonly securityId: number;
  readonly source: StrategyRealtimeSource;
  readonly period: 1;
  readonly timestamp: Date;
  readonly outcome: 'sealed' | 'discarded';
}

export type StrategyMarketObservation =
  | {
      readonly outcome: 'sealed';
      readonly bar: StrategyBar;
    }
  | {
      readonly outcome: 'discarded';
      readonly securityId: number;
      readonly source: StrategyRealtimeSource;
      readonly period: 1;
      readonly timestamp: Date;
    };

export interface StrategyReplayWindowCriteria {
  readonly securityId: number;
  readonly source: StrategyRealtimeSource;
  readonly period: number;
  /** Exclusive upper bound: only bars strictly before this timestamp are returned. */
  readonly endAt: Date;
  readonly requiredBars: number;
}

export interface StrategyReplayWindow {
  readonly bars: readonly StrategyBar[];
}

export interface StrategyReplayMarketDataPort {
  readReplayPage(
    criteria: StrategyReplayPageCriteria,
  ): Promise<StrategyReplayPage>;

  loadReplayWindow(
    criteria: StrategyReplayWindowCriteria,
  ): Promise<StrategyReplayWindow>;
}

export interface StrategyRealtimeMarketDataPort {
  loadRealtimeWindow(
    criteria: StrategyRealtimeWindowCriteria,
  ): Promise<StrategyRealtimeWindow>;

  resolveRealtimeObservation(
    trigger: StrategyTrigger,
  ): Promise<StrategyMarketObservation>;
}

/**
 * Complete strategy market-data capability. Runtime applications depend only
 * on the replay or realtime sub-port they actually implement.
 */
export interface StrategyMarketDataPort
  extends StrategyReplayMarketDataPort,
    StrategyRealtimeMarketDataPort {}
