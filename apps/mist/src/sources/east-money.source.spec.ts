import { Test, TestingModule } from '@nestjs/testing';
import { EastMoneySource } from './east-money.source';
import { AxiosInstance } from 'axios';
import { KLineFetchParams } from '../data-collector';
import { Period } from '../chan/enums/period.enum';
import { UtilsService } from '@app/utils';

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
      ],
    })
      .compile();

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
        'Failed to fetch K-line data from East Money API: Network error',
      );
    });
  });

  describe('isSupportedPeriod', () => {
    it('should return true for supported periods', () => {
      expect(service.isSupportedPeriod(Period.One)).toBe(true);
      expect(service.isSupportedPeriod(Period.FIVE)).toBe(true);
      expect(service.isSupportedPeriod(Period.FIFTEEN)).toBe(true);
      expect(service.isSupportedPeriod(Period.THIRTY)).toBe(true);
      expect(service.isSupportedPeriod(Period.SIXTY)).toBe(true);
      expect(service.isSupportedPeriod(Period.DAY)).toBe(true);
      expect(service.isSupportedPeriod(Period.WEEK)).toBe(true);
      expect(service.isSupportedPeriod(Period.MONTH)).toBe(true);
    });

    it('should return false for unsupported periods', () => {
      expect(service.isSupportedPeriod(Period.QUARTER)).toBe(false);
      expect(service.isSupportedPeriod(Period.YEAR)).toBe(false);
    });
  });

  describe('getPeriodFormat', () => {
    it('should return correct period format', () => {
      expect(service.getPeriodFormat(Period.One)).toBe('1');
      expect(service.getPeriodFormat(Period.FIVE)).toBe('5');
      expect(service.getPeriodFormat(Period.DAY)).toBe('daily');
      expect(service.getPeriodFormat(Period.WEEK)).toBe('weekly');
      expect(service.getPeriodFormat(Period.MONTH)).toBe('monthly');
    });

    it('should throw error for unsupported period', () => {
      expect(() => service.getPeriodFormat(Period.QUARTER)).toThrow(
        `Data source ef does not support period quarterly`,
      );
    });
  });
});