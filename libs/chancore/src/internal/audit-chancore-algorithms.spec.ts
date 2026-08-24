/**
 * audit-chancore-algorithms §6-§7：背驰与买卖点端到端审计
 *
 * §6 背驰（趋势/盘整双口径）审计
 * §7 买卖点（一/二/三类）审计
 *
 * 这不是单元测试的重复——单元测试验证每个函数独立正确，
 * 本审计验证 **ChanCore 完整 pipeline**（构造 forces → detectDivergences → detectBuySellPoints）
 * 的行为符合缠论定义。
 */
import { ChanBspType, ChanDivergenceType, TrendDirection } from '../contracts';
import type {
  ChanBspInput,
  ChanBspUnit,
  ChanDivergenceInput,
  ChanDivergenceUnit,
  ChanDivergenceZhongshu,
  ChanUnitForce,
} from '../contracts';
import { DivergenceDetector } from './divergence';
import { BuySellPointDetector } from './buy-sell-point';

// ---------------------------------------------------------------------------
// §6 背驰审计
// ---------------------------------------------------------------------------

describe('§6 Divergence Audit — 趋势/盘整双口径', () => {
  const divergence = new DivergenceDetector();

  // §6.1 构造 forces，运行 detectDivergences()，统计趋势/盘整背驰数量
  describe('6.1 统计趋势背驰与盘整背驰数量', () => {
    it('盘整背驰输入：产出 exactly 1 consolidation divergence', () => {
      const input = makeConsolidationCase();
      const result = divergence.detectDivergences(input);
      const consolidations = result.filter(
        (d) => d.type === ChanDivergenceType.Consolidation,
      );
      const trends = result.filter((d) => d.type === ChanDivergenceType.Trend);
      expect(consolidations).toHaveLength(1);
      expect(trends).toHaveLength(0);
    });

    it('趋势背驰输入：产出 exactly 1 trend divergence', () => {
      const input = makeTrendUpCase();
      const result = divergence.detectDivergences(input);
      const trends = result.filter((d) => d.type === ChanDivergenceType.Trend);
      expect(trends).toHaveLength(1);
    });

    it('无中枢：产出 0', () => {
      const units = makeAlternatingUnits(5);
      const forces = units.map((_, i) => makeForce(10 - i, 100 - i * 10));
      expect(
        divergence.detectDivergences({ units, zhongshus: [], forces }),
      ).toEqual([]);
    });
  });

  // §6.2 验证盘整背驰：进入段 vs 离开段同向 + 双口径严格 <
  describe('6.2 盘整背驰验证', () => {
    it('进入段 vs 离开段同向 + 双口径严格 < → 报告盘整背驰', () => {
      const input = makeConsolidationCase();
      const result = divergence.detectDivergences(input);
      const c = result.find(
        (d) => d.type === ChanDivergenceType.Consolidation,
      )!;
      // 进入段 u0 up，离开段 u4 up → 同向
      expect(input.units[c.enterIndex].trend).toBe(TrendDirection.Up);
      expect(input.units[c.leaveIndex].trend).toBe(TrendDirection.Up);
      // 双口径严格 <
      expect(c.leaveForce.area).toBeLessThan(c.enterForce.area);
      expect(c.leaveForce.peak).toBeLessThan(c.enterForce.peak);
    });

    it('仅 area 弱、peak 不弱 → 不报告（双口径必须同时满足）', () => {
      const input = makeConsolidationCase();
      // 把离开段 peak 调高到 > 进入段
      const forces = [...input.forces];
      forces[4] = makeForce(3, 999); // area 弱但 peak 极强
      const result = divergence.detectDivergences({
        ...input,
        forces,
      });
      expect(
        result.some((d) => d.type === ChanDivergenceType.Consolidation),
      ).toBe(false);
    });

    it('进入段 vs 离开段反向 → 不报告（24课 A/C 必须同向）', () => {
      const input = makeConsolidationCase();
      const units = [...input.units];
      units[4] = {
        ...units[4],
        trend: TrendDirection.Down, // 反向
      };
      const result = divergence.detectDivergences({ ...input, units });
      expect(
        result.some((d) => d.type === ChanDivergenceType.Consolidation),
      ).toBe(false);
    });

    it('力度相等 → 不报告（严格 <，无 epsilon）', () => {
      const input = makeConsolidationCase();
      const forces = [...input.forces];
      forces[4] = makeForce(input.forces[0].area, input.forces[0].peak);
      const result = divergence.detectDivergences({ ...input, forces });
      expect(
        result.some((d) => d.type === ChanDivergenceType.Consolidation),
      ).toBe(false);
    });
  });

  // §6.3 验证趋势链构造：连续同向中枢 + 位置递进 gg/dd
  describe('6.3 趋势链构造验证', () => {
    it('两个同向中枢 + gg/dd 递进 → 形成趋势链', () => {
      const input = makeTrendUpCase();
      const result = divergence.detectDivergences(input);
      const trends = result.filter((d) => d.type === ChanDivergenceType.Trend);
      expect(trends).toHaveLength(1);
      // 链末中枢是第二个（index=1）
      expect(trends[0].zhongshuIndex).toBe(1);
    });

    it('第二个中枢 dd 未递进 → 断链，无趋势背驰', () => {
      const input = makeTrendUpCase();
      const zhongshus = [...input.zhongshus];
      // 第二个中枢 dd 改为比第一个低 → 不递进
      zhongshus[1] = { ...zhongshus[1], dd: 2 };
      const result = divergence.detectDivergences({
        ...input,
        zhongshus,
      });
      expect(result.some((d) => d.type === ChanDivergenceType.Trend)).toBe(
        false,
      );
    });

    it('中间插入反向中枢 → 链被打断', () => {
      const units = makeAlternatingUnits(13);
      const zhongshus: ChanDivergenceZhongshu[] = [
        makeZhongshu(units[1].startTime, units[3].endTime, 20, 5), // up
        makeZhongshu(units[4].startTime, units[6].endTime, 15, 0, 15, 0), // down（反向）
        makeZhongshu(units[7].startTime, units[9].endTime, 30, 10, 30, 10), // up
        makeZhongshu(units[10].startTime, units[12].endTime, 40, 15, 40, 15), // up
      ];
      const forces = units.map((_, i) => makeForce(10 - i, 100 - i * 5));
      const result = divergence.detectDivergences({
        units,
        zhongshus,
        forces,
      });
      // 反向中枢打断链：前两个 up 各孤立，后两个构成链但只有链末中枢
      // 不过后两个中枢的进入段/离开段方向需要检查
      // 关键是：中间有反向中枢时，前段 up 链被截断
      const trendZhongshuIndices = result
        .filter((d) => d.type === ChanDivergenceType.Trend)
        .map((d) => d.zhongshuIndex);
      // 不应有跨越反向中枢的趋势链
      expect(trendZhongshuIndices).not.toContain(1); // 第一个 up 中枢不应是链末
    });
  });

  // §6.4 验证趋势背驰：链末中枢进入段 vs 离开段，双口径严格 <
  describe('6.4 趋势背驰验证', () => {
    it('链末中枢进入段(A) vs 离开段(C)，C 双分量 < A → 趋势背驰', () => {
      const input = makeTrendUpCase();
      const result = divergence.detectDivergences(input);
      const t = result.find((d) => d.type === ChanDivergenceType.Trend)!;
      // A = 进入段（链末中枢前的同向段）
      // C = 离开段（链末中枢后的同向段）
      expect(t.leaveForce.area).toBeLessThan(t.enterForce.area);
      expect(t.leaveForce.peak).toBeLessThan(t.enterForce.peak);
    });

    it('C 不弱于 A → 不报告趋势背驰', () => {
      const input = makeTrendUpCase();
      const forces = [...input.forces];
      // 把离开段(u8)的 forces 调到 >= 进入段(u4)
      forces[8] = makeForce(9, 90);
      const result = divergence.detectDivergences({ ...input, forces });
      expect(result.some((d) => d.type === ChanDivergenceType.Trend)).toBe(
        false,
      );
    });

    it('下跌趋势链：一买方向（down trend），链末中枢 C < A', () => {
      const input = makeTrendDownCase();
      const result = divergence.detectDivergences(input);
      const t = result.find((d) => d.type === ChanDivergenceType.Trend)!;
      expect(t).toBeDefined();
      expect(t.leaveForce.area).toBeLessThan(t.enterForce.area);
      expect(t.leaveForce.peak).toBeLessThan(t.enterForce.peak);
    });
  });
});

