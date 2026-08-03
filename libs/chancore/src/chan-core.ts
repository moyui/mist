import type {
  ChanBiTwoPhaseResult,
  ChanChannelTwoPhaseResult,
  ChanFenxing,
  ChanK,
  ChanMergedK,
} from './contracts';
import { assertChanKSeries } from './internal/assert-chan-k-series';
import { BiCalculator } from './internal/bi';
import { ChannelCalculator } from './internal/channel';
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
}
