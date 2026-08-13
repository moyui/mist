import { BiStatus, BiType, DuanType, TrendDirection } from '../contracts';
import type { ChanBi, ChanBiTwoPhaseResult } from '../contracts';
import { DuanCalculator } from './duan';

describe('DuanCalculator (特征序列法)', () => {
  it('returns empty for fewer than 3 Bi in phaseB', () => {
    const calc = new DuanCalculator();
    expect(calc.createDuan({ phaseA: [], phaseB: [] })).toEqual([]);
    expect(
      calc.createDuan({ phaseA: [], phaseB: [makeBi('up', 8, 4, 0)] }),
    ).toEqual([]);
  });

  it('ends a segment at the fenxing extremum Bi when there is no gap (case 1)', () => {
    // 向上段特征序列 e1=(8,5) e2=(11,7) e3=(9,6) 在 e2 形成顶分型；e1/e2 区间重合 → 无缺口（第一种）。
    const bis: ChanBi[] = [
      makeBi('up', 8, 4, 0),
      makeBi('down', 8, 5, 1), // e1=(8,5)
      makeBi('up', 11, 5, 2),
      makeBi('down', 11, 7, 3), // e2=(11,7) 顶分型中间
      makeBi('up', 9, 7, 4),
      makeBi('down', 9, 6, 5), // e3=(9,6)
      makeBi('up', 13, 6, 6),
    ];

    const result = new DuanCalculator().createDuan({ phaseA: [], phaseB: bis });

    expect(result).toHaveLength(2);
    const seg = result[0];
    expect(seg.type).toBe(DuanType.Complete);
    expect(seg.trend).toBe(TrendDirection.Up);
    expect(seg.high).toBe(11);
    expect(seg.low).toBe(4);
    expect(seg.originBis).toHaveLength(3); // bi[0..2]
    expect(seg.endBi).toBe(bis[2]);

    expect(result[1].type).toBe(DuanType.UnComplete);
    expect(result[1].endBi).toBeNull();
  });

  it('confirms a gap fenxing via the reverse segment fenxing (case 2 confirmed)', () => {
    // 向上段特征序列 e1=(8,5) e2=(13,9) e3=(11,7)：e1/e2 有缺口（第二种）。
    // 反方向（向下）新段特征序列 f1=(11,9) f2=(10,7) f3=(9,4) f4=(11,6) 在 f3 形成底分型 → 倒推确认。
    const bis: ChanBi[] = [
      makeBi('up', 8, 4, 0),
      makeBi('down', 8, 5, 1), // e1
      makeBi('up', 13, 5, 2),
      makeBi('down', 13, 9, 3), // e2 顶分型中间，极值=13（与 e1 有缺口）
      makeBi('up', 11, 9, 4),
      makeBi('down', 11, 7, 5), // e3
      makeBi('up', 10, 7, 6), // f1
      makeBi('down', 10, 4, 7),
      makeBi('up', 9, 4, 8), // f3 对应区间的底（low=4）
      makeBi('down', 9, 6, 9),
      makeBi('up', 11, 6, 10), // f4
    ];

    const result = new DuanCalculator().createDuan({ phaseA: [], phaseB: bis });

    // 向上段(bi0-2，经 case-2 倒推确认) + 向下段(bi3-7，case-1) + 尾段(bi8-10)
    expect(result).toHaveLength(3);
    const upSeg = result[0];
    expect(upSeg.type).toBe(DuanType.Complete);
    expect(upSeg.trend).toBe(TrendDirection.Up);
    expect(upSeg.high).toBe(13); // 原极值
    expect(upSeg.endBi).toBe(bis[2]);

    const downSeg = result[1];
    expect(downSeg.trend).toBe(TrendDirection.Down);
    expect(downSeg.type).toBe(DuanType.Complete);
    expect(downSeg.startBi).toBe(bis[3]);

    expect(result[2].type).toBe(DuanType.UnComplete);
  });

  it('does not end a segment on an unconfirmed gap fenxing (case 2 not confirmed)', () => {
    // 向上段 case-2 缺口分型，但反方向新段特征序列元素不足（无底分型）、且未越过极值。
    // 第二种情况未确认 → 原段继续延伸 → 整条为未完成尾段。
    const bis: ChanBi[] = [
      makeBi('up', 8, 4, 0),
      makeBi('down', 8, 5, 1), // e1
      makeBi('up', 13, 5, 2),
      makeBi('down', 13, 9, 3), // e2 顶分型中间（与 e1 有缺口）
      makeBi('up', 11, 9, 4),
      makeBi('down', 11, 7, 5), // e3
      makeBi('up', 10, 7, 6), // 反方向新段特征序列仅 2 元素，无法成底分型
    ];

    const result = new DuanCalculator().createDuan({ phaseA: [], phaseB: bis });

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe(DuanType.UnComplete);
    expect(result[0].endBi).toBeNull();
    expect(result[0].originBis).toHaveLength(7); // bi[0..6]
  });

  it('is deterministic across repeated calls and does not mutate input', () => {
    const bis: ChanBi[] = [
      makeBi('up', 8, 4, 0),
      makeBi('down', 8, 5, 1),
      makeBi('up', 13, 5, 2),
      makeBi('down', 13, 9, 3),
      makeBi('up', 11, 9, 4),
      makeBi('down', 11, 7, 5),
      makeBi('up', 10, 7, 6),
      makeBi('down', 10, 4, 7),
      makeBi('up', 9, 4, 8),
      makeBi('down', 9, 6, 9),
      makeBi('up', 11, 6, 10),
    ];
    const input: ChanBiTwoPhaseResult = { phaseA: bis, phaseB: bis };
    const calc = new DuanCalculator();
    const first = calc.createDuan(input);
    const second = calc.createDuan(input);
    expect(second).toEqual(first);
    expect(bis.map((b) => b.high)).toEqual([
      8, 8, 13, 13, 11, 11, 10, 10, 9, 9, 11,
    ]);
  });
});

/** 构造最小 ChanBi（仅设 DuanCalculator 使用的字段；fenxings/originData 留空，段算法不读）。 */
function makeBi(
  trend: 'up' | 'down',
  high: number,
  low: number,
  id: number,
): ChanBi {
  const time = new Date(2026, 6, 1, 9, id, 0, 0);
  return {
    startTime: time,
    endTime: time,
    high,
    low,
    trend: trend === 'up' ? TrendDirection.Up : TrendDirection.Down,
    type: BiType.Complete,
    status: BiStatus.Valid,
    independentCount: 1,
    originIds: [id],
    originData: [],
    startFenxing: null,
    endFenxing: null,
  };
}
