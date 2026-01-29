import { UtilsService } from '@app/utils';
import { Inject, Injectable } from '@nestjs/common';
import { KVo } from '../indicator/vo/k.vo';
import { TrendService } from '../trend/trend.service';
import { CreateBiDto } from './dto/create-bi.dto';
import { CreateChannelDto } from './dto/create-channel.dto';
import { BiType } from './enums/bi.enum';
import { ChannelLevel, ChannelType } from './enums/channel.enum';
import { FenxingType } from './enums/fenxing.enum';
import { TrendDirection } from './enums/trend-direction.enum';
import { BiVo } from './vo/bi.vo';
import { ChannelVo } from './vo/channel.vo';
import { FenxingVo } from './vo/fenxing.vo';
import { MergedKVo } from './vo/merged-k.vo';

@Injectable()
export class ChanService {
  @Inject()
  private readonly utilsService: UtilsService;

  @Inject()
  private readonly trendService: TrendService;

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
  mergeK(data: KVo[]): MergedKVo[] {
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

  // 处理分型
  private handleFenxing(
    prev: MergedKVo,
    now: MergedKVo,
    next: MergedKVo,
    nowIndex: number,
  ): FenxingVo {
    if (
      now.highest > prev.highest &&
      now.highest > next.highest &&
      now.lowest > prev.lowest &&
      now.lowest > next.lowest
    ) {
      const middleOriginIndex = this.utilsService.findLastIndex(
        now.mergedData,
        (item) => item.highest === now.highest,
      );
      return {
        type: FenxingType.Top,
        highest: now.highest,
        lowest: prev.lowest < next.lowest ? prev.lowest : next.lowest,
        leftIds: prev.mergedIds,
        middleIds: now.mergedIds,
        middleIndex: nowIndex,
        rightIds: next.mergedIds,
        middleOriginId: now.mergedIds[middleOriginIndex] || -1,
      };
    }

    if (
      now.lowest < prev.lowest &&
      now.lowest < next.lowest &&
      now.highest < prev.highest &&
      now.highest < next.highest
    ) {
      const middleOriginIndex = now.mergedData.findIndex(
        (item) => item.lowest === now.lowest,
      );
      return {
        type: FenxingType.Bottom,
        highest: prev.highest > next.highest ? prev.highest : next.highest,
        lowest: now.lowest,
        leftIds: prev.mergedIds,
        middleIds: now.mergedIds,
        middleIndex: nowIndex,
        rightIds: next.mergedIds,
        middleOriginId: now.mergedIds[middleOriginIndex] || -1,
      };
    }

    return {
      type: FenxingType.None,
      highest: 0,
      lowest: 0,
      leftIds: [],
      middleIds: [],
      middleIndex: -1,
      rightIds: [],
      middleOriginId: -1,
    };
  }

  // 顶底分型之间必须要拉开差距，这里暂时不考虑底分型的整体位置还要比顶分型高的情况，反过来也是
  private isFenxingsContained(a: FenxingVo, b: FenxingVo) {
    if (a.type === FenxingType.Top && b.type === FenxingType.Bottom) {
      if (a.highest > b.highest && a.lowest > b.lowest) {
        return { isContained: false, bigger: null };
      } else {
        return {
          isContained: true,
          bigger: a.highest <= b.highest ? 'a' : 'b',
        };
      }
    } else if (a.type === FenxingType.Bottom && b.type === FenxingType.Top) {
      if (a.lowest < b.lowest && a.highest < b.highest) {
        return { isContained: false, bigger: null };
      } else {
        return {
          isContained: true,
          bigger: a.lowest >= b.lowest ? 'b' : 'a',
        };
      }
    }
    return { isContained: false, bigger: null };
  }

  getFenxings(data: MergedKVo[]) {
    // 至少需要三个k线才能进行分型判断
    if (data.length < 3) {
      return [];
    }
    const fenxings: FenxingVo[] = [];
    for (let i = 1; i < data.length - 1; i++) {
      const prev = data[i - 1];
      const now = data[i];
      const next = data[i + 1];
      if (!prev || !now || !next) {
        continue;
      }
      const fenxing = this.handleFenxing(prev, now, next, i);
      if (fenxing.type !== FenxingType.None) {
        fenxings.push(fenxing);
      }
    }
    return fenxings;
  }

  private uniqueById(arr: KVo[]) {
    const seen = new Set<number>();
    return arr.filter((item) => {
      if (seen.has(item.id)) {
        return false;
      }
      seen.add(item.id);
      return true;
    });
  }

  private getBi(data: MergedKVo[], fenxings: FenxingVo[]) {
    if (data.length === 0) {
      return [];
    }
    // 基准数据
    let baseData: BiVo = {
      startTime: data[0].startTime,
      endTime: data[0].endTime,
      highest: data[0].highest,
      lowest: data[0].lowest,
      trend: data[0].trend,
      originIds: [...data[0].mergedIds],
      originData: [...data[0].mergedData],
      independentCount: 1,
      type: BiType.UnComplete,
    };
    const bis: BiVo[] = [baseData];
    const validFenxings: FenxingVo[] = [];
    if (fenxings.length === 0) {
      return bis;
    }
    let startKIndex = 1; // baseK线不进入统计
    let highest = baseData.highest;
    let lowest = baseData.lowest;
    let tempKs: MergedKVo[] = []; // 存放已经遍历过的k线，最后合并的时候需要去重，不包含起始的baseK

    for (let i = 0; i < fenxings.length - 1; i++) {
      const tempStartKIndex = startKIndex;
      let nowFenxing: FenxingVo | null = null;
      // 寻找第一个和趋势相同的分型
      if (baseData.trend === TrendDirection.Up) {
        if (fenxings[i].type === FenxingType.Top) {
          nowFenxing = fenxings[i];
        } else {
          continue;
        }
      } else if (baseData.trend === TrendDirection.Down) {
        if (fenxings[i].type === FenxingType.Bottom) {
          nowFenxing = fenxings[i];
        } else {
          continue;
        }
      } else if (baseData.trend === TrendDirection.None) {
        // 无趋势的话，就将第一个分型作为有效分型
        nowFenxing = fenxings[i];
      }
      // 判断从这一笔到validFenxing的最高点和最低点
      if (nowFenxing.type === FenxingType.Top) {
        highest = nowFenxing.highest;
      } else if (nowFenxing.type === FenxingType.Bottom) {
        lowest = nowFenxing.lowest;
      }
      // 遍历从这一笔到validFenxing的数据，判断当中的k线是否有凸起或者凹陷的情况，顺便把k线数据更新
      for (let j = startKIndex; j <= nowFenxing.middleIndex; j++) {
        const now = data[j];
        tempKs.push(now);
        // 判断当前k线是否是凸起
        if (now.highest > highest || now.lowest < lowest) {
          // 这一个分型无效，
          nowFenxing = null;
        }
      }
      startKIndex = nowFenxing.middleIndex + 1;
      // 如果没有有效分型，继续下一个分型
      if (!nowFenxing) {
        continue;
      }
      // 判断当前分型和上一个分型之间是否存在包含关系
      const prevFenxing = validFenxings[i - 1];
      if (prevFenxing) {
        const { isContained, bigger } = this.isFenxingsContained(
          prevFenxing,
          nowFenxing,
        );
        if (isContained) {
          nowFenxing = null;
          // 如果当前分型包含了之前的分型，说明前面的分型无效，要回退到前面已经成立的一笔继续计算
          if (bigger === 'b') {
            // 上一个分型无效
            fenxings.pop();
            // 这里笔肯定存在
            const initialBi = bis.pop();
            // 起始数据回退到上一个起始笔
            highest = Math.max(initialBi.highest, highest);
            lowest = Math.min(initialBi.lowest, lowest);
            baseData = {
              startTime: initialBi.startTime,
              endTime: initialBi.endTime,
              highest: highest,
              lowest: lowest,
              trend: initialBi.trend,
              originIds: [...initialBi.originIds],
              originData: [...initialBi.originData],
              independentCount: initialBi.independentCount,
              type: BiType.UnComplete,
            };
          }
          // 如果是a的分型则直接无视，认为当前分型无效
          continue;
        }
      }
      // 判断当前的k线长度是否能够成宽笔
      // 宽笔定义: 1.顶底分型处理后不允许共用k线。2.顶分型最高k线和底分型最低k线之间（不包括这两根k线），不考虑包含关系的情况下至少有3根（包含3根）原始k线
      if (prevFenxing) {
        // 上一个分型存在的情况
        const prevFenxingNextIndex = prevFenxing.middleIndex + 1;
        const nowFenxingPrevIndex = nowFenxing.middleIndex - 1;
        // 计算这两个Index之间的原始k线
        const middleKs = data.slice(
          prevFenxingNextIndex,
          nowFenxingPrevIndex + 1,
        );
        const originKs = middleKs.map((item) => item.mergedData).flat();
        // 当前分型无效，得继续下一个分型
        if (originKs.length < 3) {
          nowFenxing = null;
          continue;
        }
      } else {
        // 上一个分型不存在的情况下，只有可能从0开始
        const startIndex = 0;
        const nowFenxingPrevIndex = nowFenxing.middleIndex - 1;
        const middleKs = data.slice(startIndex, nowFenxingPrevIndex + 1);
        const originKs = middleKs.map((item) => item.mergedData).flat();
        // 当前分型无效，得继续下一个分型
        if (originKs.length < 3) {
          nowFenxing = null;
          continue;
        }
      }

      // 以下是笔成立
      // 分型
      validFenxings.push(nowFenxing);
      const validMiddleMergedK = data[nowFenxing.middleIndex];
      // 成笔
      const bi = {
        startTime: baseData.startTime,
        endTime: validMiddleMergedK.endTime,
        highest: Math.max(baseData.highest, nowFenxing.highest),
        lowest: Math.min(baseData.lowest, nowFenxing.lowest),
        trend:
          nowFenxing.type === FenxingType.Top
            ? TrendDirection.Up
            : TrendDirection.Down,
        type: BiType.Complete,
        originIds: Array.from(
          new Set([
            ...baseData.originIds,
            ...tempKs.map((item) => item.mergedIds).flat(),
          ]),
        ),
        originData: this.uniqueById([
          ...baseData.originData,
          ...tempKs.map((item) => item.mergedData).flat(),
        ]),
        independentCount: startKIndex - 1 - (tempStartKIndex - 1) + 1, // 纠正Index的偏移位置，从0开始
      };
      bis.push(bi);
      // 更新基准数据
      baseData = {
        startTime: validMiddleMergedK.startTime,
        endTime: validMiddleMergedK.endTime,
        highest: validMiddleMergedK.highest,
        lowest: validMiddleMergedK.lowest,
        trend:
          nowFenxing.type === FenxingType.Top
            ? TrendDirection.Down
            : TrendDirection.Up,
        type: BiType.UnComplete,
        originIds: [...validMiddleMergedK.mergedIds],
        originData: [...validMiddleMergedK.mergedData],
        independentCount: 1,
      };
      tempKs = [];
      highest = baseData.highest;
      lowest = baseData.lowest;
    }

    // 这里有两种情况没有统计完成，一种是tempKs里面还有数据，一种是 startKIndex 没到头
    if (tempKs.length > 0 || startKIndex <= data.length - 1) {
      const restKs =
        startKIndex <= data.length - 1 ? data.slice(startKIndex) : [];
      tempKs.push(...restKs);
      const last = tempKs[tempKs.length - 1];
      const bi = {
        startTime: baseData.startTime,
        endTime: last.endTime,
        highest: Math.max(baseData.highest, ...tempKs.map((k) => k.highest)),
        lowest: Math.min(baseData.lowest, ...tempKs.map((k) => k.lowest)),
        trend: baseData.trend,
        type: BiType.UnComplete,
        originIds: Array.from(
          new Set([
            ...baseData.originIds,
            ...tempKs.map((k) => k.mergedIds).flat(),
          ]),
        ),
        originData: this.uniqueById([
          ...baseData.originData,
          ...tempKs.map((k) => k.mergedData).flat(),
        ]),
        independentCount: baseData.independentCount + tempKs.length,
      };
      bis.push(bi);
    }

    return bis;
  }

  private createInitialBi(data: MergedKVo): BiVo {
    return {
      startTime: data.startTime,
      endTime: data.endTime,
      highest: data.highest,
      lowest: data.lowest,
      trend: data.trend,
      type: BiType.UnComplete,
      originIds: [...data.mergedIds],
      originData: [...data.mergedData],
      independentCount: 1,
    };
  }

  private isFenxingMatchTrend(fenxing: FenxingVo, trend: TrendDirection) {
    if (trend === TrendDirection.Up) {
      return fenxing.type === FenxingType.Top;
    } else if (trend === TrendDirection.Down) {
      return fenxing.type === FenxingType.Bottom;
    }
    return true; // TrendDirection.None 时匹配任何分型
  }

  // 添加一个辅助方法来简化processFenxingAndKs中对currentKIndex的更新
  private processFenxingAndKs(
    fenxing: FenxingVo,
    data: MergedKVo[],
    currentKIndex: number,
    currentBi: BiVo,
  ): { hasBreakout: boolean; newKIndex: number; batchKs: MergedKVo[] } {
    let highest = currentBi.highest;
    let lowest = currentBi.lowest;

    if (fenxing.type === FenxingType.Top) {
      highest = fenxing.highest;
    } else {
      lowest = fenxing.lowest;
    }

    const batchKs: MergedKVo[] = [];
    let hasBreakout = false;

    // 检查分型中间的K线是否有突破
    for (let j = currentKIndex; j <= fenxing.middleIndex; j++) {
      const k = data[j];
      batchKs.push(k); // 无论分型是否有效，都将K线添加到tempKs

      if (k.highest > highest || k.lowest < lowest) {
        hasBreakout = true;
      }
    }

    // 无论分型是否有效，都更新索引到分型之后
    const newKIndex = fenxing.middleIndex + 1;
    return { hasBreakout, newKIndex, batchKs };
  }

  private checkFenxingContainment(
    prev: FenxingVo,
    current: FenxingVo,
    validFenxings: FenxingVo[],
    bis: BiVo[],
    currentBi: BiVo,
  ): {
    skipCurrent: boolean;
    shouldRollback: boolean;
    updatedBi?: BiVo;
    updatedFenxings: FenxingVo[];
  } {
    const { isContained, bigger } = this.isFenxingsContained(prev, current);
    if (!isContained) {
      return {
        skipCurrent: false,
        shouldRollback: false,
        updatedFenxings: validFenxings,
      };
    }

    // 如果当前分型包含前一个分型，前一个分型无效，需要回退
    if (bigger === 'b') {
      // 移除上一个有效分型
      const updatedValidFenxings = [...validFenxings];
      updatedValidFenxings.pop();

      // 移除上一笔
      const updatedBis = [...bis];
      const lastBi = updatedBis.pop();

      let updatedBi: BiVo | undefined;

      if (lastBi) {
        // 回退到上一笔的起始
        updatedBi = {
          ...lastBi,
          // 取上一笔和当前笔的最高最低价中更极端的值
          highest: Math.max(lastBi.highest, currentBi.highest),
          lowest: Math.min(lastBi.lowest, currentBi.lowest),
          // 回退后这笔应该是未完成状态
          type: BiType.UnComplete,
          // 重置endTime，因为这笔还没有完成
          endTime: lastBi.startTime,
          // 重置independentCount为上一笔的independentCount
          independentCount: lastBi.independentCount,
        };
      }

      return {
        skipCurrent: true,
        shouldRollback: true,
        updatedBi,
        updatedFenxings: updatedValidFenxings,
      };
    }
    // 如果是前一个分型包含当前分型，当前分型无效
    else {
      return {
        skipCurrent: true,
        shouldRollback: false,
        updatedFenxings: validFenxings,
      };
    }
  }

  private isWideBiValid(
    data: MergedKVo[],
    prevFenxing: FenxingVo | undefined,
    currentFenxing: FenxingVo,
  ): boolean {
    let startIndex: number;
    let endIndex: number;

    if (prevFenxing) {
      startIndex = prevFenxing.middleIndex + 1;
      endIndex = currentFenxing.middleIndex - 1;
    } else {
      startIndex = 0;
      endIndex = currentFenxing.middleIndex - 1;
    }

    // 计算原始K线数量
    const middleKs = data.slice(startIndex, endIndex + 1);
    const originKCount = middleKs.reduce(
      (count, k) => count + k.mergedData.length,
      0,
    );

    return originKCount >= 3;
  }

  private createCompleteBi(
    baseBi: BiVo,
    data: MergedKVo[],
    fenxing: FenxingVo,
    tempKs: MergedKVo[],
    startKIndex: number,
    endKIndex: number,
  ): BiVo {
    const trend =
      fenxing.type === FenxingType.Top
        ? TrendDirection.Up
        : TrendDirection.Down;

    const allOriginIds = [
      ...baseBi.originIds,
      ...tempKs.flatMap((k) => k.mergedIds),
    ];

    const allOriginData = [
      ...baseBi.originData,
      ...tempKs.flatMap((k) => k.mergedData),
    ];

    // 计算 independentCount
    // 修正：使用正确的索引计算方式
    const independentCount = endKIndex - startKIndex + baseBi.independentCount;

    return {
      startTime: baseBi.startTime,
      endTime: data[fenxing.middleIndex].endTime,
      highest: Math.max(baseBi.highest, fenxing.highest),
      lowest: Math.min(baseBi.lowest, fenxing.lowest),
      trend,
      type: BiType.Complete,
      originIds: Array.from(new Set(allOriginIds)),
      originData: this.uniqueById(allOriginData),
      independentCount,
    };
  }

  private createNextBi(k: MergedKVo, fenxingType: FenxingType): BiVo {
    const trend =
      fenxingType === FenxingType.Top ? TrendDirection.Down : TrendDirection.Up;

    return {
      startTime: k.startTime,
      endTime: k.endTime,
      highest: k.highest,
      lowest: k.lowest,
      trend,
      type: BiType.UnComplete,
      originIds: [...k.mergedIds],
      originData: [...k.mergedData],
      independentCount: 1,
    };
  }

  private createRemainingBi(baseBi: BiVo, remainingKs: MergedKVo[]): BiVo {
    const allKs = remainingKs;

    return {
      startTime: baseBi.startTime,
      endTime: allKs[allKs.length - 1].endTime,
      highest: Math.max(baseBi.highest, ...allKs.map((k) => k.highest)),
      lowest: Math.min(baseBi.lowest, ...allKs.map((k) => k.lowest)),
      trend: baseBi.trend,
      type: BiType.UnComplete,
      originIds: Array.from(
        new Set([...baseBi.originIds, ...allKs.flatMap((k) => k.mergedIds)]),
      ),
      originData: this.uniqueById([
        ...baseBi.originData,
        ...allKs.flatMap((k) => k.mergedData),
      ]),
      independentCount: baseBi.independentCount + allKs.length,
    };
  }

  private getBi2(data: MergedKVo[], fenxings: FenxingVo[]) {
    if (data.length === 0) return [];

    const firstBi = this.createInitialBi(data[0]);
    const bis: BiVo[] = [firstBi];

    if (fenxings.length === 0) return bis;

    let currentBi = { ...firstBi };
    let validFenxings: FenxingVo[] = [];
    // let tempKs: MergedKVo[] = [];
    let currentKIndex = 1;

    for (let i = 0; i < fenxings.length - 1; i++) {
      const fenxing = fenxings[i];
      // 检查分型是否与当前趋势匹配
      if (!this.isFenxingMatchTrend(fenxing, currentBi.trend)) {
        continue;
      }

      // 记录处理分型前的K线索引，用于计算independentCount
      const startKIndex = currentKIndex;

      const processResult = this.processFenxingAndKs(
        fenxing,
        data,
        currentKIndex,
        currentBi,
      );

      // 总是更新 currentKIndex（无论分型是否有效）
      currentKIndex = processResult.newKIndex;

      if (processResult.hasBreakout) {
        continue;
      }

      // 检查分型包含关系
      const lastValidFenxing = validFenxings[validFenxings.length - 1];
      if (lastValidFenxing) {
        const containmentResult = this.checkFenxingContainment(
          lastValidFenxing,
          fenxing,
          validFenxings,
          bis,
          currentBi,
        );

        if (containmentResult.skipCurrent) {
          // 包含关系检查不通过
          if (containmentResult.shouldRollback) {
            // 需要回退的情况
            validFenxings = containmentResult.updatedFenxings;
            currentBi = containmentResult.updatedBi || currentBi;
          }
          continue;
        }

        // 如果包含关系检查通过了，更新validFenxings（虽然这里应该没变化）
        validFenxings = containmentResult.updatedFenxings;
      }

      // 检查是否满足宽笔条件 这里可能被回退过
      if (
        !this.isWideBiValid(
          data,
          validFenxings[validFenxings.length - 1],
          fenxing,
        )
      ) {
        continue;
      }

      // 成功形成一笔
      validFenxings.push(fenxing);
      const newBi = this.createCompleteBi(
        currentBi,
        data,
        fenxing,
        processResult.batchKs, // 使用batchKs，不是累积的tempKs
        startKIndex, // 传递startKIndex用于计算independentCount
        currentKIndex, // 传递currentKIndex用于计算independentCount
      );
      bis.push(newBi);

      // 更新当前笔为下一笔的起始
      const middleK = data[fenxing.middleIndex];
      currentBi = this.createNextBi(middleK, fenxing.type);
    }

    // 处理剩余未成笔的K线
    if (currentKIndex < data.length) {
      const remainingKs = data.slice(currentKIndex);
      const lastBi = this.createRemainingBi(currentBi, remainingKs);
      bis.push(lastBi);
    }

    return bis;
  }

  // 画笔
  createBi(createBiDto: CreateBiDto) {
    // 首先进行合并k线操作
    const mergedK = this.mergeK(createBiDto.k);
    // 绘制顶底分型
    const fenxings = this.getFenxings(mergedK);
    // 接下来进行画笔操作
    const bis = this.getBi(mergedK, fenxings);
    return bis;
  }

  private isTrendAlternating(bis: BiVo[]) {
    for (let i = 0; i < bis.length - 1; i++) {
      if (bis[i].trend === bis[i + 1].trend) {
        return false;
      }
    }
    return true;
  }

  private hasOverlapWithChannel(bi: BiVo, zg: number, zd: number) {
    return bi.lowest < zg && bi.highest > zd;
  }

  private checkOverlapRange(bis: BiVo[]) {
    if (bis.length < 5) {
      return null;
    }
    const highests = bis.map((bi) => bi.highest);
    const lowests = bis.map((bi) => bi.lowest);

    const zg = Math.min(...highests);
    const zd = Math.max(...lowests);
    // 无重叠
    if (zd >= zg) return null;
    const allOverlap = bis.every((bi) =>
      this.hasOverlapWithChannel(bi, zg, zd),
    );
    // 每笔重叠区间
    if (!allOverlap) return null;
    return [zg, zd];
  }

  private getStrictChannel(bis: BiVo[], overlapRange: number[]): ChannelVo {
    const resultBis = bis.slice(0, 5);
    return {
      zg: overlapRange[0],
      zd: overlapRange[1],
      gg: Math.max(...resultBis.map((bi) => bi.highest)),
      dd: Math.min(...resultBis.map((bi) => bi.lowest)),
      bis: resultBis,
      level: ChannelLevel.Bi, // 目前都是笔中枢，后续可能有段中枢
      type: ChannelType.Complete, // 目前是完成的中枢
      startId: bis[0].originIds[0],
      endId:
        bis[bis.length - 1].originIds[bis[bis.length - 1].originIds.length - 1],
      trend: bis[0].trend, // 中枢方向就是进入第一笔的方向
    };
  }

  // 处理严格中枢状态
  private handleStrictChannelState(bis: BiVo[]): ChannelVo | null {
    if (bis.length < 5) {
      return null;
    }
    // 检查笔的方向是否交替
    if (!this.isTrendAlternating(bis)) {
      return null;
    }
    // 检查前5笔是否重叠
    const overlapRange = this.checkOverlapRange(bis.slice(0, 5));
    if (!overlapRange) {
      return null;
    }

    const channel = this.getStrictChannel(bis, overlapRange);
    return channel;
  }

  private recalculateChannel(channel: ChannelVo, bis: BiVo[]): ChannelVo {
    return {
      ...channel,
      bis: [...channel.bis, ...bis],
      gg: Math.max(channel.gg, ...bis.map((bi) => bi.highest)),
      dd: Math.min(channel.dd, ...bis.map((bi) => bi.lowest)),
    };
  }

  // 处理扩展中枢状态
  private handleExtendChannelState(
    channel: ChannelVo,
    bis: BiVo[],
  ): { channel: ChannelVo; offsetIndex: number } {
    if (bis.length === 0) return { channel, offsetIndex: 0 };
    const extendedBis: BiVo[] = [];
    let i = 0;
    for (i; i < bis.length; i++) {
      const hasOverlap = this.hasOverlapWithChannel(
        bis[i],
        channel.zg,
        channel.zd,
      );
      if (hasOverlap) {
        extendedBis.push(bis[i]);
      } else {
        break; // 如果一旦没有出现重叠，那么延伸处理结束
      }
    }
    if (extendedBis.length === 0) return { channel, offsetIndex: 0 };
    // 如果最后一笔的方向和起始笔是一样的，说明最后一笔无法构成一个正常中枢，需要进行处理
    // 这里就需要判断是笔是否用完了
    if (extendedBis[extendedBis.length - 1].trend === bis[0].trend) {
      if (i === bis.length) {
        // 笔用完了，判断成中枢结构未完
        return {
          channel: {
            ...channel,
            type: ChannelType.UnComplete,
          },
          offsetIndex: i,
        };
      } else {
        // 笔未用完，最后一笔为新中枢的起始段，不属于原有中枢
        const newExtendedBis = [...extendedBis];
        newExtendedBis.pop();
        return {
          channel: this.recalculateChannel(channel, [
            ...channel.bis,
            ...newExtendedBis,
          ]),
          offsetIndex: i - 1,
        };
      }
    } else {
      return {
        channel: this.recalculateChannel(channel, [
          ...channel.bis,
          ...extendedBis,
        ]),
        offsetIndex: i,
      };
    }
  }

  /**
   * 获取中枢
   * @param data
   * @returns
   */
  private getChannel(data: BiVo[]) {
    // 中枢要至少5笔才能形成，所以使用滑动窗口方案
    const channels: ChannelVo[] = [];
    const biCount = data.length;
    if (biCount < 5) {
      return { channels, offsetIndex: 0 };
    }
    let i = 0;
    for (i; i <= biCount - 5; i++) {
      const fiveBis = data.slice(i, i + 5);
      // 生成严格中枢
      const channel = this.handleStrictChannelState(fiveBis);
      // 如果没有找到channel, 尝试下次迭代
      if (!channel) continue;
      // 处理中枢扩展，如果存在后续笔的情况
      if (i + 5 < biCount) {
        const remainBis = data.slice(i + 5);
        const { channel: extendedChannel, offsetIndex } =
          this.handleExtendChannelState(channel, remainBis);
        i = i + offsetIndex;
        channels.push(extendedChannel);
      } else {
        channels.push(channel);
      }
    }
    return { channels, offsetIndex: i };
  }

  // 画中枢
  createChannel(createChannelDto: CreateChannelDto) {
    return this.getChannel(createChannelDto.bi);
  }
}
