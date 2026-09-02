import {
  BiStatus,
  ChannelLevel,
  ChannelStatus,
  ChannelType,
  TrendDirection,
} from '../contracts';
import type {
  ChanBi,
  ChanChannel,
  ChanChannelTwoPhaseResult,
} from '../contracts';

import { minMaxBy } from './min-max-by';

export class ChannelCalculator {
  /**
   * 主函数：识别笔级中枢（顺序确认生命周期状态机 + 缠论第 20 课中心定理二扩张归并）
   *
   * 算法流程：
   * 1. 顺序确认扫描：从左至右顺序寻找 5 笔基础中枢，确立 [ZD, ZG]；
   * 2. 缠论第 20 课触及延伸：后续笔对触及 [ZD, ZG] 且保持公共交集有效则并入延伸；
   * 3. 第三类买卖点终结：离开且回抽不回中枢区间时立即密封（Seal）闭合当前中枢；
   * 4. 9 笔结合扩展：持续震荡满 9 笔时触发中枢扩展（expanded: true）并闭合；
   * 5. Phase C：相邻同级别独立中枢满足中心定理二时进行扩张归并（Pairwise Expansion）。
   *
   * @param data Phase B 笔序列
   * @returns 两阶段中枢结果 { phaseA, phaseB }
   */
  createChannels(data: readonly ChanBi[]): ChanChannelTwoPhaseResult {
    // 仅确认且有效的笔构成中枢（status !== Valid 的 Invalid/Unknown 单元不参与：
    // 18 课"次级别前三个走势类型都是完成的才构成中枢"；统一 status 判据，
    // 数据层 createBi 输出不变）。
    const confirmed = data.filter((b) => b.status === BiStatus.Valid);

    const { phaseA, sequential } = this.sequentiallyConfirmChannels(confirmed);

    // Phase B：直接采用顺序生命周期确认的中枢序列（保留独立性，避免贪婪级联吞并）
    const phaseB = sequential;

    return { phaseA, phaseB };
  }

  /**
   * 顺序确认扫描与生命周期状态机推进
   */
  private sequentiallyConfirmChannels(data: readonly ChanBi[]): {
    phaseA: ChanChannel[];
    sequential: ChanChannel[];
  } {
    const phaseA: ChanChannel[] = [];
    const sequential: ChanChannel[] = [];
    const biCount = data.length;

    if (biCount < 5) {
      return { phaseA, sequential };
    }

    let cursor = 0;
    while (cursor <= biCount - 5) {
      const candidateWindow = data.slice(cursor, cursor + 5);
      const baseChannel = this.detectChannel(candidateWindow, data, cursor);

      if (!baseChannel) {
        cursor++;
        continue;
      }

      // 基础中枢记录进 Phase A
      const stampedBase: ChanChannel = {
        ...baseChannel,
        status: ChannelStatus.Valid,
      };
      phaseA.push(stampedBase);

      // 进入生命周期延伸与终结状态机
      const channelBis = [...candidateWindow];
      let curZg = baseChannel.zg;
      let curZd = baseChannel.zd;
      const allLows = candidateWindow.map((b) => b.low);
      const allHighs = candidateWindow.map((b) => b.high);
      let curGg = Math.max(...allHighs);
      let curDd = Math.min(...allLows);
      let isExpanded = false;

      let nextIdx = cursor + 5;
      while (nextIdx + 1 < biCount) {
        const testWindow = [...channelBis, data[nextIdx], data[nextIdx + 1]];
        const allHighMinMax = minMaxBy(testWindow, (b) => b.high);
        const allLowMinMax = minMaxBy(testWindow, (b) => b.low);

        if (
          allHighMinMax &&
          allLowMinMax &&
          allHighMinMax.min > allLowMinMax.max
        ) {
          channelBis.push(data[nextIdx], data[nextIdx + 1]);
          curZg = allHighMinMax.min;
          curZd = allLowMinMax.max;
          curGg = allHighMinMax.max;
          curDd = allLowMinMax.min;
          nextIdx += 2;

          if (channelBis.length >= 9) {
            isExpanded = true;
          }
          continue;
        } else {
          // 离开不回或交集失效，中枢在此密封终结
          break;
        }
      }

      // 处理末尾仅剩的单笔（数据序列最后一笔）
      if (nextIdx === biCount - 1) {
        const single = data[nextIdx];
        if (single.high >= curZd && single.low <= curZg) {
          const newZg = Math.min(curZg, single.high);
          const newZd = Math.max(curZd, single.low);
          if (newZg > newZd) {
            channelBis.push(single);
            curZg = newZg;
            curZd = newZd;
            curGg = Math.max(curGg, single.high);
            curDd = Math.min(curDd, single.low);
            nextIdx++;
            if (channelBis.length >= 9) {
              isExpanded = true;
            }
          }
        }
      }

      // 构建已密封的最终中枢
      const sealedChannel = this.buildChannelFromBis(
        channelBis,
        data,
        cursor,
        { zg: curZg, zd: curZd, gg: curGg, dd: curDd },
        isExpanded,
      );
      sequential.push(sealedChannel);

      // 指针后移至离开点 / 下一个扫描位置
      cursor = Math.max(cursor + 1, nextIdx);
    }

    return { phaseA, sequential };
  }

