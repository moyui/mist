import { BiStatus, BiType, FenxingType, TrendDirection } from '../contracts';
import type {
  ChanBi,
  ChanBiTwoPhaseResult,
  ChanFenxing,
  ChanK,
  ChanMergedK,
} from '../contracts';
import { ChanInvariantError } from '../errors';
import { collectMergedKRange, uniqueKById } from './bi-range';
import { mergeSpans } from './span-merge';

type CompleteBiWithFenxings = ChanBi & {
  startFenxing: ChanFenxing;
  endFenxing: ChanFenxing;
};
type ThreeBiPattern = 'up-down-up' | 'down-up-down';

export class BiCalculator {
  /**
   * 主函数：识别笔（新算法：Phase A 单时间栈 + Phase B invalid 区间归约）
   *
   * 算法流程：
   * 1. 识别所有顶底分型
   * 2. 生成交错序列（顶底交替）
   * 3. 生成候选笔 + 宽笔过滤（>=3根K线）
   * 4. Phase A 单时间栈归约候选笔，再由 Phase B 归约 invalid 区间
   *
   * 核心优势：
   * - 不需要管理分型的复杂状态（leftValid/rightValid/erased）
   * - 包含关系隐式处理（通过笔的合并）
   * - 逻辑更直观，更容易理解
   * - 简化为4步，vs 旧算法的5步
   *
   * @param data 合并K线数据
   * @returns 识别出的笔数组，保证趋势交替
   */
  getBi(data: ChanMergedK[]): ChanBiTwoPhaseResult {
    // 步骤1: 识别所有顶底分型
    const allFenxings = this.getAllRawFenxings(data);

    // 步骤2: 生成交错序列（顶底交替）
    const alternatingFenxings = this.createAlternatingSequence(allFenxings);

    // 步骤3: 生成候选笔
    const candidates = this.generateCandidateBis(alternatingFenxings, data);

    // 阶段A: 单时间栈三笔归约，invalid 残留保留给阶段B消化
    const completePhaseA = this.reducePhaseATimeStack(candidates, data);
    const phaseA = this.buildFinalUncompleteBi(completePhaseA, data);

    // 阶段B: n笔合并后处理（找含invalid段的一头一尾同向笔合并）
    const phaseB = this.mergeBiSegments(phaseA, data);

    return { phaseA, phaseB };
  }

  /**
   * 获取所有分型数据（供前端使用）
   */
  getFenxings(data: ChanMergedK[]): ChanFenxing[] {
    // 步骤1: 识别所有顶底分型
    const allFenxings = this.getAllRawFenxings(data);

    // 步骤2: 生成交错序列（顶底交替）
    const alternatingFenxings = this.createAlternatingSequence(allFenxings);

    // 直接返回交替后的分型序列
    return alternatingFenxings;
  }

  /**
   * 步骤1: 获取所有原始分型
   */
  private getAllRawFenxings(data: ChanMergedK[]): ChanFenxing[] {
    const fenxings: ChanFenxing[] = [];

    for (let i = 1; i < data.length - 1; i++) {
      const fenxing = this.detectBasicFenxing(
        data[i - 1],
        data[i],
        data[i + 1],
        i,
      );

      if (fenxing) {
        fenxings.push(fenxing);
      }
    }

    return fenxings;
  }

