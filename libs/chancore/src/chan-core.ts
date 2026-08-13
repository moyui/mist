import type {
  ChanBiTwoPhaseResult,
  ChanChannelTwoPhaseResult,
  ChanDuan,
  ChanFenxing,
  ChanK,
  ChanMergedK,
} from './contracts';
import { assertChanKSeries } from './internal/assert-chan-k-series';
import { BiCalculator } from './internal/bi';
import { ChannelCalculator } from './internal/channel';
import { DuanCalculator } from './internal/duan';
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
   * 入参 = `createBi` 的返回值 `ChanBiTwoPhaseResult`（段显式消费笔的两阶段结果，
   * 组合方式：`createDuan(createBi(k))`）。返回确认后的段序列（无 phaseA）。
   */
  static createDuan(bis: ChanBiTwoPhaseResult): readonly ChanDuan[] {
    return new DuanCalculator().createDuan(bis);
  }
}
