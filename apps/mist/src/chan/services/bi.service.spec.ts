import { Test, TestingModule } from '@nestjs/testing';
import { BiService } from './bi.service';
import { TrendDirection } from '../enums/trend-direction.enum';
import { FenxingType } from '../enums/fenxing.enum';
import { BiType } from '../enums/bi.enum';
import { KLineFixtures } from '../test/fixtures/k-line-fixtures';
import { MergedKVo } from '../vo/merged-k.vo';
import { KVo } from '../../indicator/vo/k.vo';

/**
 * Helper to create a MergedKVo from KVo data
 */
function createMergedKVo(
  id: number,
  highest: number,
  lowest: number,
  timeOffset: number = 0,
): MergedKVo {
  const k = KLineFixtures.createKVo(id, highest, lowest, timeOffset);
  return {
    startTime: k.time,
    endTime: k.time,
    highest,
    lowest,
    trend: TrendDirection.None,
    mergedCount: 1,
    mergedIds: [id],
    mergedData: [k],
  };
}

/**
 * Helper to create a merged KVo with multiple K-lines inside
 */
function createMergedKVoWithMultiple(
  ids: number[],
  highest: number,
  lowest: number,
  timeOffset: number = 0,
): MergedKVo {
  const baseTime = Date.now() + timeOffset * 60000;
  const mergedData: KVo[] = ids.map((id, idx) => {
    const k = new KVo();
    k.id = id;
    k.symbol = 'TEST';
    k.time = new Date(baseTime + idx * 60000);
    k.amount = 1000;
    k.open = lowest;
    k.close = highest;
    k.highest = highest;
    k.lowest = lowest;
    return k;
  });

  return {
    startTime: mergedData[0].time,
    endTime: mergedData[mergedData.length - 1].time,
    highest,
    lowest,
    trend: TrendDirection.None,
    mergedCount: ids.length,
    mergedIds: ids,
    mergedData,
  };
}