  /**
   * 基础分型检测
   */
  private detectBasicFenxing(
    prev: ChanMergedK,
    now: ChanMergedK,
    next: ChanMergedK,
    nowIndex: number,
  ): ChanFenxing | null {
    // 简单的分型检测，不做强度判断
    const isTop =
      now.high > prev.high &&
      now.high > next.high &&
      now.low > Math.min(prev.low, next.low);

    const isBottom =
      now.low < prev.low &&
      now.low < next.low &&
      now.high < Math.max(prev.high, next.high);

    if (isTop) {
      const highestIndex = now.mergedData.reduce(
        (maxIdx, k, idx) =>
          k.high > now.mergedData[maxIdx].high ? idx : maxIdx,
        0,
      );

      return {
        type: FenxingType.Top,
        high: now.high,
        low: Math.min(prev.low, next.low),
        leftIds: prev.mergedIds,
        middleIds: now.mergedIds,
        middleIndex: nowIndex,
        rightIds: next.mergedIds,
        middleOriginId: now.mergedIds[highestIndex],
      };
    }

    if (isBottom) {
      const lowestIndex = now.mergedData.reduce(
        (minIdx, k, idx) => (k.low < now.mergedData[minIdx].low ? idx : minIdx),
        0,
      );

      return {
        type: FenxingType.Bottom,
        high: Math.max(prev.high, next.high),
        low: now.low,
        leftIds: prev.mergedIds,
        middleIds: now.mergedIds,
        middleIndex: nowIndex,
        rightIds: next.mergedIds,
        middleOriginId: now.mergedIds[lowestIndex],
      };
    }

    return null;
  }

  /**
   * 步骤2: 生成交错序列（顶底交替）
   */
  private createAlternatingSequence(fenxings: ChanFenxing[]): ChanFenxing[] {
    if (fenxings.length <= 1) {
      return fenxings;
    }

    const result: ChanFenxing[] = [fenxings[0]];

    for (let i = 1; i < fenxings.length; i++) {
      const current = fenxings[i];
      const last = result[result.length - 1];

      if (current.type !== last.type) {
        // 类型不同，直接添加
        result.push(current);
      } else {
        // 类型相同，取更极值的一个
        if (current.type === FenxingType.Top) {
          if (current.high > last.high) {
            result[result.length - 1] = current;
          }
        } else {
          if (current.low < last.low) {
            result[result.length - 1] = current;
          }
        }
      }
    }

    return result;
  }

  /**
   * 根据分型找到对应的原始K线
   */
  private findKByFenxing(data: ChanMergedK[], fenxing: ChanFenxing): ChanK {
    const middleId = fenxing.middleOriginId; // 使用分型的中间K线ID

    // 在合并K数据中查找包含这个ID的原始K线
    for (const mergedK of data) {
      const found = mergedK.mergedData.find((k) => k.id === middleId);
      if (found) {
        return found;
      }
    }

    throw new ChanInvariantError(
      `Fenxing middleOriginId ${middleId} is missing from merged K data`,
    );
  }

  /**
   * 创建未完成的笔
   */
  private buildUnCompleteBi(
    data: ChanMergedK[],
    startIndex: number,
    endIndex: number,
    prevBi: ChanBi | null,
  ): { isSequence: boolean; bi: ChanBi } {
    const start = data[startIndex];
    const end = data[endIndex];
    const rangeStats = collectMergedKRange(data, startIndex, endIndex);
    const trend =
      start.low <= end.high ? TrendDirection.Up : TrendDirection.Down;

    // 计算开始时间：优先使用上一笔的结束分型时间
    let startTime: Date;
    if (prevBi && prevBi.endFenxing) {
      startTime = this.findKByFenxing(data, prevBi.endFenxing).time;
    } else {
      startTime = start.startTime;
    }

    // 判断和上一条趋势，如果趋势相同，则需要拼接，如果趋势相反，则不需要拼接
    if (prevBi && prevBi.trend === trend) {
      // Calculate new original K count (exclude first merged K to avoid double counting)
      const newOriginKCount = collectMergedKRange(
        data,
        startIndex + 1,
        endIndex,
      ).independentCount;

      return {
        isSequence: true,
        bi: {
          startTime: prevBi.startTime,
          endTime: end.endTime,
          high: Math.max(prevBi.high, rangeStats.high),
          low: Math.min(prevBi.low, rangeStats.low),
          trend,
          type: BiType.UnComplete,
          status: BiStatus.Unknown, // 未完成笔初始化为未知状态
          originIds: Array.from(
            new Set([...prevBi.originIds, ...rangeStats.originIds]),
          ),
          originData: uniqueKById([
            ...prevBi.originData,
            ...rangeStats.originData,
          ]),
          independentCount: prevBi.independentCount + newOriginKCount,
          startFenxing: prevBi.startFenxing,
          endFenxing: null,
        },
      };
    }

    return {
      isSequence: false,
      bi: {
        startTime: startTime,
        endTime: end.endTime,
        high: rangeStats.high,
        low: rangeStats.low,
        trend,
        type: BiType.UnComplete,
        status: BiStatus.Unknown, // 未完成笔初始化为未知状态
        originIds: rangeStats.originIds,
        originData: rangeStats.originData,
        independentCount: rangeStats.independentCount,
        startFenxing: prevBi ? prevBi.endFenxing : null,
        endFenxing: null,
      },
    };
  }

