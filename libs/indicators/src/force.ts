/**
 * Unit force aggregation for Chan divergence momentum (背驰力度).
 *
 * `histogram` is produced by `computeMacdSeries(closes).histogram` and aligns to the original K
 * series such that `histogram[i - begIndex]` corresponds to `kTimes[i]` for `i >= begIndex`.
 */
export function computeUnitForces(
  histogram: readonly number[],
  begIndex: number,
  kTimes: readonly Date[],
  units: readonly { startTime: Date; endTime: Date }[],
): number[] {
  return units.map((unit) => {
    const start = binaryLowerBound(kTimes, unit.startTime);
    const end = binaryUpperBound(kTimes, unit.endTime);

    let sum = 0;
    for (let i = start; i < end; i++) {
      const histogramIndex = i - begIndex;
      if (histogramIndex >= 0 && histogramIndex < histogram.length) {
        sum += histogram[histogramIndex];
      }
    }
    return sum;
  });
}

/**
 * Unit directional histogram area per Chan lesson 24 ("向上的看红柱子，向下看绿柱子"):
 * only bars of the same direction as the unit count as its force — an up unit sums its red bars
 * (`max(histogram, 0)`), a down unit sums its green bars (`max(-histogram, 0)`), both as a positive
 * "stronger is larger" scalar. This differs from {@link computeUnitForces} (signed sum), which would
 * rank a weaker down move as numerically smaller and mis-detect divergence.
 */
export function computeUnitDirectionalAreas(
  histogram: readonly number[],
  begIndex: number,
  kTimes: readonly Date[],
  units: readonly { startTime: Date; endTime: Date }[],
  directions: readonly ('up' | 'down')[],
): number[] {
  return units.map((unit, unitIndex) => {
    const start = binaryLowerBound(kTimes, unit.startTime);
    const end = binaryUpperBound(kTimes, unit.endTime);
    const isUp = directions[unitIndex] === 'up';

    let sum = 0;
    for (let i = start; i < end; i++) {
      const histogramIndex = i - begIndex;
      if (histogramIndex >= 0 && histogramIndex < histogram.length) {
        const bar = histogram[histogramIndex];
        if (isUp ? bar > 0 : bar < 0) {
          sum += isUp ? bar : -bar;
        }
      }
    }
    return sum;
  });
}

/** Per-unit DIF (yellow-white line) extremes over the unit interval. */
export interface UnitLinePeaks {
  readonly max: number; // highest DIF value in the interval
  readonly min: number; // lowest DIF value in the interval
}

/**
 * Per-unit DIF extremes (`computeMacdSeries(closes).macd`), same alignment as
 * {@link computeUnitForces}. The function does not resolve direction: a caller picks the extreme for
 * the unit direction and takes its absolute value (`up → |max|`, `down → |min|`) — in a divergence
 * setup the compared A/C units are same-direction, so their DIF extremes sit on the same side of the
 * zero axis and absolute values are directly comparable ("does not make a new high / low").
 */
export function computeUnitLinePeaks(
  dif: readonly number[],
  begIndex: number,
  kTimes: readonly Date[],
  units: readonly { startTime: Date; endTime: Date }[],
): UnitLinePeaks[] {
  return units.map((unit) => {
    const start = binaryLowerBound(kTimes, unit.startTime);
    const end = binaryUpperBound(kTimes, unit.endTime);

    let max: number | null = null;
    let min: number | null = null;
    for (let i = start; i < end; i++) {
      const difIndex = i - begIndex;
      if (difIndex >= 0 && difIndex < dif.length) {
        const value = dif[difIndex];
        if (max === null || value > max) max = value;
        if (min === null || value < min) min = value;
      }
    }
    return { max: max ?? 0, min: min ?? 0 };
  });
}

/** First index whose time is >= target (binary search). */
function binaryLowerBound(times: readonly Date[], target: Date): number {
  let low = 0;
  let high = times.length;
  const targetMs = target.getTime();
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (times[mid].getTime() < targetMs) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  return low;
}

/** First index whose time is > target (binary search). */
function binaryUpperBound(times: readonly Date[], target: Date): number {
  let low = 0;
  let high = times.length;
  const targetMs = target.getTime();
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (times[mid].getTime() <= targetMs) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  return low;
}