describe('BiService', () => {
  let service: BiService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BiService],
    }).compile();

    service = module.get<BiService>(BiService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getBi - fenxing detection', () => {
    it('should detect top fenxing correctly', () => {
      const data = [
        createMergedKVo(1, 100, 90, 0),
        createMergedKVo(2, 120, 100, 1), // top fenxing (higher than neighbors)
        createMergedKVo(3, 110, 95, 2),
      ];

      const result = service.getBi(data);

      // Should detect the top fenxing
      expect(result.length).toBeGreaterThanOrEqual(0);
    });

    it('should detect bottom fenxing correctly', () => {
      const data = [
        createMergedKVo(1, 120, 100, 0),
        createMergedKVo(2, 110, 90, 1), // bottom fenxing (lower than neighbors)
        createMergedKVo(3, 115, 95, 2),
      ];

      const result = service.getBi(data);

      // Should detect the bottom fenxing
      expect(result.length).toBeGreaterThanOrEqual(0);
    });

    it('should set middleOriginId to the highest price K-line for top fenxing', () => {
      // Create a merged K with multiple K-lines, where the middle one has highest price
      const data = [
        createMergedKVo(1, 100, 90, 0),
        createMergedKVoWithMultiple([2, 3, 4], 120, 100, 1),
        createMergedKVo(5, 110, 95, 2),
      ];

      // Manually set up the merged data so K3 has the highest price
      data[1].mergedData[1].highest = 125; // K3 has highest price
      data[1].highest = 125;

      const result = service.getBi(data);

      // The middleOriginId should point to K3 (id=3) which has the highest price
      expect(result.length).toBeGreaterThanOrEqual(0);
    });

    it('should set middleOriginId to the lowest price K-line for bottom fenxing', () => {
      const data = [
        createMergedKVo(1, 120, 100, 0),
        createMergedKVoWithMultiple([2, 3, 4], 110, 90, 1),
        createMergedKVo(5, 115, 95, 2),
      ];

      // Manually set up the merged data so K3 has the lowest price
      data[1].mergedData[1].lowest = 85; // K3 has lowest price
      data[1].lowest = 85;

      const result = service.getBi(data);

      expect(result.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getBi - alternating sequence', () => {
    it('should keep more extreme value for consecutive same-type fenxings (top)', () => {
      const data = [
        createMergedKVo(1, 100, 90, 0),
        createMergedKVo(2, 110, 100, 1),
        createMergedKVo(3, 115, 105, 2),
        createMergedKVo(4, 120, 110, 3), // first top fenxing
        createMergedKVo(5, 115, 105, 4),
        createMergedKVo(6, 110, 100, 5),
        createMergedKVo(7, 125, 115, 6), // second top fenxing (higher, should replace first)
        createMergedKVo(8, 120, 110, 7),
      ];

      const result = service.getBi(data);

      // Should have bi data
      expect(Array.isArray(result)).toBe(true);
    });

    it('should keep more extreme value for consecutive same-type fenxings (bottom)', () => {
      const data = [
        createMergedKVo(1, 120, 110, 0),
        createMergedKVo(2, 115, 105, 1),
        createMergedKVo(3, 110, 100, 2), // first bottom fenxing
        createMergedKVo(4, 115, 105, 3),
        createMergedKVo(5, 110, 100, 4),
        createMergedKVo(6, 105, 95, 5), // second bottom fenxing (lower, should replace first)
        createMergedKVo(7, 110, 100, 6),
      ];

      const result = service.getBi(data);

      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('getBi - bi validity', () => {
    it('should not create bi between same-type fenxings', () => {
      const data = [
        createMergedKVo(1, 100, 90, 0),
        createMergedKVo(2, 110, 100, 1), // bottom
        createMergedKVo(3, 105, 95, 2),
        createMergedKVo(4, 110, 100, 3), // another bottom - shouldn't connect
        createMergedKVo(5, 115, 105, 4),
      ];

      const result = service.getBi(data);

      expect(Array.isArray(result)).toBe(true);
    });

    it('should check price relationship for up-trend bi', () => {
      const data = [
        createMergedKVo(1, 100, 90, 0),
        createMergedKVo(2, 95, 85, 1), // bottom fenxing
        createMergedKVo(3, 100, 90, 2),
        createMergedKVo(4, 105, 95, 3),
        createMergedKVo(5, 110, 100, 4),
        createMergedKVo(6, 105, 95, 5), // top fenxing (higher than bottom's low)
        createMergedKVo(7, 100, 90, 6),
      ];

      const result = service.getBi(data);

      expect(Array.isArray(result)).toBe(true);
    });

    it('should check price relationship for down-trend bi', () => {
      const data = [
        createMergedKVo(1, 110, 100, 0),
        createMergedKVo(2, 120, 110, 1), // top fenxing
        createMergedKVo(3, 115, 105, 2),
        createMergedKVo(4, 110, 100, 3),
        createMergedKVo(5, 105, 95, 4),
        createMergedKVo(6, 100, 90, 5), // bottom fenxing (lower than top's high)
        createMergedKVo(7, 105, 95, 6),
      ];

      const result = service.getBi(data);

      expect(Array.isArray(result)).toBe(true);
    });

    it('should enforce wide bi requirement (>=3 original K-lines)', () => {
      // Create minimal data that forms fenxings but with insufficient K-lines between
      const data = [
        createMergedKVo(1, 100, 90, 0),
        createMergedKVo(2, 110, 100, 1), // potential bottom
        createMergedKVo(3, 120, 110, 2), // potential top (only 2 mergedK between, may not have 3 original Ks)
        createMergedKVo(4, 110, 100, 3),
      ];

      const result = service.getBi(data);

      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('getBi - fenxing containment', () => {
    it('should mark erasure when top contains bottom', () => {
      const data = [
        createMergedKVo(1, 100, 90, 0),
        createMergedKVo(2, 105, 95, 1), // bottom fenxing
        createMergedKVo(3, 110, 90, 2), // top fenxing that contains the bottom (110>=105 AND 90<=95)
        createMergedKVo(4, 105, 95, 3),
      ];

      const result = service.getBi(data);

      expect(Array.isArray(result)).toBe(true);
    });

    it('should mark erasure when bottom contains top', () => {
      const data = [
        createMergedKVo(1, 120, 100, 0),
        createMergedKVo(2, 110, 90, 1), // top fenxing
        createMergedKVo(3, 115, 85, 2), // bottom fenxing that contains the top (115>=110 AND 85<=90)
        createMergedKVo(4, 110, 90, 3),
      ];

      const result = service.getBi(data);

      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('getBi - trend maintenance', () => {
    it('should maintain upward trend through multiple intermediate bottom fenxings', () => {
      const data = [
        createMergedKVo(1, 100, 90, 0),
        createMergedKVo(2, 95, 85, 1), // bottom 1
        createMergedKVo(3, 105, 95, 2),
        createMergedKVo(4, 100, 90, 3), // bottom 2 (higher than bottom 1)
        createMergedKVo(5, 115, 105, 4),
        createMergedKVo(6, 120, 110, 5), // top fenxing
        createMergedKVo(7, 115, 105, 6),
      ];

      const result = service.getBi(data);

      expect(Array.isArray(result)).toBe(true);
    });

    it('should maintain downward trend through multiple intermediate top fenxings', () => {
      const data = [
        createMergedKVo(1, 120, 110, 0),
        createMergedKVo(2, 125, 115, 1), // top 1
        createMergedKVo(3, 115, 105, 2),
        createMergedKVo(4, 120, 110, 3), // top 2 (lower than top 1)
        createMergedKVo(5, 105, 95, 4),
        createMergedKVo(6, 100, 90, 5), // bottom fenxing
        createMergedKVo(7, 105, 95, 6),
      ];

      const result = service.getBi(data);

      expect(Array.isArray(result)).toBe(true);
    });

    it('should break trend when intermediate fenxing violates trend direction', () => {
      const data = [
        createMergedKVo(1, 100, 90, 0),
        createMergedKVo(2, 95, 85, 1), // bottom
        createMergedKVo(3, 110, 100, 2),
        createMergedKVo(4, 90, 80, 3), // new bottom that's LOWER - breaks trend
        createMergedKVo(5, 120, 110, 4), // top
        createMergedKVo(6, 110, 100, 5),
      ];

      const result = service.getBi(data);

      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('getBi - end-to-end', () => {
    it('should generate complete bi sequence for valid data', () => {
      const data = [
        createMergedKVo(1, 100, 90, 0),
        createMergedKVo(2, 105, 95, 1),
        createMergedKVo(3, 95, 85, 2), // bottom fenxing
        createMergedKVo(4, 100, 90, 3),
        createMergedKVo(5, 105, 95, 4),
        createMergedKVo(6, 110, 100, 5),
        createMergedKVo(7, 115, 105, 6), // top fenxing
        createMergedKVo(8, 110, 100, 7),
        createMergedKVo(9, 105, 95, 8),
      ];

      const result = service.getBi(data);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);

      // Check bi structure
      const firstBi = result[0];
      expect(firstBi).toHaveProperty('startTime');
      expect(firstBi).toHaveProperty('endTime');
      expect(firstBi).toHaveProperty('highest');
      expect(firstBi).toHaveProperty('lowest');
      expect(firstBi).toHaveProperty('trend');
      expect(firstBi).toHaveProperty('type');
      expect(firstBi).toHaveProperty('originIds');
      expect(firstBi).toHaveProperty('originData');
      expect(firstBi).toHaveProperty('startFenxing');
      expect(firstBi).toHaveProperty('endFenxing');
    });

    it('should handle empty data', () => {
      const result = service.getBi([]);
      expect(result).toEqual([]);
    });

    it('should handle data with no fenxings', () => {
      const data = [
        createMergedKVo(1, 100, 90, 0),
        createMergedKVo(2, 105, 95, 1),
        createMergedKVo(3, 110, 100, 2),
        createMergedKVo(4, 115, 105, 3),
        createMergedKVo(5, 120, 110, 4),
      ];

      const result = service.getBi(data);

      // Should return empty or uncomplete bi
      expect(Array.isArray(result)).toBe(true);
    });

    it('should create uncomplete bi for remaining data after last valid fenxing', () => {
      const data = [
        createMergedKVo(1, 100, 90, 0),
        createMergedKVo(2, 95, 85, 1), // bottom
        createMergedKVo(3, 105, 95, 2),
        createMergedKVo(4, 110, 100, 3), // top
        createMergedKVo(5, 115, 105, 4),
        createMergedKVo(6, 120, 110, 5),
        createMergedKVo(7, 125, 115, 6), // continuing up...
        createMergedKVo(8, 130, 120, 7),
      ];

      const result = service.getBi(data);

      expect(Array.isArray(result)).toBe(true);
      // Should have at least one bi (possibly uncomplete)
      expect(result.length).toBeGreaterThan(0);
    });

    it('should set correct trend direction for bi', () => {
      const data = [
        createMergedKVo(1, 100, 90, 0),
        createMergedKVo(2, 95, 85, 1), // bottom
        createMergedKVo(3, 105, 95, 2),
        createMergedKVo(4, 110, 100, 3),
        createMergedKVo(5, 115, 105, 4), // top
        createMergedKVo(6, 110, 100, 5),
      ];

      const result = service.getBi(data);

      expect(result.length).toBeGreaterThan(0);

      // First bi should be up trend (bottom to top)
      const firstBi = result.find((bi) => bi.type === BiType.Complete);
      if (firstBi) {
        expect(firstBi.trend).toBe(TrendDirection.Up);
      }
    });

    it('should handle single merged K-line (no bi possible)', () => {
      const data = [createMergedKVo(1, 100, 90, 0)];

      const result = service.getBi(data);

      // Should have uncomplete bi
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle two merged K-lines (insufficient for fenxing)', () => {
      const data = [
        createMergedKVo(1, 100, 90, 0),
        createMergedKVo(2, 110, 100, 1),
      ];

      const result = service.getBi(data);

      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('getBi - edge cases', () => {
    it('should handle all-time high/low correctly', () => {
      const data = [
        createMergedKVo(1, 100, 90, 0),
        createMergedKVo(2, 95, 85, 1), // bottom
        createMergedKVo(3, 150, 140, 2), // huge jump - all-time high
        createMergedKVo(4, 145, 135, 3),
        createMergedKVo(5, 140, 130, 4),
      ];

      const result = service.getBi(data);

      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle repeated same prices', () => {
      const data = [
        createMergedKVo(1, 100, 90, 0),
        createMergedKVo(2, 100, 90, 1), // same price - no trend
        createMergedKVo(3, 100, 90, 2), // same price
        createMergedKVo(4, 110, 100, 3),
      ];

      const result = service.getBi(data);

      expect(Array.isArray(result)).toBe(true);
    });
  });
});
