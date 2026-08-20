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
import type { ChanBi, ChanDuan } from '../contracts';
import { DuanChannelCalculator } from './duan-channel';

describe('DuanChannelCalculator (段级中枢，对称重叠无方向)', () => {
  it('returns empty two-phase result for fewer than 3 Duan', () => {
    const calc = new DuanChannelCalculator();
    expect(calc.createDuanChannels([])).toEqual({ phaseA: [], phaseB: [] });
    expect(
      calc.createDuanChannels([
        makeDuan('up', 10, 0, 0),
        makeDuan('down', 8, 2, 1),
      ]),
    ).toEqual({ phaseA: [], phaseB: [] });
  });

  it('forms a Duan-level Channel from a 3-Duan window with symmetric overlap', () => {
    // d0 up(0..10) d1 down(2..8) d2 up(3..9)：重叠 = [max低点=3, min高点=8]
    const duans: ChanDuan[] = [
      makeDuan('up', 10, 0, 0),
      makeDuan('down', 8, 2, 1),
      makeDuan('up', 9, 3, 2),
    ];

    const result = new DuanChannelCalculator().createDuanChannels(duans);

    expect(result.phaseA).toHaveLength(1);
    expect(result.phaseB).toHaveLength(1);
    const channel = result.phaseB[0];
    expect(channel.level).toBe(ChannelLevel.Duan); // 接线 ChannelLevel.Duan
    expect(channel.type).toBe(ChannelType.Complete);
    expect(channel.status).toBe(ChannelStatus.Valid);
    expect(channel.expanded).toBe(false); // 普通同级中枢，非扩张合并产物
    expect(channel.zg).toBe(8); // min(10,8,9)
    expect(channel.zd).toBe(3); // max(0,2,3)
    expect(channel.gg).toBe(10); // max(10,8,9)
    expect(channel.dd).toBe(0); // min(0,2,3)
    expect(channel.duans).toHaveLength(3);
    expect('trend' in channel).toBe(false); // 中枢无方向，无 trend 字段
    expect(channel.startId).toBe(duans[0].originIds[0]);
    expect(channel.endId).toBe(
      duans[2].originIds[duans[2].originIds.length - 1],
    );
    expect(channel.displayStartId).toBe(duans[0].originIds[1]); // 首段中间原始 K id
    expect(channel.displayEndId).toBe(duans[2].originIds[1]);
  });

  it('rejects a candidate whose symmetric overlap is degenerate (zg === zd)', () => {
    // d0 up(5..10) d1 down(0..5) d2 up(5..10)：min高点=5 === max低点=5 → 无重叠区间，不成候选
    const duans: ChanDuan[] = [
      makeDuan('up', 10, 5, 0),
      makeDuan('down', 5, 0, 1),
      makeDuan('up', 10, 5, 2),
    ];

    const result = new DuanChannelCalculator().createDuanChannels(duans);

    expect(result.phaseA).toHaveLength(0);
    expect(result.phaseB).toHaveLength(0);
  });

  it('extends a base Channel by pairs of Duan while the symmetric overlap stays valid', () => {
    // 5 段：3 段基础中枢 (d0..d2) 可尾部延伸 +2 段 (d3,d4)
    const duans: ChanDuan[] = [
      makeDuan('up', 10, 0, 0),
      makeDuan('down', 8, 2, 1),
      makeDuan('up', 9, 3, 2),
      makeDuan('down', 7, 4, 3),
      makeDuan('up', 8, 4, 4),
    ];

    const result = new DuanChannelCalculator().createDuanChannels(duans);

    // 延伸 + 重合合并后应收敛为一个覆盖全部 5 段的段级中枢
    expect(result.phaseB.length).toBeGreaterThanOrEqual(1);
    const merged = result.phaseB.reduce((a, b) =>
      b.duans.length > a.duans.length ? b : a,
    );
    expect(merged.duans.length).toBeGreaterThanOrEqual(5);
    expect(merged.zg).toBe(7); // min(10,8,9,7,8)
    expect(merged.zd).toBe(4); // max(0,2,3,4,4)
    expect(merged.expanded).toBe(false); // 单一中枢无相邻对，非扩张
  });

  it('is deterministic across repeated calls and does not mutate input', () => {
    const duans: ChanDuan[] = [
      makeDuan('up', 10, 0, 0),
      makeDuan('down', 8, 2, 1),
      makeDuan('up', 9, 3, 2),
      makeDuan('down', 7, 4, 3),
      makeDuan('up', 8, 4, 4),
    ];
    const calc = new DuanChannelCalculator();
    const first = calc.createDuanChannels(duans);
    const second = calc.createDuanChannels(duans);
    expect(second).toEqual(first);
    expect(duans.map((d) => d.high)).toEqual([10, 8, 9, 7, 8]);
  });
});

/** 构造最小 ChanDuan（段级中枢只读 startTime/endTime/high/low/trend/originIds）。 */
function makeDuan(
  trend: 'up' | 'down',
  high: number,
  low: number,
  id: number,
): ChanDuan {
  const time = new Date(2026, 6, 1, 9, id * 10, 0, 0);
  const startBi: ChanBi = {
    startTime: time,
    endTime: time,
    high,
    low,
    trend: trend === 'up' ? TrendDirection.Up : TrendDirection.Down,
    type: BiType.Complete,
    status: BiStatus.Valid,
    independentCount: 1,
    originIds: [id * 100 + 1],
    originData: [],
    startFenxing: null,
    endFenxing: null,
  };
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
    originBis: [startBi],
    startBi,
    endBi: startBi,
  };
}
