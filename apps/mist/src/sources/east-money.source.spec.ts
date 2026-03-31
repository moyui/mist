import { Test, TestingModule } from '@nestjs/testing';
import { EastMoneySource } from './east-money.source';
import { AxiosInstance } from 'axios';
import { KFetchParams } from './source-fetcher.interface';
import { Period } from '@app/shared-data';
import { UtilsService, PeriodMappingService } from '@app/utils';

describe('EastMoneySource', () => {
  let service: EastMoneySource;
  let axiosInstance: jest.Mocked<AxiosInstance>;

  beforeEach(async () => {
    const mockAxiosInstance = {
      get: jest.fn(),
    } as unknown as jest.Mocked<AxiosInstance>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EastMoneySource,
        {
          provide: UtilsService,
          useFactory: () => ({
            createAxiosInstance: jest.fn(() => mockAxiosInstance),
          }),
        },
        {
          provide: PeriodMappingService,
          useValue: {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            toSourceFormat: jest.fn((period: Period) => {
              if (period === Period.ONE_MIN) return '1';
              if (period === Period.FIVE_MIN) return '5';
              if (period === Period.FIFTEEN_MIN) return '15';
              if (period === Period.THIRTY_MIN) return '30';
              if (period === Period.SIXTY_MIN) return '60';
              if (period === Period.DAY) return 'daily';
              if (period === Period.WEEK) return '1w';
              if (period === Period.MONTH) return '1M';
              return '1';
            }),
            isSupported: jest.fn(() => {
              return true;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<EastMoneySource>(EastMoneySource);
    axiosInstance = mockAxiosInstance;
  });

  describe('fetchK - period (minute-level)', () => {
    const mockParams: KFetchParams = {
      code: '000001',
      formatCode: 'sh000001',
      period: Period.ONE_MIN,
      startDate: new Date('2024-01-01T00:00:00.000Z'),
      endDate: new Date('2024-01-01T23:59:59.000Z'),
    };

    const mockPeriodResponseData = [
      {
        时间: '2024-01-01T00:00:00.000Z',
        开盘: 100.0,
        最高: 101.5,
        最低: 99.5,
        收盘: 101.0,
        成交量: 1000000,
        成交额: 100500000,
      },
      {
        时间: '2024-01-01T00:01:00.000Z',
        开盘: 101.0,
        最高: 102.0,
        最低: 100.5,
        收盘: 101.5,
        成交量: 1200000,
        成交额: 0,
      },
    ];

    it('should fetch minute-level K-line data via index_zh_a_hist_min_em', async () => {
      axiosInstance.get.mockResolvedValueOnce({
        data: mockPeriodResponseData,
      });

      const result = await service.fetchK(mockParams);

      expect(axiosInstance.get).toHaveBeenCalledWith(
        '/api/public/index_zh_a_hist_min_em',
        {
          params: {
            symbol: '000001',
            period: '1',
            start_date: '2024-01-01 08:00:00',
            end_date: '2024-01-02 07:59:59',
          },
        },
      );

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        timestamp: new Date('2024-01-01T00:00:00.000Z'),
        open: 100.0,
        high: 101.5,
        low: 99.5,
        close: 101.0,
        volume: 1000000,
        amount: 100500000,
        period: Period.ONE_MIN,
      });
    });

    it('should handle response with zero 成交额 as undefined amount', async () => {
      const responseWithZeroAmount = [
        {
          时间: '2024-01-01T00:00:00.000Z',
          开盘: 100.0,
          最高: 101.5,
          最低: 99.5,
          收盘: 101.0,
          成交量: 1000000,
          成交额: 0,
        },
      ];

      axiosInstance.get.mockResolvedValueOnce({
        data: responseWithZeroAmount,
      });

      const result = await service.fetchK(mockParams);

      expect(result[0].amount).toBeUndefined();
    });

    it('should throw error for invalid response format', async () => {
      axiosInstance.get.mockResolvedValueOnce({
        data: 'invalid format',
      });

      await expect(service.fetchK(mockParams)).rejects.toThrow(
        'Invalid response from East Money period API: "invalid format"',
      );
    });

    it('should handle API errors', async () => {
      axiosInstance.get.mockRejectedValueOnce(new Error('Network error'));

      await expect(service.fetchK(mockParams)).rejects.toThrow('Network error');
    });
  });

  describe('fetchK - daily', () => {
    const mockParams: KFetchParams = {
      code: '000001',
      formatCode: 'sh000001',
      period: Period.DAY,
      startDate: new Date('2024-01-01T00:00:00.000Z'),
      endDate: new Date('2024-01-31T23:59:59.000Z'),
    };

    const mockDailyResponseData = [
      {
        date: '2024-01-02',
        open: 3000.0,
        high: 3050.0,
        low: 2980.0,
        close: 3020.0,
        volume: 5000000,
        amount: 500000000,
      },
    ];

    it('should fetch daily K-line data via stock_zh_index_daily_em', async () => {
      axiosInstance.get.mockResolvedValueOnce({
        data: mockDailyResponseData,
      });

      const result = await service.fetchK(mockParams);

      expect(axiosInstance.get).toHaveBeenCalledWith(
        '/api/public/stock_zh_index_daily_em',
        {
          params: {
            symbol: 'sh000001',
            start_date: '20240101',
            end_date: '20240201',
          },
        },
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        timestamp: new Date('2024-01-02'),
        open: 3000.0,
        high: 3050.0,
        low: 2980.0,
        close: 3020.0,
        volume: 5000000,
        amount: 500000000,
        period: Period.DAY,
      });
    });

    it('should throw error for invalid daily response format', async () => {
      axiosInstance.get.mockResolvedValueOnce({
        data: null,
      });

      await expect(service.fetchK(mockParams)).rejects.toThrow(
        'Invalid response from East Money daily API',
      );
    });

    it('should return empty array for empty daily response', async () => {
      axiosInstance.get.mockResolvedValueOnce({
        data: [],
      });

      const result = await service.fetchK(mockParams);
      expect(result).toEqual([]);
    });
  });

  describe('isSupportedPeriod', () => {
    it('should return true for supported periods', () => {
      expect(service.isSupportedPeriod(Period.ONE_MIN)).toBe(true);
      expect(service.isSupportedPeriod(Period.FIVE_MIN)).toBe(true);
      expect(service.isSupportedPeriod(Period.FIFTEEN_MIN)).toBe(true);
      expect(service.isSupportedPeriod(Period.THIRTY_MIN)).toBe(true);
      expect(service.isSupportedPeriod(Period.SIXTY_MIN)).toBe(true);
      expect(service.isSupportedPeriod(Period.DAY)).toBe(true);
      expect(service.isSupportedPeriod(Period.WEEK)).toBe(true);
      expect(service.isSupportedPeriod(Period.MONTH)).toBe(true);
      expect(service.isSupportedPeriod(Period.QUARTER)).toBe(true);
      expect(service.isSupportedPeriod(Period.YEAR)).toBe(true);
    });
  });
});
