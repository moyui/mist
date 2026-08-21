import { ChanBspType, ChanDivergenceType, TrendDirection } from '../contracts';
import type {
  ChanBspInput,
  ChanBspUnit,
  ChanBuySellPoint,
  ChanDivergenceInput,
  ChanDivergenceZhongshu,
} from '../contracts';
import { DivergenceDetector } from './divergence';

/** 中枢在 units 中的定位结果（供三类判定）。 */
interface BspChannelSpan {
  readonly zhongshuIndex: number;
  readonly firstIndex: number; // 中枢首单元下标（= s）
  readonly lastIndex: number; // 中枢末单元下标（= e）
  readonly zg: number;
  readonly zd: number;
}

const SIDE_ORDER: Record<ChanBspType, number> = {
  [ChanBspType.FirstBuy]: 0,
  [ChanBspType.FirstSell]: 1,
  [ChanBspType.SecondBuy]: 2,
  [ChanBspType.SecondSell]: 3,
  [ChanBspType.ThirdBuy]: 4,
  [ChanBspType.ThirdSell]: 5,
};

/**
 * 买卖点判定（缠论第20/21课）—— 无状态、无 I/O 共享纯函数，笔级/段级复用。
 * 一类 = 趋势背驰点（内部消费 DivergenceDetector 的 Trend 结果，盘整背驰过滤）；
 * 二类 = 一买/一卖后的次级别回抽确认（相邻三元组 + 前置一类点，纯结构，不查背驰）；
 * 三类 = 离开中枢后回抽不回中枢区间（几何，严格口径：贴边触及 = 回到中枢，不算）。
 */
export class BuySellPointDetector {
  /**
   * 入参 = 最小结构接口（units 笔/段序列含 high/low、zhongshus 中枢序列、forces 力度）。
   * forces 为空数组 → 一类不输出；二三类照常。返回按 unitIndex → type → zhongshuIndex 排序。
   */
  detectBuySellPoints(input: ChanBspInput): ChanBuySellPoint[] {
    if (input.units.length === 0) {
      return [];
    }
    const points: ChanBuySellPoint[] = [];
    this.detectFirst(input, points);
    this.detectSecond(input, points);
    this.detectThird(input, points);
    points.sort((a, b) => this.comparePoints(a, b));
    this.fillFirstTypeIndex(points);
    return points;
  }

  /** 一类：消费趋势背驰（Trend），盘整背驰（Consolidation）不产一类点。 */
  private detectFirst(input: ChanBspInput, out: ChanBuySellPoint[]): void {
    const { units, zhongshus, forces } = input;
    const divInput: ChanDivergenceInput = { units, zhongshus, forces };
    const divergences = new DivergenceDetector().detectDivergences(divInput);
    for (const div of divergences) {
      if (div.type !== ChanDivergenceType.Trend) {
        continue; // 盘整背驰/中枢内部不产一类点（用户定调，第24课"背驰是最重要的"）
      }
      const leaveTrend = units[div.leaveIndex].trend;
      if (leaveTrend === TrendDirection.None) {
        continue;
      }
      const isBuy = leaveTrend === TrendDirection.Down;
      out.push({
        type: isBuy ? ChanBspType.FirstBuy : ChanBspType.FirstSell,
        zhongshuIndex: div.zhongshuIndex,
        unitIndex: div.leaveIndex,
        price: isBuy ? units[div.leaveIndex].low : units[div.leaveIndex].high,
        firstTypeIndex: null,
      });
    }
  }

  /** 二类：相邻三元组 + 前置一类点（a 段必须是一类点确认段），不查背驰/力度。 */
  private detectSecond(input: ChanBspInput, out: ChanBuySellPoint[]): void {
    const { units } = input;
    const firstBuyUnits = new Set<number>();
    const firstSellUnits = new Set<number>();
    for (const p of out) {
      if (p.type === ChanBspType.FirstBuy) {
        firstBuyUnits.add(p.unitIndex);
      } else if (p.type === ChanBspType.FirstSell) {
        firstSellUnits.add(p.unitIndex);
      }
    }
    for (let i = 0; i + 2 < units.length; i++) {
      const a = units[i];
      const b = units[i + 1];
      const c = units[i + 2];
      if (
        firstBuyUnits.has(i) &&
        a.trend === TrendDirection.Down &&
        b.trend === TrendDirection.Up &&
        c.trend === TrendDirection.Down &&
        c.low > a.low
      ) {
        out.push({
          type: ChanBspType.SecondBuy,
          zhongshuIndex: null,
          unitIndex: i + 2,
          price: c.low,
          firstTypeIndex: null,
        });
      } else if (
        firstSellUnits.has(i) &&
        a.trend === TrendDirection.Up &&
        b.trend === TrendDirection.Down &&
        c.trend === TrendDirection.Up &&
        c.high < a.high
      ) {
        out.push({
          type: ChanBspType.SecondSell,
          zhongshuIndex: null,
          unitIndex: i + 2,
          price: c.high,
          firstTypeIndex: null,
        });
      }
    }
  }

