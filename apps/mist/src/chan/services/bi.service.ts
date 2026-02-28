import { Injectable } from '@nestjs/common';
import { KVo } from '../../indicator/vo/k.vo';
import { BiType } from '../enums/bi.enum';
import { FenxingType } from '../enums/fenxing.enum';
import { TrendDirection } from '../enums/trend-direction.enum';
import { BiVo } from '../vo/bi.vo';
import { FenxingVo, FenxingWithStateVo } from '../vo/fenxing.vo';
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
   * 主函数：识别笔（旧算法备份）
   *
   * NOTE: This is the old implementation kept for reference and comparison.
   * It has a known bug where it can produce consecutive bis with the same trend,
   * violating the fundamental alternating property of bi in Chan Theory.
   *
   * The new implementation (getBi) fixes this issue using a recursive + rollback
   * state machine approach.
   */
  getBiOld(data: MergedKVo[]): BiVo[] {
    // 步骤1: 识别所有顶底分型
    const allFenxings = this.getAllRawFenxings(data);

    // 步骤2: 生成交错序列（顶底交替）
    const alternatingFenxings = this.createAlternatingSequence(allFenxings);

    // 保存到状态（这里只是示意，实际需要序列化存储）
    this.saveFenxingState(alternatingFenxings);

    // 步骤3: 创建带状态的分型对象
    const fenxingsWithState = this.createFenxingsWithState(alternatingFenxings);

    // 步骤4: 计算伪笔有效性，标记擦除
    this.markInvalidPseudoBi(fenxingsWithState, data);

    // 步骤5: 连接有效分型，形成真实的笔
    const bis = this.connectValidFenxings(fenxingsWithState, data);

    return bis;
  }

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

    // 步骤3: 生成候选笔 + 宽笔过滤
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
   * Save fenxing state (placeholder)
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private saveFenxingState(fenxings: FenxingVo[]): void {
    // This should save the alternating sequence to database or file
    // Can be restored from here next time
    // console.log(`Saved ${fenxings.length} fenxings to state`);
  }

  /**
   * 步骤3: 创建带状态的分型对象
   */
  private createFenxingsWithState(fenxings: FenxingVo[]): FenxingWithStateVo[] {
    return fenxings.map((fenxing) => ({
      ...fenxing,
      leftValid: true, // 初始两侧都有效
      rightValid: true,
      erased: false,
    }));
  }

  /**
   * 步骤4: 标记无效的伪笔
   */
  private markInvalidPseudoBi(
    fenxings: FenxingWithStateVo[],
    data: MergedKVo[],
  ): void {
    // 处理每一对相邻分型（伪笔）
    for (let i = 0; i < fenxings.length - 1; i++) {
      const current = fenxings[i];
      const next = fenxings[i + 1];

      // 检查分型包含关系
      const containment = this.checkFenxingContainment(current, next);
      if (containment.hasContainment) {
        // 存在包含关系，标记擦除
        this.markErasureForContainment(current, next, containment.type);
        continue;
      }

      // 检查伪笔的有效性，伪笔也要满足笔的基础条件才能成为真笔
      if (!this.isBiValid(current, next, data)) {
        // 伪笔无效，标记擦除
        this.markErasureForInvalidBi(current, next);
      }
    }

    // 更新erased状态
    fenxings.forEach((f) => {
      f.erased = !f.leftValid && !f.rightValid;
    });
  }

  /**
   * 检查分型包含关系
   */
  private checkFenxingContainment(
    a: FenxingWithStateVo,
    b: FenxingWithStateVo,
  ): {
    hasContainment: boolean;
    type: 'a_contains_b' | 'b_contains_a' | 'none';
  } {
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
   * 标记包含关系的擦除
   */
  private markErasureForContainment(
    a: FenxingWithStateVo,
    b: FenxingWithStateVo,
    containmentType: string,
  ): void {
    if (containmentType === 'a_contains_b') {
      // a包含b
      // b完全无效
      b.leftValid = false;
      b.rightValid = false;

      // a的右侧无效（因为a到b的笔不成立）
      a.rightValid = false;

      // 记录：b被a包含
      b.erased = true;
    } else if (containmentType === 'b_contains_a') {
      // b包含a
      // a完全无效
      a.leftValid = false;
      a.rightValid = false;

      // b的左侧无效
      b.leftValid = false;

      // 记录：a被b包含
      a.erased = true;
    }
  }

  /**
   * 检查伪笔的有效性
   */
  private isBiValid(
    start: FenxingWithStateVo,
    end: FenxingWithStateVo,
    data: MergedKVo[],
  ): boolean {
    // 基本检查：分型类型必须相反
    if (start.type === end.type) {
      return false;
    }

    // 价格关系检查
    if (start.type === FenxingType.Bottom) {
      // 上升笔：终点高点必须高于起点低点
      if (end.highest <= start.lowest) {
        return false;
      }
    } else {
      // 下降笔：终点低点必须低于起点高点
      if (end.lowest >= start.highest) {
        return false;
      }
    }

    // 宽笔检查，除去分型的下标之间的原始数据长度要大于等于3
    const startMergeKIndex = start.middleIndex + 1;
    const endMergeKIndex = end.middleIndex - 1;
    const mergeKs = data.slice(startMergeKIndex, endMergeKIndex + 1);
    const originKs = mergeKs.flatMap((item) => item.mergedIds);
    if (originKs.length < 3) {
      return false;
    }

    return true;
  }

  /**
   * 标记无效伪笔的擦除
   */
  private markErasureForInvalidBi(
    start: FenxingWithStateVo,
    end: FenxingWithStateVo,
  ): void {
    // 无效伪笔：擦除两个分型的连接侧
    // start的右侧无效，end的左侧无效
    start.rightValid = false;
    end.leftValid = false;
  }

  /**
   * 步骤6: 连接有效分型，形成真实的笔
   */
  private connectValidFenxings(
    fenxings: FenxingWithStateVo[],
    data: MergedKVo[],
  ): BiVo[] {
    const bis: BiVo[] = [];
    let currentIndex = 0;
    let currentValidIndex = 0;

    while (currentIndex < fenxings.length) {
      // 寻找有效的起点分型
      const startResult = this.findValidStartFenxing(fenxings, currentIndex);
      if (!startResult.found) {
        break;
      }

      const startIndex = startResult.index!;
      const startFenxing = fenxings[startIndex];

      // 从起点开始，尝试连接后续的有效分型
      const connectionResult = this.tryConnectFromStart(
        fenxings,
        startIndex,
        data,
      );

      if (connectionResult.success) {
        // 成功形成一笔
        const bi = this.buildCompleteBi(
          data,
          startFenxing,
          connectionResult.endFenxing!,
        );

        // 注意，新形成的笔可以把所在分型的左右两侧都至为true
        this.updateFengxingStateAfterBuildBi(
          fenxings,
          startIndex,
          connectionResult.endIndex!,
        );

        bis.push(bi);

        // 更新当前索引到这个结束笔
        currentIndex = connectionResult.endIndex!;
        currentValidIndex = connectionResult.endIndex!;
      } else {
        // 连接失败，尝试下一个分型
        currentIndex = startIndex + 1;
      }
    }

    if (currentValidIndex < data.length) {
      const startIndex = fenxings[currentValidIndex]?.middleIndex ?? 0;
      // 这里得判断最后一段数据是否可以和前面一段的数据进行拼接
      const { isSequence, bi } = this.buildUnCompleteBi(
        data,
        startIndex,
        data.length - 1,
        bis[bis.length - 1],
      );

      if (isSequence) {
        bis[bis.length - 1] = bi;
      } else {
        bis.push(bi);
      }
    }

    return bis;
  }

  /**
   * 寻找有效的起点分型
   */
  private findValidStartFenxing(
    fenxings: FenxingWithStateVo[],
    startIndex: number,
  ): { found: boolean; index?: number; fenxing?: FenxingWithStateVo } {
    for (let i = startIndex; i < fenxings.length; i++) {
      const fenxing = fenxings[i];
      // 起点分型只要不被擦除即为有效
      if (!fenxing.erased) {
        return {
          found: true,
          index: i,
          fenxing,
        };
      }
    }

    return { found: false };
  }

  /**
   * 尝试从起点开始连接
   */
  private tryConnectFromStart(
    fenxings: FenxingWithStateVo[],
    startIndex: number,
    data: MergedKVo[],
  ): {
    success: boolean;
    endFenxing?: FenxingWithStateVo;
    endIndex?: number;
  } {
    const startFenxing = fenxings[startIndex];
    const trend =
      startFenxing.type === FenxingType.Bottom
        ? TrendDirection.Up
        : TrendDirection.Down;

    let bestEndFenxing: FenxingWithStateVo | null = null;
    let bestEndIndex: number = -1;

    // 寻找可能的终点分型
    for (let i = startIndex + 1; i < fenxings.length; i++) {
      const candidate = fenxings[i];

      // 如果在已经找到了某一个终点分型的情况下，快速判断终点分型和下一个连续分型之间的关系
      // 如果下一个终点分型的右侧和下一个分型的左侧valid，那么就到此为止
      if (
        bestEndIndex !== -1 &&
        bestEndFenxing?.rightValid &&
        candidate.leftValid
      ) {
        break;
      }

      // 检查候选分型是否可以作为终点
      if (!this.canBeEndFenxing(candidate, trend)) {
        continue;
      }

      // 检查趋势是否保持
      if (
        !this.isTrendMaintained(
          startFenxing,
          candidate,
          trend,
          fenxings,
          startIndex,
          i,
        )
      ) {
        // 趋势不再保持，停止寻找
        break;
      }

      // 检查笔的有效性
      if (this.isBiValid(startFenxing, candidate, data)) {
        // 如果已经有最佳终点，检查当前候选是否更好（创新高/新低）
        if (bestEndFenxing) {
          if (trend === TrendDirection.Up) {
            // 上升趋势，只有创新高的顶分型才能替代之前的终点
            if (candidate.highest <= bestEndFenxing.highest) {
              // 没有创新高，停止寻找
              break;
            }
          } else {
            // 下降趋势，只有创新低的底分型才能替代之前的终点
            if (candidate.lowest >= bestEndFenxing.lowest) {
              // 没有创新低，停止寻找
              break;
            }
          }
        }

        // 更新最佳终点
        bestEndFenxing = candidate;
        bestEndIndex = i;
      }
    }

    if (bestEndFenxing) {
      return {
        success: true,
        endFenxing: bestEndFenxing,
        endIndex: bestEndIndex,
      };
    }

    return { success: false };
  }

  /**
   * 检查候选分型是否可以作为终点
   */
  private canBeEndFenxing(
    candidate: FenxingWithStateVo,
    trend: TrendDirection,
  ): boolean {
    // 候选分型必须不是整个被擦除的分型
    if (candidate.erased) {
      return false;
    }

    // 分型类型必须与趋势匹配
    if (trend === TrendDirection.Up) {
      // 上升笔，终点必须是顶分型
      if (candidate.type !== FenxingType.Top) {
        return false;
      }
    } else {
      // 下降笔，终点必须是底分型
      if (candidate.type !== FenxingType.Bottom) {
        return false;
      }
    }

    return true;
  }

  /**
   * 检查趋势是否保持
   */
  private isTrendMaintained(
    start: FenxingWithStateVo,
    candidate: FenxingWithStateVo,
    trend: TrendDirection,
    fenxings: FenxingWithStateVo[],
    startIndex: number,
    candidateIndex: number,
  ): boolean {
    for (let i = startIndex + 1; i < candidateIndex; i++) {
      const middleFenxing = fenxings[i];

      // 如果是上升趋势中，中间的同向分型应该越来越高，上升趋势的起点必然是底分型
      if (
        trend === TrendDirection.Up &&
        middleFenxing.type === FenxingType.Bottom
      ) {
        if (middleFenxing.lowest <= start.lowest) {
          return false; // 趋势反转
        }
        // 同理，下降趋势的起点必然是顶分型
      } else if (
        trend === TrendDirection.Down &&
        middleFenxing.type === FenxingType.Top
      ) {
        if (middleFenxing.highest >= start.highest) {
          return false; // 趋势反转
        }
      }
    }

    // 检查候选分型本身
    if (trend === TrendDirection.Up) {
      // 上升趋势，候选顶分型应该创新高 start底分型，candidate顶分型
      return candidate.highest > start.lowest;
    } else {
      // 下降趋势，候选底分型应该创新低
      return candidate.lowest < start.highest;
    }
  }

  /**
   * 创建笔
   */
  private buildCompleteBi(
    data: MergedKVo[],
    start: FenxingWithStateVo,
    end: FenxingWithStateVo,
  ): BiVo {
    const startIdx = start.middleIndex;
    const endIdx = end.middleIndex;

    // 收集笔范围内的所有K线
    const rangeKs = data.slice(startIdx, endIdx + 1);

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

    // 趋势方向
    const trend =
      start.type === FenxingType.Bottom
        ? TrendDirection.Up
        : TrendDirection.Down;

    return {
      startTime: data[startIdx].startTime,
      endTime: data[endIdx].endTime,
      highest,
      lowest,
      trend,
      type: BiType.Complete,
      originIds: Array.from(new Set(allOriginIds)),
      originData: uniqueById(allOriginData),
      independentCount: rangeKs.length,
      startFenxing: start,
      endFenxing: end,
    };
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

    // 判断和上一条趋势，如果趋势相同，则需要拼接，如果趋势相反，则不需要拼接
    if (prevBi && prevBi.trend === trend) {
      return {
        isSequence: true,
        bi: {
          startTime: prevBi.startTime,
          endTime: end.endTime,
          highest: Math.max(prevBi.highest, highest),
          lowest: Math.min(prevBi.lowest, lowest),
          trend,
          type: BiType.UnComplete,
          originIds: Array.from(
            new Set([...prevBi.originIds, ...allOriginIds]),
          ),
          originData: uniqueById([...prevBi.originData, ...allOriginData]),
          independentCount: prevBi.independentCount + rangeKs.length - 1,
          startFenxing: prevBi.startFenxing,
          endFenxing: null,
        },
      };
    }

    return {
      isSequence: false,
      bi: {
        startTime: start.startTime,
        endTime: end.endTime,
        highest,
        lowest,
        trend,
        type: BiType.UnComplete,
        originIds: Array.from(new Set(allOriginIds)),
        originData: uniqueById(allOriginData),
        independentCount: rangeKs.length,
        startFenxing: prevBi ? prevBi.endFenxing : null,
        endFenxing: null,
      },
    };
  }

  /**
   * 画笔之后更新分型状态
   */
  private updateFengxingStateAfterBuildBi(
    fenxings: FenxingWithStateVo[],
    start: number,
    end: number,
  ) {
    fenxings[start].rightValid = true;
    fenxings[start].erased = false;
    fenxings[end].leftValid = true;
    fenxings[end].erased = false;
  }

  /**
   * ============================================================================
   * 新算法：递推+回退状态机
   * ============================================================================
   */

  /**
   * 步骤3: 生成候选笔 + 宽笔过滤
   *
   * 处理逻辑：
   * - 所有相邻分型对形成候选笔
   * - 立即检查宽笔要求（>=3根K线）
   * - 不满足的候选笔直接丢弃
   *
   * @param fenxings 交替的分型序列
   * @param data 合并K线数据
   * @returns 候选笔数组（已过滤宽笔）
   */
  private generateCandidateBis(
    fenxings: FenxingVo[],
    data: MergedKVo[],
  ): BiVo[] {
    const candidates: BiVo[] = [];

    for (let i = 0; i < fenxings.length - 1; i++) {
      const start = fenxings[i];
      const end = fenxings[i + 1];

      // 计算K线数量
      const kCount = this.countOriginKsBetween(
        start.middleIndex,
        end.middleIndex,
        data,
      );

      // 宽笔过滤：必须>=3根K线
      if (kCount >= 3) {
        candidates.push(this.buildBiFromFenxings(start, end, data));
      }
    }

    return candidates;
  }

  /**
   * 步骤4: 递推状态机处理候选笔
   *
   * 状态定义：
   * - confirmed: 暂时确认的笔（仍可能回退）
   * - pending: 正在试探的笔（最多1笔）
   *
   * 递推规则：
   * 1. pending为空 → 直接加入
   * 2. 趋势交替 → 将pending移入confirmed，新笔加入pending
   * 3. 趋势相同 → 检查是否形成"up→down→up"或"down→up→down"模式并处理
   *
   * @param candidates 候选笔数组
   * @param data 合并K线数据
   * @returns 最终的笔数组
   */
  private processCandidateBisWithRollback(
    candidates: BiVo[],
    data: MergedKVo[],
  ): BiVo[] {
    const confirmed: BiVo[] = [];
    const pending: BiVo[] = [];

    for (const newBi of candidates) {
      const result = this.tryAddBi(confirmed, pending, newBi, data);
      confirmed.length = 0;
      confirmed.push(...result.confirmed);
      pending.length = 0;
      pending.push(...result.pending);
    }

    // 处理未完成的最后一笔
    const finalResult = this.buildFinalUncompleteBi(confirmed, pending, data);

    return finalResult;
  }

  /**
   * 尝试添加新笔（核心递推逻辑）
   */
  private tryAddBi(
    confirmed: BiVo[],
    pending: BiVo[],
    newBi: BiVo,
    data: MergedKVo[],
  ): { confirmed: BiVo[]; pending: BiVo[] } {
    // 规则1: pending为空，直接加入
    if (pending.length === 0) {
      return { confirmed, pending: [newBi] };
    }

    const lastPending = pending[0];

    // 规则2: 趋势交替，将pending移入confirmed
    if (lastPending.trend !== newBi.trend) {
      return {
        confirmed: [...confirmed, lastPending],
        pending: [newBi],
      };
    }

    // 规则3: 趋势相同，需要处理
    // 此时pending和newBi趋势相同，需要检查confirmed的最后一笔
    if (confirmed.length === 0) {
      // 没有前序笔，合并pending和newBi
      return {
        confirmed: [...confirmed],
        pending: [this.mergeTwoBis(lastPending, newBi, data)],
      };
    }

    const lastConfirmed = confirmed[confirmed.length - 1];

    // 检查是否形成 pattern: lastConfirmed → lastPending → newBi
    const pattern = this.getPattern(lastConfirmed, lastPending, newBi);

    if (pattern === 'up-down-up') {
      return this.handleUpDownUp(
        lastConfirmed,
        lastPending,
        newBi,
        confirmed,
        data,
      );
    } else if (pattern === 'down-up-down') {
      return this.handleDownUpDown(
        lastConfirmed,
        lastPending,
        newBi,
        confirmed,
        data,
      );
    }

    // 其他情况：直接合并pending和newBi
    return {
      confirmed: [...confirmed],
      pending: [this.mergeTwoBis(lastPending, newBi, data)],
    };
  }

  /**
   * 获取三笔的模式
   */
  private getPattern(bi1: BiVo, bi2: BiVo, bi3: BiVo): string | null {
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

  /**
   * 处理 up → down → up 模式
   */
  private handleUpDownUp(
    bi1: BiVo, // up
    bi2: BiVo, // down
    bi3: BiVo, // up
    confirmed: BiVo[],
    data: MergedKVo[],
  ): { confirmed: BiVo[]; pending: BiVo[] } {
    if (bi1.highest > bi3.highest) {
      // 保留bi1，合并bi2+bi3成down笔
      const mergedDown = this.mergeTwoBis(bi2, bi3, data);
      return {
        confirmed: [...confirmed.slice(0, -1), bi1],
        pending: [mergedDown],
      };
    } else {
      // 合并bi1+bi2+bi3成大up笔
      const bigUp = this.mergeThreeBis(bi1, bi2, bi3, data);
      return {
        confirmed: [...confirmed.slice(0, -1), bigUp],
        pending: [],
      };
    }
  }

  /**
   * 处理 down → up → down 模式
   */
  private handleDownUpDown(
    bi1: BiVo, // down
    bi2: BiVo, // up
    bi3: BiVo, // down
    confirmed: BiVo[],
    data: MergedKVo[],
  ): { confirmed: BiVo[]; pending: BiVo[] } {
    if (bi1.lowest < bi3.lowest) {
      // 保留bi1，合并bi2+bi3成up笔
      const mergedUp = this.mergeTwoBis(bi2, bi3, data);
      return {
        confirmed: [...confirmed.slice(0, -1), bi1],
        pending: [mergedUp],
      };
    } else {
      // 合并bi1+bi2+bi3成大down笔
      const bigDown = this.mergeThreeBis(bi1, bi2, bi3, data);
      return {
        confirmed: [...confirmed.slice(0, -1), bigDown],
        pending: [],
      };
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

    return {
      startTime: data[startIdx].startTime,
      endTime: data[endIdx].endTime,
      highest,
      lowest,
      trend: bi1.trend,
      type: BiType.Complete,
      originIds: Array.from(new Set(allOriginIds)),
      originData: uniqueById(allOriginData),
      independentCount: rangeKs.length,
      startFenxing: bi1.startFenxing,
      endFenxing: bi2.endFenxing,
    };
  }

  /**
   * 合并三笔
   */
  private mergeThreeBis(
    bi1: BiVo,
    bi2: BiVo,
    bi3: BiVo,
    data: MergedKVo[],
  ): BiVo {
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

    return {
      startTime: data[startIdx].startTime,
      endTime: data[endIdx].endTime,
      highest,
      lowest,
      trend: bi1.trend,
      type: BiType.Complete,
      originIds: Array.from(new Set(allOriginIds)),
      originData: uniqueById(allOriginData),
      independentCount: rangeKs.length,
      startFenxing: bi1.startFenxing,
      endFenxing: bi3.endFenxing,
    };
  }

  /**
   * 计算两个分型之间的原始K线数量
   */
  private countOriginKsBetween(
    startIndex: number,
    endIndex: number,
    data: MergedKVo[],
  ): number {
    const startMergeKIndex = startIndex + 1;
    const endMergeKIndex = endIndex - 1;
    const mergeKs = data.slice(startMergeKIndex, endMergeKIndex + 1);
    const originKs = mergeKs.flatMap((item) => item.mergedIds);
    return originKs.length;
  }

  /**
   * 从分型构建笔
   */
  private buildBiFromFenxings(
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

    return {
      startTime: data[startIdx].startTime,
      endTime: data[endIdx].endTime,
      highest,
      lowest,
      trend,
      type: BiType.Complete,
      originIds: Array.from(new Set(allOriginIds)),
      originData: uniqueById(allOriginData),
      independentCount: rangeKs.length,
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
}
