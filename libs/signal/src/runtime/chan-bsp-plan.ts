/**
 * Compiled plan for a `kind='chan_bsp'` strategy definition.
 *
 * Owned by `@app/signal` (the runtime contract consumed by the evaluation
 * service); the registry in `apps/signal` compiles a chan_bsp rule into this
 * shape, and `RealtimeStrategyEvaluationService` dispatches on it. The
 * detector-specific types (events, window budget) stay in `apps/signal`.
 */

export type ChanBspUnitLevel = 'bi' | 'duan';

export type ChanBspDirection = 'buy' | 'sell' | 'both';

export interface ChanBspPointSelection {
  readonly first: boolean;
  readonly second: boolean;
  readonly third: boolean;
}

export interface ChanBspPlan {
  readonly units: ChanBspUnitLevel;
  readonly points: ChanBspPointSelection;
  readonly direction: ChanBspDirection;
  /**
   * Window data budget for the configured level: the number of bars the
   * engine loads so the Chan structure (trend chains of two or more
   * same-direction channels) can form. A data budget, NOT a decision
   * threshold — whether any point is confirmed is decided entirely by the
   * Chan structure.
   */
  readonly requiredBarCount: number;
}
