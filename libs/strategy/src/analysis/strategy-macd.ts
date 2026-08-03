import { MACD } from 'technicalindicators';
import type { StrategyBar } from '../market-data/strategy-bar';
import {
  requireExactStrategyBars,
  requireFiniteAnalysisValue,
} from './strategy-analysis.guard';

export const STRATEGY_MACD_CALCULATION_BAR_COUNT = 130;

export interface StrategyMacdObservation {
  readonly line: number;
  readonly signal: number;
  readonly histogram: number;
}

/** Calculate the latest MACD(12,26,9) observation from one exact seed window. */
export function calculateStrategyMacd(
  bars: readonly StrategyBar[],
): StrategyMacdObservation {
  requireExactStrategyBars(
    bars,
    STRATEGY_MACD_CALCULATION_BAR_COUNT,
    'MACD(12,26,9)',
  );

  const observations = MACD.calculate({
    values: bars.map((bar) => bar.close),
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
    SimpleMAOscillator: false,
    SimpleMASignal: false,
  });
  const latest = observations.at(-1);

  return {
    line: requireFiniteAnalysisValue(latest?.MACD, 'MACD(12,26,9) line'),
    signal: requireFiniteAnalysisValue(latest?.signal, 'MACD(12,26,9) signal'),
    histogram: requireFiniteAnalysisValue(
      latest?.histogram,
      'MACD(12,26,9) histogram',
    ),
  };
}
