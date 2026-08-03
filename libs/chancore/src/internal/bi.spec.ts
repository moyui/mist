import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BiStatus, BiType, FenxingType, TrendDirection } from '../contracts';
import type { ChanBi, ChanFenxing, ChanK, ChanMergedK } from '../contracts';
import { ChanInvariantError } from '../errors';
import { BiCalculator } from './bi';

const createK = (
  id: number,
  high: number,
  low: number,
  timeIndex: number = id,
): ChanK => ({
  id,
  symbol: 'TEST',
  time: new Date(Date.UTC(2026, 0, timeIndex)),
  amount: String(id * 100),
  volume: String(id),
  open: low + 1,
  close: high - 1,
  high,
  low,
});

const createMergedK = (
  index: number,
  high: number,
  low: number,
  ids: number[] = [index * 10 + 1, index * 10 + 2],
): ChanMergedK => {
  const mergedData = ids.map((id, offset) =>
    createK(id, high - offset, low + offset),
  );

  return {
    startTime: mergedData[0].time,
    endTime: mergedData[mergedData.length - 1].time,
    high,
    low,
    trend: TrendDirection.Up,
    mergedCount: mergedData.length,
    mergedIds: ids,
    mergedData,
  };
};

const createMergedFixture = (): ChanMergedK[] => [
  createMergedK(0, 10, 1),
  createMergedK(1, 13, 3),
  createMergedK(2, 16, 6),
  createMergedK(3, 12, 4),
  createMergedK(4, 9, 0),
  createMergedK(5, 11, 2),
];

const createFenxing = (
  type: FenxingType,
  middleIndex: number,
  high: number,
  low: number,
  middleOriginId: number,
): ChanFenxing => ({
  type,
  high,
  low,
  leftIds: [middleOriginId - 1],
  middleIds: [middleOriginId],
  rightIds: [middleOriginId + 1],
  middleIndex,
  middleOriginId,
});

const createCompleteBi = (
  startFenxing: ChanFenxing,
  endFenxing: ChanFenxing,
  trend: TrendDirection,
): ChanBi => ({
  startTime: new Date(Date.UTC(2026, 0, startFenxing.middleOriginId)),
  endTime: new Date(Date.UTC(2026, 0, endFenxing.middleOriginId)),
  high: Math.max(startFenxing.high, endFenxing.high),
  low: Math.min(startFenxing.low, endFenxing.low),
  trend,
  type: BiType.Complete,
  status: BiStatus.Valid,
  independentCount: 0,
  originIds: [],
  originData: [],
  startFenxing,
  endFenxing,
});

const publicBiFields = (bi: ChanBi) => ({
  trend: bi.trend,
  type: bi.type,
  status: bi.status,
  high: bi.high,
  low: bi.low,
  originIds: bi.originIds,
  independentCount: bi.independentCount,
  startFenxingType: bi.startFenxing?.type ?? null,
  endFenxingType: bi.endFenxing?.type ?? null,
});

const createWidthBi = (
  ids: number[],
  startPosition: number = 0,
  endPosition: number = ids.length - 1,
): ChanBi => {
  const originData = ids.map((id, position) =>
    createK(id, 20 + position, 10 + position, position + 1),
  );
  const startId = ids[startPosition];
  const endId = ids[endPosition];
  const startFenxing: ChanFenxing = {
    type: FenxingType.Bottom,
    high: 12,
    low: 8,
    leftIds: [-101],
    middleIds: [startId],
    rightIds: [-102],
    middleIndex: startPosition,
    middleOriginId: startId,
  };
  const endFenxing: ChanFenxing = {
    type: FenxingType.Top,
    high: 24,
    low: 20,
    leftIds: [-201],
    middleIds: [endId],
    rightIds: [-202],
    middleIndex: endPosition,
    middleOriginId: endId,
  };

  return {
    startTime: originData[startPosition].time,
    endTime: originData[endPosition].time,
    high: 24,
    low: 8,
    trend: TrendDirection.Up,
    type: BiType.Complete,
    status: BiStatus.Unknown,
    independentCount: originData.length,
    originIds: [...ids],
    originData,
    startFenxing,
    endFenxing,
  };
};

