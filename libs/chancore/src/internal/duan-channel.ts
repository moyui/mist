import { ChannelLevel, ChannelStatus, ChannelType } from '../contracts';
import type {
  ChanDuan,
  ChanDuanChannel,
  ChanDuanChannelTwoPhaseResult,
} from '../contracts';
import {
  mergeDuanCentralExpansion,
  resolveCentralExpansions,
} from './central-expansion';
import { minMaxBy } from './min-max-by';
import { mergeSpans } from './span-merge';

/**
 * 段级中枢（Duan-level Channel）—— 以段为构成单元的中枢。缠论原典17课：
 * 中枢 = "至少三个连续次级别走势类型所重叠的部分"，是**无方向的区域**。
 *
 * 算法结构与笔级 {@link ChannelCalculator} 同构（用户指令镜像编排）：
 * - Phase A：固定 3 段滑窗枚举所有基础段级中枢（趋势交替 + 对称重叠 zg > zd）。
 * - Phase B：延伸（首尾 ±2 段成对，对称重叠合法则延伸）+ 重合合并（`mergeSpans` 时间+价格双重叠）。
 *
 * 与笔级中枢的差异：
 * - 输入 `ChanDuan[]`（createDuan 返回值）；窗口 **3 段**（原典"至少三个"，非 5 笔）。
 * - 几何为**对称重叠**：zg = min(段高点)、zd = max(段低点)、gg/dd 极值；**无方向、无首末段突破约束**。
 * - 输出**无 trend 字段**；`level = ChannelLevel.Duan`（接线）。
 */
export class DuanChannelCalculator {
  createDuanChannels(
    duans: readonly ChanDuan[],
  ): ChanDuanChannelTwoPhaseResult {
    const phaseA = this.enumerateChannels(duans);
    const merged = this.mergeChannels(phaseA, duans);
    // Phase C：中枢扩张归并（相邻波动区间重叠/相切 → 合并为一个更高级别中枢，到不动点）
    const phaseB = resolveCentralExpansions(merged, mergeDuanCentralExpansion);
    return { phaseA, phaseB };
  }

  /**
   * Phase A：固定 3 段滑窗枚举所有基础段级中枢。
   * 每个起点 i 都尝试识别一个固定三段基础中枢，成功后 i += 1，
   * 枚举出所有可能的基础中枢（含重叠/相邻），作为 Phase B 合并的原料。
   */
  private enumerateChannels(duans: readonly ChanDuan[]): ChanDuanChannel[] {
    const channels: ChanDuanChannel[] = [];
    const duanCount = duans.length;

    if (duanCount < 3) {
      return channels;
    }

    let i = 0;
    while (i <= duanCount - 3) {
      const channel = this.detectChannel(duans.slice(i, i + 3), duans, i);

      if (!channel) {
        i++;
        continue;
      }

      const stamped: ChanDuanChannel = {
        ...channel,
        status: this.isCandidateChannelValid(channel)
          ? ChannelStatus.Valid
          : ChannelStatus.Invalid,
      };

      channels.push(stamped);
      i++;
    }

    return channels;
  }

  /** 检测 3 段基础段级中枢（趋势交替 + 对称重叠有效）。 */
  private detectChannel(
    threeDuans: readonly ChanDuan[],
    originalDuans: readonly ChanDuan[],
    startIndex: number,
  ): ChanDuanChannel | null {
    if (threeDuans.length < 3) {
      return null;
    }

    if (!this.validateTrendAlternating(threeDuans)) {
      return null;
    }

    const geometry = this.validateChannelGeometry(threeDuans);
    if (!geometry) {
      return null;
    }
    const { zg, zd, gg, dd } = geometry;

    const firstDuan = originalDuans[startIndex];
    const lastDuan = originalDuans[startIndex + 2];
    const firstMiddleIndex = Math.floor(firstDuan.originIds.length / 2);
    const displayStartId = firstDuan.originIds[firstMiddleIndex];
    const lastMiddleIndex = Math.floor(lastDuan.originIds.length / 2);
    const displayEndId = lastDuan.originIds[lastMiddleIndex];

    return {
      duans: [...threeDuans],
      zg,
      zd,
      gg,
      dd,
      level: ChannelLevel.Duan,
      type: ChannelType.Complete,
      status: ChannelStatus.Unknown, // Phase A 枚举后由 enumerateChannels 印 status
      expanded: false,
      startId: firstDuan.originIds[0],
      endId: lastDuan.originIds[lastDuan.originIds.length - 1],
      displayStartId,
      displayEndId,
    };
  }

