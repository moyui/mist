import {
  DuanStatus,
  DuanType,
  FenxingType,
  TrendDirection,
} from '../contracts';
import type { ChanBi, ChanDuan, ChanDuanTwoPhaseResult } from '../contracts';
import { ChanInvariantError } from '../errors';
import { collectBiRangeStats } from './duan-range';

/**
 * 段（线段）划分 —— 缠中说禅第67课「特征序列法」（完整 case-1 + case-2）。
 *
 * 算法结构（第67课）：
 * - 特征序列：向上段取所有向下笔 X（元素 high/low=笔高低点），向下段取向上笔 S。
 * - 标准特征序列：元素做 K 线包含同构处理。
 * - 分型：向上段只看顶分型，向下段只看底分型。
 * - 段终止两种情况（第71课第一/第二元素）：
 *   - 第一种（无缺口）：分型第一、第二元素区间重合 → 段在该分型极值处终止。
 *   - 第二种（有缺口）：第一、第二元素区间不重合 → 必须**反方向新段的特征序列也出分型**
 *     才倒推确认原段终止；若价格越过原极值则失效、原段继续延伸。
 * - 段终止于分型中间反向笔的「前一根同向笔」（极值所在笔）；段间首尾相接重处理。
 *
 * 输出对齐笔：phaseA = 凡特征序列分型即终止的候选视图；phaseB = case-1/case-2 确认的最终段。
 * 不复用 {@link mergeSpans}（特征序列法是单遍递推 + case-2 受限前瞻，非不动点合并）。
 */

/** 特征序列元素：一根反向笔视为一根"准K线"。 */
interface FeatureElement {
  readonly high: number;
  readonly low: number;
  readonly biIndex: number;
}

/** 特征序列分型（尾部 3 元素）。 */
interface FeatureFenxing {
  readonly type: FenxingType;
  readonly first: FeatureElement;
  readonly middle: FeatureElement;
  readonly extremum: number;
}

interface SegmentEnd {
  readonly endIdx: number;
  readonly nextStart: number;
}

export class DuanCalculator {
  createDuan(bis: readonly ChanBi[]): ChanDuanTwoPhaseResult {
    if (bis.length < 3) {
      return { phaseA: [], phaseB: [] };
    }
    return {
      phaseA: this.segment(bis, false),
      phaseB: this.segment(bis, true),
    };
  }

  /** 按 requireCase2Confirmation 切分整条笔序列为段序列。 */
  private segment(
    bis: readonly ChanBi[],
    requireCase2Confirmation: boolean,
  ): ChanDuan[] {
    const out: ChanDuan[] = [];
    let startIdx = 0;
    while (startIdx < bis.length) {
      const direction = bis[startIdx].trend;
      const end = this.findSegmentEnd(
        bis,
        startIdx,
        direction,
        requireCase2Confirmation,
      );
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
   * 从 segStartIdx 起为方向 direction 的段找终止点。
   * 同向笔属段体（跳过）；反向笔入特征序列（含包含处理）。
   * - requireCase2Confirmation=false：凡分型即返回（phaseA 候选视图）。
   * - =true：无缺口分型直接返回；有缺口分型需 case2Confirmed 倒推确认，否则继续扫描下一分型。
   */
  private findSegmentEnd(
    bis: readonly ChanBi[],
    segStartIdx: number,
    direction: TrendDirection,
    requireCase2Confirmation: boolean,
  ): SegmentEnd | null {
    let featureSeq: FeatureElement[] = [];
    for (let i = segStartIdx; i < bis.length; i++) {
      if (bis[i].trend === direction) {
        continue;
      }
      featureSeq = this.mergeFeatureInclusion(
        featureSeq,
        { high: bis[i].high, low: bis[i].low, biIndex: i },
        direction,
      );
      const fenxing = this.detectTailFenxing(featureSeq, direction);
      if (fenxing === null) {
        continue;
      }
      const endIdx = fenxing.middle.biIndex - 1;
      if (endIdx < segStartIdx) {
        continue; // 退化：分型中间反向笔恰为段首下一笔，跳过等待下一分型
      }
      const reverseStart = fenxing.middle.biIndex;
      if (
        !requireCase2Confirmation ||
        !this.hasGap(fenxing.first, fenxing.middle)
      ) {
        return { endIdx, nextStart: reverseStart };
      }
      // 第二种情况（有缺口）：需反方向新段特征序列也出分型才倒推确认
      if (this.case2Confirmed(bis, reverseStart, direction, fenxing.extremum)) {
        return { endIdx, nextStart: reverseStart };
      }
      // 未确认：原段继续延伸，特征序列继续生长寻找下一分型
    }
    return null;
  }

  /**
   * 第二种情况倒推确认：从 reverseStart 起的反方向新段，其特征序列出现任意分型即确认原段终止。
   * 若价格越过原极值（originalDir 方向）则失效，返回 false（原段继续延伸）。
   */
  private case2Confirmed(
    bis: readonly ChanBi[],
    reverseStart: number,
    originalDir: TrendDirection,
    extremum: number,
  ): boolean {
    const reverseDir = bis[reverseStart].trend;
    let revSeq: FeatureElement[] = [];
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
      revSeq = this.mergeFeatureInclusion(
        revSeq,
        { high: bi.high, low: bi.low, biIndex: i },
        reverseDir,
      );
      if (this.detectTailFenxing(revSeq, reverseDir) !== null) {
        return true; // 任意分型即确认（不分第一/第二种情况）
      }
    }
    return false;
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

  /** 尾部分型：向上段顶分型（中间 high 严格最高）；向下段底分型（中间 low 严格最低）。 */
  private detectTailFenxing(
    seq: FeatureElement[],
    direction: TrendDirection,
  ): FeatureFenxing | null {
    if (seq.length < 3) {
      return null;
    }
    const first = seq[seq.length - 3];
    const middle = seq[seq.length - 2];
    const right = seq[seq.length - 1];
    if (direction === TrendDirection.Up) {
      if (middle.high > first.high && middle.high > right.high) {
        return { type: FenxingType.Top, first, middle, extremum: middle.high };
      }
      return null;
    }
    if (middle.low < first.low && middle.low < right.low) {
      return {
        type: FenxingType.Bottom,
        first,
        middle,
        extremum: middle.low,
      };
    }
    return null;
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
