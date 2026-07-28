import { Test, TestingModule } from '@nestjs/testing';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BiService } from './bi.service';
import { BiStatus, BiType } from '../enums/bi.enum';
import { FenxingType } from '../enums/fenxing.enum';
import { TrendDirection } from '../enums/trend-direction.enum';
import { KVo } from '../../indicator/vo/k.vo';
import { BiVo } from '../vo/bi.vo';
import { FenxingVo } from '../vo/fenxing.vo';
import { MergedKVo } from '../vo/merged-k.vo';

const createK = (id: number, highest: number, lowest: number): KVo => ({
  id,
  symbol: 'TEST',
  time: new Date(Date.UTC(2026, 0, id)),
  amount: String(id * 100),
  open: lowest + 1,
  close: highest - 1,
  highest,
  lowest,
});

const createMergedK = (
  index: number,
  highest: number,
  lowest: number,
  ids: number[] = [index * 10 + 1, index * 10 + 2],
): MergedKVo => {
  const mergedData = ids.map((id, offset) =>
    createK(id, highest - offset, lowest + offset),
  );

  return {
    startTime: mergedData[0].time,
    endTime: mergedData[mergedData.length - 1].time,
    highest,
    lowest,
    trend: TrendDirection.Up,
    mergedCount: mergedData.length,
    mergedIds: ids,
    mergedData,
  };
};

const createMergedFixture = (): MergedKVo[] => [
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
  highest: number,
  lowest: number,
  middleOriginId: number,
): FenxingVo => ({
  type,
  highest,
  lowest,
  leftIds: [middleOriginId - 1],
  middleIds: [middleOriginId],
  rightIds: [middleOriginId + 1],
  middleIndex,
  middleOriginId,
});

const createCompleteBi = (
  startFenxing: FenxingVo,
  endFenxing: FenxingVo,
  trend: TrendDirection,
): BiVo => ({
  startTime: new Date(Date.UTC(2026, 0, startFenxing.middleOriginId)),
  endTime: new Date(Date.UTC(2026, 0, endFenxing.middleOriginId)),
  highest: Math.max(startFenxing.highest, endFenxing.highest),
  lowest: Math.min(startFenxing.lowest, endFenxing.lowest),
  trend,
  type: BiType.Complete,
  status: BiStatus.Valid,
  independentCount: 0,
  originIds: [],
  originData: [],
  startFenxing,
  endFenxing,
});

const publicBiFields = (bi: BiVo) => ({
  trend: bi.trend,
  type: bi.type,
  status: bi.status,
  highest: bi.highest,
  lowest: bi.lowest,
  originIds: bi.originIds,
  independentCount: bi.independentCount,
  startFenxingType: bi.startFenxing?.type ?? null,
  endFenxingType: bi.endFenxing?.type ?? null,
});

describe('BiService', () => {
  let service: BiService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BiService],
    }).compile();

    service = module.get<BiService>(BiService);
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

    expect(() =>
      service['mergeTwoBis'](incompleteBi as any, incompleteBi as any, []),
    ).toThrow('Bi invariant failed');
  });

  it('characterizes public getBi output for a focused merged-K fixture', () => {
    const result = service.getBi(createMergedFixture());

    expect(result.phaseA.map(publicBiFields)).toEqual([
      {
        trend: TrendDirection.Down,
        type: BiType.Complete,
        status: BiStatus.Invalid,
        highest: 16,
        lowest: 0,
        originIds: [21, 22, 31, 32, 41, 42],
        independentCount: 6,
        startFenxingType: FenxingType.Top,
        endFenxingType: FenxingType.Bottom,
      },
      {
        trend: TrendDirection.Up,
        type: BiType.UnComplete,
        status: BiStatus.Unknown,
        highest: 11,
        lowest: 0,
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
      highest: 16,
      lowest: 1,
      originIds: [1, 2, 11, 12, 21, 22],
      independentCount: 6,
      startFenxing: bottom,
      endFenxing: top,
    });
    expect(candidate.originData.map((k) => k.id)).toEqual([
      1, 2, 11, 12, 21, 22,
    ]);

    expect(mergedTwo).toMatchObject({
      highest: 16,
      lowest: 1,
      originIds: [1, 2, 11, 12, 21, 22],
      independentCount: 6,
      startFenxing: bottom,
      endFenxing: top,
    });

    expect(mergedThree).toMatchObject({
      highest: 16,
      lowest: 0,
      originIds: [1, 2, 11, 12, 21, 22, 31, 32, 41, 42],
      independentCount: 10,
      startFenxing: bottom,
      endFenxing: nextBottom,
    });

    expect(unfinished).toMatchObject({
      highest: 16,
      lowest: 0,
      originIds: [21, 22, 31, 32, 41, 42, 51, 52],
      independentCount: 8,
      startFenxing: null,
      endFenxing: null,
    });
  });

  it('owns both Phase A and Phase B reductions inside BiService', () => {
    const source = readFileSync(join(__dirname, 'bi.service.ts'), 'utf8');

    expect(source).toContain('private reducePhaseATimeStack');
    expect(source).toContain('private mergeBiSegments');
    // Phase B 驱动已抽离到共享 span-merge.helper.ts，BiService 注入领域谓词。
    expect(source).toContain('mergeSpans(');
    expect(source).not.toContain('private isPhaseBMergeableSpan');
    expect(source).not.toContain('bi-phase-a-time-stack.helper');
    expect(source).not.toContain('bi-phase-b-merge.helper');
    expect(source).not.toContain('PhaseATimeStackOperations');
    expect(source).not.toContain('PhaseBMergeOperations');
    expect(source).not.toContain('BiSourceTag');
    expect(source).not.toContain('processCandidateBisWithRollback');
    expect(source).not.toContain('confirmed: BiVo[]');
    expect(source).not.toContain('pending: BiVo[]');
    expect(source).toContain('collectMergedKRange');
    expect(source).not.toContain('rangeKs.forEach');
  });
});