  /**
   * 步骤3: 生成候选笔
   *
   * 处理逻辑：
   * - 所有相邻分型对形成候选笔
   *
   * @param fenxings 交替的分型序列
   * @param data 合并K线数据
   * @returns 候选笔数组
   */
  private generateCandidateBis(
    fenxings: ChanFenxing[],
    data: ChanMergedK[],
  ): ChanBi[] {
    const candidates: ChanBi[] = [];

    for (let i = 0; i < fenxings.length - 1; i++) {
      const start = fenxings[i];
      const end = fenxings[i + 1];

      // 生成所有候选笔，不做宽笔过滤
      // 宽笔过滤将在步骤4的最终输出时进行
      const candidate = this.buildBiFromFenxings(
        BiType.Complete,
        start,
        end,
        data,
      );
      const bi: ChanBi = {
        ...candidate,
        status: this.isCandidateBiValid(candidate)
          ? BiStatus.Valid
          : BiStatus.Invalid,
      };

      candidates.push(bi);
    }

    return candidates;
  }

  private assertPhaseATimeStackCompleteBi(
    bi: ChanBi,
    label: string,
  ): asserts bi is CompleteBiWithFenxings {
    if (bi.type !== BiType.Complete || !bi.startFenxing || !bi.endFenxing) {
      throw new ChanInvariantError(
        `Phase A time stack invariant failed: ${label} must be Complete`,
      );
    }
  }

  private phaseATimeStackRangeOf(bi: CompleteBiWithFenxings): string {
    return `${bi.startFenxing.middleIndex}-${bi.endFenxing.middleIndex}`;
  }

  private assertPhaseATimeStackAdjacent(
    previous: CompleteBiWithFenxings,
    current: CompleteBiWithFenxings,
  ): void {
    if (previous.endFenxing.middleIndex !== current.startFenxing.middleIndex) {
      throw new ChanInvariantError(
        `Phase A time stack invariant failed: non-contiguous Bis ${this.phaseATimeStackRangeOf(previous)} -> ${this.phaseATimeStackRangeOf(current)}`,
      );
    }
  }

  private assertPhaseATimeStackOuterBoundary(
    merged: CompleteBiWithFenxings,
    first: CompleteBiWithFenxings,
    third: CompleteBiWithFenxings,
  ): void {
    const expectedStart = first.startFenxing.middleIndex;
    const expectedEnd = third.endFenxing.middleIndex;
    if (
      merged.startFenxing.middleIndex !== expectedStart ||
      merged.endFenxing.middleIndex !== expectedEnd
    ) {
      throw new ChanInvariantError(
        `Phase A time stack invariant failed: merged Bi ${this.phaseATimeStackRangeOf(merged)} does not preserve ${expectedStart}-${expectedEnd}`,
      );
    }
  }

