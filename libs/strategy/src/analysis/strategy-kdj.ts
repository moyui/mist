import { SMA, Stochastic } from 'technicalindicators';
import type { StrategyBar } from '../market-data/strategy-bar';
import {
  requireExactStrategyBars,
  requireFiniteAnalysisValue,
} from './strategy-analysis.guard';

export const STRATEGY_KDJ_CALCULATION_BAR_COUNT = 13;

export interface StrategyKdjObservation {
  readonly k: number;
  readonly d: number;
  readonly j: number;
}

/** Calculate the latest KDJ(9,3,3) observation from one exact seed window. */
export function calculateStrategyKdj(
  bars: readonly StrategyBar[],
): StrategyKdjObservation {
  requireExactStrategyBars(
    bars,
    STRATEGY_KDJ_CALCULATION_BAR_COUNT,
    'KDJ(9,3,3)',
  );

  const stochastic = Stochastic.calculate({
    high: bars.map((bar) => bar.high),
    low: bars.map((bar) => bar.low),
    close: bars.map((bar) => bar.close),
    period: 9,
    signalPeriod: 3,
  });
  const slowK = stochastic
    .map((value) => value.d)
    .filter((value): value is number => Number.isFinite(value));
  const smoothedD = SMA.calculate({ values: slowK, period: 3 });
  const k = requireFiniteAnalysisValue(slowK.at(-1), 'KDJ(9,3,3) K');
  const d = requireFiniteAnalysisValue(smoothedD.at(-1), 'KDJ(9,3,3) D');
  const j = requireFiniteAnalysisValue(3 * k - 2 * d, 'KDJ(9,3,3) J');

  return { k, d, j };
}
