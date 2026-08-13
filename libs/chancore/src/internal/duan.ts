import { DuanStatus, DuanType, TrendDirection } from '../contracts';
import type { ChanBi, ChanDuan } from '../contracts';
import { ChanInvariantError } from '../errors';
import { collectBiRangeStats } from './duan-range';

/**
 * 段（线段）划分 —— 缠中说禅第67课「特征序列法」+ 第71课「再分辨」的边界分型。
 *
 * 算法结构：
 * - 特征序列：向上段取所有向下笔 X（元素 high/low=笔高低点），向下段取向上笔 S；
 *   向上段只看顶分型，向下段只看底分型。
 * - **分型元素按第71课定义**（关键）：
 *   - 第一元素 = 假设转折点前**最后一个特征元素**（标准特征序列的末元素，含段内包含合并）；
 *   - 第二元素 = 从转折点开始的**第一笔**（反向笔，原始元素）；
 *   - 第三元素 = 第二元素之后的下一反向笔（原始元素，"方便预设"，不属于前后任何一段特征序列）。
 *   - **第一/第二元素之间不做包含合并**（它们不是同一特征序列的）；包含关系只对段内
 *     （转折点之前）的元素成立。这正是 71 课对"特征序列塌缩导致段永不终止"问题的处理。
 * - 段终止两种情况（67课）：第一/第二元素间无缺口=第一种（直接确认）；有缺口=第二种
 *   （需反方向新段特征序列也出分型才倒推确认；价格越过原极值则失效、段继续延伸）。
 * - 段终止于第二元素（反向笔）的**前一根同向笔**；段间首尾相接重处理。
 *
 * 返回确认后的段单数组（无 phaseA/phaseB）。不复用 {@link mergeSpans}（单遍递推 + case-2 受限前瞻）。
 */

/** 特征序列元素：一根反向笔视为一根"准K线"。 */
interface FeatureElement {
  readonly high: number;
  readonly low: number;
  readonly biIndex: number;
}

interface SegmentEnd {
  readonly endIdx: number;
  readonly nextStart: number;
}

export class DuanCalculator {
  /**
   * 入参 = `createBi` 返回值的 `phaseB`（`ChanBi[]`，最终笔数组）——段算法只消费最终笔，
   * 不需要两阶段 envelope。返回确认后的段序列（单数组，无 phaseA）。
   */
  createDuan(bis: readonly ChanBi[]): ChanDuan[] {
    if (bis.length < 3) {
      return [];
    }
    return this.segment(bis, this.findValidSegmentStart(bis));
  }

  /**
   * 有效起始点选择（镜像 tomcat123a/-chanlun 的 check_init_seg）：
   * 跳过无效起始，找第一个满足 4 笔有效结构的起点——
   * 上升段：bi[i].high < bi[i+2].high（高点更高）且 bi[i].low < bi[i+1].low（低点更高）；
   * 下降段：bi[i].low > bi[i+2].low（低点更低）且 bi[i].high > bi[i+1].high（高点更低）。
   * 找不到时回退到 0（保持旧行为）。
   */
  private findValidSegmentStart(bis: readonly ChanBi[]): number {
    for (let i = 0; i <= bis.length - 4; i++) {
      if (bis[i].trend === TrendDirection.Up) {
        if (bis[i].high < bis[i + 2].high && bis[i].low < bis[i + 1].low) {
          return i;
        }
      } else if (bis[i].low > bis[i + 2].low && bis[i].high > bis[i + 1].high) {
        return i;
      }
    }
    return 0;
  }

  /** 切分整条笔序列为确认后的段序列（case-1 直接确认 + case-2 倒推确认），从 startIdx 起。 */
  private segment(bis: readonly ChanBi[], startIdx: number): ChanDuan[] {
    const out: ChanDuan[] = [];
    while (startIdx < bis.length) {
      const direction = bis[startIdx].trend;
      const end = this.findSegmentEnd(bis, startIdx, direction);
      if (end === null) {
        out.push(
          this.buildDuan(
            bis,
            startIdx,
            bis.length - 1,
            DuanType.UnComplete,
            DuanStatus.Unknown,
          ),
        );
        break;
      }
      out.push(
        this.buildDuan(
          bis,
          startIdx,
          end.endIdx,
          DuanType.Complete,
          DuanStatus.Valid,
        ),
      );
      startIdx = end.nextStart;
    }
    return out;
  }

  /**
   * 从 segStartIdx 起为方向 direction 的段找终止点（第71课边界分型）。
   *
   * 对每个反向笔（候选"第二元素"，其起点=候选转折点），在其后一反向笔（"第三元素"）到来时，
   * 用 第一元素（标准特征序列末元素，段内包含合并）/ 第二元素（原始）/ 第三元素（原始）检查分型。
   * **第一/第二元素之间不做包含合并**（71课：分型元素横跨转折点，不属于同一特征序列）。
   * 无缺口分型（第一种）直接确认终止；有缺口分型（第二种）需 case2Confirmed 倒推确认，
   * 未确认则段继续延伸、继续扫描下一分型。
   */
  private findSegmentEnd(
    bis: readonly ChanBi[],
    segStartIdx: number,
    direction: TrendDirection,
  ): SegmentEnd | null {
    let stdSeq: FeatureElement[] = []; // 段内标准特征序列（转折点之前的元素，含包含合并）
    let prev: FeatureElement | null = null; // 候选"第二元素"
    for (let i = segStartIdx; i < bis.length; i++) {
      if (bis[i].trend === direction) {
        continue; // 同向笔（段体），不入特征序列
      }
      const rev: FeatureElement = {
        high: bis[i].high,
        low: bis[i].low,
        biIndex: i,
      };
      if (prev !== null) {
        const first = stdSeq.length > 0 ? stdSeq[stdSeq.length - 1] : null;
        if (
          first !== null &&
          this.isDirectionalFenxing(first, prev, rev, direction)
        ) {
          const endIdx = prev.biIndex - 1;
          if (endIdx >= segStartIdx) {
            if (!this.hasGap(first, prev)) {
              // 第一种情况：段在第二元素起点（转折点）处结束
              return { endIdx, nextStart: prev.biIndex };
            }
            // 第二种情况（有缺口）：需反方向新段也出分型才倒推确认
            const extremum =
              direction === TrendDirection.Down ? prev.low : prev.high;
            if (this.case2Confirmed(bis, prev.biIndex, direction, extremum)) {
              return { endIdx, nextStart: prev.biIndex };
            }
            // 未确认：prev 归属段内，继续扫描下一分型
          }
        }
        stdSeq = this.mergeFeatureInclusion(stdSeq, prev, direction);
      }
      prev = rev;
    }
    return null;
  }

