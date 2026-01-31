import { Injectable } from '@nestjs/common';
import { KVo } from '../../indicator/vo/k.vo';
import { TrendService } from '../../trend/trend.service';
import { TrendDirection } from '../enums/trend-direction.enum';
import { MergedKVo } from '../vo/merged-k.vo';

@Injectable()
export class KMergeService {
  constructor(private readonly trendService: TrendService) {}

  // 处理包含关系
  private handleContainedState(
    current: MergedKVo,
    next: KVo,
    trend: TrendDirection,
  ): { merged: boolean; newHigh: number; newLow: number } {
    // 没有明显趋势，不处理k线关系
    if (trend === TrendDirection.None) {
      return { merged: false, newHigh: 0, newLow: 0 };
    }
    const isContained =
      (current.highest >= next.highest && current.lowest <= next.lowest) ||
      (next.highest >= current.highest && next.lowest <= current.lowest);

    if (!isContained) {
      return { merged: false, newHigh: 0, newLow: 0 };
    }

    // 处理向上趋势, 高高取高
    if (trend === TrendDirection.Up) {
      return {
        merged: true,
        newHigh: Math.max(current.highest, next.highest),
        newLow: Math.max(current.lowest, next.lowest),
      };
    }

    // 处理向下趋势, 低低取低
    return {
      merged: true,
      newHigh: Math.min(current.highest, next.highest),
      newLow: Math.min(current.lowest, next.lowest),
    };
  }

  // 合并k线
  merge(data: KVo[]): MergedKVo[] {
    if (data.length === 0) {
      return [];
    }
    let currentTrend = TrendDirection.None;
    // 基准K线
    let baseData: MergedKVo = {
      startTime: data[0].time,
      endTime: data[0].time,
      highest: data[0].highest,
      lowest: data[0].lowest,
      trend: currentTrend,
      mergedCount: 1,
      mergedIds: [data[0].id],
      mergedData: [data[0]],
    };
    const mergedKs: MergedKVo[] = [baseData];
    for (let i = 1; i < data.length; i++) {
      const prev = data[i - 1];
      const now = data[i];
      currentTrend = this.trendService.judgeSimpleTrend(
        prev,
        now,
        currentTrend,
      );
      // 这个有问题
      const containedState = this.handleContainedState(
        baseData,
        now,
        currentTrend,
      );
      // 这里说明有包含关系，按照k线进行合并
      if (containedState.merged) {
        // 先处理baseData
        baseData.endTime = now.time;
        baseData.highest = containedState.newHigh;
        baseData.lowest = containedState.newLow;
        baseData.mergedCount += 1;
        baseData.trend = currentTrend;
        baseData.mergedIds.push(now.id);
        baseData.mergedData.push(now);
        // 然后替换上一条k线
        mergedKs[mergedKs.length - 1] = { ...baseData };
      } else {
        const newBaseData: MergedKVo = {
          startTime: now.time,
          endTime: now.time,
          highest: now.highest,
          lowest: now.lowest,
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
