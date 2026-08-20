import {
  BiStatus,
  BiType,
  ChannelLevel,
  ChannelStatus,
  ChannelType,
  DuanStatus,
  DuanType,
  TrendDirection,
} from '../contracts';
import type {
  ChanBi,
  ChanChannel,
  ChanDuan,
  ChanDuanChannel,
} from '../contracts';
import { ChanCore } from '../chan-core';
import {
  isCentralExpansion,
  mergeBiCentralExpansion,
  mergeDuanCentralExpansion,
  resolveCentralExpansions,
} from './central-expansion';

describe('central-expansion (中枢扩张：笔级 + 段级)', () => {
  describe('isCentralExpansion（D1：相切也算扩张，最小接口 dd/gg 通吃）', () => {
    it('recognizes positive-width wave-range overlap', () => {
      expect(
        isCentralExpansion(
          makeBiChannel({ dd: 4, gg: 11 }),
          makeBiChannel({ dd: 1, gg: 8 }),
        ),
      ).toBe(true);
    });

    it('counts a pure touch (max(dd) === min(gg)) as expansion', () => {
      expect(
        isCentralExpansion(
          makeBiChannel({ dd: 4, gg: 8 }),
          makeBiChannel({ dd: 8, gg: 12 }),
        ),
      ).toBe(true);
    });

    it('rejects disjoint wave ranges', () => {
      expect(
        isCentralExpansion(
          makeBiChannel({ dd: 0, gg: 5 }),
          makeBiChannel({ dd: 6, gg: 9 }),
        ),
      ).toBe(false);
    });

    it('recognizes a nested wave range', () => {
      expect(
        isCentralExpansion(
          makeBiChannel({ dd: 2, gg: 9 }),
          makeBiChannel({ dd: 4, gg: 6 }),
        ),
      ).toBe(true);
    });

    it('works identically for Duan-level Channels through the minimal interface', () => {
      expect(
        isCentralExpansion(
          makeDuanChannel({ dd: 4, gg: 11 }),
          makeDuanChannel({ dd: 1, gg: 8 }),
        ),
      ).toBe(true);
      expect(
        isCentralExpansion(
          makeDuanChannel({ dd: 4, gg: 11 }),
          makeDuanChannel({ dd: 12, gg: 20 }),
        ),
      ).toBe(false);
    });
  });

  describe('mergeBiCentralExpansion（笔级：union bis + 波动重叠区 + trend 继承）', () => {
    it('merges geometry to the wave-overlap zone and union extrema', () => {
      // Z1 波动[4,11]（中枢[7,9]）在上，Z2 波动[1,8]（中枢[2,4]）在下：波动重叠、中枢区间不重叠
      const prev = makeBiChannel({ zg: 9, zd: 7, gg: 11, dd: 4 });
      const next = makeBiChannel({
        zg: 4,
        zd: 2,
        gg: 8,
        dd: 1,
        trend: TrendDirection.Down,
      });
      const merged = mergeBiCentralExpansion(prev, next);

      expect(merged.zg).toBe(Math.min(11, 8)); // 波动重叠区上沿
      expect(merged.zd).toBe(Math.max(4, 1)); // 波动重叠区下沿
      expect(merged.gg).toBe(Math.max(11, 8));
      expect(merged.dd).toBe(Math.min(4, 1));
      expect(merged.expanded).toBe(true);
      expect(merged.level).toBe(ChannelLevel.Bi);
      expect(merged.type).toBe(ChannelType.Complete);
      expect(merged.status).toBe(ChannelStatus.Valid);
      expect(merged.trend).toBe(prev.trend); // 首中枢方向
      expect(merged.startId).toBe(prev.startId);
      expect(merged.endId).toBe(next.endId);
      expect(merged.displayStartId).toBe(prev.displayStartId);
      expect(merged.displayEndId).toBe(next.displayEndId);
    });

    it('retains a touch-only degenerate overlap zone (zg === zd) as an expanded Unit', () => {
      const prev = makeBiChannel({ zg: 8, zd: 6, gg: 8, dd: 4 });
      const next = makeBiChannel({ zg: 4, zd: 2, gg: 12, dd: 8 });
      const merged = mergeBiCentralExpansion(prev, next);
      expect(merged.zg).toBe(8);
      expect(merged.zd).toBe(8); // 相切：重叠区退化为单点
      expect(merged.expanded).toBe(true);
    });

    it('unions bis by startTime without duplicates', () => {
      const shared = makeBi(3, 'up', 8, 3);
      const prev = makeBiChannel({
        bis: [makeBi(1, 'up', 10, 0), makeBi(2, 'down', 9, 2), shared],
      });
      const next = makeBiChannel({
        bis: [shared, makeBi(4, 'down', 6, 4), makeBi(5, 'up', 7, 5)],
      });
      const merged = mergeBiCentralExpansion(prev, next);
      const keys = new Set(merged.bis.map((b) => b.startTime.getTime()));
      expect(merged.bis).toHaveLength(5); // 3+3 - 1 共享 startTime
      expect(keys.size).toBe(merged.bis.length);
    });

    it('does not mutate inputs', () => {
      const prev = makeBiChannel({ dd: 4, gg: 11 });
      const next = makeBiChannel({ dd: 1, gg: 8 });
      const prevBis = prev.bis.length;
      mergeBiCentralExpansion(prev, next);
      expect(prev.bis).toHaveLength(prevBis);
      expect(prev.gg).toBe(11);
      expect(next.dd).toBe(1);
    });
  });

  describe('mergeDuanCentralExpansion（段级：union duans + 波动重叠区，无 trend）', () => {
    it('merges geometry and carries no trend field', () => {
      const prev = makeDuanChannel({ zg: 9, zd: 7, gg: 11, dd: 4 });
      const next = makeDuanChannel({ zg: 4, zd: 2, gg: 8, dd: 1 });
      const merged = mergeDuanCentralExpansion(prev, next);

      expect(merged.zg).toBe(8);
      expect(merged.zd).toBe(4);
      expect(merged.gg).toBe(11);
      expect(merged.dd).toBe(1);
      expect(merged.expanded).toBe(true);
      expect(merged.level).toBe(ChannelLevel.Duan);
      expect('trend' in merged).toBe(false);
      expect(merged.startId).toBe(prev.startId);
      expect(merged.endId).toBe(next.endId);
    });

    it('unions duans by startTime without duplicates', () => {
      const shared = makeDuan(2, 'up', 9, 3);
      const prev = makeDuanChannel({
        duans: [makeDuan(0, 'up', 10, 0), makeDuan(1, 'down', 8, 2), shared],
      });
      const next = makeDuanChannel({
        duans: [shared, makeDuan(3, 'down', 7, 4), makeDuan(4, 'up', 8, 4)],
      });
      const merged = mergeDuanCentralExpansion(prev, next);
      const keys = new Set(merged.duans.map((d) => d.startTime.getTime()));
      expect(merged.duans).toHaveLength(5);
      expect(keys.size).toBe(merged.duans.length);
    });
  });

  describe('isCentralExpansion + resolveCentralExpansions（相邻对固定点：严格分离）', () => {
    it('collapses a three-Chain of pairwise-overlapping Units into one expanded Unit', () => {
      const z1 = makeBiChannel({ zg: 9, zd: 7, gg: 11, dd: 4 });
      const z2 = makeBiChannel({ zg: 4, zd: 2, gg: 8, dd: 1 });
      const z3 = makeBiChannel({ zg: 2, zd: 0, gg: 3, dd: -1 });
      const result = resolveCentralExpansions(
        [z1, z2, z3],
        mergeBiCentralExpansion,
      );
      expect(result).toHaveLength(1);
      expect(result[0].expanded).toBe(true);
    });

    it('keeps one expanded Unit plus a separate normal Unit', () => {
      const z1 = makeBiChannel({ zg: 9, zd: 7, gg: 11, dd: 4 });
      const z2 = makeBiChannel({ zg: 4, zd: 2, gg: 8, dd: 1 });
      const far = makeBiChannel({ zg: 22, zd: 20, gg: 25, dd: 18 });
      const result = resolveCentralExpansions(
        [z1, z2, far],
        mergeBiCentralExpansion,
      );
      expect(result).toHaveLength(2);
      expect(result[0].expanded).toBe(true);
      expect(result[1].expanded).toBe(false);
    });

    it('guarantees strict adjacent separation (max(dd) > min(gg))', () => {
      const units = [
        makeBiChannel({ zg: 9, zd: 7, gg: 11, dd: 4 }),
        makeBiChannel({ zg: 4, zd: 2, gg: 8, dd: 1 }),
        makeBiChannel({ zg: 2, zd: 0, gg: 3, dd: -1 }),
        makeBiChannel({ zg: 6, zd: 4, gg: 7, dd: 3 }),
      ];
      const result = resolveCentralExpansions(units, mergeBiCentralExpansion);
      expect(allAdjacentStrict(result)).toBe(true);
    });

    it('is deterministic and does not mutate input', () => {
      const units = [
        makeBiChannel({ zg: 9, zd: 7, gg: 11, dd: 4 }),
        makeBiChannel({ zg: 4, zd: 2, gg: 8, dd: 1 }),
      ];
      const first = resolveCentralExpansions(units, mergeBiCentralExpansion);
      const second = resolveCentralExpansions(units, mergeBiCentralExpansion);
      expect(second).toEqual(first);
      expect(units.map((u) => u.zg)).toEqual([9, 4]);
      expect(units[0].bis.length).toBeGreaterThan(0);
    });
  });

  describe('integration through the facades', () => {
    it('ChanCore.createDuanChannels resolves an adjacent wave-overlapping pair', () => {
      // 段序列趋势交替；构造两中枢（区间[7,9]与[2,4]不重叠、波动[4,11]与[1,8]重叠）
      const duans: ChanDuan[] = [
        makeDuan(0, 'up', 11, 4),
        makeDuan(1, 'down', 9, 6),
        makeDuan(2, 'up', 10, 7),
        makeDuan(3, 'down', 8, 1),
        makeDuan(4, 'up', 6, 1),
        makeDuan(5, 'down', 4, 2),
      ];
      const { phaseA, phaseB } = ChanCore.createDuanChannels(duans);

      expect(phaseA.length).toBeGreaterThan(0);
      // 两中枢（波动[1,11] 与 [1,8]）碰撞 → 扩张归并为一个 expanded 单元
      expect(phaseB).toHaveLength(1);
      expect(phaseB[0].expanded).toBe(true);
      expect(phaseB[0].zg).toBe(8); // 波动重叠区上沿 = min(11,8)
      expect(phaseB[0].zd).toBe(1); // 波动重叠区下沿 = max(1,1)
      // 确定性
      const replay = ChanCore.createDuanChannels(duans);
      expect(replay.phaseB).toEqual(phaseB);
      expect(replay.phaseA).toEqual(phaseA);
    });

    it('does not merge properly progressive disjoint Channels (position progression kept)', () => {
      // 下中枢[2,4]（波动[1,8]）+ 上中枢[14,16]（波动[11,20]）：严格分离，不误并
      const duans: ChanDuan[] = [
        makeDuan(0, 'down', 8, 1),
        makeDuan(1, 'up', 6, 2),
        makeDuan(2, 'down', 4, 2),
        makeDuan(3, 'up', 20, 11),
        makeDuan(4, 'down', 18, 14),
        makeDuan(5, 'up', 16, 15),
      ];
      const { phaseB } = ChanCore.createDuanChannels(duans);
      expect(allAdjacentStrict(phaseB)).toBe(true);
      for (const channel of phaseB) {
        expect(channel.expanded).toBe(false);
      }
    });
  });
});

