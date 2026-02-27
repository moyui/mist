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
    // 判断包含关系的方向
    // 前包含后：当前K线包含下一根K线
    const currentContainsNext =
      current.highest >= next.highest && current.lowest <= next.lowest;
    // 后包含前：下一根K线包含当前K线
    const nextContainsCurrent =
      next.highest >= current.highest && next.lowest <= current.lowest;

    // 没有包含关系，不合并
    if (!currentContainsNext && !nextContainsCurrent) {
      return { merged: false, newHigh: 0, newLow: 0 };
    }

    // 当趋势为None时，根据包含关系的方向来判断
    let actualTrend = trend;
    if (actualTrend === TrendDirection.None) {
      // 比较中心点位置来决定方向
      const currentMiddle = (current.highest + current.lowest) / 2;
      const nextMiddle = (next.highest + next.lowest) / 2;

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
      const now = data[i];
      // 使用上一个合并K线来判断趋势
      const lastMergedK = mergedKs[mergedKs.length - 1];

      // 将MergedKVo转换为KVo，以便trendService使用
      const lastMergedKAsKVo: KVo = {
        id: lastMergedK.mergedIds[lastMergedK.mergedIds.length - 1],
        symbol: lastMergedK.mergedData[0].symbol,
        time: lastMergedK.endTime,
        amount:
          lastMergedK.mergedData[lastMergedK.mergedData.length - 1].amount,
        open: lastMergedK.mergedData[0].open,
        close: lastMergedK.mergedData[lastMergedK.mergedData.length - 1].close,
        highest: lastMergedK.highest,
        lowest: lastMergedK.lowest,
      };

      currentTrend = this.trendService.judgeSimpleTrend(
        lastMergedKAsKVo,
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
