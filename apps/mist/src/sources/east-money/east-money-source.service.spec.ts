import { Test, TestingModule } from '@nestjs/testing';
import { EastMoneySource } from './east-money.source';
import { AxiosInstance } from 'axios';
import { KFetchParams, KData, EfExtension } from './source-fetcher.interface';
import {
  Period,
  Security,
  DataSource,
  K,
  KExtensionEf,
} from '@app/shared-data';
import { UtilsService, PeriodMappingService } from '@app/utils';
import { DataSource as TypeOrmDataSource } from 'typeorm';

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
        {
          provide: TypeOrmDataSource,
          useValue: {
            transaction: jest.fn((cb) =>
              cb({
                create: jest.fn((_, data) => data),
                save: jest.fn((_, entities) => Promise.resolve(entities)),
              }),
            ),
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
        涨跌幅: 1.2,
        涨跌额: 0.13,
        振幅: 2.5,
        换手率: 0.5,
      },
      {
        时间: '2024-01-01T00:01:00.000Z',
        开盘: 101.0,
        最高: 102.0,
        最低: 100.5,
        收盘: 101.5,
        成交量: 1200000,
        成交额: 0,
        涨跌幅: 1.2,
        涨跌额: 0.13,
        振幅: 2.5,
        换手率: 0.5,
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
        extensions: {
          amplitude: 2.5,
          changePct: 1.2,
          changeAmt: 0.13,
          turnoverRate: 0.5,
        },
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
          涨跌幅: 1.2,
          涨跌额: 0.13,
          振幅: 2.5,
          换手率: 0.5,
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

  describe('saveK', () => {
    let mockTransaction: jest.Mock;
    let mockManagerCreate: jest.Mock;
    let mockManagerSave: jest.Mock;
    let ds: { transaction: jest.Mock };

    beforeEach(() => {
      mockManagerCreate = jest.fn((_, data) => data);
      mockManagerSave = jest
        .fn()
        .mockImplementation((_, entities) => Promise.resolve(entities));
      mockTransaction = jest.fn((cb) =>
        cb({ create: mockManagerCreate, save: mockManagerSave }),
      );

      // Re-configure the TypeOrmDataSource mock for saveK tests
      ds = service['typeOrmDataSource'] as unknown as {
        transaction: jest.Mock;
      };
      ds.transaction = mockTransaction;
    });

    it('should save base K and extension entities in a transaction', async () => {
      const mockData: KData[] = [
        {
          timestamp: new Date('2024-01-01T09:30:00.000Z'),
          open: 10.5,
          high: 11.0,
          low: 10.3,
          close: 10.8,
          volume: 1000000,
          period: Period.ONE_MIN,
          extensions: {
            amplitude: 2.5,
            changePct: 1.2,
            changeAmt: 0.13,
            turnoverRate: 0.5,
          } as EfExtension,
        },
      ];

      const mockSecurity = { id: 1, code: '000001' } as Security;

      await service.saveK(mockData, mockSecurity, Period.ONE_MIN);

      expect(mockTransaction).toHaveBeenCalledTimes(1);
      // base K created
      expect(mockManagerCreate).toHaveBeenCalledWith(
        K,
        expect.objectContaining({
          security: mockSecurity,
          source: DataSource.EAST_MONEY,
          open: 10.5,
          close: 10.8,
        }),
      );
      // base K saved, then extensions created
      expect(mockManagerSave).toHaveBeenCalledTimes(2);
      // extensions created for item with extensions
      expect(mockManagerCreate).toHaveBeenCalledWith(
        KExtensionEf,
        expect.objectContaining({
          amplitude: 2.5,
          changePct: 1.2,
        }),
      );
    });

    it('should be a no-op for empty data', async () => {
      await service.saveK([], {} as Security, Period.ONE_MIN);

      expect(mockTransaction).not.toHaveBeenCalled();
      expect(mockManagerCreate).not.toHaveBeenCalled();
      expect(mockManagerSave).not.toHaveBeenCalled();
    });

    it('should skip extension creation for daily data (no extensions)', async () => {
      const mockData: KData[] = [
        {
          timestamp: new Date('2024-01-01'),
          open: 3000,
          high: 3050,
          low: 2980,
          close: 3020,
          volume: 5000000,
          period: Period.DAY,
        },
      ];

      await service.saveK(mockData, {} as Security, Period.DAY);

      expect(mockTransaction).toHaveBeenCalledTimes(1);
      // base K created and saved, but only once (no extensions)
      expect(mockManagerCreate).toHaveBeenCalledTimes(1);
      expect(mockManagerCreate).toHaveBeenCalledWith(
        K,
        expect.objectContaining({ open: 3000 }),
      );
      expect(mockManagerSave).toHaveBeenCalledTimes(1);
    });
  });
});
