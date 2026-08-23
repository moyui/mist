import type {
  ChanBi,
  ChanBiTwoPhaseResult,
  ChanBspInput,
  ChanBuySellPoint,
  ChanChannelTwoPhaseResult,
  ChanDivergence,
  ChanDivergenceInput,
  ChanDuan,
  ChanDuanChannelTwoPhaseResult,
  ChanFenxing,
  ChanK,
  ChanMergedK,
} from './contracts';
import { assertChanKSeries } from './internal/assert-chan-k-series';
import { BiCalculator } from './internal/bi';
import { BuySellPointDetector } from './internal/buy-sell-point';
import { ChannelCalculator } from './internal/channel';
import { DivergenceDetector } from './internal/divergence';
import { DuanCalculator } from './internal/duan';
import { DuanChannelCalculator } from './internal/duan-channel';
import { KMergeCalculator } from './internal/k-merge';

export class ChanCore {
  // 3：fix-chan-central-expansion-condition 起，中枢延伸修正为区间固定语义（[zd, zg] 不变，
  // 仅更新 gg/dd 与边界），扩张判定修正为严格中心定理二（中枢区间严格分离 + 波动区间重叠/相切）。
  static readonly algorithmVersion = 3 as const;

  private constructor() {}

  static mergeK(orderedK: readonly ChanK[]): readonly ChanMergedK[] {
    assertChanKSeries(orderedK);
    return new KMergeCalculator().merge(orderedK);
  }

  static findFenxings(orderedK: readonly ChanK[]): readonly ChanFenxing[] {
    assertChanKSeries(orderedK);
    const mergedK = new KMergeCalculator().merge(orderedK);
    return new BiCalculator().getFenxings(mergedK);
  }

  static createBi(orderedK: readonly ChanK[]): ChanBiTwoPhaseResult {
    assertChanKSeries(orderedK);
    const mergedK = new KMergeCalculator().merge(orderedK);
    return new BiCalculator().getBi(mergedK);
  }

  static createChannels(orderedK: readonly ChanK[]): ChanChannelTwoPhaseResult {
    assertChanKSeries(orderedK);
    const mergedK = new KMergeCalculator().merge(orderedK);
    const bis = new BiCalculator().getBi(mergedK);
    return new ChannelCalculator().createChannels(bis.phaseB);
  }

  /**
   * 入参 = `createBi` 返回值的 `phaseB`（`ChanBi[]` 最终笔数组，组合方式：
   * `createDuan(createBi(k).phaseB)`）。返回确认后的段序列（无 phaseA）。
   */
  static createDuan(bis: readonly ChanBi[]): readonly ChanDuan[] {
    return new DuanCalculator().createDuan(bis);
  }

  /**
   * 段级中枢：入参 = `createDuan` 的返回值 `ChanDuan[]`（组合方式
   * `createDuanChannels(createDuan(createBi(k).phaseB))`）。几何对称重叠无方向，接线 ChannelLevel.Duan。
   */
  static createDuanChannels(
    duans: readonly ChanDuan[],
  ): ChanDuanChannelTwoPhaseResult {
    return new DuanChannelCalculator().createDuanChannels(duans);
  }

  /**
   * 背驰：入参 = 最小结构接口（units 笔/段序列、zhongshus 中枢序列、forces 力度双分量，
   * 组合方式见 spec；中枢扩张由 chan-central-extension Phase C 先行解决）。共享纯函数，笔/段复用。
   */
  static detectDivergences(
    input: ChanDivergenceInput,
  ): readonly ChanDivergence[] {
    return new DivergenceDetector().detectDivergences(input);
  }

  /**
   * 买卖点（一/二/三类）：入参 = 最小结构接口（units 笔/段序列含 high/low、zhongshus 中枢序列、
   * forces 力度双分量；forces 为空数组 → 一类不输出）。一类=趋势背驰点、二类=一买/一卖后
   * 回抽确认（纯结构）、三类=离开中枢后回抽不回中枢区间（几何，严格）。共享纯函数，笔/段复用。
   */
  static detectBuySellPoints(input: ChanBspInput): readonly ChanBuySellPoint[] {
    return new BuySellPointDetector().detectBuySellPoints(input);
  }
}
