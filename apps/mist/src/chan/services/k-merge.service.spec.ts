import { Test, TestingModule } from '@nestjs/testing';
import { KMergeService } from './k-merge.service';
import { TrendService } from '../../trend/trend.service';
import { TrendDirection } from '../enums/trend-direction.enum';
import { KLineFixtures } from '../test/fixtures/k-line-fixtures';
import { KVo } from '../../indicator/vo/k.vo';
import { UtilsService } from '@app/utils';

describe('KMergeService', () => {
  let service: KMergeService;
  let trendService: TrendService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [KMergeService, TrendService, UtilsService],
    }).compile();

    service = module.get<KMergeService>(KMergeService);
    trendService = module.get<TrendService>(TrendService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('handleContainedState', () => {
    it('should merge with high-high in up trend', () => {
      const current = {
        startTime: new Date(),
        endTime: new Date(),
        highest: 120,
        lowest: 100,
        trend: TrendDirection.Up,
        mergedCount: 1,
        mergedIds: [1],
        mergedData: [KLineFixtures.single()[0]],
      };

      const next = KLineFixtures.createKVo(2, 115, 105, 1); // contained

      // Access private method via bracket notation for testing
      const result = (service as any).handleContainedState(
        current,
        next,
        TrendDirection.Up,
      );

      expect(result.merged).toBe(true);
      expect(result.newHigh).toBe(120); // max(120, 115) = 120
      expect(result.newLow).toBe(105); // max(100, 105) = 105 (high-high for up trend)
    });

    it('should merge with low-low in down trend', () => {
      const current = {
        startTime: new Date(),
        endTime: new Date(),
        highest: 140,
        lowest: 120,
        trend: TrendDirection.Down,
        mergedCount: 1,
        mergedIds: [1],
        mergedData: [KLineFixtures.single()[0]],
      };

      const next = KLineFixtures.createKVo(2, 135, 125, 1); // contained

      const result = (service as any).handleContainedState(
        current,
        next,
        TrendDirection.Down,
      );

      expect(result.merged).toBe(true);
      expect(result.newHigh).toBe(135); // min(140, 135) = 135 (low-low for down trend)
      expect(result.newLow).toBe(120); // min(120, 125) = 120
    });

    it('should not merge when there is no containment', () => {
      const current = {
        startTime: new Date(),
        endTime: new Date(),
        highest: 120,
        lowest: 100,
        trend: TrendDirection.Up,
        mergedCount: 1,
        mergedIds: [1],
        mergedData: [KLineFixtures.single()[0]],
      };

      const next = KLineFixtures.createKVo(2, 130, 120, 1); // not contained

      const result = (service as any).handleContainedState(
        current,
        next,
        TrendDirection.Up,
      );

      expect(result.merged).toBe(false);
      expect(result.newHigh).toBe(0);
      expect(result.newLow).toBe(0);
    });

    it('should not merge when trend is None', () => {
      const current = {
        startTime: new Date(),
        endTime: new Date(),
        highest: 120,
        lowest: 100,
        trend: TrendDirection.None,
        mergedCount: 1,
        mergedIds: [1],
        mergedData: [KLineFixtures.single()[0]],
      };

      const next = KLineFixtures.createKVo(2, 115, 105, 1); // contained

      const result = (service as any).handleContainedState(
        current,
        next,
        TrendDirection.None,
      );

      expect(result.merged).toBe(false);
      expect(result.newHigh).toBe(0);
      expect(result.newLow).toBe(0);
    });

    it('should detect containment when current contains next', () => {
      const current = {
        startTime: new Date(),
        endTime: new Date(),
        highest: 120,
        lowest: 100,
        trend: TrendDirection.Up,
        mergedCount: 1,
        mergedIds: [1],
        mergedData: [KLineFixtures.single()[0]],
      };

      const next = KLineFixtures.createKVo(2, 115, 105, 1);

      const result = (service as any).handleContainedState(
        current,
        next,
        TrendDirection.Up,
      );

      expect(result.merged).toBe(true);
    });

    it('should detect containment when next contains current', () => {
      const current = {
        startTime: new Date(),
        endTime: new Date(),
        highest: 115,
        lowest: 105,
        trend: TrendDirection.Up,
        mergedCount: 1,
        mergedIds: [1],
        mergedData: [KLineFixtures.single()[0]],
      };

      const next = KLineFixtures.createKVo(2, 120, 100, 1);

      const result = (service as any).handleContainedState(
        current,
        next,
        TrendDirection.Up,
      );

      expect(result.merged).toBe(true);
    });
  });

  describe('merge', () => {
    it('should return empty array for empty input', () => {
      const result = service.merge(KLineFixtures.empty());
      expect(result).toEqual([]);
    });

    it('should return single merged K-line for single input', () => {
      const result = service.merge(KLineFixtures.single());

      expect(result.length).toBe(1);
      expect(result[0].mergedCount).toBe(1);
      expect(result[0].mergedIds).toEqual([1]);
      expect(result[0].highest).toBe(100);
      expect(result[0].lowest).toBe(90);
    });

    it('should correctly merge K-lines with containment in up trend', () => {
      const result = service.merge(KLineFixtures.withContainmentUpTrend());

      // Due to trend detection, K1 and K2 don't form a clear trend initially
      // K1->K2: high down, low up (no trend)
      // K2->K3: both up (up trend established)
      // K3->K4: both up (up trend continues)
      // K3 and K4 might merge if K4 is contained in K3

      // The algorithm starts with baseData = K1, then checks K2
      // Since K1->K2 has no clear trend, K2 becomes new baseData
      // Then K2->K3 has up trend, but K2 and K3 don't have containment
      // So they stay separate

      expect(result.length).toBe(4);

      // Each K-line stays separate because no containment with clear trend
      expect(result[0].mergedCount).toBe(1);
      expect(result[0].mergedIds).toEqual([1]);

      expect(result[1].mergedCount).toBe(1);
      expect(result[1].mergedIds).toEqual([2]);

      expect(result[2].mergedCount).toBe(1);
      expect(result[2].mergedIds).toEqual([3]);

      expect(result[3].mergedCount).toBe(1);
      expect(result[3].mergedIds).toEqual([4]);
    });

    it('should correctly merge K-lines with containment in down trend', () => {
      const result = service.merge(KLineFixtures.withContainmentDownTrend());

      // Similar to up trend, K1->K2 has no clear trend initially
      expect(result.length).toBe(4);

      expect(result[0].mergedCount).toBe(1);
      expect(result[0].mergedIds).toEqual([1]);

      expect(result[1].mergedCount).toBe(1);
      expect(result[1].mergedIds).toEqual([2]);

      expect(result[2].mergedCount).toBe(1);
      expect(result[2].mergedIds).toEqual([3]);

      expect(result[3].mergedCount).toBe(1);
      expect(result[3].mergedIds).toEqual([4]);
    });

    it('should track mergedCount correctly', () => {
      // Create custom data that will actually merge
      // Need: clear trend + containment relationship
      const data = [
        KLineFixtures.createKVo(1, 100, 90, 0),
        KLineFixtures.createKVo(2, 110, 100, 1), // up trend from K1
        KLineFixtures.createKVo(3, 105, 102, 2), // contained in K2 (110>=105 AND 100<=102)
        KLineFixtures.createKVo(4, 130, 120, 3), // up trend continues
        KLineFixtures.createKVo(5, 125, 122, 4), // contained in K4 (130>=125 AND 120<=122)
        KLineFixtures.createKVo(6, 150, 140, 5), // not contained
      ];

      const result = service.merge(data);

      // K2 and K3 should merge (clear up trend + containment)
      expect(result[0].mergedCount).toBe(1); // K1 starts with no trend
      expect(result[1].mergedCount).toBe(2); // K2 + K3 merged
      expect(result[2].mergedCount).toBe(2); // K4 + K5 merged
      expect(result[3].mergedCount).toBe(1); // K6
    });

    it('should track mergedIds correctly', () => {
      const data = [
        KLineFixtures.createKVo(1, 100, 90, 0),
        KLineFixtures.createKVo(2, 110, 100, 1), // up trend from K1
        KLineFixtures.createKVo(3, 105, 102, 2), // contained in K2
        KLineFixtures.createKVo(4, 130, 120, 3), // up trend continues
        KLineFixtures.createKVo(5, 125, 122, 4), // contained in K4
        KLineFixtures.createKVo(6, 150, 140, 5), // not contained
      ];

      const result = service.merge(data);

      expect(result[0].mergedIds).toEqual([1]);
      expect(result[1].mergedIds).toEqual([2, 3]);
      expect(result[2].mergedIds).toEqual([4, 5]);
      expect(result[3].mergedIds).toEqual([6]);
    });

    it('should set startTime and endTime correctly', () => {
      const data = [
        KLineFixtures.createKVo(1, 100, 90, 0),
        KLineFixtures.createKVo(2, 110, 100, 1),
        KLineFixtures.createKVo(3, 105, 102, 2), // will merge with K2
        KLineFixtures.createKVo(4, 125, 115, 3),
      ];

      const result = service.merge(data);

      expect(result[0].startTime).toEqual(data[0].time);
      expect(result[0].endTime).toEqual(data[0].time);

      // Merged K-line (K2 + K3)
      expect(result[1].startTime).toEqual(data[1].time);
      expect(result[1].endTime).toEqual(data[2].time);
    });

    it('should not merge when there is no clear trend', () => {
      const data = [
        KLineFixtures.createKVo(1, 100, 90, 0),
        KLineFixtures.createKVo(2, 95, 85, 1), // lower high, lower low - down trend
        KLineFixtures.createKVo(3, 105, 95, 2), // higher high, higher low - up trend
      ];

      const result = service.merge(data);

      // First two form down trend, third breaks it
      expect(result.length).toBe(3);
      expect(result[0].mergedCount).toBe(1);
      expect(result[1].mergedCount).toBe(1);
      expect(result[2].mergedCount).toBe(1);
    });
  });
});
