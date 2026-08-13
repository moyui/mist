import {
  BiStatus,
  BiType,
  DuanStatus,
  DuanType,
  TrendDirection,
} from '../contracts';
import type { ChanBi } from '../contracts';
import { DuanCalculator } from './duan';

describe('DuanCalculator (特征序列法)', () => {
  it('returns empty two-phase result for fewer than 3 Bi', () => {
    const calc = new DuanCalculator();
    expect(calc.createDuan([])).toEqual({ phaseA: [], phaseB: [] });
    expect(calc.createDuan([makeBi('up', 8, 4, 0)])).toEqual({
      phaseA: [],
      phaseB: [],
    });
    expect(
      calc.createDuan([makeBi('up', 8, 4, 0), makeBi('down', 8, 5, 1)]),
    ).toEqual({ phaseA: [], phaseB: [] });
  });

  it('ends an upward segment at the fenxing extremum Bi (first case, no gap)', () => {
    // 交替笔序列，向上段特征序列 e1=(8,5) e2=(11,7) e3=(9,6) 在 e2 形成顶分型（无包含、无缺口）。
    const bis: ChanBi[] = [
      makeBi('up', 8, 4, 0), // H0=8
      makeBi('down', 8, 5, 1), // e1=(8,5)
      makeBi('up', 11, 5, 2), // H2=11
      makeBi('down', 11, 7, 3), // e2=(11,7)  ← 顶分型中间
      makeBi('up', 9, 7, 4), // H4=9
      makeBi('down', 9, 6, 5), // e3=(9,6)
      makeBi('up', 13, 6, 6), // 尾
    ];

    const result = new DuanCalculator().createDuan(bis);

    // phaseA 与 phaseB 各 2 项：确认段 + 未完成尾段
    expect(result.phaseA).toHaveLength(2);
    expect(result.phaseB).toHaveLength(2);

    const seg = result.phaseB[0];
    expect(seg.type).toBe(DuanType.Complete);
    expect(seg.status).toBe(DuanStatus.Valid);
    expect(seg.trend).toBe(TrendDirection.Up);
    expect(seg.high).toBe(11); // 极值
    expect(seg.low).toBe(4);
    expect(seg.originBis).toHaveLength(3); // bi[0..2]
    expect(seg.startBi).toBe(bis[0]);
    expect(seg.endBi).toBe(bis[2]); // 终止于分型中间反向笔的前一根同向笔
    expect(seg.originIds).toEqual([0, 1, 2]);

    const tail = result.phaseB[1];
    expect(tail.type).toBe(DuanType.UnComplete);
    expect(tail.status).toBe(DuanStatus.Unknown);
    expect(tail.endBi).toBeNull(); // 尾段未确认
    expect(tail.trend).toBe(TrendDirection.Down);
    expect(tail.originBis).toHaveLength(4); // bi[3..6]
  });

  it('is deterministic across repeated calls and does not mutate input', () => {
    const bis: ChanBi[] = [
      makeBi('up', 8, 4, 0),
      makeBi('down', 8, 5, 1),
      makeBi('up', 11, 5, 2),
      makeBi('down', 11, 7, 3),
      makeBi('up', 9, 7, 4),
      makeBi('down', 9, 6, 5),
      makeBi('up', 13, 6, 6),
    ];
    const calc = new DuanCalculator();
    const first = calc.createDuan(bis);
    const second = calc.createDuan(bis);
    expect(second).toEqual(first);
    // 输入未被改动
    expect(bis.map((b) => b.high)).toEqual([8, 8, 11, 11, 9, 9, 13]);
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