const nonIdentityWidthFields = (bi: ChanBi) => ({
  trend: bi.trend,
  type: bi.type,
  status: bi.status,
  high: bi.high,
  low: bi.low,
  independentCount: bi.independentCount,
  startFenxingType: bi.startFenxing?.type ?? null,
  endFenxingType: bi.endFenxing?.type ?? null,
});

describe('BiCalculator', () => {
  let service: BiCalculator;

  beforeEach(() => {
    service = new BiCalculator();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('throws a clear invariant error when merging incomplete Bi values', () => {
    const incompleteBi = {
      trend: TrendDirection.Up,
      startFenxing: null,
      endFenxing: null,
    };

    const mergeIncomplete = () =>
      service['mergeTwoBis'](incompleteBi as any, incompleteBi as any, []);

    expect(mergeIncomplete).toThrow(ChanInvariantError);
    expect(mergeIncomplete).toThrow('Bi invariant failed');
  });

  it('characterizes public getBi output for a focused merged-K fixture', () => {
    const result = service.getBi(createMergedFixture());

    expect(result.phaseA.map(publicBiFields)).toEqual([
      {
        trend: TrendDirection.Down,
        type: BiType.Complete,
        status: BiStatus.Invalid,
        high: 16,
        low: 0,
        originIds: [21, 22, 31, 32, 41, 42],
        independentCount: 6,
        startFenxingType: FenxingType.Top,
        endFenxingType: FenxingType.Bottom,
      },
      {
        trend: TrendDirection.Up,
        type: BiType.UnComplete,
        status: BiStatus.Unknown,
        high: 11,
        low: 0,
        originIds: [41, 42, 51, 52],
        independentCount: 4,
        startFenxingType: FenxingType.Bottom,
        endFenxingType: null,
      },
    ]);
  });

  it('preserves range fields for candidate, merge, and unfinished Bi construction', () => {
    const data = createMergedFixture();
    const bottom = createFenxing(FenxingType.Bottom, 0, 10, 1, 1);
    const top = createFenxing(FenxingType.Top, 2, 16, 6, 21);
    const nextBottom = createFenxing(FenxingType.Bottom, 4, 9, 0, 41);

    const candidate = service['buildBiFromFenxings'](
      BiType.Complete,
      bottom,
      top,
      data,
    );
    const firstBi = createCompleteBi(bottom, top, TrendDirection.Up);
    const secondBi = createCompleteBi(top, nextBottom, TrendDirection.Down);
    const mergedTwo = service['mergeTwoBis'](firstBi, firstBi, data);
    const mergedThree = service['mergeThreeBis'](firstBi, secondBi, data);
    const { bi: unfinished } = service['buildUnCompleteBi'](data, 2, 5, null);

    expect(candidate).toMatchObject({
      high: 16,
      low: 1,
      originIds: [1, 2, 11, 12, 21, 22],
      independentCount: 6,
      startFenxing: bottom,
      endFenxing: top,
    });
    expect(candidate.originData.map((k) => k.id)).toEqual([
      1, 2, 11, 12, 21, 22,
    ]);

    expect(mergedTwo).toMatchObject({
      high: 16,
      low: 1,
      originIds: [1, 2, 11, 12, 21, 22],
      independentCount: 6,
      startFenxing: bottom,
      endFenxing: top,
    });

    expect(mergedThree).toMatchObject({
      high: 16,
      low: 0,
      originIds: [1, 2, 11, 12, 21, 22, 31, 32, 41, 42],
      independentCount: 10,
      startFenxing: bottom,
      endFenxing: nextBottom,
    });

    expect(unfinished).toMatchObject({
      high: 16,
      low: 0,
      originIds: [21, 22, 31, 32, 41, 42, 51, 52],
      independentCount: 8,
      startFenxing: null,
      endFenxing: null,
    });
  });

  describe('wide Bi distance', () => {
    it('rejects adjacent raw K values even when their database IDs are far apart', () => {
      const bi = createWidthBi([10, 1000]);

      expect(service['isBiWideEnough'](bi)).toBe(false);
    });

    it('uses exactly three intervening raw K values as the width boundary', () => {
      const exactlyThree = createWidthBi([10, 700, 30, 900, 50]);
      const onlyTwo = createWidthBi([10, 700, 30, 900]);

      expect(service['isBiWideEnough'](exactlyThree)).toBe(true);
      expect(service['isBiWideEnough'](onlyTwo)).toBe(false);
    });

    it('keeps validity independent from database ID spacing while preserving identities', () => {
      const consecutive = createWidthBi([1, 2, 3, 4]);
      const interleaved = createWidthBi([101, 9000, 305, 70000]);

      const evaluatedConsecutive: ChanBi = {
        ...consecutive,
        status: service['isCandidateBiValid'](consecutive)
          ? BiStatus.Valid
          : BiStatus.Invalid,
      };
      const evaluatedInterleaved: ChanBi = {
        ...interleaved,
        status: service['isCandidateBiValid'](interleaved)
          ? BiStatus.Valid
          : BiStatus.Invalid,
      };

      expect(nonIdentityWidthFields(evaluatedInterleaved)).toEqual(
        nonIdentityWidthFields(evaluatedConsecutive),
      );
      expect(evaluatedConsecutive.originIds).toEqual([1, 2, 3, 4]);
      expect(evaluatedInterleaved.originIds).toEqual([101, 9000, 305, 70000]);
      expect(evaluatedInterleaved.startFenxing?.middleOriginId).toBe(101);
      expect(evaluatedInterleaved.endFenxing?.middleOriginId).toBe(70000);
    });

    it('rejects a missing Fenxing endpoint identity as an invariant failure', () => {
      const source = createWidthBi([10, 20, 30, 40, 50]);
      const bi: ChanBi = {
        ...source,
        endFenxing: { ...source.endFenxing!, middleOriginId: 999 },
      };

      expect(() => service['isBiWideEnough'](bi)).toThrow(
        'Wide Bi invariant failed',
      );
    });

    it('rejects a duplicated Fenxing endpoint identity as an invariant failure', () => {
      const bi = createWidthBi([10, 20, 30, 20, 50], 1, 4);

      expect(() => service['isBiWideEnough'](bi)).toThrow(
        'Wide Bi invariant failed',
      );
    });
  });

  it('owns both Phase A and Phase B reductions inside BiCalculator', () => {
    const source = readFileSync(join(__dirname, 'bi.ts'), 'utf8');

    expect(source).toContain('private reducePhaseATimeStack');
    expect(source).toContain('private mergeBiSegments');
    // Phase B 驱动已抽离到共享 span-merge.ts，BiCalculator 注入领域谓词。
    expect(source).toContain('mergeSpans(');
    expect(source).not.toContain('private isPhaseBMergeableSpan');
    expect(source).not.toContain('bi-phase-a-time-stack.helper');
    expect(source).not.toContain('bi-phase-b-merge.helper');
    expect(source).not.toContain('PhaseATimeStackOperations');
    expect(source).not.toContain('PhaseBMergeOperations');
    expect(source).not.toContain('BiSourceTag');
    expect(source).not.toContain('processCandidateBisWithRollback');
    expect(source).not.toContain('confirmed: ChanBi[]');
    expect(source).not.toContain('pending: ChanBi[]');
    expect(source).toContain('collectMergedKRange');
    expect(source).not.toContain('rangeKs.forEach');
  });
});
