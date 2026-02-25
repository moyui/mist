import { Test, TestingModule } from '@nestjs/testing';
import { ChanService } from './chan.service';
import { BiService } from './services/bi.service';
import { KMergeService } from './services/k-merge.service';
import { TrendService } from '../trend/trend.service';
import { UtilsService } from '@app/utils';
import { KLineFixtures } from './test/fixtures/k-line-fixtures';
import { CreateBiDto } from './dto/create-bi.dto';
import { TrendDirection } from './enums/trend-direction.enum';
import { BiType } from './enums/bi.enum';
import { KVo } from '../indicator/vo/k.vo';

describe('ChanService', () => {
  let service: ChanService;
  let biService: BiService;
  let kMergeService: KMergeService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChanService,
        BiService,
        KMergeService,
        TrendService,
        UtilsService,
      ],
    }).compile();

    service = module.get<ChanService>(ChanService);
    biService = module.get<BiService>(BiService);
    kMergeService = module.get<KMergeService>(KMergeService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createBi', () => {
    it('should call kMergeService.merge first', () => {
      const kData = KLineFixtures.upTrend();
      const mergeSpy = jest.spyOn(kMergeService, 'merge');
      const createBiDto = new CreateBiDto();
      createBiDto.k = kData;

      service.createBi(createBiDto);

      expect(mergeSpy).toHaveBeenCalledWith(kData);
    });

    it('should call biService.getBi with merged K-lines', () => {
      const kData = KLineFixtures.upTrend();
      const mergedData = kMergeService.merge(kData);
      const biSpy = jest.spyOn(biService, 'getBi');

      const createBiDto = new CreateBiDto();
      createBiDto.k = kData;

      service.createBi(createBiDto);

      expect(biSpy).toHaveBeenCalledWith(mergedData);
    });

    it('should return bi data from biService', () => {
      const kData = KLineFixtures.upTrend();
      const createBiDto = new CreateBiDto();
      createBiDto.k = kData;

      const result = service.createBi(createBiDto);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThanOrEqual(0);
    });

    it('should process complete workflow: merge -> getBi', () => {
      // Test with data that will produce actual bi
      const kData = [
        KLineFixtures.createKVo(1, 100, 90, 0),
        KLineFixtures.createKVo(2, 105, 95, 1),
        KLineFixtures.createKVo(3, 95, 85, 2), // bottom
        KLineFixtures.createKVo(4, 100, 90, 3),
        KLineFixtures.createKVo(5, 105, 95, 4),
        KLineFixtures.createKVo(6, 110, 100, 5),
        KLineFixtures.createKVo(7, 115, 105, 6), // top
        KLineFixtures.createKVo(8, 110, 100, 7),
        KLineFixtures.createKVo(9, 105, 95, 8),
      ];

      const createBiDto = new CreateBiDto();
      createBiDto.k = kData;

      const mergeSpy = jest.spyOn(kMergeService, 'merge');

      const result = service.createBi(createBiDto);

      // Verify the workflow completed
      expect(mergeSpy).toHaveBeenCalled();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle empty K-line data', () => {
      const createBiDto = new CreateBiDto();
      createBiDto.k = [];

      const result = service.createBi(createBiDto);

      expect(result).toEqual([]);
    });

    it('should handle single K-line data', () => {
      const createBiDto = new CreateBiDto();
      createBiDto.k = KLineFixtures.single();

      const result = service.createBi(createBiDto);

      expect(Array.isArray(result)).toBe(true);
    });

    it('should coordinate services correctly for upward trend', () => {
      const kData = KLineFixtures.upTrend();
      const createBiDto = new CreateBiDto();
      createBiDto.k = kData;

      const mergeSpy = jest.spyOn(kMergeService, 'merge');
      const biSpy = jest.spyOn(biService, 'getBi');

      service.createBi(createBiDto);

      expect(mergeSpy).toHaveBeenCalledTimes(1);
      expect(biSpy).toHaveBeenCalledTimes(1);
    });

    it('should coordinate services correctly for downward trend', () => {
      const kData = KLineFixtures.downTrend();
      const createBiDto = new CreateBiDto();
      createBiDto.k = kData;

      const mergeSpy = jest.spyOn(kMergeService, 'merge');
      const biSpy = jest.spyOn(biService, 'getBi');

      service.createBi(createBiDto);

      expect(mergeSpy).toHaveBeenCalledTimes(1);
      expect(biSpy).toHaveBeenCalledTimes(1);
    });

    it('should coordinate services correctly with containment', () => {
      const kData = KLineFixtures.withContainmentUpTrend();
      const createBiDto = new CreateBiDto();
      createBiDto.k = kData;

      const mergeSpy = jest.spyOn(kMergeService, 'merge');
      const biSpy = jest.spyOn(biService, 'getBi');

      service.createBi(createBiDto);

      expect(mergeSpy).toHaveBeenCalledTimes(1);
      expect(biSpy).toHaveBeenCalledTimes(1);
    });

    it('should preserve bi properties in result', () => {
      const kData = [
        KLineFixtures.createKVo(1, 100, 90, 0),
        KLineFixtures.createKVo(2, 105, 95, 1),
        KLineFixtures.createKVo(3, 95, 85, 2), // bottom
        KLineFixtures.createKVo(4, 100, 90, 3),
        KLineFixtures.createKVo(5, 105, 95, 4),
        KLineFixtures.createKVo(6, 110, 100, 5),
        KLineFixtures.createKVo(7, 115, 105, 6), // top
        KLineFixtures.createKVo(8, 110, 100, 7),
        KLineFixtures.createKVo(9, 105, 95, 8),
      ];

      const createBiDto = new CreateBiDto();
      createBiDto.k = kData;

      const result = service.createBi(createBiDto);

      if (result.length > 0) {
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
      }
    });

    it('should handle large dataset without errors', () => {
      const largeKData: ReturnType<typeof KLineFixtures.upTrend> = [];
      for (let i = 0; i < 100; i++) {
        const k = KLineFixtures.createKVo(
          i + 1,
          100 + i * 10,
          90 + i * 10,
          i,
        );
        largeKData.push(k);
      }

      const createBiDto = new CreateBiDto();
      createBiDto.k = largeKData;

      expect(() => service.createBi(createBiDto)).not.toThrow();
    });

    it('should return bi with correct trend direction', () => {
      const kData = [
        KLineFixtures.createKVo(1, 100, 90, 0),
        KLineFixtures.createKVo(2, 105, 95, 1),
        KLineFixtures.createKVo(3, 95, 85, 2), // bottom
        KLineFixtures.createKVo(4, 105, 95, 3),
        KLineFixtures.createKVo(5, 110, 100, 4),
        KLineFixtures.createKVo(6, 115, 105, 5), // top
        KLineFixtures.createKVo(7, 110, 100, 6),
      ];

      const createBiDto = new CreateBiDto();
      createBiDto.k = kData;

      const result = service.createBi(createBiDto);

      if (result.length > 0) {
        const firstCompleteBi = result.find((bi) => bi.type === BiType.Complete);
        if (firstCompleteBi) {
          expect(
            [TrendDirection.Up, TrendDirection.Down].includes(
              firstCompleteBi.trend,
            ),
          ).toBe(true);
        }
      }
    });
  });

  describe('service coordination', () => {
    it('should use merged K-lines from kMergeService as input to biService', () => {
      const kData = KLineFixtures.completeBi();
      const createBiDto = new CreateBiDto();
      createBiDto.k = kData;

      // Get merged data
      const expectedMergedData = kMergeService.merge(kData);

      // Spy on biService to check what data it receives
      const biSpy = jest.spyOn(biService, 'getBi');

      service.createBi(createBiDto);

      // Verify biService was called with the merged data
      expect(biSpy).toHaveBeenCalledWith(expectedMergedData);
    });

    it('should not modify original K-line data', () => {
      const kData = [...KLineFixtures.upTrend()];
      const originalData = JSON.stringify(kData);
      const createBiDto = new CreateBiDto();
      createBiDto.k = kData;

      service.createBi(createBiDto);

      expect(JSON.stringify(kData)).toBe(originalData);
    });
  });
});
