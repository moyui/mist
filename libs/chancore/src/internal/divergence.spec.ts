import { ChanDivergenceType, TrendDirection } from '../contracts';
import type {
  ChanDivergenceInput,
  ChanDivergenceUnit,
  ChanDivergenceZhongshu,
  ChanUnitForce,
} from '../contracts';
import { DivergenceDetector } from './divergence';

describe('DivergenceDetector (背驰，24课 A/B/C 三段结构，双口径)', () => {
  const calc = new DivergenceDetector();

  it('returns [] for empty input (no units / no zhongshus / no forces)', () => {
    expect(
      calc.detectDivergences({ units: [], zhongshus: [], forces: [] }),
    ).toEqual([]);
    expect(
      calc.detectDivergences({
        units: [makeUnit('up', 0)],
        zhongshus: [],
        forces: [makeForce(1, 1)],
      }),
    ).toEqual([]);
  });

  it('skips a zhongshu whose boundaries cannot be located in units', () => {
    const input = makeConsolidationInput(4, {
      firstTime: new Date(1999, 0, 1), // 不匹配任何 unit.startTime
    });
    expect(calc.detectDivergences(input)).toEqual([]);
  });

  it('does not report consolidation when a zhongshu has no entering unit', () => {
    // 中枢 = [u1,u2,u3]，进入段 u0 存在——改为让 firstIndex=0 无进入段：
    // 用 units[0..2] 作中枢（firstIndex=0, enter=-1）
    const units = makeAlternatingUnits(3);
    const zhongshus = [
      makeZhongshu(units[0].startTime, units[2].endTime, 10, 0, 10, 0),
    ];
    const forces = [makeForce(1, 10), makeForce(5, 50), makeForce(5, 50)];
    expect(calc.detectDivergences({ units, zhongshus, forces })).toEqual([]);
  });

  it('does not report consolidation when a zhongshu has no leaving unit', () => {
    // 中枢 = [u4,u5,u6] 在 7 段序列末尾，leave = units[7] 不存在
    const units = makeAlternatingUnits(7);
    const zhongshus = [
      makeZhongshu(units[4].startTime, units[6].endTime, 10, 0, 10, 0),
    ];
    const forces = units.map((_, i) => makeForce(10 - i, 100 - i * 10));
    expect(calc.detectDivergences({ units, zhongshus, forces })).toEqual([]);
  });

  it('reports consolidation divergence when leaving force is weaker on BOTH components', () => {
    // 中枢 = [u1,u2,u3]；进入段 u0、离开段 u4
    const input = makeConsolidationInput(5, {
      forces: [
        makeForce(9, 90), // u0 enter
        makeForce(5, 50), // u1
        makeForce(5, 50), // u2
        makeForce(5, 50), // u3
        makeForce(3, 30), // u4 leave (< enter)
      ],
    });
    const result = calc.detectDivergences(input);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe(ChanDivergenceType.Consolidation);
    expect(result[0].zhongshuIndex).toBe(0);
    expect(result[0].enterIndex).toBe(0);
    expect(result[0].leaveIndex).toBe(4);
    expect(result[0].enterForce).toEqual(makeForce(9, 90));
    expect(result[0].leaveForce).toEqual(makeForce(3, 30));
  });

  it('does NOT report when only one component is weaker (area shrinks but peak does not)', () => {
    // 中枢 = [u1,u2,u3]；进入段 u0(peak=30) 离开段 u4(peak=40>30) → 不背驰
    const input = makeConsolidationInput(5, {
      forces: [
        makeForce(9, 30), // u0 enter peak=30
        makeForce(5, 50), // u1
        makeForce(5, 50), // u2
        makeForce(5, 50), // u3
        makeForce(3, 40), // u4 leave peak=40 > 30 → 不背驰
      ],
    });
    expect(calc.detectDivergences(input)).toEqual([]);
  });

  it('does NOT report on equality (strict less-than, no epsilon)', () => {
    // 中枢 = [u1,u2,u3]；进入段 u0、离开段 u4 力度相等 → 不背驰
    const input = makeConsolidationInput(5, {
      forces: [
        makeForce(9, 90), // u0 enter
        makeForce(5, 50), // u1
        makeForce(5, 50), // u2
        makeForce(5, 50), // u3
        makeForce(9, 90), // u4 leave == enter
      ],
    });
    expect(calc.detectDivergences(input)).toEqual([]);
  });

  it('does NOT report when entering and leaving units have opposite directions (24课 A/C 同向)', () => {
    const uAll = makeAlternatingUnits(5); // u0..u4，u0 up
    const zhongshus = [makeZhongshu(uAll[1].startTime, uAll[3].endTime, 10, 0)];
    // 覆盖 forces：leave(u4) 双分量 < enter(u0)
    const fAll = [
      makeForce(9, 90), // u0
      makeForce(5, 50),
      makeForce(5, 50),
      makeForce(5, 50),
      makeForce(3, 30), // u4 < u0
    ];
    // 同向基线：应触发 1
    const base = calc.detectDivergences({
      units: uAll,
      zhongshus,
      forces: fAll,
    });
    expect(base).toHaveLength(1);
    // 反向：把离开段 u4 方向改成 down（与进入段 u0 up 反向）
    const reversed = [...uAll];
    reversed[4] = {
      startTime: reversed[4].startTime,
      endTime: reversed[4].endTime,
      trend: TrendDirection.Down,
    };
    const res = calc.detectDivergences({
      units: reversed,
      zhongshus,
      forces: fAll,
    });
    expect(res.some((d) => d.type === ChanDivergenceType.Consolidation)).toBe(
      false,
    );
  });

  it('constructs an up trend chain and reports trend divergence on the chain last channel', () => {
    const input = makeTrendInput();
    const result = calc.detectDivergences(input);

    const trendResults = result.filter(
      (d) => d.type === ChanDivergenceType.Trend,
    );
    expect(trendResults).toHaveLength(1);
    expect(trendResults[0].zhongshuIndex).toBe(1); // 链末中枢（B）
    expect(trendResults[0].enterIndex).toBe(4); // A 段 = units[4] (u4 up)
    expect(trendResults[0].leaveIndex).toBe(8); // C 段 = units[8] (u8 up)
    expect(trendResults[0].enterForce).toEqual(makeForce(8, 80));
    expect(trendResults[0].leaveForce).toEqual(makeForce(4, 40));
  });

  it('does not produce a trend when chain progress fails (later channel not higher)', () => {
    const input = makeTrendInput({ c2gg: 25, c2dd: 4 }); // dd 未递进(4 < 5) → 断链
    const result = calc.detectDivergences(input);
    expect(result.some((d) => d.type === ChanDivergenceType.Trend)).toBe(false);
  });

  it('treats a same-level merged channel as ordinary (no expanded awareness: geometry only)', () => {
    // ChanDivergenceZhongshu 最小接口不含 expanded；合并产物仍同级别、参与位置递进判断。
    // 这里用与默认相同的几何（合并产物的 zg/zd 用波动重叠区、gg/dd 并集极值）验证照常入链。
    const input = makeTrendInput({ c2zg: 12, c2zd: 8, c2gg: 35, c2dd: 6 });
    // c2.gg=35>20 且 c2.dd=6>5 → 仍递进，应出趋势背驰
    const result = calc.detectDivergences(input);
    expect(result.some((d) => d.type === ChanDivergenceType.Trend)).toBe(true);
  });

  it('breaks the chain when interleaved by an opposite-direction channel', () => {
    const units = makeAlternatingUnits(11);
    // 中枢1 up：u1..u3（离开段 u4 up）；反向中枢：u5..u7（离开段 u8 down）；
    // 中枢3 up：u8..u10? 需 u10 离开段为 up —— 这里构造中枢3 为 u7..u9（离开段 u10 down）不构成 up 链。
    // 简化：只放两个 up 中枢，中间插一个反向（down）中枢 → up 链被截断，各成孤立（链长1）。
    const zhongshus: ChanDivergenceZhongshu[] = [
      makeZhongshu(units[1].startTime, units[3].endTime, 20, 5, 20, 5), // up：离开段 u4(up)
      makeZhongshu(units[4].startTime, units[6].endTime, 15, 0, 15, 0), // down：离开段 u7(down)
      makeZhongshu(units[7].startTime, units[9].endTime, 30, 10, 30, 10), // up：离开段 u10(up)
    ];
    const forces = units.map((_, i) => makeForce(10 - i, 100 - i * 10));
    const result = calc.detectDivergences({ units, zhongshus, forces });
    // 反向中枢打断 up 链：两段 up 各孤立 → 无趋势背驰
    expect(result.some((d) => d.type === ChanDivergenceType.Trend)).toBe(false);
  });

  it('orders results by zhongshuIndex and does not mutate input', () => {
    const input = makeTrendInput();
    const snapshot = JSON.stringify(input);
    const result = calc.detectDivergences(input);
    expect(
      result.every(
        (d, i) => i === 0 || d.zhongshuIndex >= result[i - 1].zhongshuIndex,
      ),
    ).toBe(true);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it('is deterministic for repeated calls', () => {
    const input = makeTrendInput();
    expect(calc.detectDivergences(input)).toEqual(
      calc.detectDivergences(input),
    );
  });
});

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function makeUnit(trend: 'up' | 'down', index: number): ChanDivergenceUnit {
  const time = new Date(2026, 6, 1, 9, index * 10, 0, 0);
  return {
    startTime: time,
    endTime: new Date(time.getTime() + 60_000),
    trend: trend === 'up' ? TrendDirection.Up : TrendDirection.Down,
  };
}

function makeAlternatingUnits(count: number): ChanDivergenceUnit[] {
  // 方向交替：u0 up, u1 down, u2 up, ...
  return Array.from({ length: count }, (_, i) =>
    makeUnit(i % 2 === 0 ? 'up' : 'down', i),
  );
}

function makeZhongshu(
  firstUnitTime: Date,
  lastUnitTime: Date,
  gg: number,
  dd: number,
  zg = gg,
  zd = dd,
): ChanDivergenceZhongshu {
  return { firstUnitTime, lastUnitTime, gg, dd, zg, zd };
}

function makeForce(area: number, peak: number): ChanUnitForce {
  return { area, peak };
}

/**
 * 构造 4 段交替序列 + 1 个中枢（首段 units[1]、末段 units[3]），
 * 进入段 = units[0]、离开段 = units[4]（如存在）。
 */
function makeConsolidationInput(
  unitCount: number,
  opts: {
    forces?: ChanUnitForce[];
    firstTime?: Date;
  } = {},
): ChanDivergenceInput {
  const units = makeAlternatingUnits(unitCount);
  const zhongshus = [
    makeZhongshu(opts.firstTime ?? units[1].startTime, units[3].endTime, 10, 0),
  ];
  const forces =
    opts.forces ?? units.map((_, i) => makeForce(10 - i, 100 - i * 10));
  return { units, zhongshus, forces };
}

/**
 * 标准向上趋势链输入：
 * 9 段交替（u0 up ... u8 up）；中枢1 = [u1,u2,u3]（离开段 u4 up → 方向 up），
 * 中枢2 = [u5,u6,u7]（离开段 u8 up → 方向 up）；中枢2 位置递进（gg/dd 更高）。
 * 趋势背驰：中枢2(B) 进入段 u4(A) vs 离开段 u8(C)，C 双分量 < A。
 */
function makeTrendInput(
  opts: {
    c2gg?: number;
    c2dd?: number;
    c2zg?: number;
    c2zd?: number;
  } = {},
): ChanDivergenceInput {
  const units = makeAlternatingUnits(9); // u0 up ... u8 up
  const c2gg = opts.c2gg ?? 30;
  const c2dd = opts.c2dd ?? 10;
  const c2zg = opts.c2zg ?? c2gg;
  const c2zd = opts.c2zd ?? c2dd;

  const zhongshus: ChanDivergenceZhongshu[] = [
    makeZhongshu(units[1].startTime, units[3].endTime, 20, 5), // c1: gg20 dd5
    makeZhongshu(units[5].startTime, units[7].endTime, c2gg, c2dd, c2zg, c2zd),
  ];

  const forces: ChanUnitForce[] = [
    makeForce(1, 10), // u0
    makeForce(5, 50), // u1
    makeForce(5, 50), // u2
    makeForce(5, 50), // u3
    makeForce(8, 80), // u4 A（up）
    makeForce(5, 50), // u5
    makeForce(5, 50), // u6
    makeForce(5, 50), // u7
    makeForce(4, 40), // u8 C（up）< A
  ];

  return { units, zhongshus, forces };
}
