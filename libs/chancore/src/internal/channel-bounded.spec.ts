import {
  BiStatus,
  BiType,
  ChanCore,
  TrendDirection,
  type ChanBi,
} from '../index';
import { ChannelCalculator } from './channel';

function makeMockBi(
  trend: TrendDirection,
  low: number,
  high: number,
  startTime: string,
  endTime: string,
  idStart: number = 1,
  idEnd: number = 5,
  status: BiStatus = BiStatus.Valid,
): ChanBi {
  return {
    startTime: new Date(startTime),
    endTime: new Date(endTime),
    low,
    high,
    trend,
    type: BiType.Complete,
    status,
    originIds: Array.from(
      { length: idEnd - idStart + 1 },
      (_, i) => idStart + i,
    ),
    originData: [],
    independentCount: idEnd - idStart + 1,
    startFenxing: null,
    endFenxing: null,
  };
}

describe('ChannelCalculator.getAdjacentBoundedChannels', () => {
  it('returns empty result when macroBis is empty or has no valid strokes', () => {
    const calc = new ChannelCalculator();
    const subBis = [
      makeMockBi(
        TrendDirection.Up,
        10,
        20,
        '2026-01-01T09:30:00Z',
        '2026-01-01T09:35:00Z',
      ),
    ];

    expect(calc.getAdjacentBoundedChannels(subBis, [])).toEqual({
      phaseA: [],
      phaseB: [],
    });

    const invalidMacro = [
      makeMockBi(
        TrendDirection.Up,
        10,
        30,
        '2026-01-01T09:30:00Z',
        '2026-01-01T11:30:00Z',
        1,
        5,
        BiStatus.Invalid,
      ),
    ];
    expect(calc.getAdjacentBoundedChannels(subBis, invalidMacro)).toEqual({
      phaseA: [],
      phaseB: [],
    });
  });

  it('returns empty result when subBis has fewer than 5 strokes', () => {
    const calc = new ChannelCalculator();
    const macroBis = [
      makeMockBi(
        TrendDirection.Up,
        10,
        50,
        '2026-01-01T09:30:00Z',
        '2026-01-01T11:30:00Z',
      ),
    ];
    const subBis = [
      makeMockBi(
        TrendDirection.Up,
        10,
        20,
        '2026-01-01T09:30:00Z',
        '2026-01-01T09:40:00Z',
      ),
      makeMockBi(
        TrendDirection.Down,
        15,
        20,
        '2026-01-01T09:40:00Z',
        '2026-01-01T09:50:00Z',
      ),
    ];

    expect(calc.getAdjacentBoundedChannels(subBis, macroBis)).toEqual({
      phaseA: [],
      phaseB: [],
    });
  });

  it('computes central strictly bounded within a single macro bi', () => {
    const macroBis = [
      makeMockBi(
        TrendDirection.Up,
        10,
        35,
        '2026-01-01T09:30:00Z',
        '2026-01-01T11:30:00Z',
      ),
    ];

    // Standard 5-bi upward base central inside 09:30 ~ 11:30:
    // Bi1: Up 10 -> 22 (enters below ZD=16)
    // Bi2: Down 22 -> 16
    // Bi3: Up 16 -> 24
    // Bi4: Down 24 -> 17  (ZD = max(16, 17) = 17, ZG = min(22, 24) = 22)
    // Bi5: Up 17 -> 35 (exits above ZG=22)
    const subBis = [
      makeMockBi(
        TrendDirection.Up,
        10,
        22,
        '2026-01-01T09:30:00Z',
        '2026-01-01T09:40:00Z',
      ),
      makeMockBi(
        TrendDirection.Down,
        16,
        22,
        '2026-01-01T09:40:00Z',
        '2026-01-01T09:50:00Z',
      ),
      makeMockBi(
        TrendDirection.Up,
        16,
        24,
        '2026-01-01T09:50:00Z',
        '2026-01-01T10:00:00Z',
      ),
      makeMockBi(
        TrendDirection.Down,
        17,
        24,
        '2026-01-01T10:00:00Z',
        '2026-01-01T10:10:00Z',
      ),
      makeMockBi(
        TrendDirection.Up,
        17,
        35,
        '2026-01-01T10:10:00Z',
        '2026-01-01T10:20:00Z',
      ),
    ];

    const result = ChanCore.createAdjacentBoundedChannels(subBis, macroBis);
    expect(result.phaseB).toHaveLength(1);
    const zs = result.phaseB[0];
    expect(zs.zd).toBe(17);
    expect(zs.zg).toBe(22);
    expect(zs.bis[0].startTime.getTime()).toBeGreaterThanOrEqual(
      new Date('2026-01-01T09:30:00Z').getTime(),
    );
    expect(zs.bis[zs.bis.length - 1].endTime.getTime()).toBeLessThanOrEqual(
      new Date('2026-01-01T11:30:00Z').getTime(),
    );
  });

  it('partitions sub-bis across multiple sequential macro bis without cross-boundary leakage', () => {
    // Macro Bi #1: Up from 09:30 to 11:30
    // Macro Bi #2: Down from 11:30 to 15:00
    const macroBis = [
      makeMockBi(
        TrendDirection.Up,
        10,
        35,
        '2026-01-01T09:30:00Z',
        '2026-01-01T11:30:00Z',
      ),
      makeMockBi(
        TrendDirection.Down,
        12,
        35,
        '2026-01-01T11:30:00Z',
        '2026-01-01T15:00:00Z',
      ),
    ];

    // Inside Macro #1 (09:30 ~ 11:30): 5-bi base central
    const subBisMacro1 = [
      makeMockBi(
        TrendDirection.Up,
        10,
        22,
        '2026-01-01T09:30:00Z',
        '2026-01-01T09:40:00Z',
      ),
      makeMockBi(
        TrendDirection.Down,
        16,
        22,
        '2026-01-01T09:40:00Z',
        '2026-01-01T09:50:00Z',
      ),
      makeMockBi(
        TrendDirection.Up,
        16,
        24,
        '2026-01-01T09:50:00Z',
        '2026-01-01T10:00:00Z',
      ),
      makeMockBi(
        TrendDirection.Down,
        17,
        24,
        '2026-01-01T10:00:00Z',
        '2026-01-01T10:10:00Z',
      ),
      makeMockBi(
        TrendDirection.Up,
        17,
        35,
        '2026-01-01T10:10:00Z',
        '2026-01-01T11:30:00Z',
      ),
    ];

    // Inside Macro #2 (11:30 ~ 15:00): 5-bi downward base central
    // Bi1: Down 35 -> 20 (enters above ZG=27)
    // Bi2: Up 20 -> 27
    // Bi3: Down 18 -> 27
    // Bi4: Up 18 -> 26 (ZG = min(27, 26) = 26, ZD = max(20, 18) = 20)
    // Bi5: Down 12 -> 26 (exits below ZD=20)
    const subBisMacro2 = [
      makeMockBi(
        TrendDirection.Down,
        20,
        35,
        '2026-01-01T11:30:00Z',
        '2026-01-01T11:50:00Z',
      ),
      makeMockBi(
        TrendDirection.Up,
        20,
        27,
        '2026-01-01T11:50:00Z',
        '2026-01-01T13:30:00Z',
      ),
      makeMockBi(
        TrendDirection.Down,
        18,
        27,
        '2026-01-01T13:30:00Z',
        '2026-01-01T13:50:00Z',
      ),
      makeMockBi(
        TrendDirection.Up,
        18,
        26,
        '2026-01-01T13:50:00Z',
        '2026-01-01T14:10:00Z',
      ),
      makeMockBi(
        TrendDirection.Down,
        12,
        26,
        '2026-01-01T14:10:00Z',
        '2026-01-01T14:50:00Z',
      ),
    ];

    const allSubBis = [...subBisMacro1, ...subBisMacro2];
    const result = ChanCore.createAdjacentBoundedChannels(allSubBis, macroBis);

    expect(result.phaseB).toHaveLength(2);
    // Central #1 is Upward, fully inside Macro #1
    expect(result.phaseB[0].trend).toBe(TrendDirection.Up);
    expect(
      result.phaseB[0].bis[result.phaseB[0].bis.length - 1].endTime.getTime(),
    ).toBeLessThanOrEqual(new Date('2026-01-01T11:30:00Z').getTime());

    // Central #2 is Downward, fully inside Macro #2
    expect(result.phaseB[1].trend).toBe(TrendDirection.Down);
    expect(result.phaseB[1].bis[0].startTime.getTime()).toBeGreaterThanOrEqual(
      new Date('2026-01-01T11:30:00Z').getTime(),
    );
  });

  it('correctly anchors sub-bis to macro fenxing extreme when sub-bi starts slightly before macro bar close time', () => {
    // 30m bar closes at 11:30 (so macroBi.startTime is 11:30)
    // but the 5m peak actually occurs at 11:25 (so subBi #1 starts at 11:25)
    const macroBis = [
      makeMockBi(
        TrendDirection.Down,
        20,
        50,
        '2026-01-01T11:30:00Z',
        '2026-01-01T13:30:00Z',
      ),
    ];

    const subBis = [
      makeMockBi(
        TrendDirection.Down,
        30,
        50,
        '2026-01-01T11:25:00Z', // 5m before macro 11:30!
        '2026-01-01T12:00:00Z',
      ),
      makeMockBi(
        TrendDirection.Up,
        30,
        42,
        '2026-01-01T12:00:00Z',
        '2026-01-01T12:20:00Z',
      ),
      makeMockBi(
        TrendDirection.Down,
        32,
        42,
        '2026-01-01T12:20:00Z',
        '2026-01-01T12:40:00Z',
      ),
      makeMockBi(
        TrendDirection.Up,
        32,
        40,
        '2026-01-01T12:40:00Z',
        '2026-01-01T13:00:00Z',
      ),
      makeMockBi(
        TrendDirection.Down,
        20,
        40,
        '2026-01-01T13:00:00Z',
        '2026-01-01T13:25:00Z',
      ),
    ];

    const result = ChanCore.createAdjacentBoundedChannels(subBis, macroBis);
    expect(result.phaseB).toHaveLength(1);
    const zs = result.phaseB[0];
    expect(zs.trend).toBe(TrendDirection.Down);
    expect(zs.zg).toBe(40);
    expect(zs.zd).toBe(32);
    expect(zs.bis[0].startTime.toISOString()).toBe('2026-01-01T11:25:00.000Z');
  });
});
