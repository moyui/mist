import type {
  ChanBi,
  ChanChannel,
  ChanFenxing,
  ChanK,
  ChanMergedK,
} from '@app/chancore';
import type { KVo } from '../indicator/vo/k.vo';
import type { BiVo } from './vo/bi.vo';
import type { ChannelVo } from './vo/channel.vo';
import type { FenxingVo } from './vo/fenxing.vo';
import type { MergedKVo } from './vo/merged-k.vo';

export type LegacyChanKInput = KVo & {
  readonly volume?: string | null;
};

export function toChanK(k: LegacyChanKInput): ChanK {
  return {
    id: k.id,
    symbol: k.symbol,
    time: new Date(k.time.getTime()),
    open: k.open,
    high: k.highest,
    low: k.lowest,
    close: k.close,
    volume: k.volume ?? null,
    amount: k.amount,
  };
}

export function toLegacyMergedK(mergedK: ChanMergedK): MergedKVo {
  return {
    startTime: new Date(mergedK.startTime.getTime()),
    endTime: new Date(mergedK.endTime.getTime()),
    highest: mergedK.high,
    lowest: mergedK.low,
    trend: mergedK.trend,
    mergedCount: mergedK.mergedCount,
    mergedIds: [...mergedK.mergedIds],
    mergedData: mergedK.mergedData.map(toLegacyK),
  };
}

export function toLegacyFenxing(fenxing: ChanFenxing | null): FenxingVo | null {
  if (fenxing === null) {
    return null;
  }

  return {
    leftIds: [...fenxing.leftIds],
    middleIds: [...fenxing.middleIds],
    rightIds: [...fenxing.rightIds],
    middleIndex: fenxing.middleIndex,
    middleOriginId: fenxing.middleOriginId,
    type: fenxing.type,
    highest: fenxing.high,
    lowest: fenxing.low,
  };
}

export function toLegacyBi(bi: ChanBi): BiVo {
  return {
    startTime: new Date(bi.startTime.getTime()),
    endTime: new Date(bi.endTime.getTime()),
    highest: bi.high,
    lowest: bi.low,
    trend: bi.trend,
    type: bi.type,
    status: bi.status,
    independentCount: bi.independentCount,
    originIds: [...bi.originIds],
    originData: bi.originData.map(toLegacyK),
    startFenxing: toLegacyFenxing(bi.startFenxing),
    endFenxing: toLegacyFenxing(bi.endFenxing),
  };
}

export function toLegacyChannel(channel: ChanChannel): ChannelVo {
  return {
    bis: channel.bis.map(toLegacyBi),
    zg: channel.zg,
    zd: channel.zd,
    gg: channel.gg,
    dd: channel.dd,
    level: channel.level,
    type: channel.type,
    status: channel.status,
    trend: channel.trend,
    startId: channel.startId,
    endId: channel.endId,
    displayStartId: channel.displayStartId,
    displayEndId: channel.displayEndId,
  };
}

function toLegacyK(k: ChanK): KVo {
  return {
    id: k.id,
    symbol: k.symbol,
    time: new Date(k.time.getTime()),
    amount: k.amount,
    open: k.open,
    close: k.close,
    highest: k.high,
    lowest: k.low,
  };
}