  private reducePhaseATimeStack(
    candidates: readonly ChanBi[],
    data: ChanMergedK[],
  ): ChanBi[] {
    const stack: ChanBi[] = [];

    for (const sourceCandidate of candidates) {
      const candidate: ChanBi = { ...sourceCandidate };
      this.assertPhaseATimeStackCompleteBi(candidate, 'candidate');

      if (stack.length > 0) {
        const previous = stack[stack.length - 1];
        this.assertPhaseATimeStackCompleteBi(previous, 'stack tail');
        this.assertPhaseATimeStackAdjacent(previous, candidate);
      }
      stack.push(candidate);

      while (stack.length >= 3) {
        const first = stack[stack.length - 3];
        const middle = stack[stack.length - 2];
        const third = stack[stack.length - 1];
        this.assertPhaseATimeStackCompleteBi(first, 'first');
        this.assertPhaseATimeStackCompleteBi(middle, 'middle');
        this.assertPhaseATimeStackCompleteBi(third, 'third');
        this.assertPhaseATimeStackAdjacent(first, middle);
        this.assertPhaseATimeStackAdjacent(middle, third);

        const allValid =
          first.status === BiStatus.Valid &&
          middle.status === BiStatus.Valid &&
          third.status === BiStatus.Valid;
        if (allValid) break;
        if (!this.canMergeThreeBis(first, middle, third)) break;

        const merged = this.mergeThreeBis(first, third, data);
        this.assertPhaseATimeStackCompleteBi(merged, 'merged Bi');
        this.assertPhaseATimeStackOuterBoundary(merged, first, third);
        const replacement: ChanBi = {
          ...merged,
          status: this.isCandidateBiValid(merged)
            ? BiStatus.Valid
            : BiStatus.Invalid,
        };
        stack.splice(stack.length - 3, 3, replacement);
      }
    }

    return stack;
  }

  /**
   * Phase B：归约包含 Invalid 的同向首尾区间。
   *
   * 扫描顺序固定为“跨度从短到长、同跨度从左到右”。每轮只处理第一个
   * 可归约区间，替换后再从最短跨度重新扫描，直到到达固定点。
   *
   * 合并驱动由共享的 {@link mergeSpans} 提供，Bi 领域谓词（完成态/同向/
   * canMergeTwoBis/envelope/mergeTwoBis/重新判状态）通过 operations 注入。
   */
  private mergeBiSegments(
    phaseABis: readonly ChanBi[],
    data: ChanMergedK[],
  ): ChanBi[] {
    return mergeSpans(phaseABis, {
      isCompleteItem: (bi) =>
        bi.type === BiType.Complete && !!bi.startFenxing && !!bi.endFenxing,
      isSameDirection: (head, tail) => head.trend === tail.trend,
      spanHasInvalid: (span) =>
        span.some((bi) => bi.status === BiStatus.Invalid),
      canMergeTwo: (head, tail) => this.canMergeTwoBis(head, tail),
      middleFitsEnvelope: (span) => {
        const head = span[0];
        const tail = span[span.length - 1];
        const envelopeHigh = Math.max(head.high, tail.high);
        const envelopeLow = Math.min(head.low, tail.low);
        return span
          .slice(1, -1)
          .every(
            (middle) =>
              middle.high <= envelopeHigh && middle.low >= envelopeLow,
          );
      },
      mergeTwo: (head, tail) => this.mergeTwoBis(head, tail, data),
      stampStatus: (merged) => ({
        ...merged,
        status: this.isCandidateBiValid(merged)
          ? BiStatus.Valid
          : BiStatus.Invalid,
      }),
    });
  }

  /**
   * 获取三笔的模式
   */
  private getThreePattern(
    bi1: ChanBi,
    bi2: ChanBi,
    bi3: ChanBi,
  ): ThreeBiPattern | null {
    const isUpDownUp =
      bi1.trend === TrendDirection.Up &&
      bi2.trend === TrendDirection.Down &&
      bi3.trend === TrendDirection.Up;
    const isDownUpDown =
      bi1.trend === TrendDirection.Down &&
      bi2.trend === TrendDirection.Up &&
      bi3.trend === TrendDirection.Down;

    if (isUpDownUp) return 'up-down-up';
    if (isDownUpDown) return 'down-up-down';
    return null;
  }

  private assertCompleteBi(
    bi: ChanBi,
    label: string,
  ): asserts bi is CompleteBiWithFenxings {
    if (!bi.startFenxing || !bi.endFenxing) {
      throw new ChanInvariantError(
        `Bi invariant failed: ${label} requires startFenxing and endFenxing`,
      );
    }
  }