  /**
   * 从 N 笔序列和已算好的几何参数构建中枢对象。
   */
  private buildChannelFromBis(
    bis: readonly ChanBi[],
    originalBis: readonly ChanBi[],
    startIndex: number,
    geometry: { zg: number; zd: number; gg: number; dd: number },
    expanded = false,
  ): ChanChannel {
    const endIndex = startIndex + bis.length - 1;
    const firstBi = originalBis[startIndex];
    const firstBiMiddleIndex = Math.floor(firstBi.originIds.length / 2);
    const displayStartId = firstBi.originIds[firstBiMiddleIndex];

    const lastBi = originalBis[endIndex];
    const lastBiMiddleIndex = Math.floor(lastBi.originIds.length / 2);
    const displayEndId = lastBi.originIds[lastBiMiddleIndex];

    return {
      bis: [...bis],
      zg: geometry.zg,
      zd: geometry.zd,
      gg: geometry.gg,
      dd: geometry.dd,
      level: ChannelLevel.Bi,
      type: ChannelType.Complete,
      status: ChannelStatus.Valid,
      startId: originalBis[startIndex].originIds[0],
      endId: lastBi.originIds[lastBi.originIds.length - 1],
      trend: bis[0].trend,
      expanded,
      displayStartId,
      displayEndId,
    };
  }

  /**
   * 验证候选中枢是否有效（标准缠论定义）。
   */
  isCandidateChannelValid(channel: ChanChannel): boolean {
    return channel.bis.length >= 3 && channel.zg > channel.zd;
  }

  /**
   * 验证笔的趋势是否交替
   */
  private validateTrendAlternating(bis: readonly ChanBi[]): boolean {
    for (let i = 0; i < bis.length - 1; i++) {
      if (bis[i].trend === bis[i + 1].trend) {
        return false;
      }
    }
    return true;
  }

