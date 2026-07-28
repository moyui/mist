import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EastMoneySource } from './east-money-source.service';
import { AxiosInstance } from 'axios';
import { KFetchParams, KData, EfExtension } from '../source-fetcher.interface';
import {
  Period,
  Security,
  DataSource,
  K,
  KExtensionEf,
} from '@app/shared-data';
import { UtilsService, PeriodMappingService } from '@app/utils';
import { DataSource as TypeOrmDataSource } from 'typeorm';
import { DATASOURCE_HTTP_TIMEOUT_MS } from '../constants';

const createInsertBuilderMock = () => ({
  insert: jest.fn().mockReturnThis(),
  into: jest.fn().mockReturnThis(),
  values: jest.fn().mockReturnThis(),
  orUpdate: jest.fn().mockReturnThis(),
  updateEntity: jest.fn().mockReturnThis(),
  execute: jest.fn().mockResolvedValue(undefined),
});

describe('EastMoneySource', () => {
  let service: EastMoneySource;
  let axiosInstance: jest.Mocked<AxiosInstance>;
  let createAxiosInstance: jest.Mock;

  const createService = async (
    configValues: Record<string, string | undefined> = {},
  ) => {
    const mockAxiosInstance = {
      get: jest.fn(),
    } as unknown as jest.Mocked<AxiosInstance>;
    createAxiosInstance = jest.fn(() => mockAxiosInstance);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EastMoneySource,
        {
          provide: UtilsService,
          useFactory: () => ({
            createAxiosInstance,
          }),
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => configValues[key]),
          },
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
  };

  beforeEach(async () => {
    await createService();
  });

  describe('configuration', () => {
    it('uses AKTOOLS_BASE_URL when configured', async () => {
      await createService({
        AKTOOLS_BASE_URL: 'http://aktools.internal:18080',
      });

      expect(createAxiosInstance).toHaveBeenCalledWith({
        baseURL: 'http://aktools.internal:18080',
        timeout: DATASOURCE_HTTP_TIMEOUT_MS,
      });
    });

    it('uses the local AKTools default when config is absent', async () => {
      await createService();

      expect(createAxiosInstance).toHaveBeenCalledWith({
        baseURL: 'http://127.0.0.1:8080',
        timeout: DATASOURCE_HTTP_TIMEOUT_MS,
      });
    });
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
        volume: '1000000',
        amount: '100500000',
        period: Period.ONE_MIN,
        extensions: {
          amplitude: 2.5,
          changePct: 1.2,
          changeAmt: 0.13,
          turnoverRate: 0.5,
        },
      });
    });

    it('should preserve explicit zero 成交额', async () => {
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

      expect(result[0].amount).toBe('0');
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
        volume: '5000000',
        amount: '500000000',
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
        volume: '5000000',
        amount: '500000000',
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
    let mockManagerUpsert: jest.Mock;
    let mockManagerFind: jest.Mock;
    let mockManagerCreateQueryBuilder: jest.Mock;
    let mockKInsertBuilder: ReturnType<typeof createInsertBuilderMock>;
    let mockExtensionInsertBuilder: {
      insert: jest.Mock;
      into: jest.Mock;
      values: jest.Mock;
      orUpdate: jest.Mock;
      updateEntity: jest.Mock;
      execute: jest.Mock;
    };
    let ds: { transaction: jest.Mock };

    beforeEach(() => {
      let savedKRows: Array<Record<string, unknown>> = [];
      mockManagerCreate = jest.fn((_, data) => data);
      mockManagerSave = jest
        .fn()
        .mockImplementation((_, entities) => Promise.resolve(entities));
      mockManagerUpsert = jest.fn((entity, entities) => {
        if (entity === K) {
          savedKRows = entities.map(
            (item: Record<string, unknown>, index: number) => ({
              ...item,
              id: index + 1,
            }),
          );
        }
        return Promise.resolve(undefined);
      });
      mockManagerFind = jest.fn((entity) => {
        if (entity === K) {
          return Promise.resolve(savedKRows);
        }
        return Promise.resolve([]);
      });
      mockKInsertBuilder = createInsertBuilderMock();
      mockKInsertBuilder.execute.mockImplementation(() => {
        const values = mockKInsertBuilder.values.mock.calls[0]?.[0] ?? [];
        savedKRows = values.map(
          (item: Record<string, unknown>, index: number) => ({
            ...item,
            id: index + 1,
          }),
        );
        return Promise.resolve(undefined);
      });
      mockExtensionInsertBuilder = createInsertBuilderMock();
      mockManagerCreateQueryBuilder = jest
        .fn()
        .mockReturnValueOnce(mockKInsertBuilder)
        .mockReturnValue(mockExtensionInsertBuilder);
      mockTransaction = jest.fn((cb) =>
        cb({
          create: mockManagerCreate,
          save: mockManagerSave,
          upsert: mockManagerUpsert,
          find: mockManagerFind,
          createQueryBuilder: mockManagerCreateQueryBuilder,
        }),
      );

      // Re-configure the TypeOrmDataSource mock for saveK tests
      ds = service['typeOrmDataSource'] as unknown as {
        transaction: jest.Mock;
      };
      ds.transaction = mockTransaction;
    });

    it('should upsert base K and extension entities in a transaction', async () => {
      const mockData: KData[] = [
        {
          timestamp: new Date('2024-01-01T09:30:00.000Z'),
          open: 10.5,
          high: 11.0,
          low: 10.3,
          close: 10.8,
          volume: '1000000',
          amount: null,
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
      expect(mockManagerUpsert).not.toHaveBeenCalled();
      expect(mockManagerCreateQueryBuilder).toHaveBeenCalledTimes(2);
      expect(mockKInsertBuilder.into).toHaveBeenCalledWith(K);
      expect(mockKInsertBuilder.values).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            securityId: mockSecurity.id,
            timestamp: mockData[0].timestamp,
          }),
        ]),
      );
      expect(mockKInsertBuilder.orUpdate).toHaveBeenCalledWith(
        ['open', 'high', 'low', 'close', 'volume', 'amount'],
        ['securityId', 'source', 'period', 'timestamp'],
      );
      expect(mockKInsertBuilder.updateEntity).toHaveBeenCalledWith(false);
      expect(mockKInsertBuilder.execute).toHaveBeenCalledTimes(1);
      // extensions created for item with extensions
      expect(mockManagerCreate).toHaveBeenCalledWith(
        KExtensionEf,
        expect.objectContaining({
          kId: 1,
          amplitude: 2.5,
          changePct: 1.2,
        }),
      );
      expect(mockManagerUpsert).not.toHaveBeenCalledWith(
        KExtensionEf,
        expect.anything(),
        expect.anything(),
      );
      expect(mockManagerCreateQueryBuilder).toHaveBeenCalledTimes(2);
      expect(mockExtensionInsertBuilder.into).toHaveBeenCalledWith(
        KExtensionEf,
      );
      expect(mockExtensionInsertBuilder.values).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            kId: 1,
            amplitude: 2.5,
            changePct: 1.2,
          }),
        ]),
      );
      expect(mockExtensionInsertBuilder.orUpdate).toHaveBeenCalledWith(
        [
          'amplitude',
          'changePct',
          'changeAmt',
          'turnoverRate',
          'volumeCount',
          'innerVolume',
          'outerVolume',
          'prevClose',
          'prevOpen',
        ],
        ['k_id'],
      );
      expect(mockExtensionInsertBuilder.updateEntity).toHaveBeenCalledWith(
        false,
      );
      expect(mockExtensionInsertBuilder.execute).toHaveBeenCalledTimes(1);
    });

    it('should be a no-op for empty data', async () => {
      await service.saveK([], {} as Security, Period.ONE_MIN);

      expect(mockTransaction).not.toHaveBeenCalled();
      expect(mockManagerCreate).not.toHaveBeenCalled();
      expect(mockManagerSave).not.toHaveBeenCalled();
      expect(mockManagerUpsert).not.toHaveBeenCalled();
      expect(mockManagerFind).not.toHaveBeenCalled();
    });

    it('keeps new rows when a requested range overlaps existing East Money rows', async () => {
      const existingTimestamp = new Date('2026-06-26T00:00:00.000Z');
      const olderTimestamp = new Date('2026-06-25T00:00:00.000Z');
      const key = (timestamp: Date) => timestamp.getTime();
      const mockSecurity = { id: 1, code: '000001' } as Security;
      let nextId = 20;
      const storedKs = new Map<number, Record<string, unknown>>([
        [
          key(existingTimestamp),
          {
            id: 10,
            security: mockSecurity,
            source: DataSource.EAST_MONEY,
            period: Period.DAY,
            timestamp: existingTimestamp,
          },
        ],
      ]);
      const kInsertBuilder = createInsertBuilderMock();
      kInsertBuilder.execute.mockImplementation(() => {
        const values = kInsertBuilder.values.mock.calls[0]?.[0] ?? [];
        for (const item of values as Array<Record<string, unknown>>) {
          const timestamp = item.timestamp as Date;
          const existing = storedKs.get(key(timestamp));
          storedKs.set(key(timestamp), {
            ...existing,
            ...item,
            id: existing?.id ?? nextId++,
          });
        }
        return Promise.resolve(undefined);
      });
      const manager = {
        create: jest.fn((_, data) => data),
        save: jest.fn((entity, entities) => {
          if (entity === K) {
            const duplicate = entities.find((item: { timestamp: Date }) =>
              storedKs.has(key(item.timestamp)),
            );
            if (duplicate) {
              const error = new Error('Duplicate entry') as Error & {
                code: string;
              };
              error.code = 'ER_DUP_ENTRY';
              return Promise.reject(error);
            }
          }
          return Promise.resolve(entities);
        }),
        upsert: jest.fn((entity, entities) => {
          if (entity === K) {
            for (const item of entities as Array<Record<string, unknown>>) {
              const timestamp = item.timestamp as Date;
              const existing = storedKs.get(key(timestamp));
              storedKs.set(key(timestamp), {
                ...existing,
                ...item,
                id: existing?.id ?? nextId++,
              });
            }
          }
          return Promise.resolve(undefined);
        }),
        find: jest.fn((entity) => {
          if (entity === K) {
            return Promise.resolve(Array.from(storedKs.values()));
          }
          return Promise.resolve([]);
        }),
        createQueryBuilder: jest.fn(() => kInsertBuilder),
      };
      mockTransaction.mockImplementation((cb) => cb(manager));

      await service.saveK(
        [
          {
            timestamp: existingTimestamp,
            open: 1199,
            high: 1199,
            low: 1168.1,
            close: 1168.63,
            volume: '5006647',
            amount: null,
            period: Period.DAY,
          },
          {
            timestamp: olderTimestamp,
            open: 1205,
            high: 1210,
            low: 1190,
            close: 1198,
            volume: '4200000',
            amount: null,
            period: Period.DAY,
          },
        ],
        mockSecurity,
        Period.DAY,
      );

      expect(storedKs.get(key(olderTimestamp))).toEqual(
        expect.objectContaining({
          id: 20,
          close: 1198,
        }),
      );
      expect(manager.upsert).not.toHaveBeenCalled();
      expect(manager.createQueryBuilder).toHaveBeenCalledTimes(1);
      expect(kInsertBuilder.into).toHaveBeenCalledWith(K);
      expect(kInsertBuilder.values).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ timestamp: existingTimestamp }),
          expect.objectContaining({ timestamp: olderTimestamp }),
        ]),
      );
      expect(kInsertBuilder.orUpdate).toHaveBeenCalledWith(
        ['open', 'high', 'low', 'close', 'volume', 'amount'],
        ['securityId', 'source', 'period', 'timestamp'],
      );
      expect(kInsertBuilder.updateEntity).toHaveBeenCalledWith(false);
      expect(kInsertBuilder.execute).toHaveBeenCalledTimes(1);
    });

    it('should skip extension creation for daily data (no extensions)', async () => {
      const mockData: KData[] = [
        {
          timestamp: new Date('2024-01-01'),
          open: 3000,
          high: 3050,
          low: 2980,
          close: 3020,
          volume: '5000000',
          amount: null,
          period: Period.DAY,
        },
      ];

      await service.saveK(mockData, {} as Security, Period.DAY);

      expect(mockTransaction).toHaveBeenCalledTimes(1);
      expect(mockManagerCreate).toHaveBeenCalledTimes(1);
      expect(mockManagerCreate).toHaveBeenCalledWith(
        K,
        expect.objectContaining({ open: 3000 }),
      );
      expect(mockManagerUpsert).not.toHaveBeenCalled();
      expect(mockManagerCreateQueryBuilder).toHaveBeenCalledTimes(1);
      expect(mockKInsertBuilder.into).toHaveBeenCalledWith(K);
      expect(mockKInsertBuilder.values).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ open: 3000 })]),
      );
      expect(mockKInsertBuilder.orUpdate).toHaveBeenCalledWith(
        ['open', 'high', 'low', 'close', 'volume', 'amount'],
        ['securityId', 'source', 'period', 'timestamp'],
      );
      expect(mockExtensionInsertBuilder.execute).not.toHaveBeenCalled();
    });
  });
});