  /**
   * 对称重叠几何（无方向）：对构成段（N ≥ 3），
   * zg = min(段高点)、zd = max(段低点)、gg = max(段高点)、dd = min(段低点)。
   * 有效条件：N ≥ 3 且 zg > zd（存在重叠区间）。无首末段突破约束、无进入/离开方向
   * （原典：中枢 = "至少三个连续次级别走势类型所重叠的部分"，是区域本身）。
   */
  private validateChannelGeometry(duans: readonly ChanDuan[]): {
    zg: number;
    zd: number;
    gg: number;
    dd: number;
  } | null {
    if (duans.length < 3) {
      return null;
    }
    const highMinMax = minMaxBy(duans, (d) => d.high);
    const lowMinMax = minMaxBy(duans, (d) => d.low);
    if (!highMinMax || !lowMinMax) {
      return null;
    }
    const zg = highMinMax.min;
    const gg = highMinMax.max;
    const zd = lowMinMax.max;
    const dd = lowMinMax.min;
    if (zg <= zd) {
      return null;
    }
    return { zg, zd, gg, dd };
  }

  private isCandidateChannelValid(channel: ChanDuanChannel): boolean {
    return channel.duans.length >= 3 && channel.zg > channel.zd;
  }

  private validateTrendAlternating(duans: readonly ChanDuan[]): boolean {
    for (let i = 0; i < duans.length - 1; i++) {
      if (duans[i].trend === duans[i + 1].trend) {
        return false;
      }
    }
    return true;
  }

  /**
   * Phase B：先延伸，再重合合并（镜像 mergeChannels）。
   */
  private mergeChannels(
    phaseAChannels: readonly ChanDuanChannel[],
    duans: readonly ChanDuan[] = [],
  ): ChanDuanChannel[] {
    const extended =
      duans.length > 0
        ? phaseAChannels.map((channel) => this.extendChannel(channel, duans))
        : phaseAChannels.map((channel) => ({ ...channel }));

    const merged = mergeSpans(extended, {
      isCompleteItem: (channel) => channel.type === ChannelType.Complete,
      // 中枢合并不要求 trend 相同（重叠中枢常 up/down 交替），只要求时间区间有交集
      isSameDirection: (head, tail) => this.channelsOverlapInTime(head, tail),
      // 中枢合并不依赖 Invalid 标记，恒允许（由 canMergeTwo 把关质量）
      spanHasInvalid: () => true,
      canMergeTwo: (head, tail) => this.canMergeTwoChannels(head, tail),
      middleFitsEnvelope: (span) => this.middleChannelsFitEnvelope(span),
      mergeTwo: (head, tail) => this.mergeTwoChannels(head, tail),
      stampStatus: (merged) => ({
        ...merged,
        // 合并产物用对称重叠重新校验合法性
        status: this.validateChannelGeometry(merged.duans)
          ? ChannelStatus.Valid
          : ChannelStatus.Invalid,
      }),
    });

    return merged.filter((channel) => channel.status === ChannelStatus.Valid);
  }

  /**
   * 延伸中枢：首尾各延伸 2 段（成对），整体对称重叠合法则延伸（镜像 extendChannel）。
   */
  private extendChannel(
    channel: ChanDuanChannel,
    duans: readonly ChanDuan[],
  ): ChanDuanChannel {
    const firstDuanTime = channel.duans[0].startTime.getTime();
    const lastDuanTime =
      channel.duans[channel.duans.length - 1].endTime.getTime();
    let startIdx = -1;
    let endIdx = -1;
    for (let i = 0; i < duans.length; i++) {
      if (duans[i].startTime.getTime() === firstDuanTime) startIdx = i;
      if (duans[i].endTime.getTime() === lastDuanTime) endIdx = i;
    }
    if (startIdx === -1 || endIdx === -1) {
      return channel;
    }

    let current = channel;
    let curStart = startIdx;
    let curEnd = endIdx;

    let changed = true;
    while (changed) {
      changed = false;

      if (curEnd + 2 < duans.length) {
        const tailWindow = duans.slice(curStart, curEnd + 3);
        const geometry = this.validateChannelGeometry(tailWindow);
        if (geometry) {
          current = this.buildChannelFromDuans(
            tailWindow,
            duans,
            curStart,
            geometry,
          );
          curEnd += 2;
          changed = true;
        }
      }

      if (curStart - 2 >= 0) {
        const headWindow = duans.slice(curStart - 2, curEnd + 1);
        const geometry = this.validateChannelGeometry(headWindow);
        if (geometry) {
          current = this.buildChannelFromDuans(
            headWindow,
            duans,
            curStart - 2,
            geometry,
          );
          curStart -= 2;
          changed = true;
        }
      }
    }

    return current;
  }

