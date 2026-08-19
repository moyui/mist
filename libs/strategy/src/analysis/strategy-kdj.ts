import type { StrategyBar } from '../market-data/strategy-bar';
import { computeKdjObservation } from '@app/indicators';
import type { KdjObservation } from '@app/indicators';
import { requireExactStrategyBars } from './strategy-analysis.guard';

export const STRATEGY_KDJ_CALCULATION_BAR_COUNT = 13;

export type StrategyKdjObservation = KdjObservation;

/**
 * Calculate the latest KDJ(9,3,3) observation from one exact seed window.
 * The math is delegated to the shared indicator core (@app/indicators); the exact-window
 * validation stays here so the window-count/`requiredBarCount` contract never drifts.
 */
export function calculateStrategyKdj(
  bars: readonly StrategyBar[],
): StrategyKdjObservation {
  requireExactStrategyBars(
    bars,
    STRATEGY_KDJ_CALCULATION_BAR_COUNT,
    'KDJ(9,3,3)',
  );

  return computeKdjObservation(
    bars.map((bar) => bar.high),
    bars.map((bar) => bar.low),
    bars.map((bar) => bar.close),
    { windowSize: STRATEGY_KDJ_CALCULATION_BAR_COUNT },
  );
}