  private canMergeTwoBis(bi1: ChanBi, bi2: ChanBi) {
    this.assertCompleteBi(bi1, 'bi1');
    this.assertCompleteBi(bi2, 'bi2');

    // 递进条件用非严格不等号（<= / >=）：
    // 两端分型价格相等（同一阻力/支撑位的不同分型）时也应允许合并，
    // 否则 Phase A 三笔合成会漏掉 "valid + Invalid + Invalid" 这种典型残留，
    // 把它们留给 Phase B 反而被更大跨度合并吞掉合法反向笔。
    if (
      bi2.trend === TrendDirection.Up &&
      bi1.trend === TrendDirection.Up &&
      bi1.endFenxing.high <= bi2.endFenxing.high &&
      bi1.startFenxing.low < bi2.startFenxing.low
    ) {
      return true;
    }
    if (
      bi2.trend === TrendDirection.Down &&
      bi1.trend === TrendDirection.Down &&
      bi1.startFenxing.high > bi2.startFenxing.high &&
      bi1.endFenxing.low >= bi2.endFenxing.low
    ) {
      return true;
    }
    return false;
  }

  private canMergeThreeBis(bi1: ChanBi, bi2: ChanBi, bi3: ChanBi) {
    this.assertCompleteBi(bi1, 'bi1');
    this.assertCompleteBi(bi2, 'bi2');
    this.assertCompleteBi(bi3, 'bi3');

    const pattern = this.getThreePattern(bi1, bi2, bi3);
    if (!pattern) return false;
    const canMergeSameTrend = this.canMergeTwoBis(bi1, bi3);
    if (!canMergeSameTrend) return false;
    switch (pattern) {
      case 'up-down-up': {
        return (
          bi1.startFenxing.low <= bi2.endFenxing.low &&
          bi2.startFenxing.high <= bi3.endFenxing.high
        );
      }
      case 'down-up-down':
        return (
          bi1.startFenxing.high >= bi2.endFenxing.high &&
          bi2.startFenxing.low >= bi3.endFenxing.low
        );
      default:
        return false;
    }
  }

  /**
   * 合并两笔
   */
  private mergeTwoBis(bi1: ChanBi, bi2: ChanBi, data: ChanMergedK[]): ChanBi {
    this.assertCompleteBi(bi1, 'bi1');
    this.assertCompleteBi(bi2, 'bi2');

    // 合并两笔：bi1的起点 + bi2的终点
    const startIdx = bi1.startFenxing.middleIndex;
    const endIdx = bi2.endFenxing.middleIndex;
    const rangeStats = collectMergedKRange(data, startIdx, endIdx);

    // 使用分型的中间K线时间，而不是合并K的开始/结束时间
    const startK = this.findKByFenxing(data, bi1.startFenxing);
    const endK = this.findKByFenxing(data, bi2.endFenxing);

    return {
      startTime: startK.time,
      endTime: endK.time,
      high: rangeStats.high,
      low: rangeStats.low,
      trend: bi1.trend,
      type: BiType.Complete,
      status: BiStatus.Unknown, // 合并后的笔初始化为未知状态，将由 helper 重新验证
      originIds: rangeStats.originIds,
      originData: rangeStats.originData,
      independentCount: rangeStats.independentCount,
      startFenxing: bi1.startFenxing,
      endFenxing: bi2.endFenxing,
    };
  }