  /** 从 N 段序列和几何参数构建 ChanDuanChannel（镜像 buildChannelFromBis）。 */
  private buildChannelFromDuans(
    duans: readonly ChanDuan[],
    originalDuans: readonly ChanDuan[],
    startIndex: number,
    geometry: { zg: number; zd: number; gg: number; dd: number },
  ): ChanDuanChannel {
    const endIndex = startIndex + duans.length - 1;
    const firstDuan = originalDuans[startIndex];
    const firstMiddleIndex = Math.floor(firstDuan.originIds.length / 2);
    const displayStartId = firstDuan.originIds[firstMiddleIndex];

    const lastDuan = originalDuans[endIndex];
    const lastMiddleIndex = Math.floor(lastDuan.originIds.length / 2);
    const displayEndId = lastDuan.originIds[lastMiddleIndex];

    return {
      duans: [...duans],
      zg: geometry.zg,
      zd: geometry.zd,
      gg: geometry.gg,
      dd: geometry.dd,
      level: ChannelLevel.Duan,
      type: ChannelType.Complete,
      // 延伸产物已由 validateChannelGeometry 保证合法，印 Valid
      status: ChannelStatus.Valid,
      expanded: false,
      startId: firstDuan.originIds[0],
      endId: lastDuan.originIds[lastDuan.originIds.length - 1],
      displayStartId,
      displayEndId,
    };
  }

  /** 两个段级中枢能否合并（时间 + 价格双重叠，镜像 canMergeTwoChannels）。 */
  private canMergeTwoChannels(
    head: ChanDuanChannel,
    tail: ChanDuanChannel,
  ): boolean {
    // y 轴价格重叠：两个 zone 的交集非空
    const priceOverlapHigh = Math.min(head.zg, tail.zg);
    const priceOverlapLow = Math.max(head.zd, tail.zd);
    if (priceOverlapHigh <= priceOverlapLow) {
      return false;
    }

    // 合并后 zone 仍有效（zg > zd）
    const allDuans = [...head.duans, ...tail.duans];
    const highMinMax = minMaxBy(allDuans, (d) => d.high);
    const lowMinMax = minMaxBy(allDuans, (d) => d.low);
    if (!highMinMax || !lowMinMax) {
      return false;
    }
    return highMinMax.min > lowMinMax.max;
  }

  private channelsOverlapInTime(
    head: ChanDuanChannel,
    tail: ChanDuanChannel,
  ): boolean {
    const headStart = head.duans[0]?.startTime.getTime();
    const headEnd = head.duans.at(-1)?.endTime.getTime();
    const tailStart = tail.duans[0]?.startTime.getTime();
    const tailEnd = tail.duans.at(-1)?.endTime.getTime();

    if (
      headStart === undefined ||
      headEnd === undefined ||
      tailStart === undefined ||
      tailEnd === undefined
    ) {
      return false;
    }

    return headStart <= tailEnd && tailStart <= headEnd;
  }

  /** 中间段级中枢是否都与首尾合并 zone 有价格重叠（镜像 middleChannelsFitEnvelope）。 */
  private middleChannelsFitEnvelope(span: readonly ChanDuanChannel[]): boolean {
    const head = span[0];
    const tail = span[span.length - 1];
    const zoneHigh = Math.min(head.zg, tail.zg);
    const zoneLow = Math.max(head.zd, tail.zd);
    return span.slice(1, -1).every((middle) => {
      return middle.zg >= zoneLow && middle.zd <= zoneHigh;
    });
  }

  /** 合并两个段级中枢（镜像 mergeTwoChannels）。 */
  private mergeTwoChannels(
    head: ChanDuanChannel,
    tail: ChanDuanChannel,
  ): ChanDuanChannel {
    const seen = new Set<number>();
    const mergedDuans: ChanDuan[] = [];
    for (const duan of [...head.duans, ...tail.duans]) {
      const duanKey = duan.startTime.getTime();
      if (seen.has(duanKey)) {
        continue;
      }
      seen.add(duanKey);
      mergedDuans.push(duan);
    }

    const geometry = this.validateChannelGeometry(mergedDuans);
    const zg = geometry ? geometry.zg : head.zg;
    const zd = geometry ? geometry.zd : head.zd;
    const gg = geometry ? geometry.gg : head.gg;
    const dd = geometry ? geometry.dd : head.dd;

    return {
      duans: mergedDuans,
      zg,
      zd,
      gg,
      dd,
      level: head.level,
      type: ChannelType.Complete,
      status: ChannelStatus.Unknown, // 由 stampStatus 重新判定
      expanded: false,
      startId: head.startId,
      endId: tail.endId,
      displayStartId: head.displayStartId,
      displayEndId: tail.displayEndId,
    };
  }
}
