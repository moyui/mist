import { TrendDirection } from '../contracts';
import type { ChanK, ChanMergedK } from '../contracts';
import { TrendCalculator } from './trend';

type MutableMergedK = {
  startTime: Date;
  endTime: Date;
  high: number;
  low: number;
  trend: TrendDirection;
  mergedCount: number;
  mergedIds: number[];
  mergedData: ChanK[];
};

export class KMergeCalculator {
  constructor(private readonly trend = new TrendCalculator()) {}

  // 处理包含关系
  private handleContainedState(
    current: ChanMergedK,
    next: ChanK,
    trend: TrendDirection,
  ): { merged: boolean; newHigh: number; newLow: number } {
    // 判断包含关系的方向
    // 前包含后：当前K线包含下一根K线
    const currentContainsNext =
      current.high >= next.high && current.low <= next.low;
    // 后包含前：下一根K线包含当前K线
    const nextContainsCurrent =
      next.high >= current.high && next.low <= current.low;

    // 没有包含关系，不合并
    if (!currentContainsNext && !nextContainsCurrent) {
      return { merged: false, newHigh: 0, newLow: 0 };
    }

    // 当趋势为None时，根据包含关系的方向来判断
    let actualTrend = trend;
    if (actualTrend === TrendDirection.None) {
      // 比较中心点位置来决定方向
      const currentMiddle = (current.high + current.low) / 2;
      const nextMiddle = (next.high + next.low) / 2;

      if (nextMiddle < currentMiddle) {
        actualTrend = TrendDirection.Down;
      } else if (nextMiddle > currentMiddle) {
        actualTrend = TrendDirection.Up;
      } else {
        // 中心点相等，不合并
        return { merged: false, newHigh: 0, newLow: 0 };
      }
    }

    // 处理向上趋势, 高高取高
    if (actualTrend === TrendDirection.Up) {
      return {
        merged: true,
        newHigh: Math.max(current.high, next.high),
        newLow: Math.max(current.low, next.low),
      };
    }

    // 处理向下趋势, 低低取低
    return {
      merged: true,
      newHigh: Math.min(current.high, next.high),
      newLow: Math.min(current.low, next.low),
    };
  }

  // 合并k线
  merge(data: readonly ChanK[]): ChanMergedK[] {
    if (data.length === 0) {
      return [];
    }
    let currentTrend = TrendDirection.None;
    // 基准K线
    let baseData: MutableMergedK = {
      startTime: data[0].time,
      endTime: data[0].time,
      high: data[0].high,
      low: data[0].low,
      trend: currentTrend,
      mergedCount: 1,
      mergedIds: [data[0].id],
      mergedData: [data[0]],
    };
    const mergedKs: ChanMergedK[] = [baseData];
    for (let i = 1; i < data.length; i++) {
      const now = data[i];
      // 使用上一个合并K线来判断趋势
      const lastMergedK = mergedKs[mergedKs.length - 1];

      const lastMergedRange: Pick<ChanK, 'high' | 'low'> = {
        high: lastMergedK.high,
        low: lastMergedK.low,
      };

      currentTrend = this.trend.judgeSimpleTrend(
        lastMergedRange,
        now,
        currentTrend,
      );

      const containedState = this.handleContainedState(
        lastMergedK,
        now,
        currentTrend,
      );

      // 这里说明有包含关系，按照k线进行合并
      if (containedState.merged) {
        // 先处理baseData
        baseData.endTime = now.time;
        baseData.high = containedState.newHigh;
        baseData.low = containedState.newLow;
        baseData.mergedCount += 1;
        baseData.trend = currentTrend;
        baseData.mergedIds.push(now.id);
        baseData.mergedData.push(now);
        // 然后替换上一条k线
        mergedKs[mergedKs.length - 1] = { ...baseData };
      } else {
        const newBaseData: MutableMergedK = {
          startTime: now.time,
          endTime: now.time,
          high: now.high,
          low: now.low,
          trend: currentTrend,
          mergedCount: 1,
          mergedIds: [now.id],
          mergedData: [now],
        };
        baseData = newBaseData;
        mergedKs.push({ ...newBaseData });
      }
    }
    return mergedKs;
  }
}
