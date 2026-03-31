import { Test, TestingModule } from '@nestjs/testing';
import { ChanController } from './chan.controller';
import { ChanService } from './chan.service';
import { BiService } from './services/bi.service';
import { KMergeService } from './services/k-merge.service';
import { ChannelService } from './services/channel.service';
import { KLineFixtures } from '@test-data/fixtures/patterns/k-line-fixtures';
import { ChanQueryDto } from './dto/query/chan-query.dto';
import { TrendService } from './services/trend.service';
import { IndicatorService } from '../indicator/indicator.service';
import { PeriodMappingService, UtilsService } from '@app/utils';
import { Period } from '@app/shared-data';
import { DataSource } from '@app/shared-data';
import { TimezoneService } from '@app/timezone';

describe('ChanController', () => {
  let controller: ChanController;
  let chanService: ChanService;
  let kMergeService: KMergeService;
  let indicatorService: IndicatorService;

  const mockKData = KLineFixtures.upTrend();

  const mockKEntities: any[] = mockKData.map((k, index) => ({
    id: index + 1,
    security: { code: '000001' },
    timestamp: k.time,
    period: Period.ONE_MIN,
    source: DataSource.EAST_MONEY,
    open: k.open,
    high: k.highest,
    low: k.lowest,
    close: k.close,
    amount: k.amount,
  }));

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ChanController],
      providers: [
        ChanService,
        BiService,
        KMergeService,
        ChannelService,
        TrendService,
        {
          provide: IndicatorService,
          useValue: {
            findKData: jest.fn().mockResolvedValue(mockKEntities),
          },
        },
        {
          provide: PeriodMappingService,
          useValue: {
            toKPeriod: jest.fn().mockReturnValue(Period.ONE_MIN),
          },
        },
        {
          provide: UtilsService,
          useValue: {
            // Mock UtilsService methods if needed
          },
        },
        {
          provide: TimezoneService,
          useValue: {
            getCurrentBeijingTime: jest.fn().mockReturnValue(new Date()),
          },
        },
      ],
    }).compile();

    controller = module.get<ChanController>(ChanController);
    chanService = module.get<ChanService>(ChanService);
    kMergeService = module.get<KMergeService>(KMergeService);
    indicatorService = module.get<IndicatorService>(IndicatorService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('POST /chan/merge-k', () => {
    let chanQueryDto: ChanQueryDto;

    beforeEach(() => {
      chanQueryDto = new ChanQueryDto();
      chanQueryDto.symbol = '000001';
      chanQueryDto.period = Period.ONE_MIN;
    });

    it('should return merged K-lines for valid input', async () => {
      const result = await controller.postMergeK(chanQueryDto);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(indicatorService.findKData).toHaveBeenCalled();
    });

    it('should call kMergeService.merge with correct data', async () => {
      const mergeSpy = jest.spyOn(kMergeService, 'merge');

      await controller.postMergeK(chanQueryDto);

      expect(mergeSpy).toHaveBeenCalled();
      expect(indicatorService.findKData).toHaveBeenCalledWith({
        symbol: '000001',
        period: Period.ONE_MIN,
        startDate: expect.any(Date),
        endDate: expect.any(Date),
        source: undefined,
      });
    });

    it('should return empty array for empty input', async () => {
      jest.spyOn(indicatorService, 'findKData').mockResolvedValue([]);

      const result = await controller.postMergeK(chanQueryDto);

      expect(result).toEqual([]);
    });

    it('should handle single K-line input', async () => {
      const singleK = [KLineFixtures.single()[0]];
      const mockSingleK: any[] = [
        {
          id: 1,
          security: { code: '000001' },
          timestamp: singleK[0].time,
          period: Period.ONE_MIN,
          source: DataSource.EAST_MONEY,
          open: singleK[0].open,
          high: singleK[0].highest,
          low: singleK[0].lowest,
          close: singleK[0].close,
          amount: singleK[0].amount,
        },
      ];
      jest.spyOn(indicatorService, 'findKData').mockResolvedValue(mockSingleK);

      const result = await controller.postMergeK(chanQueryDto);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should merge K-lines with containment in up trend', async () => {
      const kData = KLineFixtures.withContainmentUpTrend();
      const mockK: any[] = kData.map((k, index) => ({
        id: index + 1,
        security: { code: '000001' },
        timestamp: k.time,
        period: Period.ONE_MIN,
        source: DataSource.EAST_MONEY,
        open: k.open,
        high: k.highest,
        low: k.lowest,
        close: k.close,
        amount: k.amount,
      }));
      jest.spyOn(indicatorService, 'findKData').mockResolvedValue(mockK);

      const result = await controller.postMergeK(chanQueryDto);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should merge K-lines with containment in down trend', async () => {
      const kData = KLineFixtures.withContainmentDownTrend();
      const mockK: any[] = kData.map((k, index) => ({
        id: index + 1,
        security: { code: '000001' },
        timestamp: k.time,
        period: Period.ONE_MIN,
        source: DataSource.EAST_MONEY,
        open: k.open,
        high: k.highest,
        low: k.lowest,
        close: k.close,
        amount: k.amount,
      }));
      jest.spyOn(indicatorService, 'findKData').mockResolvedValue(mockK);

      const result = await controller.postMergeK(chanQueryDto);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('POST /chan/bi', () => {
    let chanQueryDto: ChanQueryDto;

    beforeEach(() => {
      chanQueryDto = new ChanQueryDto();
      chanQueryDto.symbol = '000001';
      chanQueryDto.period = Period.ONE_MIN;
    });

    it('should return Bi (strokes) for valid K-line data', async () => {
      const result = await controller.postIndexBi(chanQueryDto);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should call chanService.createBi with correct data', async () => {
      const createBiSpy = jest.spyOn(chanService, 'createBi');

      await controller.postIndexBi(chanQueryDto);

      expect(createBiSpy).toHaveBeenCalled();
    });

    it('should return empty array for empty input', async () => {
      jest.spyOn(indicatorService, 'findKData').mockResolvedValue([]);

      const result = await controller.postIndexBi(chanQueryDto);

      expect(result).toEqual([]);
    });

    it('should handle single K-line input', async () => {
      const singleK = [KLineFixtures.single()[0]];
      const mockSingleK: any[] = [
        {
          id: 1,
          security: { code: '000001' },
          timestamp: singleK[0].time,
          period: Period.ONE_MIN,
          source: DataSource.EAST_MONEY,
          open: singleK[0].open,
          high: singleK[0].highest,
          low: singleK[0].lowest,
          close: singleK[0].close,
          amount: singleK[0].amount,
        },
      ];
      jest.spyOn(indicatorService, 'findKData').mockResolvedValue(mockSingleK);

      const result = await controller.postIndexBi(chanQueryDto);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should detect up trend Bi', async () => {
      const kData = KLineFixtures.upTrend();
      const mockK: any[] = kData.map((k, index) => ({
        id: index + 1,
        security: { code: '000001' },
        timestamp: k.time,
        period: Period.ONE_MIN,
        source: DataSource.EAST_MONEY,
        open: k.open,
        high: k.highest,
        low: k.lowest,
        close: k.close,
        amount: k.amount,
      }));
      jest.spyOn(indicatorService, 'findKData').mockResolvedValue(mockK);

      const result = await controller.postIndexBi(chanQueryDto);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should detect down trend Bi', async () => {
      const kData = KLineFixtures.downTrend();
      const mockK: any[] = kData.map((k, index) => ({
        id: index + 1,
        security: { code: '000001' },
        timestamp: k.time,
        period: Period.ONE_MIN,
        source: DataSource.EAST_MONEY,
        open: k.open,
        high: k.highest,
        low: k.lowest,
        close: k.close,
        amount: k.amount,
      }));
      jest.spyOn(indicatorService, 'findKData').mockResolvedValue(mockK);

      const result = await controller.postIndexBi(chanQueryDto);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle Bi with complete data', async () => {
      const kData = KLineFixtures.completeBi();
      const mockK: any[] = kData.map((k: any, index: number) => ({
        id: index + 1,
        security: { code: '000001' },
        timestamp: k.time,
        period: Period.ONE_MIN,
        source: DataSource.EAST_MONEY,
        open: k.open,
        high: k.highest,
        low: k.lowest,
        close: k.close,
        amount: k.amount,
      }));
      jest.spyOn(indicatorService, 'findKData').mockResolvedValue(mockK);

      const result = await controller.postIndexBi(chanQueryDto);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('POST /chan/fenxing', () => {
    let chanQueryDto: ChanQueryDto;

    beforeEach(() => {
      chanQueryDto = new ChanQueryDto();
      chanQueryDto.symbol = '000001';
      chanQueryDto.period = Period.ONE_MIN;
    });

    it('should return fenxings (fractals) for valid K-line data', async () => {
      const result = await controller.postFenxing(chanQueryDto);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should call chanService.getFenxings with correct data', async () => {
      const getFenxingsSpy = jest.spyOn(chanService, 'getFenxings');

      await controller.postFenxing(chanQueryDto);

      expect(getFenxingsSpy).toHaveBeenCalled();
    });

    it('should return empty array for empty input', async () => {
      jest.spyOn(indicatorService, 'findKData').mockResolvedValue([]);

      const result = await controller.postFenxing(chanQueryDto);

      expect(result).toEqual([]);
    });
  });

  describe('POST /chan/channel', () => {
    let chanQueryDto: ChanQueryDto;

    beforeEach(() => {
      chanQueryDto = new ChanQueryDto();
      chanQueryDto.symbol = '000001';
      chanQueryDto.period = Period.ONE_MIN;
    });

    it('should return channels for valid K-line data', async () => {
      const result = await controller.postChannel(chanQueryDto);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should call channelService.createChannel with correct data', async () => {
      const createChannelSpy = jest.spyOn(
        controller['channelService'],
        'createChannel',
      );

      await controller.postChannel(chanQueryDto);

      expect(createChannelSpy).toHaveBeenCalled();
    });

    it('should throw error for empty input (ChannelService requires Bi data)', async () => {
      jest.spyOn(indicatorService, 'findKData').mockResolvedValue([]);

      await expect(controller.postChannel(chanQueryDto)).rejects.toThrow(
        'Invalid input: bi array cannot be empty',
      );
    });
  });
});
