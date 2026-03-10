import { Injectable } from '@nestjs/common';
import { KVo } from '../../indicator/vo/k.vo';
import { BiType, BiStatus } from '../enums/bi.enum';
import { FenxingType } from '../enums/fenxing.enum';
import { TrendDirection } from '../enums/trend-direction.enum';
import { BiVo } from '../vo/bi.vo';
import { FenxingVo } from '../vo/fenxing.vo';
import { MergedKVo } from '../vo/merged-k.vo';

const uniqueById = (arr: KVo[]) => {
  const seen = new Set<number>();
  return arr.filter((item) => {
    if (seen.has(item.id)) {
      return false;
    }
    seen.add(item.id);
    return true;
  });
};

@Injectable()
export class BiService {
  /**
   * 主函数：识别笔（新算法：递推+回退）
   *
   * 算法流程：
   * 1. 识别所有顶底分型
   * 2. 生成交错序列（顶底交替）
   * 3. 生成候选笔 + 宽笔过滤（>=3根K线）
   * 4. 递推状态机处理候选笔
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
  getBi(data: MergedKVo[]): BiVo[] {
    // 步骤1: 识别所有顶底分型
    const allFenxings = this.getAllRawFenxings(data);

    // 步骤2: 生成交错序列（顶底交替）
    const alternatingFenxings = this.createAlternatingSequence(allFenxings);

    // 步骤3: 生成候选笔
    const candidates = this.generateCandidateBis(alternatingFenxings, data);

    // 步骤4: 递推状态机处理
    const bis = this.processCandidateBisWithRollback(candidates, data);

    return bis;
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
    const rangeKs = data.slice(startIndex, endIndex + 1);
    const trend =
      start.lowest <= end.highest ? TrendDirection.Up : TrendDirection.Down;

    // 计算笔的属性
    let highest = -Infinity;
    let lowest = Infinity;
    const allOriginIds: number[] = [];
    const allOriginData: KVo[] = [];

    rangeKs.forEach((k) => {
      highest = Math.max(highest, k.highest);
      lowest = Math.min(lowest, k.lowest);
      allOriginIds.push(...k.mergedIds);
      allOriginData.push(...k.mergedData);
    });

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
      const newOriginKCount = rangeKs
        .slice(1)
        .reduce((sum, k) => sum + k.mergedData.length, 0);

      return {
        isSequence: true,
        bi: {
          startTime: prevBi.startTime,
          endTime: end.endTime,
          highest: Math.max(prevBi.highest, highest),
          lowest: Math.min(prevBi.lowest, lowest),
          trend,
          type: BiType.UnComplete,
          status: BiStatus.Unknown, // 未完成笔初始化为未知状态
          originIds: Array.from(
            new Set([...prevBi.originIds, ...allOriginIds]),
          ),
          originData: uniqueById([...prevBi.originData, ...allOriginData]),
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
        highest,
        lowest,
        trend,
        type: BiType.UnComplete,
        status: BiStatus.Unknown, // 未完成笔初始化为未知状态
        originIds: Array.from(new Set(allOriginIds)),
        originData: uniqueById(allOriginData),
        independentCount: rangeKs.reduce(
          (sum, k) => sum + k.mergedData.length,
          0,
        ),
        startFenxing: prevBi ? prevBi.endFenxing : null,
        endFenxing: null,
      },
    };
  }

  /**
   * ============================================================================
   * 新算法：递推+回退状态机
   * ============================================================================
   */

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

  /**
   * 步骤4: 递推状态机处理候选笔
   *
   * 状态定义：
   * - confirmed: 暂时确认的笔（仍可能回退）
   * - pending: 正在试探的笔（可能存在多笔）
   *
   * @param candidates 候选笔数组
   * @param data 合并K线数据
   * @returns 最终的笔数组
   */
  private processCandidateBisWithRollback(
    candidates: BiVo[],
    data: MergedKVo[],
  ): BiVo[] {
    let confirmed: BiVo[] = [];
    let pending: BiVo[] = [];

    for (let i = 0; i < candidates.length; i++) {
      const newBi = candidates[i];
      const result = this.tryAddBi(confirmed, pending, newBi, data);
      confirmed = result.confirmed;
      pending = result.pending;
    }

    // 处理未完成的最后一笔
    const finalResult = this.buildFinalUncompleteBi(confirmed, pending, data);

    return finalResult;
  }

