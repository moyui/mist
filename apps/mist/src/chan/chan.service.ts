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
    const baseData: MergedKVo = {
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
        mergedKs[mergedKs.length - 1] = baseData;
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
        mergedKs.push(newBaseData);
      }
    }
    return mergedKs;
  }

  // 处理分型
  private handleFenxing(
    prev: MergedKVo,
    prevIndex: number,
    now: MergedKVo,
    nowIndex: number,
    next: MergedKVo,
    nextIndex: number,
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
        leftIndex: prevIndex,
        middleIds: now.mergedIds,
        middleIndex: nowIndex,
        rightIds: next.mergedIds,
        rightIndex: nextIndex,
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
        leftIndex: prevIndex,
        middleIds: now.mergedIds,
        middleIndex: nowIndex,
        rightIds: next.mergedIds,
        rightIndex: nextIndex,
        middleOriginId: now.mergedIds[middleOriginIndex] || -1,
      };
    }

    return {
      type: FenxingType.None,
      highest: 0,
      lowest: 0,
      leftIds: [],
      leftIndex: -1,
      middleIds: [],
      middleIndex: -1,
      rightIds: [],
      rightIndex: -1,
      middleOriginId: -1,
    };
  }

  private isFenxingsContained(a: FenxingVo, b: FenxingVo) {
    if (a.highest > b.highest && a.lowest < b.lowest) {
      return true;
    }
    if (a.highest < b.highest && a.lowest > b.lowest) {
      return true;
    }
    return false;
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
      const fenxing = this.handleFenxing(prev, i - 1, now, i, next, i + 1);
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

  private getInitialBi(now: MergedKVo) {
    return {
      startTime: now.startTime,
      endTime: now.endTime,
      highest: now.highest,
      lowest: now.lowest,
      trend: now.trend,
      type: BiType.Initial,
      originIds: [...now.mergedIds],
      originData: [...now.mergedData],
      independentCount: 1,
    };
  }

  private getFallbackBi(lastBi: BiVo, baseData: BiVo) {
    return {
      startTime: lastBi.startTime, // 上一笔的开始
      endTime: baseData.endTime, // 当前笔的结束
      highest: Math.max(lastBi.highest, baseData.highest),
      lowest: Math.min(lastBi.lowest, baseData.lowest),
      trend: lastBi.trend, // 趋势未发生改变
      type: BiType.UnComplete,
      originIds: Array.from(
        new Set([...lastBi.originIds, ...baseData.originIds]),
      ),
      originData: this.uniqueById([
        ...lastBi.originData,
        ...baseData.originData,
      ]),
      independentCount: lastBi.independentCount + baseData.independentCount - 1, // 回退分型的中间k线重复计算
    };
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
    // 从当前分型开始
    let fenxingIndex = -1;
    let mergedKIndex = 0;
    for (let i = 0; i < fenxings.length - 1; i++) {
      // 寻找第一个和趋势相同的分型
      if (baseData.trend === TrendDirection.Up) {
        if (fenxings[i].type === FenxingType.Top) {
          validFenxings.push(fenxings[i]);
          fenxingIndex += 1;
        } else {
          continue;
        }
      } else if (baseData.trend === TrendDirection.Down) {
        if (fenxings[i].type === FenxingType.Bottom) {
          validFenxings.push(fenxings[i]);
          fenxingIndex += 1;
        } else {
          continue;
        }
      } else if (baseData.trend === TrendDirection.None) {
        // 无趋势的话，就将第一个分型作为有效分型
        validFenxings.push(fenxings[i]);
        fenxingIndex += 1;
      }
      // const validFenxing = validFenxings[fenxingIndex];
      // const validMergedKIndex = validFenxing.middleIndex;
      // baseData.endTime = data[mergedKIndex].endTime;
      // baseData.independentCount = validMergedKIndex - mergedKIndex + 1;
      // baseData.type = BiType.Complete;
      // baseData.originIds = [...data[0].mergedIds];
      // baseData.originData = [...data[0].mergedData];
    }

    for (let i = 1; i < data.length; i++) {
      const prev = data[i - 1];
      const now = data[i];
      const next = data[i + 1];
      if (!prev || !now || !next) {
        // todo 未完成笔
        continue;
      }
      // 笔数据更新
      baseData.endTime = now.endTime;
      baseData.trend = now.trend;
      baseData.highest = Math.max(baseData.highest, now.highest);
      baseData.lowest = Math.min(baseData.lowest, now.lowest);
      baseData.originIds.push(...now.mergedIds);
      baseData.originData.push(...now.mergedData);
      baseData.independentCount += 1;
      // 判断这三个数据是不是分型
      const fenxing = this.handleFenxing(prev, i - 1, now, i, next, i + 1);
      // 有分型出现，判断是否成笔
      if (fenxing.type === FenxingType.None) continue;
      // 如果历史state中没有分型，那么先加进去
      if (fenxings.length === 0) {
        // 上一笔完成
        fenxings.push(fenxing);
        baseData.type = BiType.Complete;
        bis.push(baseData);
        // 基准数据更新
        baseData = this.getInitialBi(now);
        continue;
      }
      const lastFenxing = fenxings[fenxings.length - 1];
      // 必须和上一个有效的分型之间是顶底分型
      if (lastFenxing.type === fenxing.type) {
        continue;
      }
      // 分型必须不能互相包含
      if (this.isFenxingsContained(lastFenxing, fenxing)) {
        // 回退处理
        fenxings.pop();
        const lastBi = bis.pop();
        baseData = this.getFallbackBi(lastBi, baseData);
      }
      // 合并后的笔至少有4根独立k线
      if (baseData.independentCount < 4) {
        // 回退处理
        fenxings.pop();
        const lastBi = bis.pop();
        baseData = this.getFallbackBi(lastBi, baseData);
        continue;
      }
      // 原来的笔之间至少有5根原始笔
      const startOriginIndex = baseData.originData.findIndex(
        (k) => k.id === lastFenxing.middleOriginId,
      );
      const endOriginIndex = baseData.originData.findIndex(
        (k) => k.id === fenxing.middleOriginId,
      );
      if (endOriginIndex - startOriginIndex < 5) {
        // 回退处理
        fenxings.pop();
        const lastBi = bis.pop();
        baseData = this.getFallbackBi(lastBi, baseData);
        continue;
      }
      // 还有一个中间非笔结构，没想起来，到时候继续做，没记错的话是高度限制的，这样需要把趋势改变的逻辑加上 todo

      // 上一笔完成
      fenxings.push(fenxing);
      baseData.type = BiType.Complete;
      bis.push(baseData);
      // 基准数据更新
      baseData = this.getInitialBi(now);
    }
    // 如果当前的基准数据是未完成且上一笔是完成的情况
    if (
      baseData.type === BiType.UnComplete &&
      bis[bis.length - 1].type === BiType.Complete
    ) {
      bis.push(baseData);
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
