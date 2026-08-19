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
