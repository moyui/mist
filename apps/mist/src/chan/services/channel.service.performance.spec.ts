import { Test, TestingModule } from '@nestjs/testing';
import { ChannelService } from './channel.service';
import { CreateChannelDto } from '../dto/create-channel.dto';
import { TrendDirection } from '../enums/trend-direction.enum';
import { BiType } from '../enums/bi.enum';
import { FenxingType } from '../enums/fenxing.enum';
import { BiVo } from '../vo/bi.vo';

/**
 * Helper to create a BiVo for performance testing
 */
function createBiVo(
  id: number,
  trend: TrendDirection,
  highest: number,
  lowest: number,
): BiVo {
  const baseTime = Date.now() + id * 60000;

  return {
    startTime: new Date(baseTime),
    endTime: new Date(baseTime + 60000),
    highest,
    lowest,
    trend,
    type: BiType.Complete,
    status: 1,
    independentCount: 1,
    originIds: [id],
    originData: [],
    startFenxing: {
      leftIds: [id - 1],
      middleIds: [id],
      rightIds: [id + 1],
      middleIndex: 0,
      middleOriginId: id,
      type: trend === TrendDirection.Up ? FenxingType.Top : FenxingType.Bottom,
      highest,
      lowest,
    },
    endFenxing: {
      leftIds: [id - 1],
      middleIds: [id],
      rightIds: [id + 1],
      middleIndex: 0,
      middleOriginId: id,
      type: trend === TrendDirection.Up ? FenxingType.Top : FenxingType.Bottom,
      highest,
      lowest,
    },
    enteringSegment: {
      startPrice: 0,
      endPrice: 0,
      exists: false,
    },
    leavingSegment: {
      startPrice: 0,
      endPrice: 0,
      height: 0,
      exists: false,
    },
    isPiercing: false,
  };
}

/**
 * Generate alternating bis for performance testing
 */
function generateAlternatingBis(count: number): BiVo[] {
  const bis: BiVo[] = [];
  const basePrice = 1000;

  for (let i = 0; i < count; i++) {
    const isUp = i % 2 === 0;
    const trend = isUp ? TrendDirection.Up : TrendDirection.Down;
    const variation = Math.sin(i * 0.5) * 50; // Create some overlap

    const highest = basePrice + variation + (isUp ? 20 : 10);
    const lowest = basePrice + variation - (isUp ? 10 : 20);

    bis.push(createBiVo(i + 1, trend, highest, lowest));
  }

  return bis;
}

describe('ChannelService - Performance Tests', () => {
  let service: ChannelService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ChannelService],
    }).compile();

    service = module.get<ChannelService>(ChannelService);
  });

  describe('Bi detection performance', () => {
    it('should detect 100 bi in less than 100ms', () => {
      const mockBi = generateAlternatingBis(100);
      const dto = new CreateChannelDto();
      dto.bi = mockBi;

      const startTime = Date.now();
      const result = service.createChannel(dto);
      const endTime = Date.now();
      const duration = endTime - startTime;

      console.log(`100 bi detection took ${duration}ms`);

      expect(duration).toBeLessThan(100);
      expect(result).toBeDefined();
    });

    it('should detect 1000 bi in less than 1s', () => {
      const mockBi = generateAlternatingBis(1000);
      const dto = new CreateChannelDto();
      dto.bi = mockBi;

      const startTime = Date.now();
      const result = service.createChannel(dto);
      const endTime = Date.now();
      const duration = endTime - startTime;

      console.log(`1000 bi detection took ${duration}ms`);

      expect(duration).toBeLessThan(1000);
      expect(result).toBeDefined();
    });
  });

  describe('Channel detection performance with complex patterns', () => {
    it('should handle multiple channel detection efficiently', () => {
      // Create data that will form multiple separate channels
      const bis: BiVo[] = [];

      // Channel 1: 10 bis
      for (let i = 0; i < 10; i++) {
        const isUp = i % 2 === 0;
        bis.push(
          createBiVo(
            i + 1,
            isUp ? TrendDirection.Up : TrendDirection.Down,
            100 + (isUp ? 20 : 15),
            100 - (isUp ? 10 : 15),
          ),
        );
      }

      // Gap in price
      // Channel 2: 10 bis
      for (let i = 0; i < 10; i++) {
        const isUp = i % 2 === 0;
        bis.push(
          createBiVo(
            i + 11,
            isUp ? TrendDirection.Up : TrendDirection.Down,
            200 + (isUp ? 20 : 15),
            200 - (isUp ? 10 : 15),
          ),
        );
      }

      const dto = new CreateChannelDto();
      dto.bi = bis;

      const startTime = Date.now();
      const result = service.createChannel(dto);
      const endTime = Date.now();
      const duration = endTime - startTime;

      console.log(
        `Multiple channel detection (20 bis) took ${duration}ms, found ${result.length} channels`,
      );

      expect(duration).toBeLessThan(100);
      expect(result.length).toBeGreaterThanOrEqual(1);
    });
  });
});