  /**
   * 尝试添加新笔（核心递推逻辑 - 无递归版本）
   *
   * 设计思路：
   * - 合并具有单调性：合并后的笔极值范围更大，更难再次合并
   * - 笔的方向交替性：上升→下降→上升，阻止了连锁合并
   * - 因此：一次合并后，不需要立即尝试再次合并，可加入pending等待后续处理
   *
   * @param confirmed 已经确认的笔
   * @param pending 滑动窗口迭代
   * @param bi3 这次新增的笔
   * @param data 原始数据队列
   * @returns 最终的笔数组
   */
  private tryAddBi(
    confirmed: BiVo[], // 已经确认的笔
    pending: BiVo[], // 滑动窗口迭代
    bi3: BiVo, // 这次新增的笔
    data: MergedKVo[], // 原始数据队列
  ): { confirmed: BiVo[]; pending: BiVo[] } {
    // 检查候选笔是否有效
    const bi3Valid = bi3.status === BiStatus.Valid;
    const { bi: bi2, from: bi2From } = this.getLastBi(pending, confirmed);
    const { bi: bi1, from: bi1From } = this.getLastLastBi(
      pending,
      confirmed,
      bi2From,
    );

    // 检查pending中的笔的数量是否超过了3笔
    if (pending.length >= 3) {
      // 说明里面堆积的候选笔很多，这里就要判断是否能够一口气直接合并
      // 首先判断起点是否能从pending数组开始
      const pendingResult = this.handleTwoBiInPending(pending, bi3, data);
      if (pendingResult.status === 'merge') {
        this.removeBiByIndex(pending, pendingResult.startIndex);
        return this.pushBi(pending, confirmed, pendingResult.bi);
      }
      // 再判断起点是否能从confirm数组开始
      const confirmedResult = this.handleTwoBiInConfirmed(confirmed, bi3, data);
      if (confirmedResult.status === 'merge') {
        this.removeBiByIndex(confirmed, confirmedResult.startIndex);
        return this.pushBi(pending, confirmed, confirmedResult.bi);
      }
      // 如果这里都不满足的话，那么就继续继续向下看
    }

    // 常规情况只做三笔合并判断
    if (bi1 && bi2 && bi3) {
      const bi1Valid = bi1.status === BiStatus.Valid;
      const bi2Valid = bi2.status === BiStatus.Valid;

      if (bi1Valid && bi2Valid && bi3Valid) {
        // 如果bi1和bi2都有效，那么直接删除原来位置，加入confirmed即可
        this.removeBiByFrom(pending, confirmed, bi1From, bi2From);
        return {
          confirmed: [...confirmed, bi1, bi2, bi3],
          pending: [...pending],
        };
      } else {
        // 如果只要bi1,bi2,bi3三笔当中有一笔无效，就进行合并推测
        const result = this.handleThreeBi(bi1, bi2, bi3, data);
        if (result.status === 'merge') {
          // 移除原有的位置
          this.removeBiByFrom(pending, confirmed, bi1From, bi2From);
          return this.pushBi(pending, confirmed, result.bi);
        }
        if (bi3Valid) {
          // 在这三笔无法合并成为一笔的情况下，此时bi3却可以独立存在成为一笔
          // 这里先尝试将bi1，bi2，bi3加入confirm进行确认，然后等待后面还有没有什么bug的情况导致需要回退
          this.removeBiByFrom(pending, confirmed, bi1From, bi2From);
          return {
            confirmed: [...confirmed, bi1, bi2, bi3],
            pending: [...pending],
          };
        }
      }
    }
    // 其他情况
    return {
      confirmed: [...confirmed],
      pending: [...pending, bi3],
    };
  }

