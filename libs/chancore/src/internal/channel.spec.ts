import {
  BiStatus,
  BiType,
  ChannelLevel,
  ChannelStatus,
  ChannelType,
  FenxingType,
  TrendDirection,
} from '../contracts';
import type { ChanBi, ChanChannel } from '../contracts';
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

function makeChannel(
  offset: number,
  bases: number[],
  trend: TrendDirection,
  status: ChannelStatus,
): ChanChannel {
  const bis = bases.map((base, index) => makeBi(offset + index, base, 20));
  const highs = bis.map((bi) => bi.high);
  const lows = bis.map((bi) => bi.low);

  return {
    bis,
    zg: Math.min(...highs),
    zd: Math.max(...lows),
    gg: Math.max(...highs),
    dd: Math.min(...lows),
    level: ChannelLevel.Bi,
    type: ChannelType.Complete,
    status,
    startId: bis[0].originIds[0],
    endId: bis[bis.length - 1].originIds.at(-1)!,
    trend,
    expanded: false,
    displayStartId: bis[0].originIds[0],
    displayEndId: bis[bis.length - 1].originIds.at(-1)!,
  };
}

function mergeChannels(service: ChannelCalculator, channels: ChanChannel[]) {
  return (
    service as unknown as {
      mergeChannels(value: readonly ChanChannel[]): ChanChannel[];
    }
  ).mergeChannels(channels);
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

    // 两阶段契约：{ phaseA, phaseB }，都是数组
    expect(result).toHaveProperty('phaseA');
    expect(result).toHaveProperty('phaseB');
    expect(Array.isArray(result.phaseA)).toBe(true);
    expect(Array.isArray(result.phaseB)).toBe(true);
    // 不应再有旧的扁平数组 + offsetIndex 结构
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

  describe('Phase A enumeration (5-bi base channel)', () => {
    /**
     * 构造一组满足缠论标准定义的上升中枢 5 笔序列（A B C D E）：
     *
     *   A(up)   80→90    起点 80（低于 dd，从下方进入）
     *   B(down) 85→100
     *   C(up)   88→102
     *   D(down) 90→105
     *   E(up)   92→120   终点 120（高于 gg，向上离开）
     *
     * 前4笔高点：90,100,102,105 → zg=min=90, gg=max=105
     * 后4笔低点：85,88,90,92   → zd=max=92, dd=min=85
     * A.low=80 < dd=85 ✓    E.high=120 > gg=105 ✓
     * zg=90 > zd=92？否 → 需要调整让 zg > zd
     *
     * 调整：让前4笔高点更高、后4笔低点更低，使 zg > zd：
     *   A(up)   80→110   起 80
     *   B(down) 100→120
     *   C(up)   105→125
     *   D(down) 108→130
     *   E(up)   115→140  终 140
     * 前4高：110,120,125,130 → zg=110, gg=130
     * 后4低：100,105,108,115 → zd=115, dd=100
     * 80<100 ✓, 140>130 ✓, zg=110 < zd=115 ✗ 还是不够
     *
     * 再调：拉开中间震荡幅度
     */
    function buildValidUpChannel(): ChanBi[] {
      // A 从 50 涨到 110（起点 50 远低于中枢）
      // BCD 在 90~120 之间震荡
      // E 从 95 涨到 180（终点 180 远高于中枢）
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

      // Phase A 至少枚举出 1 个基础中枢
      expect(result.phaseA.length).toBeGreaterThanOrEqual(1);
      const channel = result.phaseA[0];
      expect(channel.zg).toBeGreaterThan(channel.zd);
      expect(channel.gg).toBeGreaterThanOrEqual(channel.zg);
      expect(channel.dd).toBeLessThanOrEqual(channel.zd);
      // 基础中枢包含至少 5 笔
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
      // 5 笔单调上升、无重叠区间：每笔的 low 都高于前一笔的 high
      const noOverlap: ChanBi[] = [];
      for (let i = 0; i < 5; i++) {
        // 从 100 起，每笔区间 [base, base+5]，相邻笔不重叠
        const base = 100 + i * 10 + (i % 2) * 5;
        noOverlap.push(makeBi(i, base, 5));
      }
      const result = service.createChannels(noOverlap);

      expect(result.phaseA).toHaveLength(0);
      expect(result.phaseB).toHaveLength(0);
    });
  });

  describe('Phase B merge (time + price overlap)', () => {
    /**
     * Phase B 合并条件：时间重叠（x 轴）+ 价格重叠（y 轴）。
     * 不再依赖 Invalid 标记，也不要求 trend 相同。
     * 两个中枢在时间和价格上都重叠时，合并为一个。
     */
    it('merges two valid channels when they overlap in time and price', () => {
      const head = makeChannel(
        0,
        [100, 101, 102, 103, 104],
        TrendDirection.Up,
        ChannelStatus.Valid,
      );
      const tail = makeChannel(
        4,
        [104, 105, 106, 107, 108],
        TrendDirection.Up,
        ChannelStatus.Valid,
      );

      // 两个中枢时间重叠（bi[4] 共享）、价格重叠（zone 有交集）→ 合并
      const result = mergeChannels(service, [head, tail]);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        status: ChannelStatus.Valid,
        startId: head.startId,
        endId: tail.endId,
      });
    });

    it('reduces an overlapping valid-invalid-valid span to one valid channel', () => {
      const head = makeChannel(
        0,
        [100, 101, 102, 103, 104],
        TrendDirection.Up,
        ChannelStatus.Valid,
      );
      const middle = makeChannel(
        2,
        [102, 103, 104, 105, 106],
        TrendDirection.Down,
        ChannelStatus.Invalid,
      );
      const tail = makeChannel(
        4,
        [104, 105, 106, 107, 108],
        TrendDirection.Up,
        ChannelStatus.Valid,
      );

      const result = mergeChannels(service, [head, middle, tail]);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        status: ChannelStatus.Valid,
        trend: TrendDirection.Up,
        startId: head.startId,
        endId: tail.endId,
      });
    });

    it('merges channels with different directions when overlapping', () => {
      // trend 不同但时间和价格都重叠 → 仍应合并
      const head = makeChannel(
        0,
        [100, 101, 102, 103, 104],
        TrendDirection.Up,
        ChannelStatus.Valid,
      );
      const tail = makeChannel(
        2,
        [102, 103, 104, 105, 106],
        TrendDirection.Down,
        ChannelStatus.Invalid,
      );

      const result = mergeChannels(service, [head, tail]);
      expect(result).toHaveLength(1);
    });

    it('does not merge channels with an incompatible combined zone', () => {
      const head = makeChannel(
        0,
        [100, 101, 102, 103, 104],
        TrendDirection.Up,
        ChannelStatus.Valid,
      );
      const tail = makeChannel(
        2,
        [300, 301, 302, 303, 304],
        TrendDirection.Up,
        ChannelStatus.Invalid,
      );

      expect(mergeChannels(service, [head, tail])).toEqual([head]);
    });

    it('restarts from the shortest span until it reaches a fixed point', () => {
      const channels = [
        makeChannel(
          0,
          [100, 101, 102, 103, 104],
          TrendDirection.Up,
          ChannelStatus.Valid,
        ),
        makeChannel(
          2,
          [102, 103, 104, 105, 106],
          TrendDirection.Down,
          ChannelStatus.Invalid,
        ),
        makeChannel(
          4,
          [104, 105, 106, 107, 108],
          TrendDirection.Up,
          ChannelStatus.Valid,
        ),
        makeChannel(
          6,
          [106, 107, 108, 109, 110],
          TrendDirection.Down,
          ChannelStatus.Invalid,
        ),
        makeChannel(
          8,
          [108, 109, 110, 111, 112],
          TrendDirection.Up,
          ChannelStatus.Valid,
        ),
      ];

      const result = mergeChannels(service, channels);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        status: ChannelStatus.Valid,
        startId: channels[0].startId,
        endId: channels.at(-1)!.endId,
      });
    });

    it('does not merge separated channels and omits residual Invalid channels', () => {
      const head = makeChannel(
        0,
        [100, 101, 102, 103, 104],
        TrendDirection.Up,
        ChannelStatus.Valid,
      );
      const middle = makeChannel(
        10,
        [102, 103, 104, 105, 106],
        TrendDirection.Down,
        ChannelStatus.Invalid,
      );
      const tail = makeChannel(
        20,
        [104, 105, 106, 107, 108],
        TrendDirection.Up,
        ChannelStatus.Valid,
      );

      expect(mergeChannels(service, [head, middle, tail])).toEqual([
        head,
        tail,
      ]);
    });

    it('extends a base channel by pairs of bis and updates to dynamic common intersection (zg/zd)', () => {
      // 7 笔（向上进入）：前 5 笔确立基础中枢，后 2 笔延伸并共同收敛公共交集
      const valid = [100, 101, 102, 103, 104, 105, 106].map((base, index) =>
        makeBi(index, base, 20),
      );
      const result = service.createChannels(valid);
      expect(result.phaseB).toHaveLength(1);
      const channel = result.phaseB[0];
      expect(channel.bis.length).toBeGreaterThanOrEqual(7);
      // 动态公共重叠交集：zg = min(120..126) = 120, zd = max(100..106) = 106
      expect(channel.zg).toBe(120);
      expect(channel.zd).toBe(106);
      expect(channel.gg).toBe(126);
      expect(channel.dd).toBe(100);
      expect(channel.zg).toBeGreaterThan(channel.zd);
    });

    it('terminates extension when dynamic common intersection becomes empty (zg <= zd)', () => {
      // 5 笔基础中枢在 [100, 124] 震荡，第 6、7 笔跌至 70..95（最高 95 < 最低 104），交集为空无法延伸
      const bis = [
        makeBi(0, 100, 20), // 100..120 Up (low=100 < dd=101)
        makeBi(1, 101, 20), // 101..121 Down
        makeBi(2, 102, 20), // 102..122 Up
        makeBi(3, 103, 20), // 103..123 Down
        makeBi(4, 104, 20), // 104..124 Up (high=124 > gg=123)
        makeBi(5, 75, 20), // 75..95 Down (脱离重叠区)
        makeBi(6, 70, 20), // 70..90 Up
      ];
      const result = service.createChannels(bis);
      expect(result.phaseB).toHaveLength(1);
      // 延伸应终止，中枢保持为 5 笔基础中枢
      expect(result.phaseB[0].bis).toHaveLength(5);
    });
  });
});
