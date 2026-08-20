import {
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
import {
  mergeBiCentralExpansion,
  resolveCentralExpansions,
} from './central-expansion';
import { minMaxBy } from './min-max-by';
import { mergeSpans } from './span-merge';

export class ChannelCalculator {
  /**
   * 主函数：识别中枢（两阶段算法：Phase A 5笔滑窗枚举 + Phase B 定点迭代合并）
   *
   * 算法流程：
   * 1. Phase A：以固定5笔滑窗枚举所有基础中枢（趋势交替 + zg>zd + 第4/5笔重叠），
   *            每个起点都尝试，成功后步进1，枚举出所有可能的基础中枢（含重叠/相邻）
   * 2. Phase B：对 Phase A 输出做定点迭代合并（短跨度优先 + 最左优先），
   *            把时间重叠且 zone 兼容的同向中枢合并成大中枢
   *
   * 核心优势：
   * - 镜像笔的两阶段架构（Phase A 局部枚举 + Phase B 全局合并），结构一致易维护
   * - Phase A 枚举所有候选，不漏；Phase B 合并冗余，不重
   * - Phase A 保留通过基础重叠检查的候选，再用范围与极值规则标记 Valid/Invalid
   *
   * @param data Phase B 笔序列
   * @returns 两阶段中枢结果 { phaseA, phaseB }
   */
  createChannels(data: readonly ChanBi[]): ChanChannelTwoPhaseResult {
    // Phase A：固定5笔滑窗枚举所有基础中枢
    const phaseA = this.enumerateChannels(data);

    // Phase B：先延伸（首尾各+2笔），再重合合并
    const merged = this.mergeChannels(phaseA, data);

    // Phase C：中枢扩张归并（相邻波动区间重叠/相切 → 合并为一个更高级别中枢，到不动点）
    const phaseB = resolveCentralExpansions(merged, mergeBiCentralExpansion);

    return { phaseA, phaseB };
  }

  /**
   * Phase A：固定5笔滑窗枚举所有基础中枢。
   *
   * 每个起点 i 都尝试识别一个固定五笔基础中枢，成功后 i += 1，
   * 枚举出所有可能的基础中枢（含重叠/相邻），作为 Phase B 合并的原料。
   * 每个中枢印 status: Valid|Invalid，Phase B 只消化含 Invalid 的 span。
   *
   * @param data 笔数组
   * @returns Phase A 枚举出的所有基础中枢
   */
  private enumerateChannels(data: readonly ChanBi[]): ChanChannel[] {
    const channels: ChanChannel[] = [];
    const biCount = data.length;

    if (biCount < 5) {
      return channels;
    }

    let i = 0;
    while (i <= biCount - 5) {
      const channel = this.detectChannel(data.slice(i, i + 5), data, i);

      if (!channel) {
        i++;
        continue;
      }

      // 基础重叠由 detectChannel 保证；范围与极值规则决定最终 status。
      const stamped: ChanChannel = {
        ...channel,
        status: this.isCandidateChannelValid(channel)
          ? ChannelStatus.Valid
          : ChannelStatus.Invalid,
      };

      channels.push(stamped);
      // 每个起点都尝试，步进1枚举所有重叠/相邻候选中枢
      i++;
    }

    return channels;
  }

  /**
   * Phase B：先延伸，再重合合并。
   *
   * 步骤1（延伸）：对每个中枢，尝试首尾各延伸 2 笔（成对），用 N 笔正确定义
   * 重算 zg/zd/gg/dd，合法则延伸。可连续延伸（+2、+4…），直到不合法为止。
   * 即使被延伸的 2 笔和别的笔组合单独看不成立中枢，只要整体合法就延伸。
   *
   * 步骤2（重合合并）：对延伸后的中枢列表，用时间+价格双重叠判定合并。
   *
   * @param phaseAChannels Phase A 枚举出的基础中枢
   * @param data 原始笔序列（延伸需要访问中枢前后的笔）
   * @returns 合并到不动点后的最终中枢序列
   */
  private mergeChannels(
    phaseAChannels: readonly ChanChannel[],
    data: readonly ChanBi[] = [],
  ): ChanChannel[] {
    // 步骤1：延伸（需要原始笔序列；无笔序列时跳过，仅做重合合并）
    const extended =
      data.length > 0
        ? phaseAChannels.map((channel) => this.extendChannel(channel, data))
        : phaseAChannels.map((channel) => ({ ...channel }));

    // 步骤2：重合合并
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
        // 合并产物用缠论正确定义重新校验合法性
        status: this.validateChannelGeometry(merged.bis)
          ? ChannelStatus.Valid
          : ChannelStatus.Invalid,
      }),
    });

    return merged.filter((channel) => channel.status === ChannelStatus.Valid);
  }

  /**
   * 延伸中枢：尝试首尾各延伸 2 笔（成对），整体仍合法则延伸。
   *
   * 延伸方向：
   * - 尾部延伸：中枢末笔之后再加 2 笔，整体 N+2 笔用正确定义重算，合法则保留
   * - 头部延伸：中枢首笔之前再加 2 笔，同理
   * 可连续延伸（+2、+4…），直到延伸后不合法为止。
   *
   * 即使被延伸的 2 笔和别的笔单独组不成中枢，只要整体 N 笔满足缠论定义即可延伸。
   *
   * @param channel 待延伸的中枢
   * @param data 原始笔序列
   * @returns 延伸后的中枢（可能比原中枢多笔）
   */
  private extendChannel(
    channel: ChanChannel,
    data: readonly ChanBi[],
  ): ChanChannel {
    // 找到中枢首笔/末笔在 data 中的索引
    const firstBiTime = channel.bis[0].startTime.getTime();
    const lastBiTime = channel.bis[channel.bis.length - 1].endTime.getTime();
    let startIdx = -1;
    let endIdx = -1;
    for (let i = 0; i < data.length; i++) {
      if (data[i].startTime.getTime() === firstBiTime) startIdx = i;
      if (data[i].endTime.getTime() === lastBiTime) endIdx = i;
    }
    if (startIdx === -1 || endIdx === -1) {
      return channel;
    }

    let current = channel;
    let curStart = startIdx;
    let curEnd = endIdx;

    // 反复尝试延伸（尾部 + 头部），直到都不再能延伸
    let changed = true;
    while (changed) {
      changed = false;

      // 尾部延伸 +2 笔
      if (curEnd + 2 < data.length) {
        const tailWindow = data.slice(curStart, curEnd + 3);
        const geometry = this.validateChannelGeometry(tailWindow);
        if (geometry) {
          current = this.buildChannelFromBis(
            tailWindow,
            data,
            curStart,
            geometry,
          );
          curEnd += 2;
          changed = true;
        }
      }

      // 头部延伸 +2 笔
      if (curStart - 2 >= 0) {
        const headWindow = data.slice(curStart - 2, curEnd + 1);
        const geometry = this.validateChannelGeometry(headWindow);
        if (geometry) {
          current = this.buildChannelFromBis(
            headWindow,
            data,
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

  /**
   * 从 N 笔序列和已算好的几何参数构建中枢对象。
   */
  private buildChannelFromBis(
    bis: readonly ChanBi[],
    originalBis: readonly ChanBi[],
    startIndex: number,
    geometry: { zg: number; zd: number; gg: number; dd: number },
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
      // 延伸产物已由 validateChannelGeometry 保证合法，印 Valid
      status: ChannelStatus.Valid,
      startId: originalBis[startIndex].originIds[0],
      endId: lastBi.originIds[lastBi.originIds.length - 1],
      trend: bis[0].trend,
      expanded: false,
      displayStartId,
      displayEndId,
    };
  }

  /**
   * 验证候选中枢是否有效（标准缠论定义）。
   *
   * 中枢成立只看 zg > zd（3 段重叠）+ 至少 3 笔，不附加极值/范围强校验。
   * 极值关系只在延伸(extendChannel)和后续走势判断里用，不影响中枢是否成立。
   * @param channel 候选中枢
   * @returns 是否有效
   */
  private isCandidateChannelValid(channel: ChanChannel): boolean {
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
   * 计算并验证 N 笔中枢（N≥5，奇数）的几何参数（zg/zd/gg/dd）与首末笔约束。
   *
   * 缠论标准定义（N 笔，首笔 A、末笔 E）：
   * - 上升中枢（A 上升，从下方进入）：
   *   zg = min(前 N-1 笔高点)   中枢上沿
   *   zd = max(后 N-1 笔低点)   中枢下沿
   *   gg = max(前 N-1 笔高点)   中枢最高
   *   dd = min(后 N-1 笔低点)   中枢最低
   *   约束：A.low < dd 且 E.high > gg
   * - 下降中枢（A 下降，从上方进入）：镜像对称
   *   zg = min(后 N-1 笔高点)
   *   zd = max(前 N-1 笔低点)
   *   gg = max(后 N-1 笔高点)
   *   dd = min(前 N-1 笔低点)
   *   约束：A.high > gg 且 E.low < dd
   *
   * 5 笔时前 N-1 = 前4笔（A,B,C,D），后 N-1 = 后4笔（B,C,D,E）。
   * 7 笔时前 N-1 = 前6笔，后 N-1 = 后6笔。以此类推。
   *
   * 首末笔约束保证中枢是"进入-震荡-离开"的完整结构，而非趋势行情的片段。
   *
   * @param bis N 笔序列（N≥5，已保证趋势交替）
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

    // 前 N-1 笔和后 N-1 笔（去掉首笔或末笔）
    const front = bis.slice(0, n - 1); // 去 E
    const back = bis.slice(1); // 去 A

    let zg: number, zd: number, gg: number, dd: number;
    if (isUp) {
      // 上升：前 N-1 笔算 zg/gg，后 N-1 笔算 zd/dd
      const frontHigh = minMaxBy(front, (bi) => bi.high);
      const backLow = minMaxBy(back, (bi) => bi.low);
      if (!frontHigh || !backLow) return null;
      zg = frontHigh.min;
      gg = frontHigh.max;
      zd = backLow.max;
      dd = backLow.min;
    } else {
      // 下降：后 N-1 笔算 zg/gg，前 N-1 笔算 zd/dd
      const backHigh = minMaxBy(back, (bi) => bi.high);
      const frontLow = minMaxBy(front, (bi) => bi.low);
      if (!backHigh || !frontLow) return null;
      zg = backHigh.min;
      gg = backHigh.max;
      zd = frontLow.max;
      dd = frontLow.min;
    }

    // 约束1：zg > zd（中枢有重叠区间）
    if (zg <= zd) {
      return null;
    }

    // 约束2：首末笔必须突破中枢边界（进入段和离开段的标志性特征）
    if (isUp) {
      // 上升：A 从下方进入（A.low < dd），E 向上离开（E.high > gg）
      if (firstBi.low >= dd || lastBi.high <= gg) {
        return null;
      }
    } else {
      // 下降：A 从上方进入（A.high > gg），E 向下离开（E.low < dd）
      if (firstBi.high <= gg || lastBi.low >= dd) {
        return null;
      }
    }

    return { zg, zd, gg, dd };
  }

  /**
   * 检测 5-bi 基础中枢
   * @param fiveBis 笔数组（至少 5 笔）
   * @param originalBis 原始完整笔数组（用于获取正确的 ID）
   * @param startIndex 起始索引
   * @returns 中枢对象或 null
   */
  private detectChannel(
    fiveBis: readonly ChanBi[],
    originalBis: readonly ChanBi[],
    startIndex: number,
  ): ChanChannel | null {
    if (fiveBis.length < 5) {
      return null;
    }

    // 验证1：检查趋势是否交替
    if (!this.validateTrendAlternating(fiveBis)) {
      return null;
    }

    // 验证2：计算 zg/zd/gg/dd 并校验重叠 + 首末笔约束
    const geometry = this.validateChannelGeometry(fiveBis);
    if (!geometry) {
      return null;
    }
    const { zg, zd, gg, dd } = geometry;

    const initialFiveBis = fiveBis.slice(0, 5);

    // 计算显示范围：使用第一笔和最后一笔的中间位置
    const firstBi = originalBis[startIndex];
    const firstBiMiddleIndex = Math.floor(firstBi.originIds.length / 2);
    const displayStartId = firstBi.originIds[firstBiMiddleIndex];

    const lastBiIndex = startIndex + 4;
    const lastBi = originalBis[lastBiIndex];
    const lastBiMiddleIndex = Math.floor(lastBi.originIds.length / 2);
    const displayEndId = lastBi.originIds[lastBiMiddleIndex];

    // 创建中枢对象
    return {
      bis: [...initialFiveBis],
      zg,
      zd,
      gg,
      dd,
      level: ChannelLevel.Bi,
      type: ChannelType.Complete,
      status: ChannelStatus.Unknown, // Phase A 枚举后由 enumerateChannels 印 status
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

  /**
   * 两个中枢能否合并（Phase B 谓词）。
   *
   * 合并条件（x/y 双重叠）：
   * 1. 时间重叠：两个中枢的时间区间有交集（x 轴）
   * 2. 价格重叠：两个中枢的 [zd, zg] 区间有交集（y 轴）
   *
   * 只有双重叠才合并——单纯时间重叠但价格分离的是不同价位的中枢，
   * 单纯价格重叠但时间分离的是不同时段的中枢，都不应合并。
   *
   * @param head 首中枢
   * @param tail 尾中枢
   * @returns 能否合并
   */
  private canMergeTwoChannels(head: ChanChannel, tail: ChanChannel): boolean {
    // y 轴价格重叠：两个 zone 的交集非空
    const priceOverlapHigh = Math.min(head.zg, tail.zg);
    const priceOverlapLow = Math.max(head.zd, tail.zd);
    if (priceOverlapHigh <= priceOverlapLow) {
      return false;
    }

    // 合并后 zone 仍有效（zg > zd）
    const allBis = [...head.bis, ...tail.bis];
    const highMinMax = minMaxBy(allBis, (bi) => bi.high);
    const lowMinMax = minMaxBy(allBis, (bi) => bi.low);
    if (!highMinMax || !lowMinMax) {
      return false;
    }
    return highMinMax.min > lowMinMax.max;
  }

  private channelsOverlapInTime(head: ChanChannel, tail: ChanChannel): boolean {
    const headStart = head.bis[0]?.startTime.getTime();
    const headEnd = head.bis.at(-1)?.endTime.getTime();
    const tailStart = tail.bis[0]?.startTime.getTime();
    const tailEnd = tail.bis.at(-1)?.endTime.getTime();

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

  /**
   * 中间中枢是否都与首尾合并 zone 有价格重叠（Phase B 谓词）。
   *
   * 合并 zone 取首尾中枢 zone 的交集范围 [max(head.zd,tail.zd), min(head.zg,tail.zg)]。
   * 每个中间中枢的 [zd, zg] 必须与该合并 zone 有交集，否则说明中间存在
   * 价位分离的独立中枢，不应被一并合并。
   *
   * @param span 中枢 span（含首尾）
   * @returns 中间中枢是否都与合并 zone 价格重叠
   */
  private middleChannelsFitEnvelope(span: readonly ChanChannel[]): boolean {
    const head = span[0];
    const tail = span[span.length - 1];
    // 合并 zone 的交集范围
    const zoneHigh = Math.min(head.zg, tail.zg);
    const zoneLow = Math.max(head.zd, tail.zd);
    return span.slice(1, -1).every((middle) => {
      // 中间中枢的 [zd, zg] 与合并 zone 有交集
      return middle.zg >= zoneLow && middle.zd <= zoneHigh;
    });
  }

  /**
   * 合并两个中枢（Phase B 操作，镜像笔的 mergeTwoBis）。
   *
   * 取 head 的起点 → tail 的终点，重算 zg/zd/gg/dd/trend，重组所有笔。
   *
   * @param head 首中枢
   * @param tail 尾中枢
   * @returns 合并后的中枢
   */
  private mergeTwoChannels(head: ChanChannel, tail: ChanChannel): ChanChannel {
    // 合并笔序列：head 的笔 + tail 的笔，按时间顺序去重
    const seen = new Set<number>();
    const mergedBis: ChanBi[] = [];
    for (const bi of [...head.bis, ...tail.bis]) {
      const biKey = bi.startTime.getTime();
      if (seen.has(biKey)) {
        continue;
      }
      seen.add(biKey);
      mergedBis.push(bi);
    }

    // 用 N 笔正确定义重算几何（而非所有笔 min/max）
    const geometry = this.validateChannelGeometry(mergedBis);
    const zg = geometry ? geometry.zg : head.zg;
    const zd = geometry ? geometry.zd : head.zd;
    const gg = geometry ? geometry.gg : head.gg;
    const dd = geometry ? geometry.dd : head.dd;

    return {
      bis: mergedBis,
      zg,
      zd,
      gg,
      dd,
      level: head.level,
      type: ChannelType.Complete,
      status: ChannelStatus.Unknown, // 由 stampStatus 重新判定
      startId: head.startId,
      endId: tail.endId,
      trend: head.trend,
      expanded: false,
      displayStartId: head.displayStartId,
      displayEndId: tail.displayEndId,
    };
  }
}