/** 相邻对严格分离不变式：max(dd) > min(gg)。 */
function allAdjacentStrict<
  T extends { readonly dd: number; readonly gg: number },
>(channels: readonly T[]): boolean {
  for (let i = 0; i < channels.length - 1; i++) {
    if (
      Math.max(channels[i].dd, channels[i + 1].dd) <=
      Math.min(channels[i].gg, channels[i + 1].gg)
    ) {
      return false;
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// 测试助手：makeBiChannel / makeDuanChannel 各产全字段最小中枢
// ---------------------------------------------------------------------------

function makeBi(
  id: number,
  trend: 'up' | 'down',
  high: number,
  low: number,
): ChanBi {
  const time = new Date(2026, 6, 1, 9, id * 5, 0, 0);
  return {
    startTime: time,
    endTime: new Date(time.getTime() + 60_000),
    high,
    low,
    trend: trend === 'up' ? TrendDirection.Up : TrendDirection.Down,
    type: BiType.Complete,
    status: BiStatus.Valid,
    independentCount: 1,
    originIds: [id * 100 + 1, id * 100 + 2],
    originData: [],
    startFenxing: null,
    endFenxing: null,
  };
}

function makeBiChannel(overrides: Partial<ChanChannel> = {}): ChanChannel {
  return {
    bis: [
      makeBi(1, 'up', 10, 0),
      makeBi(2, 'down', 9, 2),
      makeBi(3, 'up', 11, 3),
    ],
    zg: 7,
    zd: 2,
    gg: 11,
    dd: 0,
    level: ChannelLevel.Bi,
    type: ChannelType.Complete,
    status: ChannelStatus.Valid,
    trend: TrendDirection.Up,
    expanded: false,
    startId: 101,
    endId: 105,
    displayStartId: 102,
    displayEndId: 104,
    ...overrides,
  };
}

function makeDuan(
  id: number,
  trend: 'up' | 'down',
  high: number,
  low: number,
): ChanDuan {
  const baseBi = makeBi(id, trend, high, low);
  const time = new Date(2026, 6, 1, 9, id * 10, 0, 0);
  return {
    startTime: time,
    endTime: new Date(time.getTime() + 60_000),
    high,
    low,
    trend: trend === 'up' ? TrendDirection.Up : TrendDirection.Down,
    type: DuanType.Complete,
    status: DuanStatus.Valid,
    independentCount: 1,
    originIds: [id * 100 + 1, id * 100 + 2],
    originBis: [baseBi],
    startBi: baseBi,
    endBi: baseBi,
  };
}

function makeDuanChannel(
  overrides: Partial<ChanDuanChannel> = {},
): ChanDuanChannel {
  return {
    duans: [
      makeDuan(1, 'up', 10, 0),
      makeDuan(2, 'down', 9, 2),
      makeDuan(3, 'up', 11, 3),
    ],
    zg: 7,
    zd: 2,
    gg: 11,
    dd: 0,
    level: ChannelLevel.Duan,
    type: ChannelType.Complete,
    status: ChannelStatus.Valid,
    expanded: false,
    startId: 101,
    endId: 105,
    displayStartId: 102,
    displayEndId: 104,
    ...overrides,
  };
}
