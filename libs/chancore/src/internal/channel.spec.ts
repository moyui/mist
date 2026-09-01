import {
  BiStatus,
  BiType,
  ChannelStatus,
  FenxingType,
  TrendDirection,
} from '../contracts';
import type { ChanBi } from '../contracts';
import { ChannelCalculator } from './channel';

/**
 * 构造一个用于中枢测试的笔。
 *
 * trendIdx 为偶数 → 向上笔（low=base, high=base+range）；
 * trendIdx 为奇数 → 向下笔（high=base+range, low=base）。
 * 通过 base 的递增/递减，让相邻笔构成可重叠的震荡，便于形成 zg>zd 的中枢。
 */
function makeBi(trendIdx: number, base: number, range = 10): ChanBi {
  const isUp = trendIdx % 2 === 0;
  return {
    startTime: new Date(2024, 0, trendIdx + 1),
    endTime: new Date(2024, 0, trendIdx + 2),
    high: base + range,
    low: base,
    trend: isUp ? TrendDirection.Up : TrendDirection.Down,
    type: BiType.Complete,
    status: BiStatus.Valid,
    independentCount: 5,
    originIds: [trendIdx * 2, trendIdx * 2 + 1],
    originData: [],
    startFenxing: {
      type: isUp ? FenxingType.Bottom : FenxingType.Top,
      high: base + range,
      low: base,
      leftIds: [trendIdx * 2 - 1],
      middleIds: [trendIdx * 2],
      rightIds: [trendIdx * 2 + 1],
      middleIndex: trendIdx,
      middleOriginId: trendIdx * 2,
    },
    endFenxing: {
      type: isUp ? FenxingType.Top : FenxingType.Bottom,
      high: base + range,
      low: base,
      leftIds: [trendIdx * 2],
      middleIds: [trendIdx * 2 + 1],
      rightIds: [trendIdx * 2 + 2],
      middleIndex: trendIdx + 1,
      middleOriginId: trendIdx * 2 + 1,
    },
  } as ChanBi;
}

/** 无效笔（宽笔校验失败，status=Invalid）：不得进入笔中枢。 */
function makeInvalidBi(trendIdx: number, base: number, range = 10): ChanBi {
  return { ...makeBi(trendIdx, base, range), status: BiStatus.Invalid };
}

