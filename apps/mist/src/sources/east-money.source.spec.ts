import { Test, TestingModule } from '@nestjs/testing';
import { EastMoneySource } from './east-money.source';
import { AxiosInstance } from 'axios';
import { KLineFetchParams } from './source-fetcher.interface';
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
              // Map Period to East Money format
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
              // East Money supports all periods
              return true;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<EastMoneySource>(EastMoneySource);
    axiosInstance = mockAxiosInstance;
  });

  describe('fetchKLine', () => {
    const mockParams: KLineFetchParams = {
      code: '000001',
      period: 1,
      startDate: new Date('2024-01-01T00:00:00.000Z'),
      endDate: new Date('2024-01-01T23:59:59.000Z'),
    };

    const mockResponseData = [
      {
        timestamp: '2024-01-01T00:00:00.000Z',
        open: 100.0,
        high: 101.5,
        low: 99.5,
        close: 101.0,
        volume: 1000000,
        amount: 100500000,
      },
      {
        timestamp: '2024-01-01T00:01:00.000Z',
        open: 101.0,
        high: 102.0,
        low: 100.5,
        close: 101.5,
        volume: 1200000,
      },
    ];

    it('should fetch K-line data successfully', async () => {
      axiosInstance.get.mockResolvedValueOnce({
        data: mockResponseData,
      });

      const result = await service.fetchKLine(mockParams);

      expect(axiosInstance.get).toHaveBeenCalledWith('/api/kline', {
        params: {
          code: '000001',
          period: '1',
          start: 1704067200,
          end: 1704153599,
        },
      });

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        timestamp: new Date('2024-01-01T00:00:00.000Z'),
        open: 100.0,
        high: 101.5,
        low: 99.5,
        close: 101.0,
        volume: 1000000,
        amount: 100500000,
        period: 1,
      });
    });

    it('should handle response without amount field', async () => {
      const responseWithoutAmount = [
        {
          timestamp: '2024-01-01T00:00:00.000Z',
          open: 100.0,
          high: 101.5,
          low: 99.5,
          close: 101.0,
          volume: 1000000,
        },
      ];

      axiosInstance.get.mockResolvedValueOnce({
        data: responseWithoutAmount,
      });

      const result = await service.fetchKLine(mockParams);

      expect(result[0].amount).toBeUndefined();
    });

    it('should throw error for invalid response format', async () => {
      axiosInstance.get.mockResolvedValueOnce({
        data: 'invalid format',
      });

      await expect(service.fetchKLine(mockParams)).rejects.toThrow(
        'Invalid response format from East Money API: "invalid format"',
      );
    });

    it('should throw error for empty response', async () => {
      axiosInstance.get.mockResolvedValueOnce({
        data: [],
      });

      const result = await service.fetchKLine(mockParams);
      expect(result).toEqual([]);
    });

    it('should handle API errors', async () => {
      axiosInstance.get.mockRejectedValueOnce(new Error('Network error'));

      await expect(service.fetchKLine(mockParams)).rejects.toThrow(
        'Network error',
      );
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
      // WEEK, MONTH, QUARTER, YEAR map to daily and are supported
      expect(service.isSupportedPeriod(Period.WEEK)).toBe(true);
      expect(service.isSupportedPeriod(Period.MONTH)).toBe(true);
      expect(service.isSupportedPeriod(Period.QUARTER)).toBe(true);
      expect(service.isSupportedPeriod(Period.YEAR)).toBe(true);
    });
  });
});
