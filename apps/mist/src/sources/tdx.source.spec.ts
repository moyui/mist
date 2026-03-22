import { Test, TestingModule } from '@nestjs/testing';
import { TdxSource } from './tdx.source';
import { AxiosInstance } from 'axios';
import { KLineFetchParams } from '../collector/interfaces/source-fetcher.interface';
import { Period } from '../chan/enums/period.enum';
import { UtilsService, PeriodMappingService } from '@app/utils';
import { KPeriod } from '@app/shared-data';

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
            toSourceFormat: jest.fn((kPeriod: KPeriod, _source) => {
              // Map KPeriod to TDX format, throw error for unsupported periods
              if (kPeriod === KPeriod.ONE_MIN) return '1m';
              if (kPeriod === KPeriod.FIVE_MIN) return '5m';
              if (kPeriod === KPeriod.DAILY) return '1d';
              throw new Error(
                `Data source ${_source} does not support period ${kPeriod}`,
              );
            }),
            isSupported: jest.fn((kPeriod: KPeriod) => {
              // TDX only supports: ONE_MIN, FIVE_MIN, DAILY
              return (
                kPeriod === KPeriod.ONE_MIN ||
                kPeriod === KPeriod.FIVE_MIN ||
                kPeriod === KPeriod.DAILY
              );
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
      expect(service.isSupportedPeriod(Period.One)).toBe(true); // 1m
      expect(service.isSupportedPeriod(Period.FIVE)).toBe(true); // 5m
      expect(service.isSupportedPeriod(Period.DAY)).toBe(true); // 1d
    });

    it('should return true for periods that map to daily', () => {
      // These periods are mapped to DAILY which TDX supports
      expect(service.isSupportedPeriod(Period.WEEK)).toBe(true); // maps to daily
      expect(service.isSupportedPeriod(Period.MONTH)).toBe(true); // maps to daily
      expect(service.isSupportedPeriod(Period.QUARTER)).toBe(true); // maps to daily
      expect(service.isSupportedPeriod(Period.YEAR)).toBe(true); // maps to daily
    });

    it('should return false for unsupported periods', () => {
      expect(service.isSupportedPeriod(Period.FIFTEEN)).toBe(false); // 15m not in TDX mapping
      expect(service.isSupportedPeriod(Period.THIRTY)).toBe(false); // 30m not in TDX mapping
      expect(service.isSupportedPeriod(Period.SIXTY)).toBe(false); // 60m not in TDX mapping
    });
  });

  describe('getPeriodFormat', () => {
    it('should return correct period format for directly supported periods', () => {
      expect(service.getPeriodFormat(Period.One)).toBe('1m');
      expect(service.getPeriodFormat(Period.FIVE)).toBe('5m');
      expect(service.getPeriodFormat(Period.DAY)).toBe('1d');
    });

    it('should return daily format for periods that map to daily', () => {
      expect(service.getPeriodFormat(Period.WEEK)).toBe('1d');
      expect(service.getPeriodFormat(Period.MONTH)).toBe('1d');
      expect(service.getPeriodFormat(Period.QUARTER)).toBe('1d');
      expect(service.getPeriodFormat(Period.YEAR)).toBe('1d');
    });

    it('should throw error for unsupported period', () => {
      expect(() => service.getPeriodFormat(Period.FIFTEEN)).toThrow(
        'Data source tdx does not support period 15min',
      );
      expect(() => service.getPeriodFormat(Period.THIRTY)).toThrow(
        'Data source tdx does not support period 30min',
      );
      expect(() => service.getPeriodFormat(Period.SIXTY)).toThrow(
        'Data source tdx does not support period 60min',
      );
    });
  });

  describe('periodToKLinePeriod', () => {
    it('should correctly map Period enum to KPeriod enum', () => {
      // This tests the private method through public interface
      expect(service.getPeriodFormat(Period.One)).toBe('1m');
      expect(service.getPeriodFormat(Period.FIVE)).toBe('5m');
      expect(service.getPeriodFormat(Period.DAY)).toBe('1d');
    });
  });
});