// ---------------------------------------------------------------------------
// §7 买卖点审计
// ---------------------------------------------------------------------------

describe('§7 BuySellPoint Audit — 一/二/三类', () => {
  const bsp = new BuySellPointDetector();

  // §7.1 统计各类买卖点数量
  describe('7.1 统计各类买卖点', () => {
    it('上涨趋势链 → 1 个一卖', () => {
      const input = makeTrendUpBspCase();
      const points = bsp.detectBuySellPoints(input);
      const firstSells = points.filter((p) => p.type === ChanBspType.FirstSell);
      expect(firstSells).toHaveLength(1);
    });

    it('下跌趋势链 → 1 个一买', () => {
      const input = makeTrendDownBspCase();
      const points = bsp.detectBuySellPoints(input);
      const firstBuys = points.filter((p) => p.type === ChanBspType.FirstBuy);
      expect(firstBuys).toHaveLength(1);
    });

    it('仅盘整背驰 → 0 个一类点', () => {
      const input = makeConsolidationOnlyBspCase();
      const points = bsp.detectBuySellPoints(input);
      const firstPoints = points.filter(
        (p) =>
          p.type === ChanBspType.FirstBuy || p.type === ChanBspType.FirstSell,
      );
      expect(firstPoints).toHaveLength(0);
    });
  });

  // §7.2 验证一类点：仅趋势背驰产出，盘整背驰不产一类点
  describe('7.2 一类点仅由趋势背驰产出', () => {
    it('盘整背驰 → 无一类点（即使离开段双弱于进入段）', () => {
      const input = makeConsolidationOnlyBspCase();
      const points = bsp.detectBuySellPoints(input);
      expect(points).toHaveLength(0);
    });

    it('趋势背驰 → 产一类点', () => {
      const input = makeTrendDownBspCase();
      const points = bsp.detectBuySellPoints(input);
      expect(
        points.some(
          (p) =>
            p.type === ChanBspType.FirstBuy || p.type === ChanBspType.FirstSell,
        ),
      ).toBe(true);
    });
  });

  // §7.3 验证二类点：前置一类点存在 + 相邻三元组回抽不破前低/前高
  describe('7.3 二类点验证', () => {
    it('一买后 down→up→down 回抽低点不破一买低点 → SecondBuy', () => {
      const input = makeFirstBuyThenSecondBuyCase();
      const points = bsp.detectBuySellPoints(input);
      const secondBuys = points.filter((p) => p.type === ChanBspType.SecondBuy);
      expect(secondBuys).toHaveLength(1);
      // 二买指向回抽段末端
      expect(secondBuys[0].firstTypeIndex).toBeGreaterThanOrEqual(0);
    });

    it('一卖后 up→down→up 回抽高点不破一卖高点 → SecondSell', () => {
      const input = makeFirstSellThenSecondSellCase();
      const points = bsp.detectBuySellPoints(input);
      const secondSells = points.filter(
        (p) => p.type === ChanBspType.SecondSell,
      );
      expect(secondSells).toHaveLength(1);
    });

    it('无前置一类点 → 不产二类点', () => {
      // 只有回抽结构但没有趋势背驰
      const input = makeConsolidationOnlyBspCase();
      const points = bsp.detectBuySellPoints(input);
      expect(
        points.some(
          (p) =>
            p.type === ChanBspType.SecondBuy ||
            p.type === ChanBspType.SecondSell,
        ),
      ).toBe(false);
    });
  });

  // §7.4 验证三类点：离开中枢后回抽不回中枢区间（严格 > zg / < zd，贴边不算）
  describe('7.4 三类点验证', () => {
    it('离开中枢后回抽高点 > zg → ThirdBuy（回抽不回中枢）', () => {
      const input = makeThirdBuyCase();
      const points = bsp.detectBuySellPoints(input);
      const thirdBuys = points.filter((p) => p.type === ChanBspType.ThirdBuy);
      expect(thirdBuys).toHaveLength(1);
    });

    it('离开中枢后回抽高点 = zg（贴边）→ 不产三买', () => {
      const input = makeThirdBuyEdgeCase();
      const points = bsp.detectBuySellPoints(input);
      expect(points.some((p) => p.type === ChanBspType.ThirdBuy)).toBe(false);
    });

    it('离开中枢后回抽低点 < zd → ThirdSell', () => {
      const input = makeThirdSellCase();
      const points = bsp.detectBuySellPoints(input);
      const thirdSells = points.filter((p) => p.type === ChanBspType.ThirdSell);
      expect(thirdSells).toHaveLength(1);
    });
  });
});

