import { Test, TestingModule } from '@nestjs/testing';
import { TdxSource } from './tdx.source';
import { AxiosInstance } from 'axios';
import { KLineFetchParams } from '../data-collector';
import { Period } from '../chan/enums/period.enum';
import { UtilsService } from '@app/utils';

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
    it('should return true for supported periods', () => {
      expect(service.isSupportedPeriod(Period.One)).toBe(true); // 1m
      expect(service.isSupportedPeriod(Period.FIVE)).toBe(true); // 5m
      expect(service.isSupportedPeriod(Period.DAY)).toBe(true); // 1d
    });

    it('should return false for unsupported periods', () => {
      expect(service.isSupportedPeriod(Period.FIFTEEN)).toBe(false); // 15m
      expect(service.isSupportedPeriod(Period.THIRTY)).toBe(false); // 30m
      expect(service.isSupportedPeriod(Period.SIXTY)).toBe(false); // 60m
      expect(service.isSupportedPeriod(Period.WEEK)).toBe(false); // weekly
      expect(service.isSupportedPeriod(Period.MONTH)).toBe(false); // monthly
      expect(service.isSupportedPeriod(Period.QUARTER)).toBe(false); // quarterly
      expect(service.isSupportedPeriod(Period.YEAR)).toBe(false); // yearly
    });
  });

  describe('getPeriodFormat', () => {
    it('should return correct period format for supported periods', () => {
      expect(service.getPeriodFormat(Period.One)).toBe('1m');
      expect(service.getPeriodFormat(Period.FIVE)).toBe('5m');
      expect(service.getPeriodFormat(Period.DAY)).toBe('1d');
    });

    it('should throw error for unsupported period', () => {
      expect(() => service.getPeriodFormat(Period.FIFTEEN)).toThrow(
        'Data source tdx does not support period 15min',
      );
    });
  });

  describe('periodToKLinePeriod', () => {
    it('should correctly map Period enum to KLinePeriod enum', () => {
      // This tests the private method through public interface
      expect(service.getPeriodFormat(Period.One)).toBe('1m');
      expect(service.getPeriodFormat(Period.FIVE)).toBe('5m');
      expect(service.getPeriodFormat(Period.DAY)).toBe('1d');
    });
  });
});
