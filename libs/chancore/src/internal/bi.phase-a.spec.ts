import { BiStatus, BiType, FenxingType, TrendDirection } from '../contracts';
import type { ChanBi, ChanFenxing } from '../contracts';
import { BiCalculator } from './bi';

function createFenxing(index: number, type: FenxingType): ChanFenxing {
  return {
    type,
    high: index + 20,
    low: index + 10,
    leftIds: [index * 10 - 1],
    middleIds: [index * 10],
    rightIds: [index * 10 + 1],
    middleIndex: index,
    middleOriginId: index * 10,
  };
}

function createBi(
  start: number,
  end: number,
  trend: TrendDirection,
  status: BiStatus,
): ChanBi {
  return {
    startTime: new Date(Date.UTC(2026, 0, start + 1)),
    endTime: new Date(Date.UTC(2026, 0, end + 1)),
    high: end + 20,
    low: start + 10,
    trend,
    type: BiType.Complete,
    status,
    independentCount: end - start,
    originIds: [start, end],
    originData: [],
    startFenxing: createFenxing(
      start,
      trend === TrendDirection.Up ? FenxingType.Bottom : FenxingType.Top,
    ),
    endFenxing: createFenxing(
      end,
      trend === TrendDirection.Up ? FenxingType.Top : FenxingType.Bottom,
    ),
  };
}

function rangeKey(bi: ChanBi): string {
  return `${bi.startFenxing?.middleIndex}-${bi.endFenxing?.middleIndex}`;
}

function mockPhaseAPrimitives(
  service: BiCalculator,
  canMerge: (first: ChanBi, middle: ChanBi, third: ChanBi) => boolean,
  isValid: (bi: ChanBi) => boolean = () => true,
) {
  return {
    canMergeThreeBis: jest
      .spyOn(service as any, 'canMergeThreeBis')
      .mockImplementation(canMerge),
    mergeThreeBis: jest
      .spyOn(service as any, 'mergeThreeBis')
      .mockImplementation((first: ChanBi, third: ChanBi) => ({
        ...first,
        endTime: third.endTime,
        high: Math.max(first.high, third.high),
        low: Math.min(first.low, third.low),
        status: BiStatus.Unknown,
        independentCount: first.independentCount + third.independentCount,
        originIds: [...first.originIds, ...third.originIds],
        endFenxing: third.endFenxing,
      })),
    isCandidateBiValid: jest
      .spyOn(service as any, 'isCandidateBiValid')
      .mockImplementation(isValid),
  };
}

describe('BiCalculator Phase A time-stack reduction', () => {
  let service: BiCalculator;

  beforeEach(() => {
    service = new BiCalculator();
  });

  it('repeats top-three reduction until the new stack top is stable', () => {
    const candidates = [
      createBi(0, 1, TrendDirection.Up, BiStatus.Valid),
      createBi(1, 2, TrendDirection.Down, BiStatus.Invalid),
      createBi(2, 3, TrendDirection.Up, BiStatus.Valid),
      createBi(3, 4, TrendDirection.Down, BiStatus.Invalid),
      createBi(4, 5, TrendDirection.Up, BiStatus.Valid),
    ];
    const allowed = new Set(['2-3|3-4|4-5', '0-1|1-2|2-5']);
    const primitives = mockPhaseAPrimitives(
      service,
      (first, middle, third) =>
        allowed.has(
          `${rangeKey(first)}|${rangeKey(middle)}|${rangeKey(third)}`,
        ),
      (bi) => bi.startFenxing?.middleIndex === 0,
    );

    const result = service['reducePhaseATimeStack'](candidates, []);

    expect(result).toHaveLength(1);
    expect(rangeKey(result[0])).toBe('0-5');
    expect(result[0].status).toBe(BiStatus.Valid);
    expect(primitives.mergeThreeBis).toHaveBeenCalledTimes(2);
    expect(primitives.isCandidateBiValid).toHaveBeenCalledTimes(2);
  });

  it('stops when the top three are all Valid', () => {
    const candidates = [
      createBi(0, 1, TrendDirection.Up, BiStatus.Valid),
      createBi(1, 2, TrendDirection.Down, BiStatus.Valid),
      createBi(2, 3, TrendDirection.Up, BiStatus.Valid),
    ];
    const primitives = mockPhaseAPrimitives(service, () => true);

    const result = service['reducePhaseATimeStack'](candidates, []);

    expect(result.map(rangeKey)).toEqual(['0-1', '1-2', '2-3']);
    expect(primitives.canMergeThreeBis).not.toHaveBeenCalled();
  });

  it('retains an Invalid top group when it cannot merge', () => {
    const candidates = [
      createBi(0, 1, TrendDirection.Up, BiStatus.Valid),
      createBi(1, 2, TrendDirection.Down, BiStatus.Invalid),
      createBi(2, 3, TrendDirection.Up, BiStatus.Valid),
    ];
    const primitives = mockPhaseAPrimitives(service, () => false);

    const result = service['reducePhaseATimeStack'](candidates, []);

    expect(result.map(rangeKey)).toEqual(['0-1', '1-2', '2-3']);
    expect(primitives.mergeThreeBis).not.toHaveBeenCalled();
  });

  it('retains leading Invalid candidates', () => {
    const candidates = [
      createBi(0, 1, TrendDirection.Up, BiStatus.Invalid),
      createBi(1, 2, TrendDirection.Down, BiStatus.Invalid),
    ];
    mockPhaseAPrimitives(service, () => false);
    const result = service['reducePhaseATimeStack'](candidates, []);
    expect(result.map((bi) => bi.status)).toEqual([
      BiStatus.Invalid,
      BiStatus.Invalid,
    ]);
  });

  it('rejects a discontinuous candidate before pushing it', () => {
    const candidates = [
      createBi(0, 1, TrendDirection.Up, BiStatus.Valid),
      createBi(2, 3, TrendDirection.Down, BiStatus.Invalid),
    ];
    mockPhaseAPrimitives(service, () => false);
    expect(() => service['reducePhaseATimeStack'](candidates, [])).toThrow(
      'non-contiguous Bis 0-1 -> 2-3',
    );
  });

  it('rejects a merged Bi that changes the outer boundary', () => {
    const candidates = [
      createBi(0, 1, TrendDirection.Up, BiStatus.Valid),
      createBi(1, 2, TrendDirection.Down, BiStatus.Invalid),
      createBi(2, 3, TrendDirection.Up, BiStatus.Valid),
    ];
    const primitives = mockPhaseAPrimitives(service, () => true);
    primitives.mergeThreeBis.mockImplementation(() =>
      createBi(1, 3, TrendDirection.Up, BiStatus.Unknown),
    );
    expect(() => service['reducePhaseATimeStack'](candidates, [])).toThrow(
      'merged Bi 1-3 does not preserve 0-3',
    );
  });

  it('does not mutate the input array or Bi objects', () => {
    const first = Object.freeze(
      createBi(0, 1, TrendDirection.Up, BiStatus.Invalid),
    ) as ChanBi;
    const second = Object.freeze(
      createBi(1, 2, TrendDirection.Down, BiStatus.Invalid),
    ) as ChanBi;
    const candidates = Object.freeze([first, second]);

    mockPhaseAPrimitives(service, () => false);
    const result = service['reducePhaseATimeStack'](candidates, []);

    expect(candidates).toEqual([first, second]);
    expect(result[0]).not.toBe(first);
    expect(result[1]).not.toBe(second);
  });
});