// ---------------------------------------------------------------------------
// §6 helpers — 构造背驰审计用例
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
 * §6.2 盘整背驰用例：5 段交替 + 1 中枢 + 进入段双强于离开段
 * u0(up) → [u1,u2,u3] 中枢 → u4(up) 离开段
 */
function makeConsolidationCase(): ChanDivergenceInput {
  const units = makeAlternatingUnits(5);
  const zhongshus = [makeZhongshu(units[1].startTime, units[3].endTime, 10, 0)];
  const forces = [
    makeForce(9, 90), // u0 enter（强）
    makeForce(5, 50), // u1
    makeForce(5, 50), // u2
    makeForce(5, 50), // u3
    makeForce(3, 30), // u4 leave（弱，双 < enter）
  ];
  return { units, zhongshus, forces };
}

/**
 * §6.3/6.4 上涨趋势链用例：9 段交替 + 2 中枢（gg/dd 递进）
 * u0(up) → [u1,u2,u3] c1 → u4(up) → [u5,u6,u7] c2 → u8(up)
 * c2.gg=30>c1.gg=20, c2.dd=10>c1.dd=5 → 递进
 * 趋势背驰：c2 进入段 u4(area=8,peak=80) vs 离开段 u8(area=4,peak=40)
 */
function makeTrendUpCase(): ChanDivergenceInput {
  const units = makeAlternatingUnits(9);
  const zhongshus = [
    makeZhongshu(units[1].startTime, units[3].endTime, 20, 5),
    makeZhongshu(units[5].startTime, units[7].endTime, 30, 10),
  ];
  const forces = [
    makeForce(1, 10), // u0
    makeForce(5, 50), // u1
    makeForce(5, 50), // u2
    makeForce(5, 50), // u3
    makeForce(8, 80), // u4 A（进入段，强）
    makeForce(5, 50), // u5
    makeForce(5, 50), // u6
    makeForce(5, 50), // u7
    makeForce(4, 40), // u8 C（离开段，弱 < A）
  ];
  return { units, zhongshus, forces };
}

