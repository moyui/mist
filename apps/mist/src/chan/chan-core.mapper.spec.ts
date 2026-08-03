import {
  BiStatus,
  BiType,
  ChannelLevel,
  ChannelStatus,
  ChannelType,
  FenxingType,
  TrendDirection,
} from '@app/chancore';
import type {
  ChanBi,
  ChanChannel,
  ChanFenxing,
  ChanMergedK,
} from '@app/chancore';
import {
  toChanK,
  toLegacyBi,
  toLegacyChannel,
  toLegacyFenxing,
  toLegacyMergedK,
} from './chan-core.mapper';

describe('ChanCore legacy mapper', () => {
  it('maps complete OHLCVA into a new core value object', () => {
    const time = new Date('2026-07-01T01:31:00.000Z');
    const coreK = toChanK({
      id: 7,
      symbol: '600519',
      time,
      open: 10,
      highest: 12,
      lowest: 9,
      close: 11,
      volume: '100.00000000',
      amount: '1100.00000000',
    });

    expect(coreK).toEqual({
      id: 7,
      symbol: '600519',
      time,
      open: 10,
      high: 12,
      low: 9,
      close: 11,
      volume: '100.00000000',
      amount: '1100.00000000',
    });
    expect(coreK.time).not.toBe(time);
  });

  it('maps merged K into isolated legacy highest/lowest output', () => {
    const coreK = toChanK({
      id: 7,
      symbol: '600519',
      time: new Date('2026-07-01T01:31:00.000Z'),
      open: 10,
      highest: 12,
      lowest: 9,
      close: 11,
      amount: '1100',
    });
    const mergedK: ChanMergedK = {
      startTime: coreK.time,
      endTime: coreK.time,
      high: 12,
      low: 9,
      trend: TrendDirection.Up,
      mergedCount: 1,
      mergedIds: [7],
      mergedData: [coreK],
    };

    const legacy = toLegacyMergedK(mergedK);
    legacy.mergedIds.push(8);
    legacy.mergedData[0].time.setTime(0);

    expect(legacy).toMatchObject({ highest: 12, lowest: 9 });
    expect(mergedK.mergedIds).toEqual([7]);
    expect(mergedK.mergedData[0].time.getTime()).not.toBe(0);
  });

  it('maps nested Bi and Channel evidence without changing core output', () => {
    const start = makeFenxing(1, FenxingType.Bottom, 10, 5);
    const end = makeFenxing(2, FenxingType.Top, 15, 8);
    const bi: ChanBi = {
      startTime: new Date('2026-07-01T01:31:00.000Z'),
      endTime: new Date('2026-07-01T01:35:00.000Z'),
      high: 15,
      low: 5,
      trend: TrendDirection.Up,
      type: BiType.Complete,
      status: BiStatus.Valid,
      independentCount: 5,
      originIds: [1, 2],
      originData: [],
      startFenxing: start,
      endFenxing: end,
    };
    const channel: ChanChannel = {
      bis: [bi],
      zg: 12,
      zd: 9,
      gg: 15,
      dd: 5,
      level: ChannelLevel.Bi,
      type: ChannelType.Complete,
      status: ChannelStatus.Valid,
      trend: TrendDirection.Up,
      startId: 1,
      endId: 2,
      displayStartId: 1,
      displayEndId: 2,
    };

    const legacyBi = toLegacyBi(bi);
    const legacyChannel = toLegacyChannel(channel);
    legacyBi.originIds.push(3);
    legacyChannel.bis[0].originIds.push(4);

    expect(legacyBi).toMatchObject({ highest: 15, lowest: 5 });
    expect(legacyChannel.bis[0]).toMatchObject({ highest: 15, lowest: 5 });
    expect(bi.originIds).toEqual([1, 2]);
    expect(toLegacyFenxing(null)).toBeNull();
  });
});

function makeFenxing(
  id: number,
  type: FenxingType,
  high: number,
  low: number,
): ChanFenxing {
  return {
    leftIds: [id - 1],
    middleIds: [id],
    rightIds: [id + 1],
    middleIndex: id,
    middleOriginId: id,
    type,
    high,
    low,
  };
}