describe('ChannelCalculator', () => {
  let service: ChannelCalculator;

  beforeEach(() => {
    service = new ChannelCalculator();
  });

  it('service should be defined', () => {
    expect(service).toBeDefined();
  });

  it('returns a two-phase result object with phaseA and phaseB arrays', () => {
    const result = service.createChannels([
      makeBi(0, 100),
      makeBi(1, 100),
      makeBi(2, 100),
      makeBi(3, 100),
    ]);

    expect(result).toHaveProperty('phaseA');
    expect(result).toHaveProperty('phaseB');
    expect(Array.isArray(result.phaseA)).toBe(true);
    expect(Array.isArray(result.phaseB)).toBe(true);
    expect(result).not.toHaveProperty('offsetIndex');
  });

  it('produces no channels when fewer than 5 bis', () => {
    const result = service.createChannels([
      makeBi(0, 100),
      makeBi(1, 100),
      makeBi(2, 100),
      makeBi(3, 100),
    ]);

    expect(result.phaseA).toHaveLength(0);
    expect(result.phaseB).toHaveLength(0);
  });

  it('excludes invalid Bi (status invalid) from Bi-level Channel derivation', () => {
    const valid: ChanBi[] = [
      makeBi(0, 100),
      makeBi(1, 101),
      makeBi(2, 102),
      makeBi(3, 103),
      makeBi(4, 104),
    ];
    const invalid = makeInvalidBi(5, 105);
    expect(service.createChannels([...valid, invalid])).toEqual(
      service.createChannels(valid),
    );
  });

  describe('Phase A base channel detection', () => {
    function buildValidUpChannel(): ChanBi[] {
      return [
        makeBi(0, 50, 60), // A up   50→110
        makeBi(1, 90, 30), // B down 90→120
        makeBi(2, 85, 40), // C up   85→125
        makeBi(3, 95, 25), // D down 95→120
        makeBi(4, 95, 85), // E up   95→180
      ];
    }

    it('detects a base channel from 5 bis satisfying chanlun definition', () => {
      const result = service.createChannels(buildValidUpChannel());

      expect(result.phaseA.length).toBeGreaterThanOrEqual(1);
      const channel = result.phaseA[0];
      expect(channel.zg).toBeGreaterThan(channel.zd);
      expect(channel.gg).toBeGreaterThanOrEqual(channel.zg);
      expect(channel.dd).toBeLessThanOrEqual(channel.zd);
      expect(channel.bis.length).toBeGreaterThanOrEqual(5);
    });

    it('stamps each detected base channel as Valid', () => {
      const result = service.createChannels(buildValidUpChannel());

      expect(result.phaseA.length).toBeGreaterThan(0);
      for (const channel of result.phaseA) {
        expect(channel.status).toBe(ChannelStatus.Valid);
      }
    });

    it('stamps a detected channel that passes range and extreme rules as Valid', () => {
      const valid = [100, 101, 102, 103, 104].map((base, index) =>
        makeBi(index, base, 20),
      );

      const result = service.createChannels(valid);

      expect(result.phaseA[0].status).toBe(ChannelStatus.Valid);
      expect(result.phaseB).toHaveLength(1);
    });

    it('keeps a valid five-bi candidate when a later bi breaks alternation', () => {
      const valid = [100, 101, 102, 103, 104].map((base, index) =>
        makeBi(index, base, 20),
      );
      const unrelatedLaterBi = makeBi(6, 200, 20);

      const result = service.createChannels([...valid, unrelatedLaterBi]);

      expect(result.phaseA).toHaveLength(1);
      expect(result.phaseA[0].status).toBe(ChannelStatus.Valid);
      expect(result.phaseB).toHaveLength(1);
    });

    it('keeps Phase A candidates isolated to their five-bi base window', () => {
      const extendable = [100, 101, 102, 103, 104, 105, 106].map(
        (base, index) => makeBi(index, base, 20),
      );

      const result = service.createChannels(extendable);

      expect(result.phaseA[0].bis).toHaveLength(5);
      expect(result.phaseA[0].endId).toBe(extendable[4].originIds.at(-1));
    });

    it('produces no channel when bis do not overlap (zg <= zd)', () => {
      const noOverlap: ChanBi[] = [];
      for (let i = 0; i < 5; i++) {
        const base = 100 + i * 10 + (i % 2) * 5;
        noOverlap.push(makeBi(i, base, 5));
      }
      const result = service.createChannels(noOverlap);

      expect(result.phaseA).toHaveLength(0);
      expect(result.phaseB).toHaveLength(0);
    });
  });

  describe('Sequential confirmation lifecycle and touch extension', () => {
    it('extends a base channel by pairs of touching bis and updates to dynamic common intersection (zg/zd)', () => {
      const valid = [100, 101, 102, 103, 104, 105, 106].map((base, index) =>
        makeBi(index, base, 20),
      );
      const result = service.createChannels(valid);
      expect(result.phaseB).toHaveLength(1);
      const channel = result.phaseB[0];
      expect(channel.bis.length).toBeGreaterThanOrEqual(7);
      expect(channel.zg).toBe(120);
      expect(channel.zd).toBe(106);
      expect(channel.gg).toBe(126);
      expect(channel.dd).toBe(100);
      expect(channel.zg).toBeGreaterThan(channel.zd);
    });

    it('terminates extension when dynamic common intersection becomes empty (zg <= zd)', () => {
      const bis = [
        makeBi(0, 100, 20), // 100..120 Up
        makeBi(1, 101, 20), // 101..121 Down
        makeBi(2, 102, 20), // 102..122 Up
        makeBi(3, 103, 20), // 103..123 Down
        makeBi(4, 104, 20), // 104..124 Up
        makeBi(5, 75, 20), // 75..95 Down (脱离重叠区)
        makeBi(6, 70, 20), // 70..90 Up
      ];
      const result = service.createChannels(bis);
      expect(result.phaseB).toHaveLength(1);
      expect(result.phaseB[0].bis).toHaveLength(5);
    });

    it('seals channel and searches next candidate upon departure', () => {
      // 构造两个独立的同级别趋势中枢（中枢1在100~120，随后下跌到40~60形成中枢2）
      const bis1 = [100, 101, 102, 103, 104].map((base, index) =>
        makeBi(index, base, 20),
      );
      const departure = [makeBi(5, 70, 15), makeBi(6, 75, 10)]; // 连接段
      const bis2 = [
        makeBi(7, 45, 35), // A: 45..80 Down (high 80 > gg)
        makeBi(8, 42, 20), // B: 42..62 Up
        makeBi(9, 43, 18), // C: 43..61 Down
        makeBi(10, 44, 16), // D: 44..60 Up
        makeBi(11, 30, 28), // E: 30..58 Down (low 30 < dd)
      ];

      const result = service.createChannels([...bis1, ...departure, ...bis2]);

      expect(result.phaseB).toHaveLength(2);
      expect(result.phaseB[0].zd).toBeGreaterThan(result.phaseB[1].zg);
    });

    it('enlarges channel to expanded when accumulation reaches 9 bis', () => {
      const nineBis = [100, 101, 102, 103, 104, 105, 106, 107, 108].map(
        (base, index) => makeBi(index, base, 20),
      );

      const result = service.createChannels(nineBis);

      expect(result.phaseB).toHaveLength(1);
      expect(result.phaseB[0].bis.length).toBeGreaterThanOrEqual(9);
      expect(result.phaseB[0].expanded).toBe(true);
    });
  });
});
