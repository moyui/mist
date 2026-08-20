import { ChanDivergenceType, TrendDirection } from '../contracts';
import type {
  ChanDivergence,
  ChanDivergenceInput,
  ChanDivergenceUnit,
  ChanUnitForce,
} from '../contracts';

interface ChannelSpan {
  readonly zhongshuIndex: number;
  readonly firstIndex: number; // 中枢首单元下标（units 中），= s
  readonly lastIndex: number; // 中枢末单元下标（units 中），= e
  readonly zg: number;
  readonly zd: number;
  readonly gg: number;
  readonly dd: number;
}

interface Chain {
  readonly spans: readonly ChannelSpan[]; // 长度 ≥2，方向一致 + 位置递进
  readonly direction: TrendDirection;
}

/**
 * 背驰判定（缠论 24 课 A/B/C 三段结构）—— 共享纯函数，笔级/段级复用，无状态、无 I/O。
 *
 * 结构：
 * 1. 中枢定位：按 firstUnitTime/lastUnitTime 在 units 中精确匹配首/末单元下标 s/e。
 * 2. 进入/离开段识别：进入段 = units[s-1]（A 段）、离开段 = units[e+1]（C 段）。
 * 3. 盘整背驰：每中枢 进入段 vs 离开段，双口径严格 <。
 * 4. 趋势链构造：连续两个同样的中枢（离开段 trend 同向 + 位置递进 gg/dd）。
 *    - 中枢扩张已由 chan-central-extension（Phase C）解决（phaseB 相邻波动区间严格不重叠），
 *      本模块**不做非扩张判定**；expanded 中枢当普通中枢看待。
 * 5. 趋势背驰：每条链的链末中枢（B）比较其进入段（A）vs 离开段（C），双口径严格 <。
 *
 * 力度比较口径：**严格 <**（等于不算），无 epsilon；area 与 peak 均须满足（双口径互相印证）。
 * 保持不变式：确定性、不变异输入。
 */
export class DivergenceDetector {
  /**
   * 入参 = 最小结构接口（units/zhongshus/forces 按索引对齐）；调用方把 ChanBi[]/ChanDuan[]、
   * ChanChannel[]/ChanDuanChannel[] 与 @app/indicators 力度计算结果映射而来。
   */
  detectDivergences(input: ChanDivergenceInput): ChanDivergence[] {
    const { units, zhongshus, forces } = input;
    if (units.length === 0 || zhongshus.length === 0 || forces.length === 0) {
      return [];
    }

    const spans = this.locateSpans(units, zhongshus);
    const results: ChanDivergence[] = [];

    // 盘整背驰（每中枢独立，无趋势前提）
    for (const span of spans) {
      const divergence = this.detectConsolidation(span, units, forces);
      if (divergence) {
        results.push(divergence);
      }
    }

    // 趋势链构造 → 趋势背驰
    const chains = this.buildChains(spans, units);
    for (const chain of chains) {
      const divergence = this.detectTrend(chain, units, forces);
      if (divergence) {
        results.push(divergence);
      }
    }

    return results.sort((a, b) => a.zhongshuIndex - b.zhongshuIndex);
  }

