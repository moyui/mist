import {
  BiStatus,
  BiType,
  ChannelLevel,
  ChannelStatus,
  ChannelType,
  DuanStatus,
  DuanType,
  FenxingType,
  TrendDirection,
} from '@app/chancore';
import type {
  ChanBi,
  ChanChannel,
  ChanDuan,
  ChanDuanChannel,
  ChanFenxing,
  ChanMergedK,
} from '@app/chancore';
import {
  toBiVo,
  toChanK,
  toChannelVo,
  toDuanChannelVo,
  toDuanVo,
  toFenxingVo,
  toMergedKVo,
} from './chan-core.mapper';

describe('ChanCore HTTP mapper', () => {
  it('maps complete OHLCVA into a new core value object', () => {
    const time = new Date('2026-07-01T01:31:00.000Z');
    const coreK = toChanK({
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

  it('maps merged K into isolated canonical high/low output', () => {
    const coreK = toChanK({
      id: 7,
      symbol: '600519',
      time: new Date('2026-07-01T01:31:00.000Z'),
      open: 10,
      high: 12,
      low: 9,
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

    const response = toMergedKVo(mergedK);
    response.mergedIds.push(8);
    response.mergedData[0].time.setTime(0);

    expect(response).toMatchObject({ high: 12, low: 9 });
    expect(response).not.toHaveProperty('highest');
    expect(response).not.toHaveProperty('lowest');
    expect(response.mergedData[0]).toMatchObject({ high: 12, low: 9 });
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
      expanded: false,
      startId: 1,
      endId: 2,
      displayStartId: 1,
      displayEndId: 2,
    };

    const biVo = toBiVo(bi);
    const channelVo = toChannelVo(channel);
    biVo.originIds.push(3);
    channelVo.bis[0].originIds.push(4);

    expect(biVo).toMatchObject({ high: 15, low: 5 });
    expect(biVo.startFenxing).toMatchObject({ high: 10, low: 5 });
    expect(channelVo.bis[0]).toMatchObject({ high: 15, low: 5 });
    expect(channelVo.expanded).toBe(false);
    expect(biVo).not.toHaveProperty('highest');
    expect(biVo).not.toHaveProperty('lowest');
    expect(bi.originIds).toEqual([1, 2]);
    expect(toFenxingVo(null)).toBeNull();
  });

  it('maps Duan with nested Bi evidence without changing core output', () => {
    const start = makeFenxing(1, FenxingType.Bottom, 10, 5);
    const end = makeFenxing(2, FenxingType.Top, 15, 8);
    const firstBi: ChanBi = {
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
    const duan: ChanDuan = {
      startTime: firstBi.startTime,
      endTime: firstBi.endTime,
      high: 20,
      low: 4,
      trend: TrendDirection.Up,
      type: DuanType.Complete,
      status: DuanStatus.Valid,
      independentCount: 7,
      originIds: [1, 2, 3],
      originBis: [firstBi],
      startBi: firstBi,
      endBi: firstBi,
    };

    const duanVo = toDuanVo(duan);
    duanVo.originIds.push(9);
    duanVo.originBis[0].originIds.push(9);

    expect(duanVo).toMatchObject({ high: 20, low: 4 });
    expect(duanVo.originBis[0]).toMatchObject({ high: 15, low: 5 });
    expect(duanVo.startBi).toMatchObject({ high: 15, low: 5 });
    expect(duanVo).not.toHaveProperty('highest');
    expect(duanVo).not.toHaveProperty('lowest');
    expect(duan.originIds).toEqual([1, 2, 3]);
    expect(duan.originBis[0].originIds).toEqual([1, 2]);
  });

  it('maps Duan-level Channel with nested Duan evidence without changing core output', () => {
    const start = makeFenxing(1, FenxingType.Bottom, 10, 5);
    const end = makeFenxing(2, FenxingType.Top, 15, 8);
    const firstBi: ChanBi = {
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
    const duan: ChanDuan = {
      startTime: firstBi.startTime,
      endTime: firstBi.endTime,
      high: 20,
      low: 4,
      trend: TrendDirection.Up,
      type: DuanType.Complete,
      status: DuanStatus.Valid,
      independentCount: 7,
      originIds: [1, 2, 3],
      originBis: [firstBi],
      startBi: firstBi,
      endBi: firstBi,
    };
    const duanChannel: ChanDuanChannel = {
      duans: [duan],
      zg: 18,
      zd: 6,
      gg: 20,
      dd: 4,
      level: ChannelLevel.Duan,
      type: ChannelType.Complete,
      status: ChannelStatus.Valid,
      expanded: false,
      startId: 1,
      endId: 3,
      displayStartId: 2,
      displayEndId: 2,
    };

    const vo = toDuanChannelVo(duanChannel);
    vo.duans[0].originIds.push(9);

    expect(vo).toMatchObject({ zg: 18, zd: 6, gg: 20, dd: 4 });
    expect(vo.level).toBe(ChannelLevel.Duan);
    expect(vo.expanded).toBe(false);
    expect(vo.duans[0]).toMatchObject({ high: 20, low: 4 });
    expect(vo).not.toHaveProperty('trend'); // 中枢无方向
    expect(vo).not.toHaveProperty('highest');
    expect(vo).not.toHaveProperty('lowest');
    expect(duanChannel.duans[0].originIds).toEqual([1, 2, 3]);
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
