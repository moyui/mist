import { Test, TestingModule } from '@nestjs/testing';
import { IndicatorMcpService } from './indicator-mcp.service';
import { IndicatorService } from '../../../mist/src/indicator/indicator.service';

describe('IndicatorMcpService', () => {
  let service: IndicatorMcpService;
  let indicatorService: IndicatorService;

  const mockPrices = [100, 102, 101, 103, 105, 104, 106, 108, 107, 109];
  const mockHighs = [102, 104, 103, 105, 107, 106, 108, 110, 109, 111];
  const mockLows = [98, 100, 99, 101, 103, 102, 104, 106, 105, 107];
  const mockCloses = mockPrices;

  const mockMACDResult = {
    nbElement: 10,
    data: { macd: [1, 2], signal: [0.5, 1.5], hist: [0.5, 0.5] },
  };

  const mockRSIResult = { nbElement: 10, data: [50, 55, 60] };
  const mockKDJResult = { nbElement: 10, k: [80], d: [75], j: [90] };
  const mockADXResult = [20, 22, 25];
  const mockATRResult = [10, 12, 11];

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IndicatorMcpService,
        {
          provide: IndicatorService,
          useValue: {
            runMACD: jest.fn(),
            runRSI: jest.fn(),
            runKDJ: jest.fn(),
            runADX: jest.fn(),
            runATR: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<IndicatorMcpService>(IndicatorMcpService);
    indicatorService = module.get<IndicatorService>(IndicatorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('calculateMacd', () => {
    it('should calculate MACD', async () => {
      jest
        .spyOn(indicatorService, 'runMACD')
        .mockResolvedValue(mockMACDResult as any);

      const result = (await service.calculateMacd(mockPrices)) as any;
      expect(result.success).toBe(true);
      expect(result.data.data).toEqual(mockMACDResult);
      expect(result.data.params).toEqual({
        fastPeriod: 12,
        slowPeriod: 26,
        signalPeriod: 9,
      });
    });

    it('should return error for empty prices array', async () => {
      const result = (await service.calculateMacd([])) as any;
      expect(result.success).toBe(false);
      expect(result.error.message).toContain('at least 1 element');
    });

    it('should return error for invalid prices (NaN)', async () => {
      const result = (await service.calculateMacd([100, NaN, 105])) as any;
      expect(result.success).toBe(false);
      expect(result.error.message).toContain('not a valid number');
    });
  });

  describe('calculateRsi', () => {
    it('should calculate RSI with default period', async () => {
      jest
        .spyOn(indicatorService, 'runRSI')
        .mockResolvedValue(mockRSIResult as any);

      const result = (await service.calculateRsi(mockPrices)) as any;
      expect(result.success).toBe(true);
      expect(result.data.data).toEqual(mockRSIResult);
      expect(result.data.params).toEqual({ period: 14 });
    });

    it('should calculate RSI with custom period', async () => {
      jest
        .spyOn(indicatorService, 'runRSI')
        .mockResolvedValue(mockRSIResult as any);

      const result = (await service.calculateRsi(mockPrices, 20)) as any;
      expect(result.success).toBe(true);
      expect(result.data.data).toEqual(mockRSIResult);
      expect(result.data.params).toEqual({ period: 20 });
    });
  });

  describe('calculateKdj', () => {
    it('should calculate KDJ with default parameters', async () => {
      jest
        .spyOn(indicatorService, 'runKDJ')
        .mockResolvedValue(mockKDJResult as any);

      const result = (await service.calculateKdj(
        mockHighs,
        mockLows,
        mockCloses,
      )) as any;
      expect(result.success).toBe(true);
      expect(result.data.data).toEqual(mockKDJResult);
      expect(result.data.params).toEqual({
        period: 9,
        kSmoothing: 3,
        dSmoothing: 3,
      });
    });

    it('should calculate KDJ with custom parameters', async () => {
      jest
        .spyOn(indicatorService, 'runKDJ')
        .mockResolvedValue(mockKDJResult as any);

      const result = (await service.calculateKdj(
        mockHighs,
        mockLows,
        mockCloses,
        14,
        5,
        5,
      )) as any;
      expect(result.success).toBe(true);
      expect(result.data.data).toEqual(mockKDJResult);
      expect(result.data.params).toEqual({
        period: 14,
        kSmoothing: 5,
        dSmoothing: 5,
      });
    });
  });

  describe('calculateAdx', () => {
    it('should calculate ADX with default period', async () => {
      jest
        .spyOn(indicatorService, 'runADX')
        .mockResolvedValue(mockADXResult as any);

      const result = (await service.calculateAdx(
        mockHighs,
        mockLows,
        mockCloses,
      )) as any;
      expect(result.success).toBe(true);
      expect(result.data.data).toEqual(mockADXResult);
      expect(result.data.params).toEqual({ period: 14 });
    });

    it('should calculate ADX with custom period', async () => {
      jest
        .spyOn(indicatorService, 'runADX')
        .mockResolvedValue(mockADXResult as any);

      const result = (await service.calculateAdx(
        mockHighs,
        mockLows,
        mockCloses,
        20,
      )) as any;
      expect(result.success).toBe(true);
      expect(result.data.data).toEqual(mockADXResult);
      expect(result.data.params).toEqual({ period: 20 });
    });
  });

  describe('calculateAtr', () => {
    it('should calculate ATR with default period', async () => {
      jest
        .spyOn(indicatorService, 'runATR')
        .mockResolvedValue(mockATRResult as any);

      const result = (await service.calculateAtr(
        mockHighs,
        mockLows,
        mockCloses,
      )) as any;
      expect(result.success).toBe(true);
      expect(result.data.data).toEqual(mockATRResult);
      expect(result.data.params).toEqual({ period: 14 });
    });

    it('should calculate ATR with custom period', async () => {
      jest
        .spyOn(indicatorService, 'runATR')
        .mockResolvedValue(mockATRResult as any);

      const result = (await service.calculateAtr(
        mockHighs,
        mockLows,
        mockCloses,
        20,
      )) as any;
      expect(result.success).toBe(true);
      expect(result.data.data).toEqual(mockATRResult);
      expect(result.data.params).toEqual({ period: 20 });
    });
  });

  describe('analyzeIndicators', () => {
    it('should calculate all indicators', async () => {
      jest
        .spyOn(indicatorService, 'runMACD')
        .mockResolvedValue(mockMACDResult as any);
      jest
        .spyOn(indicatorService, 'runRSI')
        .mockResolvedValue(mockRSIResult as any);
      jest
        .spyOn(indicatorService, 'runKDJ')
        .mockResolvedValue(mockKDJResult as any);
      jest
        .spyOn(indicatorService, 'runADX')
        .mockResolvedValue(mockADXResult as any);
      jest
        .spyOn(indicatorService, 'runATR')
        .mockResolvedValue(mockATRResult as any);

      const result = (await service.analyzeIndicators(
        mockHighs,
        mockLows,
        mockCloses,
      )) as any;
      expect(result.success).toBe(true);
      expect(result.data.data.macd.data).toEqual(mockMACDResult);
      expect(result.data.data.rsi.data).toEqual(mockRSIResult);
      expect(result.data.data.kdj.data).toEqual(mockKDJResult);
      expect(result.data.data.adx.data).toEqual(mockADXResult);
      expect(result.data.data.atr.data).toEqual(mockATRResult);
      expect(result.data.summary.indicatorsCalculated).toBe(5);
    });
  });
});