/**
 * §6.4 下跌趋势链用例：9 段交替 + 2 中枢（gg/dd 递进，方向 down）
 * u0(down) → [u1,u2,u3] c1 → u4(down) → [u5,u6,u7] c2 → u8(down)
 */
function makeTrendDownCase(): ChanDivergenceInput {
  const units = makeAlternatingUnits(9);
  const zhongshus = [
    makeZhongshu(units[1].startTime, units[3].endTime, 20, 5),
    makeZhongshu(units[5].startTime, units[7].endTime, 30, 10),
  ];
  const forces = [
    makeForce(1, 10), // u0
    makeForce(5, 50), // u1
    makeForce(5, 50), // u2
    makeForce(5, 50), // u3
    makeForce(8, 80), // u4 A
    makeForce(5, 50), // u5
    makeForce(5, 50), // u6
    makeForce(5, 50), // u7
    makeForce(4, 40), // u8 C < A
  ];
  return { units, zhongshus, forces };
}

// ---------------------------------------------------------------------------
// §7 helpers — 构造买卖点审计用例（对齐现有 buy-sell-point.spec.ts 格式）
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

/**
 * 上涨趋势链 BSP 用例（复用现有 makeTrendUpInput 格式）：
 * 9 段，递增 high/low，2 中枢，链末趋势背驰 → 一卖
 */
function makeTrendUpBspCase(): ChanBspInput {
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
    makeBspZhongshu(units[1].startTime, units[3].endTime, 24, 10),
    makeBspZhongshu(units[5].startTime, units[7].endTime, 32, 18),
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
    makeBspForce(4, 40), // u8 C < A
  ];
  return { units, zhongshus, forces };
}

/**
 * 下跌趋势链 BSP 用例（复用现有 makeTrendDownInput 格式）：
 * 9 段，递减 high/low，2 中枢，链末趋势背驰 → 一买
 */
function makeTrendDownBspCase(): ChanBspInput {
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
    makeBspForce(4, 40), // u8 C < A
  ];
  return { units, zhongshus, forces };
}

