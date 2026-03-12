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
});
