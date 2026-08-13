import type { ChanBi } from '../contracts';

/**
 * 保序去重：保留每个 id 首次出现的位置顺序（同 {@link uniqueKById} 思路，作用于数字）。
 */
export const orderedDedupIds = (ids: readonly number[]): number[] => {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const id of ids) {
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
};

export interface BiRangeStats {
  high: number;
  low: number;
  originIds: number[];
  independentCount: number;
}

/**
 * 由构成段的笔聚合段几何：high/low 取所有笔极值的 max/min；
 * originIds 为所有笔 originIds 的保序去重；independentCount = 去重后原始 K 数
 * （段内相邻笔在端点分型处共用 K，必须去重，不能直接求和）。
 */
export const collectBiRangeStats = (bis: readonly ChanBi[]): BiRangeStats => {
  let high = -Infinity;
  let low = Infinity;
  const ids: number[] = [];
  for (const bi of bis) {
    if (bi.high > high) {
      high = bi.high;
    }
    if (bi.low < low) {
      low = bi.low;
    }
    ids.push(...bi.originIds);
  }
  const originIds = orderedDedupIds(ids);
  return {
    high,
    low,
    originIds,
    independentCount: originIds.length,
  };
};