  /**
   * 第二种情况倒推确认（67课）：从 reverseStart 起的反方向新段，其特征序列出现**任意分型**
   * 即确认原段终止（不分第一/第二种情况）。若价格越过原极值（originalDir 方向）则失效，返回 false。
   * 同样按第71课边界分型检查（第一/第二元素不做包含合并）。
   */
  private case2Confirmed(
    bis: readonly ChanBi[],
    reverseStart: number,
    originalDir: TrendDirection,
    extremum: number,
  ): boolean {
    const reverseDir = bis[reverseStart].trend;
    let stdSeq: FeatureElement[] = [];
    let prev: FeatureElement | null = null;
    for (let i = reverseStart; i < bis.length; i++) {
      const bi = bis[i];
      // 失效：价格越过原极值
      if (originalDir === TrendDirection.Up && bi.high > extremum) {
        return false;
      }
      if (originalDir === TrendDirection.Down && bi.low < extremum) {
        return false;
      }
      if (bi.trend === reverseDir) {
        continue; // 反方向新段的同向笔（段体）
      }
      const rev: FeatureElement = { high: bi.high, low: bi.low, biIndex: i };
      if (prev !== null) {
        const first = stdSeq.length > 0 ? stdSeq[stdSeq.length - 1] : null;
        if (
          first !== null &&
          this.isDirectionalFenxing(first, prev, rev, reverseDir)
        ) {
          return true; // 任意分型即确认
        }
        stdSeq = this.mergeFeatureInclusion(stdSeq, prev, reverseDir);
      }
      prev = rev;
    }
    return false;
  }

  /**
   * 第71课边界分型判定：
   * - 向下段（特征序列=向上笔）：底分型 = 第二元素低点最低。
   * - 向上段（特征序列=向下笔）：顶分型 = 第二元素高点最高。
   */
  private isDirectionalFenxing(
    first: FeatureElement,
    second: FeatureElement,
    third: FeatureElement,
    direction: TrendDirection,
  ): boolean {
    if (direction === TrendDirection.Down) {
      return second.low < first.low && second.low < third.low;
    }
    return second.high > first.high && second.high > third.high;
  }

  /**
   * 特征序列包含处理（口径同 {@link KMergeCalculator}）：
   * 向上段→含并取 max high/max low；向下段→min high/min low。无包含则 push；有包含则替换尾元素。
   */
  private mergeFeatureInclusion(
    seq: FeatureElement[],
    next: FeatureElement,
    direction: TrendDirection,
  ): FeatureElement[] {
    if (seq.length === 0) {
      return [next];
    }
    const last = seq[seq.length - 1];
    const lastContainsNext = last.high >= next.high && last.low <= next.low;
    const nextContainsLast = next.high >= last.high && next.low <= last.low;
    if (!lastContainsNext && !nextContainsLast) {
      return [...seq, next];
    }
    const merged: FeatureElement =
      direction === TrendDirection.Up
        ? {
            high: Math.max(last.high, next.high),
            low: Math.max(last.low, next.low),
            biIndex: next.biIndex,
          }
        : {
            high: Math.min(last.high, next.high),
            low: Math.min(last.low, next.low),
            biIndex: next.biIndex,
          };
    return [...seq.slice(0, -1), merged];
  }

  /** 缺口：两元素区间严格不重合。 */
  private hasGap(a: FeatureElement, b: FeatureElement): boolean {
    return a.high < b.low || b.high < a.low;
  }

  /** 由 bis[startIdx..endIdx] 构建 ChanDuan。 */
  private buildDuan(
    bis: readonly ChanBi[],
    startIdx: number,
    endIdx: number,
    type: DuanType,
    status: DuanStatus,
  ): ChanDuan {
    if (startIdx > endIdx || endIdx >= bis.length) {
      throw new ChanInvariantError(
        `Duan build invariant failed: invalid range [${startIdx}..${endIdx}] for bis length ${bis.length}`,
      );
    }
    const segmentBis = bis.slice(startIdx, endIdx + 1);
    if (segmentBis.length === 0) {
      throw new ChanInvariantError(
        `Duan build invariant failed: empty segment [${startIdx}..${endIdx}]`,
      );
    }
    const stats = collectBiRangeStats(segmentBis);
    const startBi = segmentBis[0];
    const endBi = segmentBis[segmentBis.length - 1];
    return {
      startTime: new Date(startBi.startTime.getTime()),
      endTime: new Date(endBi.endTime.getTime()),
      high: stats.high,
      low: stats.low,
      trend: startBi.trend,
      type,
      status,
      independentCount: stats.independentCount,
      originIds: stats.originIds,
      originBis: [...segmentBis],
      startBi,
      endBi: type === DuanType.Complete ? endBi : null,
    };
  }
}
