import { HttpException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ChannelService } from './channel.service';
import { BiType, BiStatus } from '../enums/bi.enum';
import { TrendDirection } from '../enums/trend-direction.enum';
import { FenxingType } from '../enums/fenxing.enum';
import { BiVo } from '../vo/bi.vo';

function createTestBi(params: {
  highest: number;
  lowest: number;
  trend: TrendDirection;
  hasStartFenxing?: boolean;
  hasEndFenxing?: boolean;
}): BiVo {
  const bi = new BiVo();
  bi.highest = params.highest;
  bi.lowest = params.lowest;
  bi.trend = params.trend;
  bi.startTime = new Date('2024-01-01');
  bi.endTime = new Date('2024-01-02');
  bi.type = BiType.Complete;
  bi.status = BiStatus.Valid;
  bi.independentCount = 1;
  bi.originIds = [1];
  bi.originData = [];

  // 创建分型对象
  if (params.hasStartFenxing !== false) {
    bi.startFenxing = {
      type: FenxingType.Bottom,
      highest: params.highest,
      lowest: params.lowest,
      leftIds: [1],
      middleIds: [2],
      rightIds: [3],
      middleIndex: 1,
      middleOriginId: 2,
    };
  } else {
    bi.startFenxing = null;
  }

  if (params.hasEndFenxing !== false) {
    bi.endFenxing = {
      type: FenxingType.Top,
      highest: params.highest,
      lowest: params.lowest,
      leftIds: [3],
      middleIds: [4],
      rightIds: [5],
      middleIndex: 1,
      middleOriginId: 4,
    };
  } else {
    bi.endFenxing = null;
  }

  return bi;
}