  /** 三类：中枢离开段（e+1）后相邻回抽段（e+2），回抽段不回中枢区间（严格）。 */
  private detectThird(input: ChanBspInput, out: ChanBuySellPoint[]): void {
    const { units, zhongshus } = input;
    for (const span of this.locateSpans(units, zhongshus)) {
      const leave = span.lastIndex + 1;
      const pull = leave + 1;
      if (leave >= units.length || pull >= units.length) {
        continue; // 无离开段或无回抽段，跳过
      }
      const L = units[leave];
      const P = units[pull];
      if (
        L.trend === TrendDirection.Up &&
        P.trend === TrendDirection.Down &&
        P.low > span.zg
      ) {
        out.push({
          type: ChanBspType.ThirdBuy,
          zhongshuIndex: span.zhongshuIndex,
          unitIndex: pull,
          price: P.low,
          firstTypeIndex: null,
        });
      } else if (
        L.trend === TrendDirection.Down &&
        P.trend === TrendDirection.Up &&
        P.high < span.zd
      ) {
        out.push({
          type: ChanBspType.ThirdSell,
          zhongshuIndex: span.zhongshuIndex,
          unitIndex: pull,
          price: P.high,
          firstTypeIndex: null,
        });
      }
    }
  }

  /** 中枢定位（与背驰 locateSpans 同法）：按 firstUnitTime/lastUnitTime 精确匹配，失败跳过。 */
  private locateSpans(
    units: readonly ChanBspUnit[],
    zhongshus: readonly ChanDivergenceZhongshu[],
  ): BspChannelSpan[] {
    const spans: BspChannelSpan[] = [];
    for (let z = 0; z < zhongshus.length; z++) {
      const zhongshu = zhongshus[z];
      const s = this.indexOfUnitStart(units, zhongshu.firstUnitTime);
      const e = this.indexOfUnitEnd(units, zhongshu.lastUnitTime);
      if (s === -1 || e === -1 || e < s) {
        continue; // 定位失败，跳过该中枢（不臆断）
      }
      spans.push({
        zhongshuIndex: z,
        firstIndex: s,
        lastIndex: e,
        zg: zhongshu.zg,
        zd: zhongshu.zd,
      });
    }
    return spans;
  }

  private indexOfUnitStart(
    units: readonly ChanBspUnit[],
    target: Date,
  ): number {
    for (let i = 0; i < units.length; i++) {
      if (units[i].startTime.getTime() === target.getTime()) {
        return i;
      }
    }
    return -1;
  }

  private indexOfUnitEnd(units: readonly ChanBspUnit[], target: Date): number {
    for (let i = 0; i < units.length; i++) {
      if (units[i].endTime.getTime() === target.getTime()) {
        return i;
      }
    }
    return -1;
  }

  private comparePoints(a: ChanBuySellPoint, b: ChanBuySellPoint): number {
    if (a.unitIndex !== b.unitIndex) {
      return a.unitIndex - b.unitIndex;
    }
    const typeDiff = SIDE_ORDER[a.type] - SIDE_ORDER[b.type];
    if (typeDiff !== 0) {
      return typeDiff;
    }
    const ai =
      a.zhongshuIndex === null ? Number.MAX_SAFE_INTEGER : a.zhongshuIndex;
    const bi =
      b.zhongshuIndex === null ? Number.MAX_SAFE_INTEGER : b.zhongshuIndex;
    return ai - bi;
  }

  /** 排序后回填：每个二/三类点在同类（buy/sell）一类点中找 unitIndex 最大的前置者。 */
  private fillFirstTypeIndex(points: ChanBuySellPoint[]): void {
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      if (p.type === ChanBspType.FirstBuy || p.type === ChanBspType.FirstSell) {
        continue;
      }
      const wantBuy =
        p.type === ChanBspType.SecondBuy || p.type === ChanBspType.ThirdBuy;
      let best: ChanBuySellPoint | null = null;
      for (const q of points) {
        if (
          q.type !== ChanBspType.FirstBuy &&
          q.type !== ChanBspType.FirstSell
        ) {
          continue;
        }
        if ((q.type === ChanBspType.FirstBuy) !== wantBuy) {
          continue;
        }
        if (q.unitIndex >= p.unitIndex) {
          continue;
        }
        if (best === null || q.unitIndex > best.unitIndex) {
          best = q;
        }
      }
      points[i] = {
        ...p,
        firstTypeIndex: best === null ? null : points.indexOf(best),
      };
    }
  }
}