  /**
   * 计算并验证 5 笔基础中枢的几何参数（zg/zd/gg/dd）与首末笔约束。
   *
   * 缠论标准定义（5 笔，首笔 A、末笔 E）：
   * - 上升中枢（A 上升，从下方进入）：
   *   zg = min(前 4 笔高点)   中枢上沿
   *   zd = max(后 4 笔低点)   中枢下沿
   *   gg = max(前 4 笔高点)   中枢最高
   *   dd = min(后 4 笔低点)   中枢最低
   *   约束：A.low < dd 且 E.high > gg
   * - 下降中枢（A 下降，从上方进入）：镜像对称
   *   zg = min(后 4 笔高点)
   *   zd = max(前 4 笔低点)
   *   gg = max(后 4 笔高点)
   *   dd = min(前 4 笔低点)
   *   约束：A.high > gg 且 E.low < dd
   *
   * @param bis 5 笔序列（已保证趋势交替）
   * @returns 合法时返回几何参数，否则返回 null
   */
  private validateChannelGeometry(bis: readonly ChanBi[]): {
    zg: number;
    zd: number;
    gg: number;
    dd: number;
  } | null {
    const n = bis.length;
    if (n < 5) {
      return null;
    }

    const firstBi = bis[0];
    const lastBi = bis[n - 1];
    const isUp = firstBi.trend === TrendDirection.Up;

    const front = bis.slice(0, n - 1); // 去 E
    const back = bis.slice(1); // 去 A

    let zg: number, zd: number, gg: number, dd: number;
    if (isUp) {
      const frontHigh = minMaxBy(front, (bi) => bi.high);
      const backLow = minMaxBy(back, (bi) => bi.low);
      if (!frontHigh || !backLow) return null;
      zg = frontHigh.min;
      gg = frontHigh.max;
      zd = backLow.max;
      dd = backLow.min;
    } else {
      const backHigh = minMaxBy(back, (bi) => bi.high);
      const frontLow = minMaxBy(front, (bi) => bi.low);
      if (!backHigh || !frontLow) return null;
      zg = backHigh.min;
      gg = backHigh.max;
      zd = frontLow.max;
      dd = frontLow.min;
    }

    // 约束1：zg > zd（中枢核心必须存在有效重叠区间）
    if (zg <= zd) {
      return null;
    }

    // 约束2：进入笔与离开笔的外部端点必须在中枢 [ZD, ZG] 之外（即进入笔确实从外部进入，离开笔确实脱离中枢）
    // 内部端点（上升中枢进入笔的最高点与离开笔的最低点、下跌中枢进入笔的最低点与离开笔的最高点）允许与 ZG / ZD 重合
    if (isUp) {
      // 上升中枢：进入笔从 ZD 之下进入 (firstBi.low < zd)，离开笔向上突破 ZG 离开 (lastBi.high > zg)
      if (firstBi.low >= zd || lastBi.high <= zg) {
        return null;
      }
    } else {
      // 下跌中枢：进入笔从 ZG 之上进入 (firstBi.high > zg)，离开笔向下突破 ZD 离开 (lastBi.low < zd)
      if (firstBi.high <= zg || lastBi.low >= zd) {
        return null;
      }
    }

    return { zg, zd, gg, dd };
  }

  /**
   * 检测 5-bi 基础中枢
   */
  private detectChannel(
    fiveBis: readonly ChanBi[],
    originalBis: readonly ChanBi[],
    startIndex: number,
  ): ChanChannel | null {
    if (fiveBis.length < 5) {
      return null;
    }

    if (!this.validateTrendAlternating(fiveBis)) {
      return null;
    }

    const geometry = this.validateChannelGeometry(fiveBis);
    if (!geometry) {
      return null;
    }
    const { zg, zd, gg, dd } = geometry;

    const initialFiveBis = fiveBis.slice(0, 5);

    const firstBi = originalBis[startIndex];
    const firstBiMiddleIndex = Math.floor(firstBi.originIds.length / 2);
    const displayStartId = firstBi.originIds[firstBiMiddleIndex];

    const lastBiIndex = startIndex + 4;
    const lastBi = originalBis[lastBiIndex];
    const lastBiMiddleIndex = Math.floor(lastBi.originIds.length / 2);
    const displayEndId = lastBi.originIds[lastBiMiddleIndex];

    return {
      bis: [...initialFiveBis],
      zg,
      zd,
      gg,
      dd,
      level: ChannelLevel.Bi,
      type: ChannelType.Complete,
      status: ChannelStatus.Valid,
      startId: originalBis[startIndex].originIds[0],
      endId:
        originalBis[startIndex + 4].originIds[
          originalBis[startIndex + 4].originIds.length - 1
        ],
      trend: fiveBis[0].trend,
      expanded: false,
      displayStartId,
      displayEndId,
    };
  }
}