describe('ChannelService', () => {
  let service: ChannelService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ChannelService],
    }).compile();

    service = module.get<ChannelService>(ChannelService);
  });

  describe('基础功能', () => {
    it('service should be defined', () => {
      expect(service).toBeDefined();
    });
  });

  describe('笔数据完整性验证', () => {
    it('应该通过验证 - 完整的笔数据', () => {
      const bis = [
        createTestBi({ highest: 110, lowest: 90, trend: TrendDirection.Up }),
        createTestBi({ highest: 105, lowest: 85, trend: TrendDirection.Down }),
        createTestBi({ highest: 115, lowest: 95, trend: TrendDirection.Up }),
      ];

      expect(() => {
        service.createChannel({ bi: bis });
      }).not.toThrow();
    });

    it('应该通过验证 - 最后一笔未完成', () => {
      const bis = [
        createTestBi({ highest: 110, lowest: 90, trend: TrendDirection.Up }),
        createTestBi({ highest: 105, lowest: 85, trend: TrendDirection.Down }),
        createTestBi({
          highest: 115,
          lowest: 95,
          trend: TrendDirection.Up,
          hasEndFenxing: false,
        }),
      ];

      expect(() => {
        service.createChannel({ bi: bis });
      }).not.toThrow();
    });

    it('应该抛出异常 - 中间笔缺少 startFenxing', () => {
      const bis = [
        createTestBi({ highest: 110, lowest: 90, trend: TrendDirection.Up }),
        createTestBi({
          highest: 105,
          lowest: 85,
          trend: TrendDirection.Down,
          hasStartFenxing: false,
        }),
        createTestBi({ highest: 115, lowest: 95, trend: TrendDirection.Up }),
      ];

      expect(() => {
        service.createChannel({ bi: bis });
      }).toThrow(HttpException);
    });

    it('应该抛出异常 - 第一笔缺少 endFenxing（不是最后一笔）', () => {
      const bis = [
        createTestBi({
          highest: 110,
          lowest: 90,
          trend: TrendDirection.Up,
          hasEndFenxing: false,
        }),
        createTestBi({ highest: 105, lowest: 85, trend: TrendDirection.Down }),
        createTestBi({ highest: 115, lowest: 95, trend: TrendDirection.Up }),
      ];

      expect(() => {
        service.createChannel({ bi: bis });
      }).toThrow(HttpException);
    });
  });

  describe('重叠检查', () => {
    it('应该检测到完全重叠', () => {
      const bi = createTestBi({
        highest: 110,
        lowest: 85,
        trend: TrendDirection.Up,
      });
      const zg = 100;
      const zd = 90;

      const result = (service as any).hasOverlap(bi, zg, zd);

      expect(result).toBe(true);
    });

    it('应该检测到部分重叠 - 从下方进入', () => {
      const bi = createTestBi({
        highest: 95,
        lowest: 85,
        trend: TrendDirection.Up,
      });
      const zg = 100;
      const zd = 90;

      const result = (service as any).hasOverlap(bi, zg, zd);

      expect(result).toBe(true);
    });

    it('应该检测到无重叠 - 完全在下方', () => {
      const bi = createTestBi({
        highest: 85,
        lowest: 80,
        trend: TrendDirection.Up,
      });
      const zg = 100;
      const zd = 90;

      const result = (service as any).hasOverlap(bi, zg, zd);

      expect(result).toBe(false);
    });

    it('应该检测到边界重叠 - 最高点等于 zg', () => {
      const bi = createTestBi({
        highest: 100,
        lowest: 85,
        trend: TrendDirection.Up,
      });
      const zg = 100;
      const zd = 90;

      const result = (service as any).hasOverlap(bi, zg, zd);

      expect(result).toBe(true);
    });
  });

  describe('趋势交替检查', () => {
    it('应该检测到有效的趋势交替 - 上上下上下', () => {
      const bis = [
        createTestBi({ highest: 110, lowest: 90, trend: TrendDirection.Up }),
        createTestBi({ highest: 105, lowest: 85, trend: TrendDirection.Down }),
        createTestBi({ highest: 115, lowest: 95, trend: TrendDirection.Up }),
        createTestBi({ highest: 108, lowest: 88, trend: TrendDirection.Down }),
        createTestBi({ highest: 120, lowest: 100, trend: TrendDirection.Up }),
      ];

      const result = (service as any).isTrendAlternating(bis);

      expect(result).toBe(true);
    });

    it('应该检测到有效的趋势交替 - 下上上下下', () => {
      const bis = [
        createTestBi({ highest: 100, lowest: 80, trend: TrendDirection.Down }),
        createTestBi({ highest: 110, lowest: 90, trend: TrendDirection.Up }),
        createTestBi({ highest: 105, lowest: 85, trend: TrendDirection.Down }),
        createTestBi({ highest: 115, lowest: 95, trend: TrendDirection.Up }),
        createTestBi({ highest: 108, lowest: 88, trend: TrendDirection.Down }),
      ];

      const result = (service as any).isTrendAlternating(bis);

      expect(result).toBe(true);
    });

    it('应该检测到趋势不交替 - 相邻笔同向', () => {
      const bis = [
        createTestBi({ highest: 110, lowest: 90, trend: TrendDirection.Up }),
        createTestBi({ highest: 105, lowest: 85, trend: TrendDirection.Up }),
        createTestBi({ highest: 115, lowest: 95, trend: TrendDirection.Down }),
      ];

      const result = (service as any).isTrendAlternating(bis);

      expect(result).toBe(false);
    });

    it('应该处理单笔情况', () => {
      const bis = [
        createTestBi({ highest: 110, lowest: 90, trend: TrendDirection.Up }),
      ];

      const result = (service as any).isTrendAlternating(bis);

      expect(result).toBe(true);
    });
  });

  describe('zg-zd 计算', () => {
    it('应该正确计算 zg-zd - 有效重叠', () => {
      const bis = [
        createTestBi({ highest: 110, lowest: 90, trend: TrendDirection.Up }),
        createTestBi({ highest: 105, lowest: 85, trend: TrendDirection.Down }),
        createTestBi({ highest: 115, lowest: 95, trend: TrendDirection.Up }),
      ];

      const result = (service as any).calculateZgZd(bis);

      expect(result).not.toBeNull();
      expect(result![0]).toBe(105); // zg = min(110, 105, 115)
      expect(result![1]).toBe(95); // zd = max(90, 85, 95)
    });

    it('应该返回 null - 无重叠（zg <= zd）', () => {
      const bis = [
        createTestBi({ highest: 100, lowest: 90, trend: TrendDirection.Up }),
        createTestBi({ highest: 95, lowest: 85, trend: TrendDirection.Down }),
        createTestBi({ highest: 90, lowest: 80, trend: TrendDirection.Up }),
      ];

      const result = (service as any).calculateZgZd(bis);

      expect(result).toBeNull();
    });

    it('应该返回 null - 少于 3 笔', () => {
      const bis = [
        createTestBi({ highest: 110, lowest: 90, trend: TrendDirection.Up }),
        createTestBi({ highest: 105, lowest: 85, trend: TrendDirection.Down }),
      ];

      const result = (service as any).calculateZgZd(bis);

      expect(result).toBeNull();
    });

    it('应该处理边界情况 - zg 略大于 zd', () => {
      const bis = [
        createTestBi({ highest: 100, lowest: 90, trend: TrendDirection.Up }),
        createTestBi({ highest: 99, lowest: 89, trend: TrendDirection.Down }),
        createTestBi({ highest: 101, lowest: 91, trend: TrendDirection.Up }),
      ];

      const result = (service as any).calculateZgZd(bis);

      expect(result).not.toBeNull();
      expect(result![0]).toBe(99); // zg = min(100, 99, 101)
      expect(result![1]).toBe(91); // zd = max(90, 89, 91)
    });
  });

  describe('5-bi 中枢检测', () => {
    it('应该检测到有效的 5-bi 向上中枢', () => {
      const bis = [
        // Bi1: Up, 90-110
        createTestBi({ highest: 110, lowest: 90, trend: TrendDirection.Up }),
        // Bi2: Down, 85-105
        createTestBi({ highest: 105, lowest: 85, trend: TrendDirection.Down }),
        // Bi3: Up, 95-115
        createTestBi({ highest: 115, lowest: 95, trend: TrendDirection.Up }),
        // Bi4: Down, 88-108 (与 zg-zd 重叠)
        createTestBi({ highest: 108, lowest: 88, trend: TrendDirection.Down }),
        // Bi5: Up, 92-112 (与 zg-zd 重叠)
        createTestBi({ highest: 112, lowest: 92, trend: TrendDirection.Up }),
      ];

      const result = (service as any).detectChannel(bis);

      expect(result).not.toBeNull();
      expect(result!.zg).toBe(105); // min(110, 105, 115)
      expect(result!.zd).toBe(95); // max(90, 85, 95)
      expect(result!.gg).toBe(115); // max highest
      expect(result!.dd).toBe(85); // min lowest
      expect(result!.bis.length).toBe(5);
      expect(result!.trend).toBe(TrendDirection.Up);
    });

    it('应该检测到有效的 5-bi 向下中枢', () => {
      const bis = [
        // Bi1: Down, 80-100
        createTestBi({ highest: 100, lowest: 80, trend: TrendDirection.Down }),
        // Bi2: Up, 90-110
        createTestBi({ highest: 110, lowest: 90, trend: TrendDirection.Up }),
        // Bi3: Down, 85-105
        createTestBi({ highest: 105, lowest: 85, trend: TrendDirection.Down }),
        // Bi4: Up, 88-108 (与 zg-zd 重叠)
        createTestBi({ highest: 108, lowest: 88, trend: TrendDirection.Up }),
        // Bi5: Down, 82-102 (与 zg-zd 重叠)
        createTestBi({ highest: 102, lowest: 82, trend: TrendDirection.Down }),
      ];

      const result = (service as any).detectChannel(bis);

      expect(result).not.toBeNull();
      expect(result!.zg).toBe(100); // min(100, 110, 105)
      expect(result!.zd).toBe(90); // max(80, 90, 85)
      expect(result!.gg).toBe(110); // max highest
      expect(result!.dd).toBe(80); // min lowest
      expect(result!.bis.length).toBe(5);
      expect(result!.trend).toBe(TrendDirection.Down);
    });

    it('应该返回 null - 少于 5 笔', () => {
      const bis = [
        createTestBi({ highest: 110, lowest: 90, trend: TrendDirection.Up }),
        createTestBi({ highest: 105, lowest: 85, trend: TrendDirection.Down }),
        createTestBi({ highest: 115, lowest: 95, trend: TrendDirection.Up }),
        createTestBi({ highest: 108, lowest: 88, trend: TrendDirection.Down }),
      ];

      const result = (service as any).detectChannel(bis);

      expect(result).toBeNull();
    });

    it('应该返回 null - 趋势不交替', () => {
      const bis = [
        createTestBi({ highest: 110, lowest: 90, trend: TrendDirection.Up }),
        createTestBi({ highest: 105, lowest: 85, trend: TrendDirection.Up }),
        createTestBi({ highest: 115, lowest: 95, trend: TrendDirection.Down }),
        createTestBi({ highest: 108, lowest: 88, trend: TrendDirection.Up }),
        createTestBi({ highest: 112, lowest: 92, trend: TrendDirection.Down }),
      ];

      const result = (service as any).detectChannel(bis);

      expect(result).toBeNull();
    });

    it('应该返回 null - 前 3 笔无重叠', () => {
      const bis = [
        createTestBi({ highest: 100, lowest: 90, trend: TrendDirection.Up }),
        createTestBi({ highest: 95, lowest: 85, trend: TrendDirection.Down }),
        createTestBi({ highest: 90, lowest: 80, trend: TrendDirection.Up }),
        createTestBi({ highest: 108, lowest: 88, trend: TrendDirection.Down }),
        createTestBi({ highest: 112, lowest: 92, trend: TrendDirection.Up }),
      ];

      const result = (service as any).detectChannel(bis);

      expect(result).toBeNull();
    });

    it('应该返回 null - 第 4 笔不与 zg-zd 重叠', () => {
      const bis = [
        createTestBi({ highest: 110, lowest: 90, trend: TrendDirection.Up }),
        createTestBi({ highest: 105, lowest: 85, trend: TrendDirection.Down }),
        createTestBi({ highest: 115, lowest: 95, trend: TrendDirection.Up }),
        // Bi4 完全在 zg-zd 上方
        createTestBi({ highest: 120, lowest: 116, trend: TrendDirection.Down }),
        createTestBi({ highest: 112, lowest: 92, trend: TrendDirection.Up }),
      ];

      const result = (service as any).detectChannel(bis);

      expect(result).toBeNull();
    });

    it('应该返回 null - 第 5 笔不与 zg-zd 重叠', () => {
      const bis = [
        createTestBi({ highest: 110, lowest: 90, trend: TrendDirection.Up }),
        createTestBi({ highest: 105, lowest: 85, trend: TrendDirection.Down }),
        createTestBi({ highest: 115, lowest: 95, trend: TrendDirection.Up }),
        createTestBi({ highest: 108, lowest: 88, trend: TrendDirection.Down }),
        // Bi5 完全在 zg-zd 下方
        createTestBi({ highest: 94, lowest: 80, trend: TrendDirection.Up }),
      ];

      const result = (service as any).detectChannel(bis);

      expect(result).toBeNull();
    });
  });

  describe('初始极值计算', () => {
    it('应该正确计算向上中枢的初始极值', () => {
      const bis = [
        createTestBi({ highest: 110, lowest: 90, trend: TrendDirection.Up }),
        createTestBi({ highest: 105, lowest: 85, trend: TrendDirection.Down }),
        createTestBi({ highest: 115, lowest: 95, trend: TrendDirection.Up }),
        createTestBi({ highest: 108, lowest: 88, trend: TrendDirection.Down }),
        createTestBi({ highest: 112, lowest: 92, trend: TrendDirection.Up }),
      ];

      const channel = (service as any).detectChannel(bis);
      const result = (service as any).calculateInitialExtreme(channel);

      // 极值 = max(110, 115, 112) = 115
      expect(result).toBe(115);
    });

    it('应该正确计算向下中枢的初始极值', () => {
      const bis = [
        createTestBi({ highest: 100, lowest: 80, trend: TrendDirection.Down }),
        createTestBi({ highest: 110, lowest: 90, trend: TrendDirection.Up }),
        createTestBi({ highest: 105, lowest: 85, trend: TrendDirection.Down }),
        createTestBi({ highest: 108, lowest: 88, trend: TrendDirection.Up }),
        createTestBi({ highest: 102, lowest: 82, trend: TrendDirection.Down }),
      ];

      const channel = (service as any).detectChannel(bis);
      const result = (service as any).calculateInitialExtreme(channel);

      // 极值 = min(80, 85, 82) = 80
      expect(result).toBe(80);
    });
  });

  describe('极值比较', () => {
    it('应该检测到向上笔超过极值', () => {
      const bi = createTestBi({
        highest: 120,
        lowest: 100,
        trend: TrendDirection.Up,
      });
      const extreme = 115;
      const trend = TrendDirection.Up;

      const result = (service as any).exceedsExtreme(bi, extreme, trend);

      expect(result).toBe(true); // 120 > 115
    });

    it('应该检测到向上笔未超过极值', () => {
      const bi = createTestBi({
        highest: 110,
        lowest: 90,
        trend: TrendDirection.Up,
      });
      const extreme = 115;
      const trend = TrendDirection.Up;

      const result = (service as any).exceedsExtreme(bi, extreme, trend);

      expect(result).toBe(false); // 110 < 115
    });

    it('应该检测到向下笔超过极值', () => {
      const bi = createTestBi({
        highest: 100,
        lowest: 75,
        trend: TrendDirection.Down,
      });
      const extreme = 80;
      const trend = TrendDirection.Down;

      const result = (service as any).exceedsExtreme(bi, extreme, trend);

      expect(result).toBe(true); // 75 < 80
    });

    it('应该检测到向下笔未超过极值', () => {
      const bi = createTestBi({
        highest: 100,
        lowest: 85,
        trend: TrendDirection.Down,
      });
      const extreme = 80;
      const trend = TrendDirection.Down;

      const result = (service as any).exceedsExtreme(bi, extreme, trend);

      expect(result).toBe(false); // 85 > 80
    });

    it('应该处理边界情况 - 最高点等于极值', () => {
      const bi = createTestBi({
        highest: 115,
        lowest: 95,
        trend: TrendDirection.Up,
      });
      const extreme = 115;
      const trend = TrendDirection.Up;

      const result = (service as any).exceedsExtreme(bi, extreme, trend);

      expect(result).toBe(false); // 115 === 115, 不超过
    });

    it('应该处理边界情况 - 最低点等于极值', () => {
      const bi = createTestBi({
        highest: 100,
        lowest: 80,
        trend: TrendDirection.Down,
      });
      const extreme = 80;
      const trend = TrendDirection.Down;

      const result = (service as any).exceedsExtreme(bi, extreme, trend);

      expect(result).toBe(false); // 80 === 80, 不超过
    });
  });

  describe('极值更新', () => {
    it('应该正确更新向上中枢的极值', () => {
      const bi = createTestBi({
        highest: 120,
        lowest: 100,
        trend: TrendDirection.Up,
      });
      const extreme = 115;
      const trend = TrendDirection.Up;

      const result = (service as any).updateExtreme(bi, extreme, trend);

      expect(result).toBe(120); // max(115, 120)
    });

    it('应该正确更新向下中枢的极值', () => {
      const bi = createTestBi({
        highest: 100,
        lowest: 75,
        trend: TrendDirection.Down,
      });
      const extreme = 80;
      const trend = TrendDirection.Down;

      const result = (service as any).updateExtreme(bi, extreme, trend);

      expect(result).toBe(75); // min(80, 75)
    });

    it('应该保持极值不变 - 向上中枢未超过', () => {
      const bi = createTestBi({
        highest: 110,
        lowest: 90,
        trend: TrendDirection.Up,
      });
      const extreme = 115;
      const trend = TrendDirection.Up;

      const result = (service as any).updateExtreme(bi, extreme, trend);

      expect(result).toBe(115); // max(115, 110) = 115
    });

    it('应该保持极值不变 - 向下中枢未超过', () => {
      const bi = createTestBi({
        highest: 100,
        lowest: 85,
        trend: TrendDirection.Down,
      });
      const extreme = 80;
      const trend = TrendDirection.Down;

      const result = (service as any).updateExtreme(bi, extreme, trend);

      expect(result).toBe(80); // min(80, 85) = 80
    });
  });
});
