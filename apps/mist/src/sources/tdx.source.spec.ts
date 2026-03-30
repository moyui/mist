import { Test, TestingModule } from '@nestjs/testing';
import { TdxSource } from './tdx.source';
import { AxiosInstance } from 'axios';
import { KLineFetchParams } from './source-fetcher.interface';
import { Period } from '@app/shared-data';
import { UtilsService, PeriodMappingService } from '@app/utils';

describe('TdxSource', () => {
  let service: TdxSource;

  beforeEach(async () => {
    const mockAxiosInstance = {
      get: jest.fn(),
    } as unknown as jest.Mocked<AxiosInstance>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TdxSource,
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
            toSourceFormat: jest.fn((period: Period, _source) => {
              // Map Period to TDX format, throw error for unsupported periods
              if (period === Period.ONE_MIN) return '1m';
              if (period === Period.FIVE_MIN) return '5m';
              if (period === Period.FIFTEEN_MIN) return '15m';
              if (period === Period.THIRTY_MIN) return '30m';
              if (period === Period.SIXTY_MIN) return '60m';
              if (period === Period.DAY) return '1d';
              if (period === Period.WEEK) return '1w';
              if (period === Period.MONTH) return '1M';
              throw new Error(
                `Data source ${_source} does not support period ${period}`,
              );
            }),
            isSupported: jest.fn((period: Period) => {
              // TDX supports: ONE_MIN, FIVE_MIN, FIFTEEN_MIN, THIRTY_MIN, SIXTY_MIN, DAY, WEEK, MONTH
              return [
                Period.ONE_MIN,
                Period.FIVE_MIN,
                Period.FIFTEEN_MIN,
                Period.THIRTY_MIN,
                Period.SIXTY_MIN,
                Period.DAY,
                Period.WEEK,
                Period.MONTH,
              ].includes(period);
            }),
          },
        },
      ],
    }).compile();

    service = module.get<TdxSource>(TdxSource);
  });

  describe('fetchKLine', () => {
    const mockParams: KLineFetchParams = {
      code: '000001',
      period: 1,
      startDate: new Date('2024-01-01T00:00:00.000Z'),
      endDate: new Date('2024-01-01T23:59:59.000Z'),
    };

    it('should return empty array for now (API not implemented)', async () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      const result = await service.fetchKLine(mockParams);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'TDX API call not yet implemented for code: 000001, period: 1m',
      );
      expect(result).toEqual([]);

      consoleWarnSpy.mockRestore();
    });

    it('should handle API errors when implemented', async () => {
      // This test will be updated when the actual API is implemented
      const result = await service.fetchKLine(mockParams);
      expect(result).toEqual([]);
    });
  });

  describe('isSupportedPeriod', () => {
    it('should return true for directly supported periods', () => {
      expect(service.isSupportedPeriod(Period.ONE_MIN)).toBe(true); // 1m
      expect(service.isSupportedPeriod(Period.FIVE_MIN)).toBe(true); // 5m
      expect(service.isSupportedPeriod(Period.FIFTEEN_MIN)).toBe(true); // 15m
      expect(service.isSupportedPeriod(Period.THIRTY_MIN)).toBe(true); // 30m
      expect(service.isSupportedPeriod(Period.SIXTY_MIN)).toBe(true); // 60m
      expect(service.isSupportedPeriod(Period.DAY)).toBe(true); // 1d
      expect(service.isSupportedPeriod(Period.WEEK)).toBe(true); // 1w
      expect(service.isSupportedPeriod(Period.MONTH)).toBe(true); // 1M
    });

    it('should return false for unsupported periods', () => {
      expect(service.isSupportedPeriod(Period.QUARTER)).toBe(false); // not in TDX mapping
      expect(service.isSupportedPeriod(Period.YEAR)).toBe(false); // not in TDX mapping
    });
  });
});
