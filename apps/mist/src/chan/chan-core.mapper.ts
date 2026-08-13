import type {
  ChanBi,
  ChanChannel,
  ChanDuan,
  ChanFenxing,
  ChanK,
  ChanMergedK,
} from '@app/chancore';
import type { KVo } from '../indicator/vo/k.vo';
import type { BiVo } from './vo/bi.vo';
import type { ChannelVo } from './vo/channel.vo';
import type { DuanVo } from './vo/duan.vo';
import type { FenxingVo } from './vo/fenxing.vo';
import type { MergedKVo } from './vo/merged-k.vo';

export type ChanKSource = KVo & {
  readonly volume?: string | null;
};

export function toChanK(k: ChanKSource): ChanK {
  return {
    id: k.id,
    symbol: k.symbol,
    time: new Date(k.time.getTime()),
    open: k.open,
    high: k.high,
    low: k.low,
    close: k.close,
    volume: k.volume ?? null,
    amount: k.amount,
  };
}

export function toMergedKVo(mergedK: ChanMergedK): MergedKVo {
  return {
    startTime: new Date(mergedK.startTime.getTime()),
    endTime: new Date(mergedK.endTime.getTime()),
    high: mergedK.high,
    low: mergedK.low,
    trend: mergedK.trend,
    mergedCount: mergedK.mergedCount,
    mergedIds: [...mergedK.mergedIds],
    mergedData: mergedK.mergedData.map(toKVo),
  };
}

export function toFenxingVo(fenxing: ChanFenxing | null): FenxingVo | null {
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
    high: fenxing.high,
    low: fenxing.low,
  };
}

export function toBiVo(bi: ChanBi): BiVo {
  return {
    startTime: new Date(bi.startTime.getTime()),
    endTime: new Date(bi.endTime.getTime()),
    high: bi.high,
    low: bi.low,
    trend: bi.trend,
    type: bi.type,
    status: bi.status,
    independentCount: bi.independentCount,
    originIds: [...bi.originIds],
    originData: bi.originData.map(toKVo),
    startFenxing: toFenxingVo(bi.startFenxing),
    endFenxing: toFenxingVo(bi.endFenxing),
  };
}

export function toChannelVo(channel: ChanChannel): ChannelVo {
  return {
    bis: channel.bis.map(toBiVo),
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

export function toDuanVo(duan: ChanDuan): DuanVo {
  return {
    startTime: new Date(duan.startTime.getTime()),
    endTime: new Date(duan.endTime.getTime()),
    high: duan.high,
    low: duan.low,
    trend: duan.trend,
    type: duan.type,
    status: duan.status,
    independentCount: duan.independentCount,
    originIds: [...duan.originIds],
    originBis: duan.originBis.map(toBiVo),
    startBi: duan.startBi === null ? null : toBiVo(duan.startBi),
    endBi: duan.endBi === null ? null : toBiVo(duan.endBi),
  };
}

function toKVo(k: ChanK): KVo {
  return {
    id: k.id,
    symbol: k.symbol,
    time: new Date(k.time.getTime()),
    amount: k.amount,
    open: k.open,
    close: k.close,
    high: k.high,
    low: k.low,
  };
}
