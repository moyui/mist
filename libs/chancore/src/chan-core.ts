import type {
  ChanBi,
  ChanBiTwoPhaseResult,
  ChanChannelTwoPhaseResult,
  ChanDuan,
  ChanDuanChannelTwoPhaseResult,
  ChanFenxing,
  ChanK,
  ChanMergedK,
} from './contracts';
import { assertChanKSeries } from './internal/assert-chan-k-series';
import { BiCalculator } from './internal/bi';
import { ChannelCalculator } from './internal/channel';
import { DuanCalculator } from './internal/duan';
import { DuanChannelCalculator } from './internal/duan-channel';
import { KMergeCalculator } from './internal/k-merge';

export class ChanCore {
  static readonly algorithmVersion = 1 as const;

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
}