  /**
   * 合并三笔
   */
  private mergeThreeBis(bi1: ChanBi, bi3: ChanBi, data: ChanMergedK[]): ChanBi {
    this.assertCompleteBi(bi1, 'bi1');
    this.assertCompleteBi(bi3, 'bi3');

    // 合并三笔：bi1的起点 + bi3的终点
    const startIdx = bi1.startFenxing.middleIndex;
    const endIdx = bi3.endFenxing.middleIndex;
    const rangeStats = collectMergedKRange(data, startIdx, endIdx);

    // 使用分型的中间K线时间，而不是合并K的开始/结束时间
    const startK = this.findKByFenxing(data, bi1.startFenxing);
    const endK = this.findKByFenxing(data, bi3.endFenxing);

    return {
      startTime: startK.time,
      endTime: endK.time,
      high: rangeStats.high,
      low: rangeStats.low,
      trend: bi1.trend,
      type: BiType.Complete,
      status: BiStatus.Unknown, // 合并后的笔初始化为未知状态，将由 helper 重新验证
      originIds: rangeStats.originIds,
      originData: rangeStats.originData,
      independentCount: rangeStats.independentCount,
      startFenxing: bi1.startFenxing,
      endFenxing: bi3.endFenxing,
    };
  }

  /**
   * 检查两个分型是否构成宽笔
   *
   * **缠论宽笔定义：**
   * 1. 顶分型与底分型不能有共用K线（保证力度）
   * 2. 顶分型的最高K线和底分型的最低K线之间（不包括这两根），至少有3根K线（不考虑包含关系）
   *
   * **总结：**
   * - 由条件1可知：经过包含处理后，一笔至少有4根K线（分型各3根，但不能重叠）
   * - 由条件2可知：宽笔一笔中至少包含5根未处理包含关系的K线
   *
   * @param startFenxing 起始分型（顶分型或底分型）
   * @param endFenxing 结束分型（底分型或顶分型）
   * @returns 是否满足宽笔要求
   */
  private resolveUniqueOriginPosition(
    originData: readonly ChanK[],
    middleOriginId: number,
    label: 'start' | 'end',
  ): number {
    let resolvedPosition = -1;

    for (let position = 0; position < originData.length; position++) {
      if (originData[position].id !== middleOriginId) {
        continue;
      }
      if (resolvedPosition !== -1) {
        throw new ChanInvariantError(
          `Wide Bi invariant failed: ${label} middleOriginId ${middleOriginId} occurs more than once in originData`,
        );
      }
      resolvedPosition = position;
    }

    if (resolvedPosition === -1) {
      throw new ChanInvariantError(
        `Wide Bi invariant failed: ${label} middleOriginId ${middleOriginId} is missing from originData`,
      );
    }

    return resolvedPosition;
  }

  private isWideBi(
    startFenxing: ChanFenxing,
    endFenxing: ChanFenxing,
    originData: readonly ChanK[],
  ): boolean {
    const startPosition = this.resolveUniqueOriginPosition(
      originData,
      startFenxing.middleOriginId,
      'start',
    );
    const endPosition = this.resolveUniqueOriginPosition(
      originData,
      endFenxing.middleOriginId,
      'end',
    );

    // 条件1：检查是否有共用K线
    const startFenxingIds = new Set([
      ...startFenxing.leftIds,
      ...startFenxing.middleIds,
      ...startFenxing.rightIds,
    ]);
    const endFenxingIds = new Set([
      ...endFenxing.leftIds,
      ...endFenxing.middleIds,
      ...endFenxing.rightIds,
    ]);

    // 如果有共用K线，不满足条件1
    for (const id of startFenxingIds) {
      if (endFenxingIds.has(id)) {
        return false;
      }
    }

    // 条件2：按当前候选笔的有序原始K位置计算，不把数据库主键当作连续序号。
    const betweenCount = Math.abs(endPosition - startPosition) - 1;

    return betweenCount >= 3;
  }

  /**
   * 从分型构建笔
   */
  private buildBiFromFenxings(
    type: BiType,
    start: ChanFenxing,
    end: ChanFenxing,
    data: ChanMergedK[],
  ): ChanBi {
    const startIdx = start.middleIndex;
    const endIdx = end.middleIndex;
    const rangeStats = collectMergedKRange(data, startIdx, endIdx);

    const trend =
      start.type === FenxingType.Bottom
        ? TrendDirection.Up
        : TrendDirection.Down;

    // 使用分型的中间K线时间，而不是合并K的开始/结束时间
    const startK = this.findKByFenxing(data, start);
    const endK = this.findKByFenxing(data, end);

    return {
      startTime: startK.time,
      endTime: endK.time,
      high: rangeStats.high,
      low: rangeStats.low,
      trend,
      type,
      status: BiStatus.Unknown, // 初始化为未知状态
      originIds: rangeStats.originIds,
      originData: rangeStats.originData,
      independentCount: rangeStats.independentCount,
      startFenxing: start,
      endFenxing: end,
    };
  }

