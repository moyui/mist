import { Test, TestingModule } from '@nestjs/testing';
import { AxiosError } from 'axios';
import { UtilsService } from '@app/utils';
import { TimezoneService } from './timezone.service';

describe('TimezoneService', () => {
  let service: TimezoneService;
  let mockAxios: { get: jest.Mock };

  const mockAxiosResponse = {
    data: [
      { zrxh: 1, jybz: '1', jyrq: '2024-01-08' }, // Monday - trading day
      { zrxh: 2, jybz: '1', jyrq: '2024-01-09' }, // Tuesday - trading day
      { zrxh: 3, jybz: '1', jyrq: '2024-01-10' }, // Wednesday - trading day
      { zrxh: 4, jybz: '1', jyrq: '2024-01-11' }, // Thursday - trading day
      { zrxh: 5, jybz: '1', jyrq: '2024-01-12' }, // Friday - trading day
      { zrxh: 6, jybz: '0', jyrq: '2024-01-13' }, // Saturday - non-trading
      { zrxh: 7, jybz: '0', jyrq: '2024-01-14' }, // Sunday - non-trading
      // Chinese New Year 2024 (Feb 10-17)
      { zrxh: 32, jybz: '0', jyrq: '2024-02-10' }, // CNY - non-trading
      { zrxh: 33, jybz: '0', jyrq: '2024-02-11' }, // CNY - non-trading
    ],
  };

  beforeEach(async () => {
    mockAxios = {
      get: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TimezoneService,
        {
          provide: UtilsService,
          useValue: {
            createAxiosInstance: jest.fn(() => mockAxios),
          },
        },
      ],
    }).compile();

    service = module.get<TimezoneService>(TimezoneService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    service.clearTradingDayCache();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('convertTimestamp2Date', () => {
    it('should convert milliseconds timestamp to Date', () => {
      const timestamp = 1704067200000;
      const result = service.convertTimestamp2Date(timestamp);
      expect(result).toBeInstanceOf(Date);
      expect(result.getTime()).toBe(1704067200000);
    });

    it('should handle timestamp 0', () => {
      const result = service.convertTimestamp2Date(0);
      expect(result).toBeInstanceOf(Date);
      expect(result.getTime()).toBe(0);
    });
  });

  describe('parseDateString', () => {
    it('should parse full datetime as Beijing time', () => {
      // "2024-04-01 09:30:00" in Beijing (UTC+8) = 2024-04-01T01:30:00.000Z
      const result = service.parseDateString('2024-04-01 09:30:00');
      expect(result).toBeInstanceOf(Date);
      expect(result.toISOString()).toBe('2024-04-01T01:30:00.000Z');
    });

    it('should parse date-only and default time to 00:00:00', () => {
      // "2024-04-01" in Beijing (UTC+8) = 2024-03-31T16:00:00.000Z
      const result = service.parseDateString('2024-04-01');
      expect(result).toBeInstanceOf(Date);
      expect(result.toISOString()).toBe('2024-03-31T16:00:00.000Z');
    });

    it('should throw on invalid format', () => {
      expect(() => service.parseDateString('not-a-date')).toThrow();
    });

    it('should throw on semantically invalid date', () => {
      expect(() => service.parseDateString('2024-13-45 25:61:99')).toThrow();
    });

    it('should throw on empty string', () => {
      expect(() => service.parseDateString('')).toThrow();
    });

    it('should parse midnight correctly', () => {
      const result = service.parseDateString('2024-01-01 00:00:00');
      expect(result).toBeInstanceOf(Date);
      // Beijing midnight = UTC 16:00 previous day
      expect(result.toISOString()).toBe('2023-12-31T16:00:00.000Z');
    });
  });

  describe('isTradingDay', () => {
    describe('with SZSE API', () => {
      it('should return true for trading day from API', async () => {
        mockAxios.get.mockResolvedValue(mockAxiosResponse);

        const monday = new Date('2024-01-08');
        const result = await service.isTradingDay(monday);

        expect(result).toBe(true);
        expect(mockAxios.get).toHaveBeenCalledWith(
          'http://www.szse.cn/api/report/exchange/onepersistenthour/monthList',
          {
            params: { yearMonth: '2024-01' },
          },
        );
      });

      it('should return false for non-trading day from API', async () => {
        mockAxios.get.mockResolvedValue(mockAxiosResponse);

        const saturday = new Date('2024-01-13');
        const result = await service.isTradingDay(saturday);

        expect(result).toBe(false);
      });

      it('should return false for Chinese New Year holiday', async () => {
        mockAxios.get.mockResolvedValue(mockAxiosResponse);

        const cny = new Date('2024-02-10');
        const result = await service.isTradingDay(cny);

        expect(result).toBe(false);
      });

      it('should cache results', async () => {
        mockAxios.get.mockResolvedValue(mockAxiosResponse);

        const monday = new Date('2024-01-08');

        // First call - should hit API
        const result1 = await service.isTradingDay(monday);
        expect(result1).toBe(true);
        expect(mockAxios.get).toHaveBeenCalledTimes(1);

        // Second call - should use cache
        const result2 = await service.isTradingDay(monday);
        expect(result2).toBe(true);
        expect(mockAxios.get).toHaveBeenCalledTimes(1); // No additional call
      });
    });

    describe('API error fallback', () => {
      it('should fallback to weekend check when API fails', async () => {
        const axiosError = new AxiosError('API Error');
        mockAxios.get.mockRejectedValue(axiosError);

        const monday = new Date('2024-01-08');
        const result = await service.isTradingDay(monday);

        expect(result).toBe(true); // Monday is not weekend
      });

      it('should return false for Saturday when API fails', async () => {
        const axiosError = new AxiosError('API Error');
        mockAxios.get.mockRejectedValue(axiosError);

        const saturday = new Date('2024-01-13');
        const result = await service.isTradingDay(saturday);

        expect(result).toBe(false); // Saturday is weekend
      });
    });
  });

  describe('clearTradingDayCache', () => {
    it('should clear the cache', async () => {
      mockAxios.get.mockResolvedValue(mockAxiosResponse);

      const monday = new Date('2024-01-08');

      // Populate cache
      await service.isTradingDay(monday);
      expect(mockAxios.get).toHaveBeenCalledTimes(1);

      // Clear cache
      service.clearTradingDayCache();

      // Should call API again
      await service.isTradingDay(monday);
      expect(mockAxios.get).toHaveBeenCalledTimes(2);
    });
  });
});
