import { ChanBspType, TrendDirection } from '../contracts';
import type {
  ChanBspInput,
  ChanBspUnit,
  ChanDivergenceZhongshu,
  ChanUnitForce,
} from '../contracts';
import { BuySellPointDetector } from './buy-sell-point';

describe('BuySellPointDetector', () => {
  const calc = new BuySellPointDetector();

  // -------------------------------------------------------------------------
  // 一类（一买/一卖）：仅趋势背驰产出，盘整背驰过滤
  // -------------------------------------------------------------------------

  it('一买：下跌趋势链链末中枢 Trend 背驰 → FirstBuy 于离开段末端', () => {
    const input = makeTrendDownInput();
    const points = calc.detectBuySellPoints(input);
    expect(points).toHaveLength(1);
    expect(points[0]).toMatchObject({
      type: ChanBspType.FirstBuy,
      zhongshuIndex: 1,
      unitIndex: 8,
      price: input.units[8].low,
      firstTypeIndex: null,
    });
  });

  it('一卖：上涨趋势链链末中枢 Trend 背驰 → FirstSell 于离开段末端', () => {
    const input = makeTrendUpInput();
    const points = calc.detectBuySellPoints(input);
    expect(points).toHaveLength(1);
    expect(points[0]).toMatchObject({
      type: ChanBspType.FirstSell,
      zhongshuIndex: 1,
      unitIndex: 8,
      price: input.units[8].high,
    });
  });

  it('仅盘整背驰（无趋势链）→ 不产一类点', () => {
    // 单个中枢 + 进入段 vs 离开段双弱（Consolidation），但链长 1 无 Trend
    const units = makeBspAlternatingUnits(5);
    const zhongshus = [
      makeBspZhongshu(units[1].startTime, units[3].endTime, 20, 5),
    ];
    const forces = units.map((_, i) => makeBspForce(10 - i, 100 - i * 10));
    const points = calc.detectBuySellPoints({ units, zhongshus, forces });
    expect(points).toHaveLength(0);
  });

  it('同中枢 Trend 与 Consolidation 并存 → 只产一个一类点（Trend）', () => {
    const input = makeTrendDownInput();
    // 该 fixture 中链末中枢同时满足盘整背驰与趋势背驰
    const points = calc.detectBuySellPoints(input);
    expect(points.filter((p) => p.type === ChanBspType.FirstBuy)).toHaveLength(
      1,
    );
  });

  it('forces 为空 → 无一类点', () => {
    const input = makeTrendDownInput();
    const points = calc.detectBuySellPoints({
      units: input.units,
      zhongshus: input.zhongshus,
      forces: [],
    });
    expect(points.filter((p) => p.type === ChanBspType.FirstBuy)).toHaveLength(
      0,
    );
  });

  // -------------------------------------------------------------------------
  // 二类（二买/二卖）：一买/一卖后相邻三元组回抽确认，纯结构，不查背驰
  // -------------------------------------------------------------------------

  it('二买：一买段后 down→up→down 且回抽低点不破前低 → SecondBuy', () => {
    const input = makeFirstBuyThenPullbackInput();
    const points = calc.detectBuySellPoints(input);
    const second = points.find((p) => p.type === ChanBspType.SecondBuy);
    expect(second).toBeDefined();
    expect(second).toMatchObject({
      zhongshuIndex: null,
      unitIndex: 10,
      price: input.units[10].low,
    });
    // firstTypeIndex 引用前置一买
    const first = points.find((p) => p.type === ChanBspType.FirstBuy);
    expect(second!.firstTypeIndex).toBe(points.indexOf(first!));
  });

  it('二卖：一卖段后 up→down→up 且反抽高点不破前高 → SecondSell', () => {
    const input = makeFirstSellThenPullbackInput();
    const points = calc.detectBuySellPoints(input);
    const second = points.find((p) => p.type === ChanBspType.SecondSell);
    expect(second).toBeDefined();
    expect(second).toMatchObject({
      zhongshuIndex: null,
      unitIndex: 10,
      price: input.units[10].high,
    });
  });

  it('无前置一类点（三元组结构满足但第一段不是一类点）→ 不产二类', () => {
    // 无背驰力度（forces 全等），但三元组结构满足——缺一买前置
    const units = makeBspAlternatingUnits(5); // u0 up, u1 down, u2 up, u3 down, u4 up
    const forces = units.map(() => makeBspForce(5, 50));
    const points = calc.detectBuySellPoints({
      units,
      zhongshus: [],
      forces,
    });
    expect(points).toHaveLength(0);
  });

  it('二买严格口径：回抽低点 == 一买段低点 → 不产二买', () => {
    const input = makeFirstBuyThenPullbackInput();
    const units = input.units.slice();
    const u10 = units[10];
    units[10] = {
      ...u10,
      low: units[8].low, // 贴边 == 一买段低点
    };
    const points = calc.detectBuySellPoints({
      ...input,
      units,
    });
    expect(
      points.find((p) => p.type === ChanBspType.SecondBuy),
    ).toBeUndefined();
  });

  it('非相邻三元组不输出（中间隔段）', () => {
    // 构造一买在 u8，但 u9/u10 不是紧邻回抽（直接跳过三元组）——用 9 段输入（一买在末段）
    const input = makeTrendDownInput();
    const points = calc.detectBuySellPoints(input);
    expect(
      points.find((p) => p.type === ChanBspType.SecondBuy),
    ).toBeUndefined();
  });

  it('方向不交替（down/down/down）→ 不产二类', () => {
    const units = [
      makeBspUnit('down', 0, 20, 10),
      makeBspUnit('down', 1, 18, 8),
      makeBspUnit('down', 2, 16, 6),
    ];
    const forces = units.map(() => makeBspForce(5, 50));
    const points = calc.detectBuySellPoints({
      units,
      zhongshus: [],
      forces,
    });
    expect(points).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // 三类（三买/三卖）：离开中枢后回抽不回中枢区间（几何，严格）
  // -------------------------------------------------------------------------

  it('三买：中枢离开段 up + 回抽段 down 且低点严格高于 zg → ThirdBuy', () => {
    const input = makeThirdBuyInput();
    const points = calc.detectBuySellPoints(input);
    const third = points.find((p) => p.type === ChanBspType.ThirdBuy);
    expect(third).toBeDefined();
    expect(third).toMatchObject({
      zhongshuIndex: 0,
      unitIndex: 5,
      price: input.units[5].low,
      firstTypeIndex: null,
    });
  });

  it('三卖：中枢离开段 down + 回抽段 up 且高点严格低于 zd → ThirdSell', () => {
    const input = makeThirdSellInput();
    const points = calc.detectBuySellPoints(input);
    const third = points.find((p) => p.type === ChanBspType.ThirdSell);
    expect(third).toBeDefined();
    expect(third).toMatchObject({
      zhongshuIndex: 0,
      unitIndex: 5,
      price: input.units[5].high,
    });
  });

  it('三买严格口径：回抽低点 == zg（贴边触及）→ 不产三买', () => {
    const input = makeThirdBuyInput();
    const units = input.units.slice();
    const u5 = units[5];
    units[5] = {
      ...u5,
      low: input.zhongshus[0].zg, // 贴边 == zg
    };
    const points = calc.detectBuySellPoints({ ...input, units });
    expect(points.find((p) => p.type === ChanBspType.ThirdBuy)).toBeUndefined();
  });

  it('无回抽段（e+2 越界）→ 跳过', () => {
    const units = makeBspAlternatingUnits(5); // 中枢 [u1,u2,u3]，离开段 u4，无回抽段
    const zhongshus = [
      makeBspZhongshu(units[1].startTime, units[3].endTime, 20, 5),
    ];
    const forces = units.map(() => makeBspForce(5, 50));
    const points = calc.detectBuySellPoints({ units, zhongshus, forces });
    expect(points.find((p) => p.type === ChanBspType.ThirdBuy)).toBeUndefined();
  });

  it('无离开段（e+1 越界）→ 跳过', () => {
    const units = makeBspAlternatingUnits(4); // 中枢 [u1,u2,u3] 即末段
    const zhongshus = [
      makeBspZhongshu(units[1].startTime, units[3].endTime, 20, 5),
    ];
    const forces = units.map(() => makeBspForce(5, 50));
    const points = calc.detectBuySellPoints({ units, zhongshus, forces });
    expect(points).toHaveLength(0);
  });

  it('离开段反向（up + up 或 down + down）→ 不产三类', () => {
    // 中枢 [u1,u2,u3]，离开段 u4 up、回抽段 u5 up（方向未交替）
    const units = [
      makeBspUnit('up', 0, 12, 8),
      makeBspUnit('down', 1, 20, 10),
      makeBspUnit('up', 2, 24, 14),
      makeBspUnit('down', 3, 22, 12),
      makeBspUnit('up', 4, 30, 24),
      makeBspUnit('up', 5, 32, 26),
    ];
    const zhongshus = [
      makeBspZhongshu(units[1].startTime, units[3].endTime, 24, 10, 20, 14),
    ];
    const forces = units.map(() => makeBspForce(5, 50));
    const points = calc.detectBuySellPoints({ units, zhongshus, forces });
    expect(points.find((p) => p.type === ChanBspType.ThirdBuy)).toBeUndefined();
  });

  it('中枢定位失败（firstUnitTime 不匹配）→ 跳过', () => {
    const units = makeBspAlternatingUnits(6);
    const zhongshus = [
      makeBspZhongshu(new Date(2026, 6, 1, 23, 0, 0), units[3].endTime, 20, 5),
    ];
    const forces = units.map(() => makeBspForce(5, 50));
    const points = calc.detectBuySellPoints({ units, zhongshus, forces });
    expect(points).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // 汇总：排序 / firstTypeIndex / 确定性 / 不变异 / 空输入
  // -------------------------------------------------------------------------

  it('结果按 unitIndex → type → zhongshuIndex(null 后置) 排序', () => {
    const input = makeThirdBuyInput();
    const points = calc.detectBuySellPoints(input);
    const keys = points.map((p) => p.unitIndex);
    expect(keys).toEqual([...keys].sort((a, b) => a - b));
    // 二类 zhongshuIndex=null 与三类同 unitIndex 时 null 后置
    const input2 = makeFirstBuyThenPullbackInput();
    const points2 = calc.detectBuySellPoints(input2);
    const withNull = points2.filter((p) => p.zhongshuIndex === null);
    const withoutNull = points2.filter((p) => p.zhongshuIndex !== null);
    // 二类(unitIndex 10) 在 一类(unitIndex 8) 之后：时间序
    expect(withoutNull.every((p) => p.unitIndex < withNull[0]?.unitIndex)).toBe(
      true,
    );
  });

  it('firstTypeIndex：无前置一类点的三类点 → null', () => {
    const input = makeThirdBuyInput();
    const points = calc.detectBuySellPoints(input);
    const third = points.find((p) => p.type === ChanBspType.ThirdBuy)!;
    expect(third.firstTypeIndex).toBeNull();
  });

  it('是确定性的：重复调用返回相同结果', () => {
    const input = makeFirstBuyThenPullbackInput();
    expect(calc.detectBuySellPoints(input)).toEqual(
      calc.detectBuySellPoints(input),
    );
  });

  it('不变异输入：调用前后 JSON 一致', () => {
    const input = makeFirstBuyThenPullbackInput();
    const snapshot = JSON.stringify(input);
    calc.detectBuySellPoints(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it('空输入（无 units）→ []', () => {
    expect(
      calc.detectBuySellPoints({ units: [], zhongshus: [], forces: [] }),
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function makeBspUnit(
  trend: 'up' | 'down',
  index: number,
  high: number,
  low: number,
): ChanBspUnit {
  const time = new Date(2026, 6, 1, 9, index * 10, 0, 0);
  return {
    startTime: time,
    endTime: new Date(time.getTime() + 60_000),
    high,
    low,
    trend: trend === 'up' ? TrendDirection.Up : TrendDirection.Down,
  };
}

function makeBspAlternatingUnits(count: number): ChanBspUnit[] {
  // 方向交替：u0 up, u1 down, u2 up, ...
  const base: [number, number][] = [];
  for (let i = 0; i < count; i++) {
    const high = 30 - i * 2;
    const low = high - 6;
    base.push([high, low]);
  }
  return Array.from({ length: count }, (_, i) =>
    makeBspUnit(i % 2 === 0 ? 'up' : 'down', i, base[i][0], base[i][1]),
  );
}

function makeBspZhongshu(
  firstUnitTime: Date,
  lastUnitTime: Date,
  gg: number,
  dd: number,
  zg = gg,
  zd = dd,
): ChanDivergenceZhongshu {
  return { firstUnitTime, lastUnitTime, gg, dd, zg, zd };
}

function makeBspForce(area: number, peak: number): ChanUnitForce {
  return { area, peak };
}

/** 下跌趋势链（11 段）：链末中枢 Trend 背驰 → 一买于 u8，其后 u9 up / u10 down 回抽确认二买。 */
function makeFirstBuyThenPullbackInput(): ChanBspInput {
  const units = [
    makeBspUnit('down', 0, 34, 24),
    makeBspUnit('up', 1, 32, 22),
    makeBspUnit('down', 2, 30, 20),
    makeBspUnit('up', 3, 28, 18),
    makeBspUnit('down', 4, 26, 16), // 中枢2 进入段 A
    makeBspUnit('up', 5, 24, 14),
    makeBspUnit('down', 6, 22, 12),
    makeBspUnit('up', 7, 20, 10),
    makeBspUnit('down', 8, 18, 8), // 中枢2 离开段 C（一买，低点 8）
    makeBspUnit('up', 9, 20, 10),
    makeBspUnit('down', 10, 16, 9), // 回抽：低点 9 > 8 → 二买
  ];
  const zhongshus = [
    makeBspZhongshu(units[1].startTime, units[3].endTime, 32, 18),
    makeBspZhongshu(units[5].startTime, units[7].endTime, 24, 10),
  ];
  const forces = [
    makeBspForce(5, 50),
    makeBspForce(5, 50),
    makeBspForce(5, 50),
    makeBspForce(5, 50),
    makeBspForce(8, 80), // u4 A
    makeBspForce(5, 50),
    makeBspForce(5, 50),
    makeBspForce(5, 50),
    makeBspForce(4, 40), // u8 C < A → Trend 背驰
    makeBspForce(5, 50),
    makeBspForce(5, 50),
  ];
  return { units, zhongshus, forces };
}

/** 上涨趋势链（9 段）：一卖于 u8（末段），无回抽段。 */
function makeTrendUpInput(): ChanBspInput {
  const units = [
    makeBspUnit('up', 0, 34, 24),
    makeBspUnit('down', 1, 32, 22),
    makeBspUnit('up', 2, 30, 20),
    makeBspUnit('down', 3, 28, 18),
    makeBspUnit('up', 4, 26, 16),
    makeBspUnit('down', 5, 24, 14),
    makeBspUnit('up', 6, 22, 12),
    makeBspUnit('down', 7, 20, 10),
    makeBspUnit('up', 8, 18, 8), // C < A → 一卖
  ];
  const zhongshus = [
    makeBspZhongshu(units[1].startTime, units[3].endTime, 24, 10), // c1 较低
    makeBspZhongshu(units[5].startTime, units[7].endTime, 32, 18), // c2 更高（up 递进）
  ];
  const forces = [
    makeBspForce(5, 50),
    makeBspForce(5, 50),
    makeBspForce(5, 50),
    makeBspForce(5, 50),
    makeBspForce(8, 80), // u4 A
    makeBspForce(5, 50),
    makeBspForce(5, 50),
    makeBspForce(5, 50),
    makeBspForce(4, 40), // u8 C < A → Trend 背驰（up 链 → 一卖）
  ];
  return { units, zhongshus, forces };
}

/** 下跌趋势链（9 段）：一买于 u8（末段），无回抽段。 */
function makeTrendDownInput(): ChanBspInput {
  const units = [
    makeBspUnit('down', 0, 34, 24),
    makeBspUnit('up', 1, 32, 22),
    makeBspUnit('down', 2, 30, 20),
    makeBspUnit('up', 3, 28, 18),
    makeBspUnit('down', 4, 26, 16),
    makeBspUnit('up', 5, 24, 14),
    makeBspUnit('down', 6, 22, 12),
    makeBspUnit('up', 7, 20, 10),
    makeBspUnit('down', 8, 18, 8), // C < A → 一买
  ];
  const zhongshus = [
    makeBspZhongshu(units[1].startTime, units[3].endTime, 32, 18),
    makeBspZhongshu(units[5].startTime, units[7].endTime, 24, 10),
  ];
  const forces = [
    makeBspForce(5, 50),
    makeBspForce(5, 50),
    makeBspForce(5, 50),
    makeBspForce(5, 50),
    makeBspForce(8, 80), // u4 A
    makeBspForce(5, 50),
    makeBspForce(5, 50),
    makeBspForce(5, 50),
    makeBspForce(4, 40), // u8 C < A → Trend 背驰
  ];
  return { units, zhongshus, forces };
}

/** 上涨趋势链（11 段）：一卖于 u8，其后 u9 down / u10 up 反抽确认二卖。 */
function makeFirstSellThenPullbackInput(): ChanBspInput {
  const units = [
    makeBspUnit('up', 0, 34, 24),
    makeBspUnit('down', 1, 32, 22),
    makeBspUnit('up', 2, 30, 20),
    makeBspUnit('down', 3, 28, 18),
    makeBspUnit('up', 4, 26, 16), // 中枢2 进入段 A
    makeBspUnit('down', 5, 24, 14),
    makeBspUnit('up', 6, 22, 12),
    makeBspUnit('down', 7, 20, 10),
    makeBspUnit('up', 8, 18, 8), // 中枢2 离开段 C（一卖，高点 18）
    makeBspUnit('down', 9, 20, 10),
    makeBspUnit('up', 10, 16, 9), // 反抽：高点 16 < 18 → 二卖
  ];
  const zhongshus = [
    makeBspZhongshu(units[1].startTime, units[3].endTime, 24, 10), // c1 较低
    makeBspZhongshu(units[5].startTime, units[7].endTime, 32, 18), // c2 更高（up 递进）
  ];
  const forces = [
    makeBspForce(5, 50),
    makeBspForce(5, 50),
    makeBspForce(5, 50),
    makeBspForce(5, 50),
    makeBspForce(8, 80), // u4 A
    makeBspForce(5, 50),
    makeBspForce(5, 50),
    makeBspForce(5, 50),
    makeBspForce(4, 40), // u8 C < A → Trend 背驰（up 链 → 一卖）
    makeBspForce(5, 50),
    makeBspForce(5, 50),
  ];
  return { units, zhongshus, forces };
}

/** 三买输入：中枢 [u1,u2,u3]，离开段 u4 up，回抽段 u5 down 且 u5.low > zg。 */
function makeThirdBuyInput(): ChanBspInput {
  const units = [
    makeBspUnit('up', 0, 12, 8),
    makeBspUnit('down', 1, 20, 10),
    makeBspUnit('up', 2, 24, 14),
    makeBspUnit('down', 3, 22, 12),
    makeBspUnit('up', 4, 30, 24), // 离开段 up
    makeBspUnit('down', 5, 28, 21), // 回抽段 down：low 21 > zg 20 → 三买
  ];
  const zhongshus = [
    makeBspZhongshu(units[1].startTime, units[3].endTime, 24, 10, 20, 14),
  ];
  const forces = units.map(() => makeBspForce(5, 50));
  return { units, zhongshus, forces };
}

/** 三卖输入：中枢 [u1,u2,u3]，离开段 u4 down，回抽段 u5 up 且 u5.high < zd。 */
function makeThirdSellInput(): ChanBspInput {
  const units = [
    makeBspUnit('down', 0, 12, 8),
    makeBspUnit('up', 1, 24, 14),
    makeBspUnit('down', 2, 22, 10),
    makeBspUnit('up', 3, 20, 8),
    makeBspUnit('down', 4, 14, 6), // 离开段 down
    makeBspUnit('up', 5, 12, 6), // 反抽段 up：high 12 < zd 14 → 三卖
  ];
  const zhongshus = [
    makeBspZhongshu(units[1].startTime, units[3].endTime, 24, 8, 20, 14),
  ];
  const forces = units.map(() => makeBspForce(5, 50));
  return { units, zhongshus, forces };
}
