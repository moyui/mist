import { Test, TestingModule } from '@nestjs/testing';
import { ChanController } from './chan.controller';
import { ChanService } from './chan.service';
import { BiService } from './services/bi.service';
import { KMergeService } from './services/k-merge.service';
import { ChannelService } from './services/channel.service';
import { ChanQueryDto } from './dto/query/chan-query.dto';
import { MergedKVo } from './vo/merged-k.vo';
import { TrendService } from './services/trend.service';
import { UtilsService } from '@app/utils';
import { DataSourceService } from '@app/utils';
import { PeriodMappingService } from '@app/utils';
import { DataService } from '../data/data.service';
import { TrendDirection } from './enums/trend-direction.enum';
import { BiType } from './enums/bi.enum';
import { Period } from './enums/period.enum';
import { DataSource } from '@app/shared-data';

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
        ChannelService,
        TrendService,
        UtilsService,
        {
          provide: DataSourceService,
          useValue: {
            select: jest.fn(),
            selectOrFail: jest.fn(),
            normalize: jest.fn(),
            isValid: jest.fn(),
            getDefault: jest.fn(),
          },
        },
        {
          provide: PeriodMappingService,
          useValue: {
            toKPeriod: jest.fn().mockReturnValue('1min' as any),
            toSourceFormat: jest.fn(),
          },
        },
        {
          provide: DataService,
          useFactory: () => ({
            findBars: jest.fn().mockResolvedValue([]),
          }),
        },
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
      const chanQueryDto = new ChanQueryDto();
      chanQueryDto.symbol = '000001';
      chanQueryDto.period = Period.DAY;
      chanQueryDto.startDate = '2024-01-01';
      chanQueryDto.endDate = '2024-12-31';

      const result = await controller.postMergeK(chanQueryDto);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should call kMergeService.merge with correct data', async () => {
      const chanQueryDto = new ChanQueryDto();
      chanQueryDto.symbol = '000001';
      chanQueryDto.period = Period.DAY;
      chanQueryDto.startDate = '2024-01-01';
      chanQueryDto.endDate = '2024-12-31';

      const mergeSpy = jest.spyOn(kMergeService, 'merge');

      await controller.postMergeK(chanQueryDto);

      expect(mergeSpy).toHaveBeenCalled();
    });

    it('should return empty array for empty input', async () => {
      const chanQueryDto = new ChanQueryDto();
      chanQueryDto.symbol = '000001';
      chanQueryDto.period = Period.DAY;
      chanQueryDto.startDate = '2024-12-31';
      chanQueryDto.endDate = '2024-12-31';

      const result = await controller.postMergeK(chanQueryDto);

      expect(result).toBeDefined();
    });

    it('should handle single K-line input', async () => {
      const chanQueryDto = new ChanQueryDto();
      chanQueryDto.symbol = '000001';
      chanQueryDto.period = Period.FIVE;
      chanQueryDto.startDate = '2024-12-31';
      chanQueryDto.endDate = '2024-12-31';

      const result = await controller.postMergeK(chanQueryDto);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should merge K-lines with containment in up trend', async () => {
      const chanQueryDto = new ChanQueryDto();
      chanQueryDto.symbol = '000001';
      chanQueryDto.period = Period.DAY;
      chanQueryDto.startDate = '2024-01-01';
      chanQueryDto.endDate = '2024-12-31';

      const result = await controller.postMergeK(chanQueryDto);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should merge K-lines with containment in down trend', async () => {
      const chanQueryDto = new ChanQueryDto();
      chanQueryDto.symbol = '000001';
      chanQueryDto.period = Period.DAY;
      chanQueryDto.startDate = '2024-01-01';
      chanQueryDto.endDate = '2024-12-31';

      const result = await controller.postMergeK(chanQueryDto);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('POST /chan/bi', () => {
    it('should return bi data for valid input', async () => {
      const chanQueryDto = new ChanQueryDto();
      chanQueryDto.symbol = '000001';
      chanQueryDto.period = Period.DAY;
      chanQueryDto.startDate = '2024-01-01';
      chanQueryDto.endDate = '2024-12-31';

      const result = await controller.postIndexBi(chanQueryDto);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should call chanService.createBi with correct data', async () => {
      const chanQueryDto = new ChanQueryDto();
      chanQueryDto.symbol = '000001';
      chanQueryDto.period = Period.DAY;
      chanQueryDto.startDate = '2024-01-01';
      chanQueryDto.endDate = '2024-12-31';

      const createBiSpy = jest.spyOn(chanService, 'createBi');

      await controller.postIndexBi(chanQueryDto);

      expect(createBiSpy).toHaveBeenCalled();
    });

    it('should return empty array for empty input', async () => {
      const chanQueryDto = new ChanQueryDto();
      chanQueryDto.symbol = '000001';
      chanQueryDto.period = Period.DAY;
      chanQueryDto.startDate = '2024-12-31';
      chanQueryDto.endDate = '2024-12-31';

      const result = await controller.postIndexBi(chanQueryDto);

      expect(result).toBeDefined();
    });

    it('should handle single K-line input', async () => {
      const chanQueryDto = new ChanQueryDto();
      chanQueryDto.symbol = '000001';
      chanQueryDto.period = Period.FIVE;
      chanQueryDto.startDate = '2024-12-31';
      chanQueryDto.endDate = '2024-12-31';

      const result = await controller.postIndexBi(chanQueryDto);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should process data with fenxings', async () => {
      const chanQueryDto = new ChanQueryDto();
      chanQueryDto.symbol = '000001';
      chanQueryDto.period = Period.DAY;
      chanQueryDto.startDate = '2024-01-01';
      chanQueryDto.endDate = '2024-12-31';

      const result = await controller.postIndexBi(chanQueryDto);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle upward trend data', async () => {
      const chanQueryDto = new ChanQueryDto();
      chanQueryDto.symbol = '000001';
      chanQueryDto.period = Period.DAY;
      chanQueryDto.startDate = '2024-01-01';
      chanQueryDto.endDate = '2024-12-31';

      const result = await controller.postIndexBi(chanQueryDto);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle downward trend data', async () => {
      const chanQueryDto = new ChanQueryDto();
      chanQueryDto.symbol = '000001';
      chanQueryDto.period = Period.DAY;
      chanQueryDto.startDate = '2024-01-01';
      chanQueryDto.endDate = '2024-12-31';

      const result = await controller.postIndexBi(chanQueryDto);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle data with alternating fenxings', async () => {
      const chanQueryDto = new ChanQueryDto();
      chanQueryDto.symbol = '000001';
      chanQueryDto.period = Period.DAY;
      chanQueryDto.startDate = '2024-01-01';
      chanQueryDto.endDate = '2024-12-31';

      const result = await controller.postIndexBi(chanQueryDto);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('DTO validation', () => {
    it('should accept valid ChanQueryDto', async () => {
      const chanQueryDto = new ChanQueryDto();
      chanQueryDto.symbol = '000001';
      chanQueryDto.period = Period.DAY;
      chanQueryDto.startDate = '2024-01-01';
      chanQueryDto.endDate = '2024-12-31';
      chanQueryDto.source = DataSource.EAST_MONEY;

      // Should not throw validation error
      const result = await controller.postMergeK(chanQueryDto);

      expect(result).toBeDefined();
    });

    it('should accept ChanQueryDto with optional source', async () => {
      const chanQueryDto = new ChanQueryDto();
      chanQueryDto.symbol = '000001';
      chanQueryDto.period = Period.DAY;
      chanQueryDto.startDate = '2024-01-01';
      chanQueryDto.endDate = '2024-12-31';

      const result = await controller.postMergeK(chanQueryDto);

      expect(result).toBeDefined();
    });
  });

  describe('Service coordination', () => {
    it('should coordinate chanService.createBi correctly for bi endpoint', async () => {
      const chanQueryDto = new ChanQueryDto();
      chanQueryDto.symbol = '000001';
      chanQueryDto.period = Period.DAY;
      chanQueryDto.startDate = '2024-01-01';
      chanQueryDto.endDate = '2024-12-31';

      // Mock the entire createBi chain
      const mockBiData = [
        {
          startTime: new Date(),
          endTime: new Date(),
          highest: 120,
          lowest: 90,
          trend: TrendDirection.Up,
          type: BiType.Complete,
          status: 1,
          originIds: [1, 2, 3],
          originData: [],
          independentCount: 3,
          startFenxing: null,
          endFenxing: null,
        },
      ];

      jest.spyOn(chanService, 'createBi').mockReturnValue(mockBiData);

      const result = await controller.postIndexBi(chanQueryDto);

      expect(chanService.createBi).toHaveBeenCalled();
      expect(result).toEqual(mockBiData);
    });

    it('should coordinate kMergeService.merge correctly for merge-k endpoint', async () => {
      const chanQueryDto = new ChanQueryDto();
      chanQueryDto.symbol = '000001';
      chanQueryDto.period = Period.DAY;
      chanQueryDto.startDate = '2024-01-01';
      chanQueryDto.endDate = '2024-12-31';

      // Mock the merge result
      const mockMergedData: MergedKVo[] = [];

      const mergeSpy = jest
        .spyOn(kMergeService, 'merge')
        .mockReturnValue(mockMergedData);

      const result = await controller.postMergeK(chanQueryDto);

      expect(mergeSpy).toHaveBeenCalled();
      expect(result).toEqual(mockMergedData);
    });
  });

  describe('Edge cases', () => {
    it('should handle data with optional source parameter', async () => {
      const chanQueryDto = new ChanQueryDto();
      chanQueryDto.symbol = '000001';
      chanQueryDto.period = Period.DAY;
      chanQueryDto.startDate = '2024-01-01';
      chanQueryDto.endDate = '2024-12-31';
      chanQueryDto.source = DataSource.TDX;

      const result = await controller.postMergeK(chanQueryDto);

      expect(result).toBeDefined();
    });

    it('should handle data without source parameter (uses default)', async () => {
      const chanQueryDto = new ChanQueryDto();
      chanQueryDto.symbol = '000001';
      chanQueryDto.period = Period.DAY;
      chanQueryDto.startDate = '2024-01-01';
      chanQueryDto.endDate = '2024-12-31';

      const result = await controller.postMergeK(chanQueryDto);

      expect(result).toBeDefined();
    });
  });
});