  /** 中枢定位：首单元按 firstUnitTime(=首段startTime) 匹配；末单元按 lastUnitTime(=末段endTime) 匹配。
   *  找不到任一 → 跳过该中枢（不臆断）。 */
  private locateSpans(
    units: readonly ChanDivergenceUnit[],
    zhongshus: ChanDivergenceInput['zhongshus'],
  ): ChannelSpan[] {
    const spans: ChannelSpan[] = [];
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
        gg: zhongshu.gg,
        dd: zhongshu.dd,
      });
    }
    return spans;
  }

  /** 按 startTime 精确匹配单元下标；找不到返回 -1。 */
  private indexOfUnitStart(
    units: readonly ChanDivergenceUnit[],
    target: Date,
  ): number {
    for (let i = 0; i < units.length; i++) {
      if (units[i].startTime.getTime() === target.getTime()) {
        return i;
      }
    }
    return -1;
  }

  /** 按 endTime 精确匹配单元下标；找不到返回 -1。 */
  private indexOfUnitEnd(
    units: readonly ChanDivergenceUnit[],
    target: Date,
  ): number {
    for (let i = 0; i < units.length; i++) {
      if (units[i].endTime.getTime() === target.getTime()) {
        return i;
      }
    }
    return -1;
  }

  /** 盘整背驰：进入段 units[s-1] vs 离开段 units[e+1]，双分量严格 <，且两者同向（24课 A/C 同向）。 */
  private detectConsolidation(
    span: ChannelSpan,
    units: readonly ChanDivergenceUnit[],
    forces: readonly ChanUnitForce[],
  ): ChanDivergence | null {
    const enter = span.firstIndex - 1;
    const leave = span.lastIndex + 1;
    if (enter < 0 || leave >= units.length) {
      return null; // 无进入/离开段
    }
    // 进入段与离开段必须同向（24课 A/B/C：A 与 C 同向；方向不同是不同级别/扩张结构，不构成背驰）
    if (
      units[enter].trend === TrendDirection.None ||
      units[enter].trend !== units[leave].trend
    ) {
      return null;
    }
    if (this.isWeaker(forces[leave], forces[enter])) {
      return {
        type: ChanDivergenceType.Consolidation,
        zhongshuIndex: span.zhongshuIndex,
        enterIndex: enter,
        leaveIndex: leave,
        enterForce: { ...forces[enter] },
        leaveForce: { ...forces[leave] },
      };
    }
    return null;
  }

  /**
   * 趋势链构造：按 zhongshus 时间序扫描，连续中枢（方向一致 + 位置递进 gg/dd）归同链。
   * 被非同向 / 方向相同但不递进的中枢隔开 → 断链。链长 ≥2 才构成趋势。
   */
  private buildChains(
    spans: readonly ChannelSpan[],
    units: readonly ChanDivergenceUnit[],
  ): Chain[] {
    const chains: Chain[] = [];
    let current: ChannelSpan[] = [];
    let currentDirection: TrendDirection | null = null;

    for (const span of spans) {
      const leaveIndex = span.lastIndex + 1;
      const direction =
        leaveIndex < units.length
          ? units[leaveIndex].trend
          : this.fallbackDirection(span, units);

      if (current.length === 0) {
        current = [span];
        currentDirection = direction;
        continue;
      }

      const prev = current[current.length - 1];
      if (
        direction === currentDirection &&
        direction !== TrendDirection.None &&
        this.progressesInTrend(prev, span, direction)
      ) {
        current.push(span);
        continue;
      }

      // 断链：收束当前链（若够长），以 span 起新链
      if (current.length >= 2) {
        chains.push({
          spans: current,
          direction: currentDirection as TrendDirection,
        });
      }
      current = [span];
      currentDirection = direction;
    }

    if (current.length >= 2 && currentDirection) {
      chains.push({ spans: current, direction: currentDirection });
    }
    return chains;
  }

  /** 中枢方向兜底：若 span 无离开段（越界），用其首单元/进入段方向（同向保证）。 */
  private fallbackDirection(
    span: ChannelSpan,
    units: readonly ChanDivergenceUnit[],
  ): TrendDirection {
    if (span.lastIndex + 1 < units.length) {
      return units[span.lastIndex + 1].trend;
    }
    if (span.firstIndex - 1 >= 0) {
      return units[span.firstIndex - 1].trend;
    }
    return TrendDirection.None;
  }

  /** 位置递进（gg/dd）：向上链 后.gg>前.gg 且 后.dd>前.dd；向下链对称。 */
  private progressesInTrend(
    prev: ChannelSpan,
    next: ChannelSpan,
    direction: TrendDirection,
  ): boolean {
    if (direction === TrendDirection.Up) {
      return next.gg > prev.gg && next.dd > prev.dd;
    }
    if (direction === TrendDirection.Down) {
      return next.gg < prev.gg && next.dd < prev.dd;
    }
    return false;
  }

  /** 趋势背驰：链末中枢（B）比较其进入段（A）vs 离开段（C），双口径严格 <，两者同向且等于链方向。 */
  private detectTrend(
    chain: Chain,
    units: readonly ChanDivergenceUnit[],
    forces: readonly ChanUnitForce[],
  ): ChanDivergence | null {
    const lastSpan = chain.spans[chain.spans.length - 1];
    const enter = lastSpan.firstIndex - 1;
    const leave = lastSpan.lastIndex + 1;
    if (enter < 0 || leave >= units.length) {
      return null; // 无进入/离开段
    }
    // 进入段与离开段必须同向且等于链方向（24课 A/C 同向；否则不构成该趋势的背驰）
    if (
      units[enter].trend !== chain.direction ||
      units[leave].trend !== chain.direction
    ) {
      return null;
    }
    if (this.isWeaker(forces[leave], forces[enter])) {
      return {
        type: ChanDivergenceType.Trend,
        zhongshuIndex: lastSpan.zhongshuIndex,
        enterIndex: enter,
        leaveIndex: leave,
        enterForce: { ...forces[enter] },
        leaveForce: { ...forces[leave] },
      };
    }
    return null;
  }

  /** 双口径弱判定：leave.area < enter.area 且 leave.peak < enter.peak（严格 <，无 epsilon）。 */
  private isWeaker(leave: ChanUnitForce, enter: ChanUnitForce): boolean {
    return leave.area < enter.area && leave.peak < enter.peak;
  }
}
