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

      const result = (service as any).detectChannel(bis, bis, 0);

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

      const result = (service as any).detectChannel(bis, bis, 0);

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

      const result = (service as any).detectChannel(bis, bis, 0);

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

      const result = (service as any).detectChannel(bis, bis, 0);

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

      const result = (service as any).detectChannel(bis, bis, 0);

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

      const result = (service as any).detectChannel(bis, bis, 0);

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

      const result = (service as any).detectChannel(bis, bis, 0);

      expect(result).toBeNull();
    });

    it('应该正确使用原始笔数组的 ID', () => {
      const originalBis = [
        createTestBi({ highest: 110, lowest: 90, trend: TrendDirection.Up }),
        createTestBi({ highest: 105, lowest: 85, trend: TrendDirection.Down }),
        createTestBi({ highest: 115, lowest: 95, trend: TrendDirection.Up }),
        createTestBi({ highest: 108, lowest: 88, trend: TrendDirection.Down }),
        createTestBi({ highest: 112, lowest: 92, trend: TrendDirection.Up }),
      ];

      // 修改原始 ID
      originalBis[0].originIds = [100];
      originalBis[4].originIds = [500];

      const slice = originalBis.slice(0); // 创建副本
      const result = (service as any).detectChannel(slice, originalBis, 0);

      expect(result).not.toBeNull();
      expect(result!.startId).toBe(100);
      expect(result!.endId).toBe(500);
    });
  });

  describe('display fields calculation', () => {
    it('should calculate displayStartId as middle ID of first bi originIds', () => {
      const originalBis = [
        createTestBi({ highest: 110, lowest: 90, trend: TrendDirection.Up }),
        createTestBi({ highest: 105, lowest: 85, trend: TrendDirection.Down }),
        createTestBi({ highest: 115, lowest: 95, trend: TrendDirection.Up }),
        createTestBi({ highest: 108, lowest: 88, trend: TrendDirection.Down }),
        createTestBi({ highest: 112, lowest: 92, trend: TrendDirection.Up }),
      ];

      // Set originIds with 3 elements [1, 2, 3]
      originalBis[0].originIds = [1, 2, 3];
      originalBis[1].originIds = [10, 11, 12];
      originalBis[2].originIds = [13, 14, 15];
      originalBis[3].originIds = [16, 17, 18];
      originalBis[4].originIds = [20, 21, 22];

      const slice = originalBis.slice(0);
      const result = (service as any).detectChannel(slice, originalBis, 0);

      expect(result).not.toBeNull();
      // Middle index of [1, 2, 3] is 1 (Math.floor(3 / 2) = 1)
      expect(result!.displayStartId).toBe(2);
    });

    it('should calculate displayEndId as middle ID of last bi originIds', () => {
      const originalBis = [
        createTestBi({ highest: 110, lowest: 90, trend: TrendDirection.Up }),
        createTestBi({ highest: 105, lowest: 85, trend: TrendDirection.Down }),
        createTestBi({ highest: 115, lowest: 95, trend: TrendDirection.Up }),
        createTestBi({ highest: 108, lowest: 88, trend: TrendDirection.Down }),
        createTestBi({ highest: 112, lowest: 92, trend: TrendDirection.Up }),
      ];

      // Set originIds with 3 elements
      originalBis[0].originIds = [1, 2, 3];
      originalBis[1].originIds = [10, 11, 12];
      originalBis[2].originIds = [13, 14, 15];
      originalBis[3].originIds = [16, 17, 18];
      originalBis[4].originIds = [20, 21, 22];

      const slice = originalBis.slice(0);
      const result = (service as any).detectChannel(slice, originalBis, 0);

      expect(result).not.toBeNull();
      // Middle index of [20, 21, 22] is 1 (Math.floor(3 / 2) = 1)
      expect(result!.displayEndId).toBe(21);
    });

    it('should handle even-length originIds arrays', () => {
      const originalBis = [
        createTestBi({ highest: 110, lowest: 90, trend: TrendDirection.Up }),
        createTestBi({ highest: 105, lowest: 85, trend: TrendDirection.Down }),
        createTestBi({ highest: 115, lowest: 95, trend: TrendDirection.Up }),
        createTestBi({ highest: 108, lowest: 88, trend: TrendDirection.Down }),
        createTestBi({ highest: 112, lowest: 92, trend: TrendDirection.Up }),
      ];

      // Set originIds with 4 elements (even length)
      originalBis[0].originIds = [1, 2, 3, 4];
      originalBis[1].originIds = [10, 11, 12, 13];
      originalBis[2].originIds = [14, 15, 16, 17];
      originalBis[3].originIds = [18, 19, 20, 21];
      originalBis[4].originIds = [22, 23, 24, 25];

      const slice = originalBis.slice(0);
      const result = (service as any).detectChannel(slice, originalBis, 0);

      expect(result).not.toBeNull();
      // Middle index of [1, 2, 3, 4] is 2 (Math.floor(4 / 2) = 2)
      expect(result!.displayStartId).toBe(3);
      // Middle index of [22, 23, 24, 25] is 2
      expect(result!.displayEndId).toBe(24);
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

      const channel = (service as any).detectChannel(bis, bis, 0);
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

      const channel = (service as any).detectChannel(bis, bis, 0);
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

  describe('中枢延伸', () => {
    it('应该不延伸 - 没有剩余笔', () => {
      const bis = [
        createTestBi({ highest: 110, lowest: 90, trend: TrendDirection.Up }),
        createTestBi({ highest: 105, lowest: 85, trend: TrendDirection.Down }),
        createTestBi({ highest: 115, lowest: 95, trend: TrendDirection.Up }),
        createTestBi({ highest: 108, lowest: 88, trend: TrendDirection.Down }),
        createTestBi({ highest: 112, lowest: 92, trend: TrendDirection.Up }),
      ];

      const channel = (service as any).detectChannel(bis, bis, 0);
      const result = (service as any).extendChannel(channel, []);

      expect(result.channel.bis.length).toBe(5);
      expect(result.usedCount).toBe(0);
    });

    it('应该延伸 - 偶数笔需要等待奇数笔确认', () => {
      const bis = [
        createTestBi({ highest: 110, lowest: 90, trend: TrendDirection.Up }),
        createTestBi({ highest: 105, lowest: 85, trend: TrendDirection.Down }),
        createTestBi({ highest: 115, lowest: 95, trend: TrendDirection.Up }),
        createTestBi({ highest: 108, lowest: 88, trend: TrendDirection.Down }),
        createTestBi({ highest: 112, lowest: 92, trend: TrendDirection.Up }),
        // Bi6: 偶数笔，等待 Bi7 确认
        createTestBi({ highest: 107, lowest: 87, trend: TrendDirection.Down }),
        // Bi7: 奇数笔，超过极值 (115)
        createTestBi({ highest: 120, lowest: 100, trend: TrendDirection.Up }),
      ];

      const channel = (service as any).detectChannel(bis.slice(0, 5), bis, 0);
      const remaining = bis.slice(5);
      const result = (service as any).extendChannel(channel, remaining);

      // Bi6 和 Bi7 都应该被确认
      expect(result.channel.bis.length).toBe(7);
      expect(result.usedCount).toBe(2);
      expect(result.channel.gg).toBe(120);
      expect(result.channel.dd).toBe(85);
    });

    it('应该延伸 - 奇数笔超过极值', () => {
      const bis = [
        createTestBi({ highest: 110, lowest: 90, trend: TrendDirection.Up }),
        createTestBi({ highest: 105, lowest: 85, trend: TrendDirection.Down }),
        createTestBi({ highest: 115, lowest: 95, trend: TrendDirection.Up }),
        createTestBi({ highest: 108, lowest: 88, trend: TrendDirection.Down }),
        createTestBi({ highest: 112, lowest: 92, trend: TrendDirection.Up }),
        // Bi6: 偶数笔
        createTestBi({ highest: 107, lowest: 87, trend: TrendDirection.Down }),
        // Bi7: 奇数笔，超过极值 (115)
        createTestBi({ highest: 120, lowest: 100, trend: TrendDirection.Up }),
      ];

      const channel = (service as any).detectChannel(bis.slice(0, 5), bis, 0);
      const remaining = bis.slice(5);
      const result = (service as any).extendChannel(channel, remaining);

      expect(result.channel.bis.length).toBe(7);
      expect(result.usedCount).toBe(2);
      expect(result.channel.gg).toBe(120); // 更新后的最高点
      expect(result.channel.dd).toBe(85);
    });

    it('应该不延伸 - 奇数笔未超过极值，偶数笔回退', () => {
      const bis = [
        createTestBi({ highest: 110, lowest: 90, trend: TrendDirection.Up }),
        createTestBi({ highest: 105, lowest: 85, trend: TrendDirection.Down }),
        createTestBi({ highest: 115, lowest: 95, trend: TrendDirection.Up }),
        createTestBi({ highest: 108, lowest: 88, trend: TrendDirection.Down }),
        createTestBi({ highest: 112, lowest: 92, trend: TrendDirection.Up }),
        // Bi6: 偶数笔
        createTestBi({ highest: 107, lowest: 87, trend: TrendDirection.Down }),
        // Bi7: 奇数笔，未超过极值 (115)
        createTestBi({ highest: 114, lowest: 94, trend: TrendDirection.Up }),
      ];

      const channel = (service as any).detectChannel(bis.slice(0, 5), bis, 0);
      const remaining = bis.slice(5);
      const result = (service as any).extendChannel(channel, remaining);

      // ✅ 新预期：第6笔应该被回退
      expect(result.channel.bis.length).toBe(5);
      expect(result.usedCount).toBe(0);
    });

    it('应该不延伸 - 笔不与中枢重叠', () => {
      const bis = [
        createTestBi({ highest: 110, lowest: 90, trend: TrendDirection.Up }),
        createTestBi({ highest: 105, lowest: 85, trend: TrendDirection.Down }),
        createTestBi({ highest: 115, lowest: 95, trend: TrendDirection.Up }),
        createTestBi({ highest: 108, lowest: 88, trend: TrendDirection.Down }),
        createTestBi({ highest: 112, lowest: 92, trend: TrendDirection.Up }),
        // Bi6: 完全在 zg-zd 下方
        createTestBi({ highest: 94, lowest: 80, trend: TrendDirection.Down }),
      ];

      const channel = (service as any).detectChannel(bis.slice(0, 5), bis, 0);
      const remaining = bis.slice(5);
      const result = (service as any).extendChannel(channel, remaining);

      expect(result.channel.bis.length).toBe(5);
      expect(result.usedCount).toBe(0);
    });

    it('应该正确处理向下中枢的延伸', () => {
      const bis = [
        createTestBi({ highest: 100, lowest: 80, trend: TrendDirection.Down }),
        createTestBi({ highest: 110, lowest: 90, trend: TrendDirection.Up }),
        createTestBi({ highest: 105, lowest: 85, trend: TrendDirection.Down }),
        createTestBi({ highest: 108, lowest: 88, trend: TrendDirection.Up }),
        createTestBi({ highest: 102, lowest: 82, trend: TrendDirection.Down }),
        // Bi6: 偶数笔
        createTestBi({ highest: 107, lowest: 87, trend: TrendDirection.Up }),
        // Bi7: 奇数笔，超过极值 (80)
        createTestBi({ highest: 100, lowest: 75, trend: TrendDirection.Down }),
      ];

      const channel = (service as any).detectChannel(bis.slice(0, 5), bis, 0);
      const remaining = bis.slice(5);
      const result = (service as any).extendChannel(channel, remaining);

      expect(result.channel.bis.length).toBe(7);
      expect(result.usedCount).toBe(2);
      expect(result.channel.dd).toBe(75); // 更新后的最低点
    });

    it('应该回退多个偶数笔 - 第9笔未超过极值', () => {
      const bis = [
        // 前5笔形成中枢
        createTestBi({ highest: 110, lowest: 90, trend: TrendDirection.Up }),
        createTestBi({ highest: 105, lowest: 85, trend: TrendDirection.Down }),
        createTestBi({ highest: 115, lowest: 95, trend: TrendDirection.Up }),
        createTestBi({ highest: 108, lowest: 88, trend: TrendDirection.Down }),
        createTestBi({ highest: 112, lowest: 92, trend: TrendDirection.Up }),
        // Bi6: 偶数笔，等待 Bi7 确认
        createTestBi({ highest: 107, lowest: 87, trend: TrendDirection.Down }),
        // Bi7: 奇数笔，超过极值 (115) → Bi6、Bi7 确认
        createTestBi({ highest: 120, lowest: 100, trend: TrendDirection.Up }),
        // Bi8: 偶数笔，等待 Bi9 确认
        createTestBi({ highest: 110, lowest: 90, trend: TrendDirection.Down }),
        // Bi9: 奇数笔，未超过极值 (120) → Bi8 回退
        createTestBi({ highest: 118, lowest: 98, trend: TrendDirection.Up }),
      ];

      const channel = (service as any).detectChannel(bis.slice(0, 5), bis, 0);
      const remaining = bis.slice(5);
      const result = (service as any).extendChannel(channel, remaining);

      // 只有 Bi6、Bi7 被确认，Bi8 被回退
      expect(result.channel.bis.length).toBe(7);
      expect(result.usedCount).toBe(2);
    });

    it('应该延伸多个偶数笔 - 第9笔超过极值', () => {
      const bis = [
        // 前5笔形成中枢
        createTestBi({ highest: 110, lowest: 90, trend: TrendDirection.Up }),
        createTestBi({ highest: 105, lowest: 85, trend: TrendDirection.Down }),
        createTestBi({ highest: 115, lowest: 95, trend: TrendDirection.Up }),
        createTestBi({ highest: 108, lowest: 88, trend: TrendDirection.Down }),
        createTestBi({ highest: 112, lowest: 92, trend: TrendDirection.Up }),
        // Bi6: 偶数笔
        createTestBi({ highest: 107, lowest: 87, trend: TrendDirection.Down }),
        // Bi7: 奇数笔，超过极值 (115) → Bi6、Bi7 确认
        createTestBi({ highest: 120, lowest: 100, trend: TrendDirection.Up }),
        // Bi8: 偶数笔
        createTestBi({ highest: 110, lowest: 90, trend: TrendDirection.Down }),
        // Bi9: 奇数笔，超过极值 (120) → Bi8、Bi9 确认
        createTestBi({ highest: 125, lowest: 105, trend: TrendDirection.Up }),
      ];

      const channel = (service as any).detectChannel(bis.slice(0, 5), bis, 0);
      const remaining = bis.slice(5);
      const result = (service as any).extendChannel(channel, remaining);

      // Bi6、Bi7、Bi8、Bi9 都被确认
      expect(result.channel.bis.length).toBe(9);
      expect(result.usedCount).toBe(4);
      expect(result.channel.gg).toBe(125);
    });

    it('应该不延伸 - 偶数笔后没有奇数笔确认', () => {
      const bis = [
        // 前5笔形成中枢
        createTestBi({ highest: 110, lowest: 90, trend: TrendDirection.Up }),
        createTestBi({ highest: 105, lowest: 85, trend: TrendDirection.Down }),
        createTestBi({ highest: 115, lowest: 95, trend: TrendDirection.Up }),
        createTestBi({ highest: 108, lowest: 88, trend: TrendDirection.Down }),
        createTestBi({ highest: 112, lowest: 92, trend: TrendDirection.Up }),
        // Bi6: 偶数笔，等待 Bi7 确认
        createTestBi({ highest: 107, lowest: 87, trend: TrendDirection.Down }),
        // 没有 Bi7...
      ];

      const channel = (service as any).detectChannel(bis.slice(0, 5), bis, 0);
      const remaining = bis.slice(5);
      const result = (service as any).extendChannel(channel, remaining);

      // Bi6 没有被确认（等待奇数笔）
      expect(result.channel.bis.length).toBe(5);
      expect(result.usedCount).toBe(0);
    });
  });

  describe('时间重叠检查', () => {
    it('应该检测到完全重叠', () => {
      const bis1 = [
        createTestBi({ highest: 110, lowest: 90, trend: TrendDirection.Up }),
        createTestBi({ highest: 105, lowest: 85, trend: TrendDirection.Down }),
      ];
      bis1[0].startTime = new Date('2024-01-01');
      bis1[0].endTime = new Date('2024-01-02');
      bis1[1].startTime = new Date('2024-01-03');
      bis1[1].endTime = new Date('2024-01-04');

      const bis2 = [
        createTestBi({ highest: 115, lowest: 95, trend: TrendDirection.Up }),
        createTestBi({ highest: 108, lowest: 88, trend: TrendDirection.Down }),
      ];
      bis2[0].startTime = new Date('2024-01-02');
      bis2[0].endTime = new Date('2024-01-03');
      bis2[1].startTime = new Date('2024-01-04');
      bis2[1].endTime = new Date('2024-01-05');

      const channel1: any = {
        bis: bis1,
        zg: 105,
        zd: 90,
        gg: 110,
        dd: 85,
      };

      const channel2: any = {
        bis: bis2,
        zg: 108,
        zd: 88,
        gg: 115,
        dd: 88,
      };

      const result = (service as any).hasTimeOverlap(channel1, channel2);

      expect(result).toBe(true);
    });

    it('应该检测到部分重叠', () => {
      const bis1 = [
        createTestBi({ highest: 110, lowest: 90, trend: TrendDirection.Up }),
        createTestBi({ highest: 105, lowest: 85, trend: TrendDirection.Down }),
      ];
      bis1[0].startTime = new Date('2024-01-01');
      bis1[0].endTime = new Date('2024-01-02');
      bis1[1].startTime = new Date('2024-01-03');
      bis1[1].endTime = new Date('2024-01-04');

      const bis2 = [
        createTestBi({ highest: 115, lowest: 95, trend: TrendDirection.Up }),
        createTestBi({ highest: 108, lowest: 88, trend: TrendDirection.Down }),
      ];
      bis2[0].startTime = new Date('2024-01-04');
      bis2[0].endTime = new Date('2024-01-05');
      bis2[1].startTime = new Date('2024-01-06');
      bis2[1].endTime = new Date('2024-01-07');

      const channel1: any = {
        bis: bis1,
        zg: 105,
        zd: 90,
        gg: 110,
        dd: 85,
      };

      const channel2: any = {
        bis: bis2,
        zg: 108,
        zd: 88,
        gg: 115,
        dd: 88,
      };

      const result = (service as any).hasTimeOverlap(channel1, channel2);

      expect(result).toBe(true);
    });

    it('应该检测到无重叠', () => {
      const bis1 = [
        createTestBi({ highest: 110, lowest: 90, trend: TrendDirection.Up }),
        createTestBi({ highest: 105, lowest: 85, trend: TrendDirection.Down }),
      ];
      bis1[0].startTime = new Date('2024-01-01');
      bis1[0].endTime = new Date('2024-01-02');
      bis1[1].startTime = new Date('2024-01-03');
      bis1[1].endTime = new Date('2024-01-04');

      const bis2 = [
        createTestBi({ highest: 115, lowest: 95, trend: TrendDirection.Up }),
        createTestBi({ highest: 108, lowest: 88, trend: TrendDirection.Down }),
      ];
      bis2[0].startTime = new Date('2024-01-10');
      bis2[0].endTime = new Date('2024-01-11');
      bis2[1].startTime = new Date('2024-01-12');
      bis2[1].endTime = new Date('2024-01-13');

      const channel1: any = {
        bis: bis1,
        zg: 105,
        zd: 90,
        gg: 110,
        dd: 85,
      };

      const channel2: any = {
        bis: bis2,
        zg: 108,
        zd: 88,
        gg: 115,
        dd: 88,
      };

      const result = (service as any).hasTimeOverlap(channel1, channel2);

      expect(result).toBe(false);
    });

    it('应该检测到边界重叠 - 结束时间等于开始时间', () => {
      const bis1 = [
        createTestBi({ highest: 110, lowest: 90, trend: TrendDirection.Up }),
      ];
      bis1[0].startTime = new Date('2024-01-01');
      bis1[0].endTime = new Date('2024-01-05');

      const bis2 = [
        createTestBi({ highest: 115, lowest: 95, trend: TrendDirection.Up }),
      ];
      bis2[0].startTime = new Date('2024-01-05');
      bis2[0].endTime = new Date('2024-01-10');

      const channel1: any = {
        bis: bis1,
        zg: 105,
        zd: 90,
        gg: 110,
        dd: 85,
      };

      const channel2: any = {
        bis: bis2,
        zg: 108,
        zd: 88,
        gg: 115,
        dd: 88,
      };

      const result = (service as any).hasTimeOverlap(channel1, channel2);

      expect(result).toBe(true);
    });
  });

  describe('重叠中枢合并', () => {
    it('应该保留笔数少的中枢', () => {
      const bis1 = [
        createTestBi({ highest: 110, lowest: 90, trend: TrendDirection.Up }),
        createTestBi({ highest: 105, lowest: 85, trend: TrendDirection.Down }),
        createTestBi({ highest: 115, lowest: 95, trend: TrendDirection.Up }),
        createTestBi({ highest: 108, lowest: 88, trend: TrendDirection.Down }),
        createTestBi({ highest: 112, lowest: 92, trend: TrendDirection.Up }),
      ];
      bis1.forEach((bi, i) => {
        bi.startTime = new Date(`2024-01-0${i + 1}`);
        bi.endTime = new Date(`2024-01-0${i + 2}`);
      });

      const bis2 = [
        createTestBi({ highest: 110, lowest: 90, trend: TrendDirection.Up }),
        createTestBi({ highest: 105, lowest: 85, trend: TrendDirection.Down }),
        createTestBi({ highest: 115, lowest: 95, trend: TrendDirection.Up }),
        createTestBi({ highest: 108, lowest: 88, trend: TrendDirection.Down }),
        createTestBi({ highest: 112, lowest: 92, trend: TrendDirection.Up }),
        createTestBi({ highest: 107, lowest: 87, trend: TrendDirection.Down }),
        createTestBi({ highest: 120, lowest: 100, trend: TrendDirection.Up }),
      ];
      bis2.forEach((bi, i) => {
        bi.startTime = new Date(`2024-01-0${i + 1}`);
        bi.endTime = new Date(`2024-01-0${i + 2}`);
      });

      const channel1: any = {
        bis: bis1,
        zg: 105,
        zd: 90,
        gg: 115,
        dd: 85,
      };

      const channel2: any = {
        bis: bis2,
        zg: 105,
        zd: 90,
        gg: 120,
        dd: 85,
      };

      const result = (service as any).mergeOverlappingChannels([
        channel1,
        channel2,
      ]);

      expect(result.length).toBe(1);
      expect(result[0].bis.length).toBe(5); // 保留笔数少的
    });

    it('应该保留所有无重叠的中枢', () => {
      const bis1 = [
        createTestBi({ highest: 110, lowest: 90, trend: TrendDirection.Up }),
        createTestBi({ highest: 105, lowest: 85, trend: TrendDirection.Down }),
      ];
      bis1[0].startTime = new Date('2024-01-01');
      bis1[0].endTime = new Date('2024-01-02');
      bis1[1].startTime = new Date('2024-01-03');
      bis1[1].endTime = new Date('2024-01-04');

      const bis2 = [
        createTestBi({ highest: 115, lowest: 95, trend: TrendDirection.Up }),
        createTestBi({ highest: 108, lowest: 88, trend: TrendDirection.Down }),
      ];
      bis2[0].startTime = new Date('2024-01-10');
      bis2[0].endTime = new Date('2024-01-11');
      bis2[1].startTime = new Date('2024-01-12');
      bis2[1].endTime = new Date('2024-01-13');

      const channel1: any = {
        bis: bis1,
        zg: 105,
        zd: 90,
        gg: 110,
        dd: 85,
      };

      const channel2: any = {
        bis: bis2,
        zg: 108,
        zd: 88,
        gg: 115,
        dd: 88,
      };

      const result = (service as any).mergeOverlappingChannels([
        channel1,
        channel2,
      ]);

      expect(result.length).toBe(2);
    });

    it('应该处理多个重叠中枢', () => {
      const bis1 = [
        createTestBi({ highest: 110, lowest: 90, trend: TrendDirection.Up }),
      ];
      bis1[0].startTime = new Date('2024-01-01');
      bis1[0].endTime = new Date('2024-01-10');

      const bis2 = [
        createTestBi({ highest: 115, lowest: 95, trend: TrendDirection.Up }),
        createTestBi({ highest: 108, lowest: 88, trend: TrendDirection.Down }),
      ];
      bis2[0].startTime = new Date('2024-01-05');
      bis2[0].endTime = new Date('2024-01-15');

      const bis3 = [
        createTestBi({ highest: 120, lowest: 100, trend: TrendDirection.Up }),
        createTestBi({ highest: 107, lowest: 87, trend: TrendDirection.Down }),
        createTestBi({ highest: 112, lowest: 92, trend: TrendDirection.Up }),
      ];
      // 让 channel3 与 channel1 直接重叠
      bis3[0].startTime = new Date('2024-01-08');
      bis3[0].endTime = new Date('2024-01-20');

      const channel1: any = {
        bis: bis1,
        zg: 105,
        zd: 90,
        gg: 110,
        dd: 85,
      };

      const channel2: any = {
        bis: bis2,
        zg: 108,
        zd: 88,
        gg: 115,
        dd: 88,
      };

      const channel3: any = {
        bis: bis3,
        zg: 107,
        zd: 87,
        gg: 120,
        dd: 87,
      };

      const result = (service as any).mergeOverlappingChannels([
        channel1,
        channel2,
        channel3,
      ]);

      // channel1 与 channel2 重叠，保留 channel1（笔数少）
      // channel3 与 channel1 重叠，保留 channel1（笔数少）
      expect(result.length).toBe(1);
      expect(result[0].bis.length).toBe(1); // 保留笔数最少的
      expect(result[0].zg).toBe(105); // channel1 的 zg
    });
  });
});
