import type { ChanK, ChanMergedK } from '../contracts';

export interface MergedKRangeStats {
  high: number;
  low: number;
  originIds: number[];
  originData: ChanK[];
  independentCount: number;
}

export const uniqueKById = (items: readonly ChanK[]): ChanK[] => {
  const seen = new Set<number>();
  return items.filter((item) => {
    if (seen.has(item.id)) {
      return false;
    }
    seen.add(item.id);
    return true;
  });
};

export const collectMergedKRange = (
  data: readonly ChanMergedK[],
  startIndex: number,
  endIndex: number,
): MergedKRangeStats => {
  const originIds: number[] = [];
  const originData: ChanK[] = [];
  let high = -Infinity;
  let low = Infinity;
  let independentCount = 0;

  for (const mergedK of data.slice(startIndex, endIndex + 1)) {
    high = Math.max(high, mergedK.high);
    low = Math.min(low, mergedK.low);
    originIds.push(...mergedK.mergedIds);
    originData.push(...mergedK.mergedData);
    independentCount += mergedK.mergedData.length;
  }

  return {
    high,
    low,
    originIds: Array.from(new Set(originIds)),
    originData: uniqueKById(originData),
    independentCount,
  };
};