  /**
   * 构建最终的未完成笔
   */
  private buildFinalUncompleteBi(
    completeStack: readonly ChanBi[],
    data: ChanMergedK[],
  ): ChanBi[] {
    const result = completeStack.map((bi) => ({ ...bi }));

    if (result.length === 0 && data.length > 0) {
      // 没有任何笔，但从头开始创建未完成笔
      const { bi } = this.buildUnCompleteBi(data, 0, data.length - 1, null);
      return [bi];
    }

    if (result.length === 0) {
      return [];
    }

    const lastBi = result[result.length - 1];
    const endIndex = data.length - 1;

    // 检查是否需要构建未完成笔
    if (lastBi.endFenxing) {
      const lastFenxingIndex = lastBi.endFenxing.middleIndex;
      if (lastFenxingIndex < endIndex) {
        // 需要构建未完成笔
        const { isSequence, bi } = this.buildUnCompleteBi(
          data,
          lastFenxingIndex,
          endIndex,
          lastBi,
        );

        if (isSequence) {
          result[result.length - 1] = bi;
        } else {
          result.push(bi);
        }
      }
    }

    return result;
  }

  /**
   * 检查笔是否满足宽笔要求（>=3根原始K线）
   *
   * 这个方法用于最终过滤，确保笔的宽度满足要求。
   * 根据缠论定义：
   * 1. 顶分型与底分型不能有共用K线
   * 2. 顶分型的最高K线和底分型的最低K线之间（不包括这两根），至少有3根K线
   *
   * @param bi 待检查的笔
   * @returns 是否满足宽笔要求
   */
  private isBiWideEnough(bi: ChanBi): boolean {
    if (!bi.startFenxing || !bi.endFenxing) {
      return false;
    }

    return this.isWideBi(bi.startFenxing, bi.endFenxing, bi.originData);
  }

  /**
   * 检查分型包含关系
   */
  private isFenxingContainment(
    a: ChanFenxing | null,
    b: ChanFenxing | null,
  ): {
    hasContainment: boolean;
    type: 'a_contains_b' | 'b_contains_a' | 'none';
  } {
    if (!a || !b) {
      return { hasContainment: false, type: 'none' };
    }
    // 只有不同类型的分型才可能存在包含关系
    if (a.type === b.type) {
      return { hasContainment: false, type: 'none' };
    }

    if (a.type === FenxingType.Top && b.type === FenxingType.Bottom) {
      // a是顶分型，b是底分型
      if (a.high >= b.high && a.low <= b.low) {
        return { hasContainment: true, type: 'a_contains_b' };
      } else if (b.high >= a.high && b.low <= a.low) {
        return { hasContainment: true, type: 'b_contains_a' };
      }
    } else if (a.type === FenxingType.Bottom && b.type === FenxingType.Top) {
      // a是底分型，b是顶分型
      if (a.high >= b.high && a.low <= b.low) {
        return { hasContainment: true, type: 'a_contains_b' };
      } else if (b.high >= a.high && b.low <= a.low) {
        return { hasContainment: true, type: 'b_contains_a' };
      }
    }

    return { hasContainment: false, type: 'none' };
  }

  /**
   * 检查候选笔是否有效
   * @param bi
   * @param data
   * @returns
   */
  private isCandidateBiValid(bi: ChanBi): boolean {
    const differentTypes = bi.startFenxing?.type !== bi.endFenxing?.type;
    const wideEnough = this.isBiWideEnough(bi);
    const noContainment = !this.isFenxingContainment(
      bi.startFenxing,
      bi.endFenxing,
    ).hasContainment;

    return differentTypes && wideEnough && noContainment;
  }
}
