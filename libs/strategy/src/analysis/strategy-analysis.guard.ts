import type { StrategyBar } from '../market-data/strategy-bar';

export function requireExactStrategyBars(
  bars: readonly StrategyBar[],
  expectedCount: number,
  analysisName: string,
): void {
  if (bars.length !== expectedCount) {
    throw new RangeError(
      `${analysisName} requires exactly ${expectedCount} ordered bars`,
    );
  }

  let previousTimestamp = Number.NEGATIVE_INFINITY;
  for (const bar of bars) {
    const timestamp = bar.timestamp.getTime();
    if (!Number.isFinite(timestamp) || timestamp <= previousTimestamp) {
      throw new TypeError(
        `${analysisName} bars must have finite strictly increasing timestamps`,
      );
    }
    previousTimestamp = timestamp;

    for (const value of [bar.open, bar.high, bar.low, bar.close]) {
      if (!Number.isFinite(value) || value < 0) {
        throw new TypeError(
          `${analysisName} prices must be finite and non-negative`,
        );
      }
    }
    if (bar.low > bar.high) {
      throw new TypeError(`${analysisName} bar low must not exceed high`);
    }
  }
}

export function requireFiniteAnalysisValue(
  value: unknown,
  analysisName: string,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${analysisName} did not produce a finite observation`);
  }
  return value;
}
