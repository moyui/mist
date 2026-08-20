import {
  BiStatus,
  BiType,
  ChannelLevel,
  ChannelStatus,
  ChannelType,
  FenxingType,
  TrendDirection,
} from '../contracts';
import type {
  ChanBi,
  ChanChannel,
  ChanFenxing,
  ChanK,
  ChanMergedK,
} from '../contracts';
import { ChanCore } from '../chan-core';
import { BiCalculator } from './bi';
import { ChannelCalculator } from './channel';

describe('ChanCore numeric boundaries', () => {
  it('does not merge equal-center containment while preserving input order', () => {
    const orderedK = [
      makeK({ id: 900, high: 10, low: 0 }),
      makeK({
        id: 2,
        time: new Date('2026-07-01T01:32:00.000Z'),
        high: 9,
        low: 1,
      }),
    ];

    const merged = ChanCore.mergeK(orderedK);

    expect(merged).toHaveLength(2);
    expect(merged.map((k) => k.mergedIds)).toEqual([[900], [2]]);
  });

  it('uses strict Fenxing extrema for adjacent representable numbers', () => {
    const calculator = new BiCalculator();
    const adjacentAboveOne = 1 + Number.EPSILON;
    const prev = makeMergedK(1, 1, 0);
    const next = makeMergedK(3, 1, 0);
    const equal = makeMergedK(2, 1, 0.5);
    const adjacent = makeMergedK(2, adjacentAboveOne, 0.5);

    expect(calculator['detectBasicFenxing'](prev, equal, next, 1)).toBeNull();
    expect(
      calculator['detectBasicFenxing'](prev, adjacent, next, 1),
    ).toMatchObject({ type: FenxingType.Top, high: adjacentAboveOne });
  });

  it('keeps the earliest same-type Fenxing and raw-K extreme', () => {
    const calculator = new BiCalculator();
    const first = makeFenxing(10, FenxingType.Top, 20, 5);
    const later = makeFenxing(20, FenxingType.Top, 20, 4);

    expect(calculator['createAlternatingSequence']([first, later])).toEqual([
      first,
    ]);

    const prev = makeMergedK(1, 10, 0);
    const next = makeMergedK(3, 9, 0);
    const middle = makeMergedK(2, 20, 5, [
      makeK({ id: 77, high: 20, low: 5 }),
      makeK({ id: 88, high: 20, low: 6 }),
    ]);

    expect(
      calculator['detectBasicFenxing'](prev, middle, next, 1)?.middleOriginId,
    ).toBe(77);
  });

  it('preserves the approved non-strict Bi progression boundary', () => {
    const calculator = new BiCalculator();
    const first = makeBi(
      makeFenxing(1, FenxingType.Bottom, 5, 0),
      makeFenxing(2, FenxingType.Top, 10, 2),
    );
    const second = makeBi(
      makeFenxing(3, FenxingType.Bottom, 6, 1),
      makeFenxing(4, FenxingType.Top, 10, 3),
    );

    expect(calculator['canMergeTwoBis'](first, second)).toBe(true);
  });

  it('rejects a touching Channel zone where zg equals zd', () => {
    const calculator = new ChannelCalculator();
    const bi = makeBi(
      makeFenxing(1, FenxingType.Bottom, 5, 0),
      makeFenxing(2, FenxingType.Top, 10, 2),
    );
    const channel: ChanChannel = {
      bis: [bi, bi, bi],
      zg: 10,
      zd: 10,
      gg: 12,
      dd: 8,
      level: ChannelLevel.Bi,
      type: ChannelType.Complete,
      status: ChannelStatus.Unknown,
      trend: TrendDirection.Up,
      expanded: false,
      startId: 1,
      endId: 2,
      displayStartId: 1,
      displayEndId: 2,
    };

    expect(calculator['isCandidateChannelValid'](channel)).toBe(false);
  });
});

function makeK(overrides: Partial<ChanK> = {}): ChanK {
  return {
    id: 1,
    symbol: 'TEST',
    time: new Date('2026-07-01T01:31:00.000Z'),
    open: 1,
    high: 1,
    low: 0,
    close: 1,
    volume: null,
    amount: null,
    ...overrides,
  };
}

function makeMergedK(
  id: number,
  high: number,
  low: number,
  mergedData: readonly ChanK[] = [makeK({ id, high, low })],
): ChanMergedK {
  return {
    startTime: mergedData[0].time,
    endTime: mergedData[mergedData.length - 1].time,
    high,
    low,
    trend: TrendDirection.Up,
    mergedCount: mergedData.length,
    mergedIds: mergedData.map((k) => k.id),
    mergedData,
  };
}

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

function makeBi(startFenxing: ChanFenxing, endFenxing: ChanFenxing): ChanBi {
  return {
    startTime: new Date(Date.UTC(2026, 0, startFenxing.middleIndex)),
    endTime: new Date(Date.UTC(2026, 0, endFenxing.middleIndex)),
    high: Math.max(startFenxing.high, endFenxing.high),
    low: Math.min(startFenxing.low, endFenxing.low),
    trend: TrendDirection.Up,
    type: BiType.Complete,
    status: BiStatus.Valid,
    independentCount: 0,
    originIds: [],
    originData: [],
    startFenxing,
    endFenxing,
  };
}