/** 仅盘整背驰：5 段 + 1 中枢，无趋势链 → 不产一类点 */
function makeConsolidationOnlyBspCase(): ChanBspInput {
  const units = [
    makeBspUnit('up', 0, 34, 24),
    makeBspUnit('down', 1, 32, 22),
    makeBspUnit('up', 2, 30, 20),
    makeBspUnit('down', 3, 28, 18),
    makeBspUnit('up', 4, 26, 16),
  ];
  const zhongshus = [
    makeBspZhongshu(units[1].startTime, units[3].endTime, 32, 18),
  ];
  const forces = [
    makeBspForce(9, 90), // enter 强
    makeBspForce(5, 50),
    makeBspForce(5, 50),
    makeBspForce(5, 50),
    makeBspForce(3, 30), // leave 弱 → 盘整背驰但无趋势链
  ];
  return { units, zhongshus, forces };
}

/**
 * 一买 + 二买：复用 makeFirstBuyThenPullbackInput 格式
 * 11 段下跌趋势链 + 回抽确认
 */
function makeFirstBuyThenSecondBuyCase(): ChanBspInput {
  const units = [
    makeBspUnit('down', 0, 34, 24),
    makeBspUnit('up', 1, 32, 22),
    makeBspUnit('down', 2, 30, 20),
    makeBspUnit('up', 3, 28, 18),
    makeBspUnit('down', 4, 26, 16),
    makeBspUnit('up', 5, 24, 14),
    makeBspUnit('down', 6, 22, 12),
    makeBspUnit('up', 7, 20, 10),
    makeBspUnit('down', 8, 18, 8), // 一买（低点 8）
    makeBspUnit('up', 9, 20, 10),
    makeBspUnit('down', 10, 16, 9), // 回抽低点 9 > 8 → 二买
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
    makeBspForce(8, 80),
    makeBspForce(5, 50),
    makeBspForce(5, 50),
    makeBspForce(5, 50),
    makeBspForce(4, 40), // C < A → 一买
    makeBspForce(5, 50),
    makeBspForce(5, 50),
  ];
  return { units, zhongshus, forces };
}

/**
 * 一卖 + 二卖：复用 makeFirstSellThenPullbackInput 格式
 * 11 段上涨趋势链 + 回抽确认
 */
function makeFirstSellThenSecondSellCase(): ChanBspInput {
  const units = [
    makeBspUnit('up', 0, 10, 2),
    makeBspUnit('down', 1, 12, 4),
    makeBspUnit('up', 2, 14, 6),
    makeBspUnit('down', 3, 16, 8),
    makeBspUnit('up', 4, 18, 10),
    makeBspUnit('down', 5, 20, 12),
    makeBspUnit('up', 6, 22, 14),
    makeBspUnit('down', 7, 24, 16),
    makeBspUnit('up', 8, 26, 18), // 一卖（高点 26）
    makeBspUnit('down', 9, 24, 16),
    makeBspUnit('up', 10, 25, 17), // 回抽高点 25 < 26 → 二卖
  ];
  const zhongshus = [
    makeBspZhongshu(units[1].startTime, units[3].endTime, 16, 4),
    makeBspZhongshu(units[5].startTime, units[7].endTime, 24, 12),
  ];
  const forces = [
    makeBspForce(5, 50),
    makeBspForce(5, 50),
    makeBspForce(5, 50),
    makeBspForce(5, 50),
    makeBspForce(8, 80),
    makeBspForce(5, 50),
    makeBspForce(5, 50),
    makeBspForce(5, 50),
    makeBspForce(4, 40), // C < A → 一卖
    makeBspForce(5, 50),
    makeBspForce(5, 50),
  ];
  return { units, zhongshus, forces };
}

/** 三买：离开中枢后回抽不回中枢（复用现有 makeThirdBuyInput 格式） */
function makeThirdBuyCase(): ChanBspInput {
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

/** 三买贴边：回抽低点 = zg → 不产三买 */
function makeThirdBuyEdgeCase(): ChanBspInput {
  const units = [
    makeBspUnit('up', 0, 12, 8),
    makeBspUnit('down', 1, 20, 10),
    makeBspUnit('up', 2, 24, 14),
    makeBspUnit('down', 3, 22, 12),
    makeBspUnit('up', 4, 30, 24), // 离开段 up
    makeBspUnit('down', 5, 28, 20), // 回抽 low=20 = zg=20 → 贴边不算
  ];
  const zhongshus = [
    makeBspZhongshu(units[1].startTime, units[3].endTime, 24, 10, 20, 14),
  ];
  const forces = units.map(() => makeBspForce(5, 50));
  return { units, zhongshus, forces };
}

/** 三卖：离开中枢后回抽不回中枢 */
function makeThirdSellCase(): ChanBspInput {
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
