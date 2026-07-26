import { Injectable } from '@nestjs/common';
import { KVo } from '../../indicator/vo/k.vo';
import { BiType, BiStatus } from '../enums/bi.enum';
import { FenxingType } from '../enums/fenxing.enum';
import { TrendDirection } from '../enums/trend-direction.enum';
import { BiVo } from '../vo/bi.vo';
import { FenxingVo } from '../vo/fenxing.vo';
import { MergedKVo } from '../vo/merged-k.vo';
import { collectMergedKRange, uniqueKById } from './bi-range.helper';
import { mergeSpans } from './span-merge.helper';

type CompleteBiWithFenxings = BiVo & {
  startFenxing: FenxingVo;
  endFenxing: FenxingVo;
};
type ThreeBiPattern = 'up-down-up' | 'down-up-down';

/**
 * 两阶段合并结果：
 * - phaseA: 三笔合并输出（valid + invalid 残留混合）
 * - phaseB: n笔合并后处理输出（消化 invalid 残留后的干净序列）
 * 前端叠加渲染：phaseA 实线，phaseB 淡色线。
 */
export interface BiTwoPhaseResult {
  phaseA: BiVo[];
  phaseB: BiVo[];
}

@Injectable()
export class BiService {
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
  getBi(data: MergedKVo[]): BiTwoPhaseResult {
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
  getFenxings(data: MergedKVo[]): FenxingVo[] {
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
  private getAllRawFenxings(data: MergedKVo[]): FenxingVo[] {
    const fenxings: FenxingVo[] = [];

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
    prev: MergedKVo,
    now: MergedKVo,
    next: MergedKVo,
    nowIndex: number,
  ): FenxingVo | null {
    // 简单的分型检测，不做强度判断
    const isTop =
      now.highest > prev.highest &&
      now.highest > next.highest &&
      now.lowest > Math.min(prev.lowest, next.lowest);

    const isBottom =
      now.lowest < prev.lowest &&
      now.lowest < next.lowest &&
      now.highest < Math.max(prev.highest, next.highest);

    if (isTop) {
      const highestIndex = now.mergedData.reduce(
        (maxIdx, k, idx) =>
          k.highest > now.mergedData[maxIdx].highest ? idx : maxIdx,
        0,
      );

      return {
        type: FenxingType.Top,
        highest: now.highest,
        lowest: Math.min(prev.lowest, next.lowest),
        leftIds: prev.mergedIds,
        middleIds: now.mergedIds,
        middleIndex: nowIndex,
        rightIds: next.mergedIds,
        middleOriginId: now.mergedIds[highestIndex],
      };
    }

    if (isBottom) {
      const lowestIndex = now.mergedData.reduce(
        (minIdx, k, idx) =>
          k.lowest < now.mergedData[minIdx].lowest ? idx : minIdx,
        0,
      );

      return {
        type: FenxingType.Bottom,
        highest: Math.max(prev.highest, next.highest),
        lowest: now.lowest,
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
  private createAlternatingSequence(fenxings: FenxingVo[]): FenxingVo[] {
    if (fenxings.length <= 1) {
      return fenxings;
    }

    const result: FenxingVo[] = [fenxings[0]];

    for (let i = 1; i < fenxings.length; i++) {
      const current = fenxings[i];
      const last = result[result.length - 1];

      if (current.type !== last.type) {
        // 类型不同，直接添加
        result.push(current);
      } else {
        // 类型相同，取更极值的一个
        if (current.type === FenxingType.Top) {
          if (current.highest > last.highest) {
            result[result.length - 1] = current;
          }
        } else {
          if (current.lowest < last.lowest) {
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
  private findKByFenxing(data: MergedKVo[], fenxing: FenxingVo): KVo {
    const middleId = fenxing.middleOriginId; // 使用分型的中间K线ID

    // 在合并K数据中查找包含这个ID的原始K线
    for (const mergedK of data) {
      const found = mergedK.mergedData.find((k) => k.id === middleId);
      if (found) {
        return found;
      }
    }

    // 如果找不到，回退到使用分型所在合并K的第一个K线
    const fallback = data[fenxing.middleIndex].mergedData[0];
    return fallback;
  }

  /**
   * 创建未完成的笔
   */
  private buildUnCompleteBi(
    data: MergedKVo[],
    startIndex: number,
    endIndex: number,
    prevBi: BiVo | null,
  ): { isSequence: boolean; bi: BiVo } {
    const start = data[startIndex];
    const end = data[endIndex];
    const rangeStats = collectMergedKRange(data, startIndex, endIndex);
    const trend =
      start.lowest <= end.highest ? TrendDirection.Up : TrendDirection.Down;

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
          highest: Math.max(prevBi.highest, rangeStats.highest),
          lowest: Math.min(prevBi.lowest, rangeStats.lowest),
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
        highest: rangeStats.highest,
        lowest: rangeStats.lowest,
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
    fenxings: FenxingVo[],
    data: MergedKVo[],
  ): BiVo[] {
    const candidates: BiVo[] = [];

    for (let i = 0; i < fenxings.length - 1; i++) {
      const start = fenxings[i];
      const end = fenxings[i + 1];

      // 生成所有候选笔，不做宽笔过滤
      // 宽笔过滤将在步骤4的最终输出时进行
      const bi = this.buildBiFromFenxings(BiType.Complete, start, end, data);

      // 计算并设置状态
      bi.status = this.isCandidateBiValid(bi)
        ? BiStatus.Valid
        : BiStatus.Invalid;

      candidates.push(bi);
    }

    return candidates;
  }

  private assertPhaseATimeStackCompleteBi(
    bi: BiVo,
    label: string,
  ): asserts bi is CompleteBiWithFenxings {
    if (bi.type !== BiType.Complete || !bi.startFenxing || !bi.endFenxing) {
      throw new Error(
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
      throw new Error(
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
      throw new Error(
        `Phase A time stack invariant failed: merged Bi ${this.phaseATimeStackRangeOf(merged)} does not preserve ${expectedStart}-${expectedEnd}`,
      );
    }
  }

  private reducePhaseATimeStack(
    candidates: readonly BiVo[],
    data: MergedKVo[],
  ): BiVo[] {
    const stack: BiVo[] = [];

    for (const sourceCandidate of candidates) {
      const candidate: BiVo = { ...sourceCandidate };
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
        const replacement: BiVo = {
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
    phaseABis: readonly BiVo[],
    data: MergedKVo[],
  ): BiVo[] {
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
        const envelopeHigh = Math.max(head.highest, tail.highest);
        const envelopeLow = Math.min(head.lowest, tail.lowest);
        return span
          .slice(1, -1)
          .every(
            (middle) =>
              middle.highest <= envelopeHigh && middle.lowest >= envelopeLow,
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
    bi1: BiVo,
    bi2: BiVo,
    bi3: BiVo,
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
    bi: BiVo,
    label: string,
  ): asserts bi is CompleteBiWithFenxings {
    if (!bi.startFenxing || !bi.endFenxing) {
      throw new Error(
        `Bi invariant failed: ${label} requires startFenxing and endFenxing`,
      );
    }
  }

  private canMergeTwoBis(bi1: BiVo, bi2: BiVo) {
    this.assertCompleteBi(bi1, 'bi1');
    this.assertCompleteBi(bi2, 'bi2');

    // 递进条件用非严格不等号（<= / >=）：
    // 两端分型价格相等（同一阻力/支撑位的不同分型）时也应允许合并，
    // 否则 Phase A 三笔合成会漏掉 "valid + Invalid + Invalid" 这种典型残留，
    // 把它们留给 Phase B 反而被更大跨度合并吞掉合法反向笔。
    if (
      bi2.trend === TrendDirection.Up &&
      bi1.trend === TrendDirection.Up &&
      bi1.endFenxing.highest <= bi2.endFenxing.highest &&
      bi1.startFenxing.lowest < bi2.startFenxing.lowest
    ) {
      return true;
    }
    if (
      bi2.trend === TrendDirection.Down &&
      bi1.trend === TrendDirection.Down &&
      bi1.startFenxing.highest > bi2.startFenxing.highest &&
      bi1.endFenxing.lowest >= bi2.endFenxing.lowest
    ) {
      return true;
    }
    return false;
  }

  private canMergeThreeBis(bi1: BiVo, bi2: BiVo, bi3: BiVo) {
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
          bi1.startFenxing.lowest <= bi2.endFenxing.lowest &&
          bi2.startFenxing.highest <= bi3.endFenxing.highest
        );
      }
      case 'down-up-down':
        return (
          bi1.startFenxing.highest >= bi2.endFenxing.highest &&
          bi2.startFenxing.lowest >= bi3.endFenxing.lowest
        );
      default:
        return false;
    }
  }

  /**
   * 合并两笔
   */
  private mergeTwoBis(bi1: BiVo, bi2: BiVo, data: MergedKVo[]): BiVo {
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
      highest: rangeStats.highest,
      lowest: rangeStats.lowest,
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
  private mergeThreeBis(bi1: BiVo, bi3: BiVo, data: MergedKVo[]): BiVo {
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
      highest: rangeStats.highest,
      lowest: rangeStats.lowest,
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
  private isWideBi(startFenxing: FenxingVo, endFenxing: FenxingVo): boolean {
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

    // 条件2：顶分型最高K线和底分型最低K线之间（不包括这两根），
    // 至少有3根原始K线（不考虑包含关系，直接用ID差值计算）
    const startId = startFenxing.middleOriginId;
    const endId = endFenxing.middleOriginId;

    // 确保起始ID小于结束ID
    const minId = Math.min(startId, endId);
    const maxId = Math.max(startId, endId);

    // 计算两个K线之间的原始K线数量（不包括这两根）
    const betweenCount = maxId - minId - 1;

    return betweenCount >= 3;
  }

  /**
   * 从分型构建笔
   */
  private buildBiFromFenxings(
    type: BiType,
    start: FenxingVo,
    end: FenxingVo,
    data: MergedKVo[],
  ): BiVo {
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
      highest: rangeStats.highest,
      lowest: rangeStats.lowest,
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
    completeStack: readonly BiVo[],
    data: MergedKVo[],
  ): BiVo[] {
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
  private isBiWideEnough(bi: BiVo): boolean {
    if (!bi.startFenxing || !bi.endFenxing) {
      return false;
    }

    return this.isWideBi(bi.startFenxing, bi.endFenxing);
  }

  /**
   * 检查分型包含关系
   */
  private isFenxingContainment(
    a: FenxingVo | null,
    b: FenxingVo | null,
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
      if (a.highest >= b.highest && a.lowest <= b.lowest) {
        return { hasContainment: true, type: 'a_contains_b' };
      } else if (b.highest >= a.highest && b.lowest <= a.lowest) {
        return { hasContainment: true, type: 'b_contains_a' };
      }
    } else if (a.type === FenxingType.Bottom && b.type === FenxingType.Top) {
      // a是底分型，b是顶分型
      if (a.highest >= b.highest && a.lowest <= b.lowest) {
        return { hasContainment: true, type: 'a_contains_b' };
      } else if (b.highest >= a.highest && b.lowest <= a.lowest) {
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
  private isCandidateBiValid(bi: BiVo): boolean {
    const differentTypes = bi.startFenxing?.type !== bi.endFenxing?.type;
    const wideEnough = this.isBiWideEnough(bi);
    const noContainment = !this.isFenxingContainment(
      bi.startFenxing,
      bi.endFenxing,
    ).hasContainment;

    return differentTypes && wideEnough && noContainment;
  }
}
