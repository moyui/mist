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
 * 段（线段）划分 —— 缠中说禅第67课「特征序列法」。
 *
 * ⚠️ 校验状态（务必先读）：
 * - 算法**结构**严格按第67课：特征序列（反向笔）→ 包含处理 → 分型（向上段只看顶/向下段只看底）
 *   → 段终止于分型中间反向笔的**前一根同向笔**（即极值所在笔）。
 * - **已实现且自测**：第一种情况（分型第一/第二元素无缺口）的终止与笔切片；段间首尾相接重处理。
 * - **简化/待校验**：第二种情况（有缺口）原典要求"反方向新段也出分型才倒推确认"，当前实现**一律按
 *   分型终止**（不区分缺口），且 phaseA/phaseB 暂不区分候选/确认。**需用第67课/社区标准 fixture
 *   校验后再补全第二种情况的回溯倒推与 phaseA/phaseB 区分**——这是后续迭代项，非静默定稿。
 *
 * 特征序列定义（第67课）：向上段特征序列=所有向下笔 X（只考察顶分型）；向下段反之。缺口=相邻元素
 * 区间不重合。不复用 {@link mergeSpans}（特征序列法是单遍递推 + 段间重处理，非不动点合并）。
 */

/** 特征序列元素：一根反向笔视为一根"准K线"（high/low = 笔高低点）。 */
interface FeatureElement {
  readonly high: number;
  readonly low: number;
  readonly biIndex: number; // 对应反向笔在输入 bis 中的下标
}

/** 特征序列分型（取尾部 3 元素判定）。 */
interface FeatureFenxing {
  readonly type: FenxingType;
  readonly first: FeatureElement;
  readonly middle: FeatureElement; // 极值所在（段终止判据）
  readonly extremum: number;
}

export class DuanCalculator {
  createDuan(bis: readonly ChanBi[]): ChanDuanTwoPhaseResult {
    if (bis.length < 3) {
      return { phaseA: [], phaseB: [] };
    }

    const phaseA: ChanDuan[] = [];
    const phaseB: ChanDuan[] = [];

    let segStartIdx = 0;
    while (segStartIdx < bis.length) {
      const direction = bis[segStartIdx].trend;
      const fenxing = this.findSegmentEnd(bis, segStartIdx, direction);

      if (fenxing === null) {
        // 未形成特征序列分型 → 末端未完成段
        phaseA.push(
          this.buildDuan(
            bis,
            segStartIdx,
            bis.length - 1,
            DuanType.UnComplete,
            DuanStatus.Unknown,
          ),
        );
        phaseB.push(
          this.buildDuan(
            bis,
            segStartIdx,
            bis.length - 1,
            DuanType.UnComplete,
            DuanStatus.Unknown,
          ),
        );
        break;
      }

      // 段终止于分型中间反向笔的「前一根同向笔」（极值所在笔）。
      const endIdx = fenxing.middle.biIndex - 1;
      if (endIdx < segStartIdx) {
        // 分型中间反向笔恰为段首下一笔的退化情形：退化为未完成段，避免空段。
        phaseA.push(
          this.buildDuan(
            bis,
            segStartIdx,
            bis.length - 1,
            DuanType.UnComplete,
            DuanStatus.Unknown,
          ),
        );
        phaseB.push(
          this.buildDuan(
            bis,
            segStartIdx,
            bis.length - 1,
            DuanType.UnComplete,
            DuanStatus.Unknown,
          ),
        );
        break;
      }

      phaseA.push(
        this.buildDuan(
          bis,
          segStartIdx,
          endIdx,
          DuanType.Complete,
          DuanStatus.Valid,
        ),
      );
      phaseB.push(
        this.buildDuan(
          bis,
          segStartIdx,
          endIdx,
          DuanType.Complete,
          DuanStatus.Valid,
        ),
      );

      // 新段从分型中间反向笔起，方向由该笔决定（段间首尾相接重处理）。
      segStartIdx = fenxing.middle.biIndex;
    }

    return { phaseA, phaseB };
  }

  /**
   * 从 segStartIdx 起为方向 direction 的段构造特征序列，返回首个特征序列分型（否则 null）。
   * 同向笔属段体（跳过）；反向笔入特征序列（含包含处理）。
   */
  private findSegmentEnd(
    bis: readonly ChanBi[],
    segStartIdx: number,
    direction: TrendDirection,
  ): FeatureFenxing | null {
    let stdSeq: FeatureElement[] = [];
    for (let i = segStartIdx; i < bis.length; i++) {
      if (bis[i].trend === direction) {
        continue;
      }
      stdSeq = this.mergeFeatureInclusion(
        stdSeq,
        { high: bis[i].high, low: bis[i].low, biIndex: i },
        direction,
      );
      const fenxing = this.detectTailFenxing(stdSeq, direction);
      if (fenxing !== null) {
        return fenxing;
      }
    }
    return null;
  }

  /**
   * 特征序列包含处理（口径同 {@link KMergeCalculator}）：
   * 向上段(direction=Up，特征序列为向下笔)→含并取 max high/max low；向下段→min high/min low。
   * 相邻无包含则 push；有包含则替换尾元素（保 biIndex 为后者的下标）。
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
        return {
          type: FenxingType.Top,
          first,
          middle,
          extremum: middle.high,
        };
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
