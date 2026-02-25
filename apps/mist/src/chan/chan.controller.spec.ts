import { Test, TestingModule } from '@nestjs/testing';
import { ChanController } from './chan.controller';
import { ChanService } from './chan.service';
import { BiService } from './services/bi.service';
import { KMergeService } from './services/k-merge.service';
import { KLineFixtures } from './test/fixtures/k-line-fixtures';
import { MergeKDto } from './dto/merge-k.dto';
import { CreateBiDto } from './dto/create-bi.dto';
import { TrendService } from '../trend/trend.service';
import { UtilsService } from '@app/utils';
import { TrendDirection } from './enums/trend-direction.enum';
import { BiType } from './enums/bi.enum';

describe('ChanController', () => {
  let controller: ChanController;
  let chanService: ChanService;
  let kMergeService: KMergeService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ChanController],
      providers: [
        ChanService,
        BiService,
        KMergeService,
        TrendService,
        UtilsService,
      ],
    }).compile();

    controller = module.get<ChanController>(ChanController);
    chanService = module.get<ChanService>(ChanService);
    kMergeService = module.get<KMergeService>(KMergeService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('POST /chan/merge-k', () => {
    it('should return merged K-lines for valid input', async () => {
      const kData = KLineFixtures.upTrend();
      const mergeKDto = new MergeKDto();
      mergeKDto.k = kData;

      const result = await controller.postMergeK(mergeKDto);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should call kMergeService.merge with correct data', async () => {
      const kData = KLineFixtures.upTrend();
      const mergeKDto = new MergeKDto();
      mergeKDto.k = kData;

      const mergeSpy = jest.spyOn(kMergeService, 'merge');

      await controller.postMergeK(mergeKDto);

      expect(mergeSpy).toHaveBeenCalledWith(kData);
    });

    it('should return empty array for empty input', async () => {
      const mergeKDto = new MergeKDto();
      mergeKDto.k = [];

      const result = await controller.postMergeK(mergeKDto);

      expect(result).toEqual([]);
    });

    it('should handle single K-line input', async () => {
      const mergeKDto = new MergeKDto();
      mergeKDto.k = KLineFixtures.single();

      const result = await controller.postMergeK(mergeKDto);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should merge K-lines with containment in up trend', async () => {
      const mergeKDto = new MergeKDto();
      mergeKDto.k = KLineFixtures.withContainmentUpTrend();

      const result = await controller.postMergeK(mergeKDto);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should merge K-lines with containment in down trend', async () => {
      const mergeKDto = new MergeKDto();
      mergeKDto.k = KLineFixtures.withContainmentDownTrend();

      const result = await controller.postMergeK(mergeKDto);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('POST /chan/bi', () => {
    it('should return bi data for valid input', async () => {
      const kData = KLineFixtures.completeBi();
      const createBiDto = new CreateBiDto();
      createBiDto.k = kData;

      const result = await controller.postIndexBi(createBiDto);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should call chanService.createBi with correct data', async () => {
      const kData = KLineFixtures.upTrend();
      const createBiDto = new CreateBiDto();
      createBiDto.k = kData;

      const createBiSpy = jest.spyOn(chanService, 'createBi');

      await controller.postIndexBi(createBiDto);

      expect(createBiSpy).toHaveBeenCalledWith(createBiDto);
    });

    it('should return empty array for empty input', async () => {
      const createBiDto = new CreateBiDto();
      createBiDto.k = [];

      const result = await controller.postIndexBi(createBiDto);

      expect(result).toEqual([]);
    });

    it('should handle single K-line input', async () => {
      const createBiDto = new CreateBiDto();
      createBiDto.k = KLineFixtures.single();

      const result = await controller.postIndexBi(createBiDto);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should process data with fenxings', async () => {
      const createBiDto = new CreateBiDto();
      createBiDto.k = KLineFixtures.completeBi();

      const result = await controller.postIndexBi(createBiDto);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle upward trend data', async () => {
      const createBiDto = new CreateBiDto();
      createBiDto.k = KLineFixtures.upTrend();

      const result = await controller.postIndexBi(createBiDto);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle downward trend data', async () => {
      const createBiDto = new CreateBiDto();
      createBiDto.k = KLineFixtures.downTrend();

      const result = await controller.postIndexBi(createBiDto);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle data with alternating fenxings', async () => {
      const createBiDto = new CreateBiDto();
      createBiDto.k = KLineFixtures.alternatingFenxings();

      const result = await controller.postIndexBi(createBiDto);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('DTO validation', () => {
    it('should accept valid CreateBiDto', async () => {
      const createBiDto = new CreateBiDto();
      createBiDto.k = KLineFixtures.upTrend();

      // Should not throw validation error
      const result = await controller.postIndexBi(createBiDto);

      expect(result).toBeDefined();
    });

    it('should accept valid MergeKDto', async () => {
      const mergeKDto = new MergeKDto();
      mergeKDto.k = KLineFixtures.upTrend();

      // Should not throw validation error
      const result = await controller.postMergeK(mergeKDto);

      expect(result).toBeDefined();
    });
  });

  describe('Service coordination', () => {
    it('should coordinate chanService.createBi correctly for bi endpoint', async () => {
      const kData = KLineFixtures.completeBi();
      const createBiDto = new CreateBiDto();
      createBiDto.k = kData;

      // Mock the entire createBi chain
      const mockBiData = [
        {
          startTime: new Date(),
          endTime: new Date(),
          highest: 120,
          lowest: 90,
          trend: TrendDirection.Up,
          type: BiType.Complete,
          originIds: [1, 2, 3],
          originData: kData.slice(0, 3),
          independentCount: 3,
          startFenxing: null,
          endFenxing: null,
        },
      ];

      jest.spyOn(chanService, 'createBi').mockReturnValue(mockBiData);

      const result = await controller.postIndexBi(createBiDto);

      expect(chanService.createBi).toHaveBeenCalledWith(createBiDto);
      expect(result).toEqual(mockBiData);
    });

    it('should coordinate kMergeService.merge correctly for merge-k endpoint', async () => {
      const kData = KLineFixtures.withContainmentUpTrend();
      const mergeKDto = new MergeKDto();
      mergeKDto.k = kData;

      // Mock the merge result
      const mockMergedData = kMergeService.merge(kData);

      const mergeSpy = jest
        .spyOn(kMergeService, 'merge')
        .mockReturnValue(mockMergedData);

      const result = await controller.postMergeK(mergeKDto);

      expect(mergeSpy).toHaveBeenCalledWith(kData);
      expect(result).toEqual(mockMergedData);
    });
  });

  describe('Edge cases', () => {
    it('should handle large dataset', async () => {
      const largeKData: ReturnType<typeof KLineFixtures.upTrend> = [];
      for (let i = 0; i < 100; i++) {
        largeKData.push(
          KLineFixtures.createKVo(i + 1, 100 + i * 10, 90 + i * 10, i),
        );
      }

      const createBiDto = new CreateBiDto();
      createBiDto.k = largeKData;

      const result = await controller.postIndexBi(createBiDto);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle data with no clear fenxings', async () => {
      const createBiDto = new CreateBiDto();
      createBiDto.k = KLineFixtures.noFenxings();

      const result = await controller.postIndexBi(createBiDto);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });
  });
});
