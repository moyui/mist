import type { StrategyBar } from '../market-data/strategy-bar';
import { computeMacdObservation } from '@app/indicators';
import type { MacdObservation } from '@app/indicators';
import { requireExactStrategyBars } from './strategy-analysis.guard';

export const STRATEGY_MACD_CALCULATION_BAR_COUNT = 130;

export type StrategyMacdObservation = MacdObservation;

/**
 * Calculate the latest MACD(12,26,9) observation from one exact seed window.
 * The math is delegated to the shared indicator core (@app/indicators); the exact-window
 * validation stays here so the window-count/`requiredBarCount` contract never drifts.
 */
export function calculateStrategyMacd(
  bars: readonly StrategyBar[],
): StrategyMacdObservation {
  requireExactStrategyBars(
    bars,
    STRATEGY_MACD_CALCULATION_BAR_COUNT,
    'MACD(12,26,9)',
  );

  return computeMacdObservation(
    bars.map((bar) => bar.close),
    { windowSize: STRATEGY_MACD_CALCULATION_BAR_COUNT },
  );
}