  /**
   * 获取三笔的模式
   */
  private getThreePattern(bi1: BiVo, bi2: BiVo, bi3: BiVo): string | null {
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

  private getLastBi(pending: BiVo[], confirmed: BiVo[]) {
    if (pending[pending.length - 1]) {
      return {
        bi: pending[pending.length - 1],
        from: 'pending',
      };
    }
    if (confirmed[confirmed.length - 1]) {
      return {
        bi: confirmed[confirmed.length - 1],
        from: 'confirmed',
      };
    }
    return {
      bi: null,
      from: 'none',
    };
  }

  private getLastLastBi(pending: BiVo[], confirmed: BiVo[], lastFrom: string) {
    if (lastFrom === 'pending') {
      // 那么现在pending的倒数第二笔找
      if (pending[pending.length - 2]) {
        return {
          bi: pending[pending.length - 2],
          from: 'pending',
        };
      } else if (confirmed[confirmed.length - 1]) {
        return {
          bi: confirmed[confirmed.length - 1],
          from: 'confirmed',
        };
      } else {
        return {
          bi: null,
          from: 'none',
        };
      }
    } else if (lastFrom === 'confirmed') {
      if (confirmed[confirmed.length - 2]) {
        return {
          bi: confirmed[confirmed.length - 2],
          from: 'confirmed',
        };
      } else {
        return {
          bi: null,
          from: 'none',
        };
      }
    } else {
      return {
        bi: null,
        from: 'none',
      };
    }
  }

  private canMergeTwoBis(bi1: BiVo, bi2: BiVo) {
    if (
      bi2.trend === TrendDirection.Up &&
      bi1.trend === TrendDirection.Up &&
      bi1.endFenxing!.highest < bi2.endFenxing!.highest &&
      bi1.startFenxing!.lowest < bi2.startFenxing!.lowest
    ) {
      return true;
    }
    if (
      bi2.trend === TrendDirection.Down &&
      bi1.trend === TrendDirection.Down &&
      bi1.startFenxing!.highest > bi2.startFenxing!.highest &&
      bi1.endFenxing!.lowest > bi2.endFenxing!.lowest
    ) {
      return true;
    }
    return false;
  }

  private canMergeThreeBis(bi1: BiVo, bi2: BiVo, bi3: BiVo) {
    const pattern = this.getThreePattern(bi1, bi2, bi3);
    if (!pattern) return false;
    const canMergeSameTrend = this.canMergeTwoBis(bi1, bi3);
    if (!canMergeSameTrend) return false;
    switch (pattern) {
      case 'up-down-up': {
        return (
          bi1.startFenxing!.lowest <= bi2.endFenxing!.lowest &&
          bi2.startFenxing!.highest <= bi3.endFenxing!.highest
        );
      }
      case 'down-up-down':
        return (
          bi1.startFenxing!.highest >= bi2.endFenxing!.highest &&
          bi2.startFenxing!.lowest >= bi3.endFenxing!.lowest
        );
      default:
        return false;
    }
  }

  private findStartBiInPending(pending: BiVo[], bi: BiVo): number {
    let index = -1;
    for (let i = 0; i < pending.length; i++) {
      const candidate = pending[i];
      if (candidate.trend !== bi.trend) continue;
      if (this.canMergeTwoBis(candidate, bi)) {
        index = i;
        break;
      }
    }

    return index;
  }
  /**
   * 处理两笔在pending数组中
   * @param pending
   * @param bi
   * @param data
   * @returns
   */
  private handleTwoBiInPending(
    pending: BiVo[],
    bi: BiVo,
    data: MergedKVo[],
  ): { status: 'keepAll' | 'merge'; bi: BiVo; startIndex: number } {
    const startIndex = this.findStartBiInPending(pending, bi);
    if (startIndex !== -1) {
      const startBi = pending[startIndex];
      const result = this.mergeTwoBis(startBi, bi, data);
      return {
        status: 'merge',
        startIndex: startIndex,
        bi: result,
      };
    }
    // 如果没找到，那么只能保留
    return { status: 'keepAll', bi: bi, startIndex: -1 };
  }

  /**
   * 处理两笔在confirmed数组中
   * @param candidate
   * @param bi
   * @param data
   * @returns
   */
  private handleTwoBiInConfirmed(
    confirmed: BiVo[],
    bi: BiVo,
    data: MergedKVo[],
  ): { status: 'keepAll' | 'merge'; bi: BiVo; startIndex: number } {
    // 至少得有一个长度，三笔的情况可能不存在
    if (confirmed.length < 1) {
      return { status: 'keepAll', bi: bi, startIndex: -1 };
    }
    const bi1 = confirmed[confirmed.length - 2];
    const bi2 = confirmed[confirmed.length - 1];

    // 判断bi2和bi是否是同方向的，再进行处理
    if (bi2.trend === bi.trend) {
      if (this.canMergeTwoBis(bi2, bi)) {
        const result = this.mergeTwoBis(bi2, bi, data);
        return {
          status: 'merge',
          bi: result,
          startIndex: confirmed.length - 1,
        };
      } else {
        return { status: 'keepAll', bi: bi, startIndex: -1 };
      }
    } else {
      if (bi1 && bi2 && this.canMergeThreeBis(bi1, bi2, bi)) {
        const result = this.mergeThreeBis(bi1, bi, data);
        return {
          status: 'merge',
          bi: result,
          startIndex: confirmed.length - 2,
        };
      } else {
        return { status: 'keepAll', bi: bi, startIndex: -1 };
      }
    }
  }

  /**
   * 处理三笔
   */
  private handleThreeBi(bi1: BiVo, bi2: BiVo, bi3: BiVo, data: MergedKVo[]) {
    if (!this.canMergeThreeBis(bi1, bi2, bi3)) {
      return { status: 'keepAll', bi: bi3 };
    } else {
      return { status: 'merge', bi: this.mergeThreeBis(bi1, bi3, data) };
    }
  }

  /**
   * 移除pending数组中指定索引的笔
   * @param pending
   * @param index
   */
  private removeBiByIndex<T>(bis: T[], index: number) {
    if (index >= 0 && index < bis.length) {
      bis.splice(index);
    }
  }

  /**
   * 移除笔
   * @param pending
   * @param confirmed
   * @param bi1From
   * @param bi2From
   */
  private removeBiByFrom(
    pending: BiVo[],
    confirmed: BiVo[],
    bi1From: string,
    bi2From: string,
  ) {
    if (bi1From === 'pending' && bi2From === 'pending') {
      if (pending.length < 2) {
        throw new Error('Invalid state: pending has fewer than 2 items');
      }

      pending.pop();
      pending.pop();
      // 这个不应该存在
    } else if (bi1From === 'confirmed' && bi2From === 'pending') {
      if (pending.length < 1 || confirmed.length < 1) {
        throw new Error(
          'Invalid state: pending & confirmed has fewer than 2 items',
        );
      }

      confirmed.pop();
      pending.pop();
    } else if (bi1From === 'confirmed' && bi2From === 'confirmed') {
      if (confirmed.length < 2) {
        throw new Error('Invalid state: confirmed has fewer than 2 items');
      }

      confirmed.pop();
      confirmed.pop();
    }
  }

  /**
   * 合并两笔
   */
  private mergeTwoBis(bi1: BiVo, bi2: BiVo, data: MergedKVo[]): BiVo {
    // 合并两笔：bi1的起点 + bi2的终点
    const startIdx = bi1.startFenxing!.middleIndex;
    const endIdx = bi2.endFenxing!.middleIndex;

    const rangeKs = data.slice(startIdx, endIdx + 1);

    let highest = -Infinity;
    let lowest = Infinity;
    const allOriginIds: number[] = [];
    const allOriginData: KVo[] = [];

    rangeKs.forEach((k) => {
      highest = Math.max(highest, k.highest);
      lowest = Math.min(lowest, k.lowest);
      allOriginIds.push(...k.mergedIds);
      allOriginData.push(...k.mergedData);
    });

    // 使用分型的中间K线时间，而不是合并K的开始/结束时间
    const startK = this.findKByFenxing(data, bi1.startFenxing!);
    const endK = this.findKByFenxing(data, bi2.endFenxing!);

    return {
      startTime: startK.time,
      endTime: endK.time,
      highest,
      lowest,
      trend: bi1.trend,
      type: BiType.Complete,
      status: BiStatus.Unknown, // 合并后的笔初始化为未知状态，将在pushBi中重新验证
      originIds: Array.from(new Set(allOriginIds)),
      originData: uniqueById(allOriginData),
      independentCount: rangeKs.reduce(
        (sum, k) => sum + k.mergedData.length,
        0,
      ),
      startFenxing: bi1.startFenxing,
      endFenxing: bi2.endFenxing,
    };
  }

  /**
   * 合并三笔
   */
  private mergeThreeBis(bi1: BiVo, bi3: BiVo, data: MergedKVo[]): BiVo {
    // 合并三笔：bi1的起点 + bi3的终点
    const startIdx = bi1.startFenxing!.middleIndex;
    const endIdx = bi3.endFenxing!.middleIndex;

    const rangeKs = data.slice(startIdx, endIdx + 1);

    let highest = -Infinity;
    let lowest = Infinity;
    const allOriginIds: number[] = [];
    const allOriginData: KVo[] = [];

    rangeKs.forEach((k) => {
      highest = Math.max(highest, k.highest);
      lowest = Math.min(lowest, k.lowest);
      allOriginIds.push(...k.mergedIds);
      allOriginData.push(...k.mergedData);
    });

    // 使用分型的中间K线时间，而不是合并K的开始/结束时间
    const startK = this.findKByFenxing(data, bi1.startFenxing!);
    const endK = this.findKByFenxing(data, bi3.endFenxing!);

    return {
      startTime: startK.time,
      endTime: endK.time,
      highest,
      lowest,
      trend: bi1.trend,
      type: BiType.Complete,
      status: BiStatus.Unknown, // 合并后的笔初始化为未知状态，将在pushBi中重新验证
      originIds: Array.from(new Set(allOriginIds)),
      originData: uniqueById(allOriginData),
      independentCount: rangeKs.reduce(
        (sum, k) => sum + k.mergedData.length,
        0,
      ),
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

    const rangeKs = data.slice(startIdx, endIdx + 1);

    let highest = -Infinity;
    let lowest = Infinity;
    const allOriginIds: number[] = [];
    const allOriginData: KVo[] = [];

    rangeKs.forEach((k) => {
      highest = Math.max(highest, k.highest);
      lowest = Math.min(lowest, k.lowest);
      allOriginIds.push(...k.mergedIds);
      allOriginData.push(...k.mergedData);
    });

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
      highest,
      lowest,
      trend,
      type,
      status: BiStatus.Unknown, // 初始化为未知状态
      originIds: Array.from(new Set(allOriginIds)),
      originData: uniqueById(allOriginData),
      independentCount: rangeKs.reduce(
        (sum, k) => sum + k.mergedData.length,
        0,
      ),
      startFenxing: start,
      endFenxing: end,
    };
  }

  /**
   * 构建最终的未完成笔
   */
  private buildFinalUncompleteBi(
    confirmed: BiVo[],
    pending: BiVo[],
    data: MergedKVo[],
  ): BiVo[] {
    const result = [...confirmed, ...pending];

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
   * @param data 合并K线数据（此参数保留用于兼容性，但不再使用）
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

  /**
   * 将笔加入确认数组或待处理数组
   * @param pending
   * @param confirmed
   * @param bi
   */
  private pushBi(pending: BiVo[], confirmed: BiVo[], bi: BiVo) {
    // 检查新笔是否有效（因为可能有新合并的笔需要重新验证）
    const isValid = this.isCandidateBiValid(bi);

    // 将新计算的状态写入笔中
    bi.status = isValid ? BiStatus.Valid : BiStatus.Invalid;

    // 这里有confirm为0的处理，如果confirm为0的情况下，且新生成的笔是有效笔的情况下，需要把pending的内容区域清空处理
    if (!isValid) {
      pending.push(bi);
    }

    if (isValid) {
      if (confirmed.length === 0 && pending.length > 0) {
        pending = [];
        confirmed.push(bi);
      } else if (pending.length === 0) {
        confirmed.push(bi);
      } else {
        pending.push(bi);
      }
    }

    return { confirmed: [...confirmed], pending: [...pending] };
  }
}
