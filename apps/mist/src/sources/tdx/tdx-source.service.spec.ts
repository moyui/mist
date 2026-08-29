import { Test, TestingModule } from '@nestjs/testing';
import { HttpStatus } from '@nestjs/common';
import { TdxSource } from './tdx-source.service';
import { ConfigService } from '@nestjs/config';
import { AxiosInstance } from 'axios';
import { DataSource } from 'typeorm';
import {
  Period,
  Security,
  DataSource as AppDataSource,
  K,
  KExtensionTdx,
} from '@app/shared-data';
import { UtilsService, PeriodMappingService } from '@app/utils';
import { TdxResponse } from './types';
import { DATASOURCE_HTTP_TIMEOUT_MS } from '../constants';
import { createInsertBuilderMock } from '../testing/typeorm-mock-helpers';

describe('TdxSource', () => {
  let service: TdxSource;
  let mockAxiosGet: jest.Mock;
  let mockAxiosPost: jest.Mock;
  let mockTypeOrmDataSource: jest.Mocked<DataSource>;
  let createAxiosInstance: jest.Mock;

  beforeEach(async () => {
    mockAxiosGet = jest.fn();
    mockAxiosPost = jest.fn();

    const mockAxiosInstance = {
      get: mockAxiosGet,
      post: mockAxiosPost,
    } as unknown as jest.Mocked<AxiosInstance>;

    mockTypeOrmDataSource = {
      transaction: jest.fn(),
    } as unknown as jest.Mocked<DataSource>;
    createAxiosInstance = jest.fn(() => mockAxiosInstance);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TdxSource,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'TDX_BASE_URL') return 'http://127.0.0.1:9001';
              return undefined;
            }),
          },
        },
        {
          provide: UtilsService,
          useFactory: () => ({
            createAxiosInstance,
          }),
        },
        {
          provide: PeriodMappingService,
          useValue: {
            toSourceFormat: jest.fn((period: Period, source: AppDataSource) => {
              if (source === AppDataSource.TDX) {
                switch (period) {
                  case Period.ONE_MIN:
                    return '1m';
                  case Period.FIVE_MIN:
                    return '5m';
                  case Period.FIFTEEN_MIN:
                    return '15m';
                  case Period.THIRTY_MIN:
                    return '30m';
                  case Period.SIXTY_MIN:
                    return '1h';
                  case Period.DAY:
                    return '1d';
                  case Period.WEEK:
                    return '1w';
                  case Period.MONTH:
                    return '1M';
                  default:
                    return null;
                }
              }
              return null;
            }),
            isSupported: jest.fn((period: Period, source: AppDataSource) => {
              if (source === AppDataSource.TDX) {
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
              }
              return false;
            }),
          },
        },
        {
          provide: DataSource,
          useValue: mockTypeOrmDataSource,
        },
      ],
    }).compile();

    service = module.get<TdxSource>(TdxSource);

    // Mock axios.create to return our mock
    (service as any).axios = {
      get: mockAxiosGet,
      post: mockAxiosPost,
    };
  });

  describe('configuration', () => {
    it('uses TDX_BASE_URL with the shared datasource HTTP timeout', () => {
      expect(createAxiosInstance).toHaveBeenCalledWith({
        baseURL: 'http://127.0.0.1:9001',
        timeout: DATASOURCE_HTTP_TIMEOUT_MS,
      });
    });

    it('does not expose the removed on-demand snapshot method', () => {
      expect('fetchSnapshot' in service).toBe(false);
    });
  });

  describe('isSupportedPeriod', () => {
    it('should return true for directly supported periods', () => {
      expect(service.isSupportedPeriod(Period.ONE_MIN)).toBe(true);
      expect(service.isSupportedPeriod(Period.FIVE_MIN)).toBe(true);
      expect(service.isSupportedPeriod(Period.FIFTEEN_MIN)).toBe(true);
      expect(service.isSupportedPeriod(Period.THIRTY_MIN)).toBe(true);
      expect(service.isSupportedPeriod(Period.SIXTY_MIN)).toBe(true);
      expect(service.isSupportedPeriod(Period.DAY)).toBe(true);
      expect(service.isSupportedPeriod(Period.WEEK)).toBe(true);
      expect(service.isSupportedPeriod(Period.MONTH)).toBe(true);
    });

    it('should return false for unsupported periods', () => {
      expect(service.isSupportedPeriod(Period.QUARTER)).toBe(false);
      expect(service.isSupportedPeriod(Period.YEAR)).toBe(false);
    });
  });

  describe('saveK', () => {
    it('should be a no-op for empty data', async () => {
      await expect(
        service.saveK([], {} as Security, Period.ONE_MIN),
      ).resolves.toBeUndefined();
    });

    it('keeps new rows when a requested range overlaps existing TDX rows', async () => {
      const existingTimestamp = new Date('2026-06-26T00:00:00+08:00');
      const olderTimestamp = new Date('2026-06-25T00:00:00+08:00');
      const key = (timestamp: Date) => timestamp.getTime();
      const security = {
        id: 1,
        code: '600519',
        sourceConfigs: [{ source: AppDataSource.TDX, formatCode: '600519.SH' }],
      } as Security;
      let nextId = 20;
      const storedKs = new Map<number, Record<string, unknown>>([
        [
          key(existingTimestamp),
          {
            id: 10,
            security,
            source: AppDataSource.TDX,
            period: Period.DAY,
            timestamp: existingTimestamp,
          },
        ],
      ]);
      const kInsertBuilder = createInsertBuilderMock();
      kInsertBuilder.execute.mockImplementation(() => {
        if (kInsertBuilder.into.mock.calls[0]?.[0] !== K) {
          return Promise.resolve(undefined);
        }
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
      const extensionInsertBuilder = createInsertBuilderMock();

      const manager = {
        create: jest.fn((_, payload) => payload),
        save: jest.fn((entity, payload) => {
          if (entity === K) {
            const duplicate = payload.find((item: { timestamp: Date }) =>
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
          return Promise.resolve(payload);
        }),
        upsert: jest.fn((entity, payload) => {
          if (entity === K) {
            for (const item of payload as Array<Record<string, unknown>>) {
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
        createQueryBuilder: jest
          .fn()
          .mockReturnValueOnce(kInsertBuilder)
          .mockReturnValueOnce(extensionInsertBuilder),
      };
      mockTypeOrmDataSource.transaction.mockImplementation(
        async (...args: any[]) => {
          const callback = args.find((arg) => typeof arg === 'function');
          return callback(manager as any);
        },
      );

      await service.saveK(
        [
          {
            timestamp: existingTimestamp,
            open: 1199,
            high: 1199,
            low: 1168.1,
            close: 1168.63,
            volume: '5006647',
            amount: '592201.44',
          },
          {
            timestamp: olderTimestamp,
            open: 1205,
            high: 1210,
            low: 1190,
            close: 1198,
            volume: '4200000',
            amount: '501000',
          },
        ],
        security,
        Period.DAY,
      );

      expect(storedKs.get(key(olderTimestamp))).toEqual(
        expect.objectContaining({
          id: 20,
          close: 1198,
        }),
      );
      expect(manager.upsert).not.toHaveBeenCalled();
      expect(manager.createQueryBuilder).toHaveBeenCalledTimes(2);
      expect(kInsertBuilder.into).toHaveBeenCalledWith(K);
      expect(kInsertBuilder.values).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ timestamp: existingTimestamp }),
          expect.objectContaining({ timestamp: olderTimestamp }),
        ]),
      );
      expect(kInsertBuilder.orUpdate).toHaveBeenCalledWith(
        ['open', 'high', 'low', 'close', 'volume', 'amount'],
        ['security_id', 'source', 'period', 'timestamp'],
      );
      expect(kInsertBuilder.updateEntity).toHaveBeenCalledWith(false);
      expect(kInsertBuilder.execute).toHaveBeenCalledTimes(1);
      expect(manager.upsert).not.toHaveBeenCalledWith(
        KExtensionTdx,
        expect.anything(),
        expect.anything(),
      );
      expect(extensionInsertBuilder.into).toHaveBeenCalledWith(KExtensionTdx);
      expect(extensionInsertBuilder.values).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ kId: 10 }),
          expect.objectContaining({ kId: 20 }),
        ]),
      );
      expect(extensionInsertBuilder.orUpdate).toHaveBeenCalledWith(
        [
          'forward_factor',
          'vol_in_stock',
          'backward_factor',
          'volume_ratio',
          'turnover_rate',
          'turnover_amount',
          'total_market_value',
          'float_market_value',
          'earnings_per_share',
          'price_earnings_ratio',
          'price_to_book_ratio',
        ],
        ['k_id'],
      );
      expect(extensionInsertBuilder.updateEntity).toHaveBeenCalledWith(false);
      expect(extensionInsertBuilder.execute).toHaveBeenCalledTimes(1);
    });

    it('saves structured TDX extensions without opaque raw payloads or zero defaults', async () => {
      const kInsertBuilder = createInsertBuilderMock();
      const extensionInsertBuilder = createInsertBuilderMock();
      const manager = {
        create: jest.fn((entity, payload) => ({ entity, ...payload })),
        save: jest.fn((entity, payload) => {
          if (entity === K) {
            return Promise.resolve(
              payload.map((item: unknown, index: number) => ({
                ...(item as Record<string, unknown>),
                id: index + 1,
              })),
            );
          }
          return Promise.resolve(payload);
        }),
        upsert: jest.fn(() => Promise.resolve(undefined)),
        find: jest.fn((entity) => {
          if (entity === K) {
            return Promise.resolve(
              data.map((item: TdxResponse, index: number) => ({
                ...item,
                id: index + 1,
              })),
            );
          }
          return Promise.resolve([]);
        }),
        createQueryBuilder: jest
          .fn()
          .mockReturnValueOnce(kInsertBuilder)
          .mockReturnValueOnce(extensionInsertBuilder),
      };
      mockTypeOrmDataSource.transaction.mockImplementation(
        async (...args: any[]) => {
          const callback = args.find((arg) => typeof arg === 'function');
          return callback(manager as any);
        },
      );

      const data: TdxResponse[] = [
        {
          timestamp: new Date('2026-06-26T00:00:00+08:00'),
          open: 1199,
          high: 1199,
          low: 1168.1,
          close: 1168.63,
          volume: '5006647',
          amount: '592201.44',
          extensions: {
            forwardFactor: 0.711862,
            volInStock: 182942480,
          },
        },
      ];
      const security = {
        code: '600519',
        sourceConfigs: [{ source: AppDataSource.TDX, formatCode: '600519.SH' }],
      } as Security;

      await service.saveK(data, security, Period.DAY);

      const extensionCreateCall = manager.create.mock.calls.find(
        ([entity]) => entity === KExtensionTdx,
      );
      expect(extensionCreateCall?.[1]).toEqual(
        expect.objectContaining({
          forwardFactor: 0.711862,
          volInStock: 182942480,
        }),
      );
      expect(extensionCreateCall?.[1]).not.toHaveProperty('raw');
      expect(extensionCreateCall?.[1]).not.toHaveProperty('backwardFactor', 0);
      expect(extensionCreateCall?.[1]).not.toHaveProperty('volumeRatio', 0);
    });
  });

  describe('fetchDividFactors', () => {
    it('uses normalized dividend-factors endpoint and maps explicit factor items only', async () => {
      mockAxiosPost.mockResolvedValueOnce({
        data: {
          ok: true,
          provider: 'tdx',
          data: {
            items: [
              {
                symbol: '600519.SH',
                date: '20250101',
                forwardFactor: 1.2345,
                backwardFactor: 0.9876,
                provider: 'tdx',
              },
              {
                symbol: '600519.SH',
                date: '20250601',
                bonus: 1.23,
                provider: 'tdx',
              },
            ],
          },
          meta: { transport: 'http', asOf: '2026-06-26T15:01:00+08:00' },
          error: null,
        },
      });

      const result = await service.fetchDividFactors(
        '600519.SH',
        new Date('2025-01-01T00:00:00+08:00'),
        new Date('2025-12-31T00:00:00+08:00'),
      );

      expect(mockAxiosPost).toHaveBeenCalledWith(
        '/v1/reference/dividend-factors/query',
        {
          symbol: '600519.SH',
          startTime: '20250101',
          endTime: '20251231',
        },
      );
      expect(mockAxiosGet).not.toHaveBeenCalled();
      expect(result).toEqual([
        {
          timestamp: new Date('2025-01-01T00:00:00+08:00'),
          forwardFactor: 1.2345,
          backwardFactor: 0.9876,
        },
      ]);
    });

    it('treats dividend factor fetch failures as recoverable empty factors', async () => {
      mockAxiosPost.mockRejectedValueOnce(new Error('tdx timeout'));

      const result = await service.fetchDividFactors(
        '600519.SH',
        new Date('2025-01-01T00:00:00+08:00'),
        new Date('2025-12-31T00:00:00+08:00'),
      );

      expect(result).toEqual([]);
      expect(mockAxiosPost).toHaveBeenCalledWith(
        '/v1/reference/dividend-factors/query',
        {
          symbol: '600519.SH',
          startTime: '20250101',
          endTime: '20251231',
        },
      );
      expect(mockAxiosGet).not.toHaveBeenCalled();
    });
  });

  describe('normalized /v1 HTTP contract', () => {
    const expectBadGatewayWithMessage = async (
      promise: Promise<unknown>,
      message: string,
    ) => {
      await expect(promise).rejects.toMatchObject({
        status: HttpStatus.BAD_GATEWAY,
        message: expect.stringContaining(message),
      });
    };

    it('fetchK posts to /v1/bars/query and maps normalized bars', async () => {
      mockAxiosPost.mockResolvedValueOnce({
        data: {
          ok: true,
          provider: 'tdx',
          data: {
            bars: [
              {
                symbol: '600519.SH',
                period: '1m',
                barTime: '2026-06-26T09:31:00+08:00',
                open: 10.1,
                high: 10.3,
                low: 10.0,
                close: 10.2,
                volume: '1200.12500000',
                amount: '12345.60000000',
                provider: 'tdx',
                receivedAt: '2026-06-26T09:31:02+08:00',
              },
            ],
          },
          meta: { transport: 'http', asOf: '2026-06-26T09:31:02+08:00' },
          error: null,
        },
      });

      const result = await service.fetchK({
        code: '600519',
        formatCode: '600519.SH',
        period: Period.ONE_MIN,
        startDate: new Date('2026-06-26T00:00:00+08:00'),
        endDate: new Date('2026-06-26T23:59:59+08:00'),
      });

      expect(mockAxiosPost).toHaveBeenCalledWith(
        '/v1/bars/query',
        expect.objectContaining({
          symbols: ['600519.SH'],
          // Python /v1 currently accepts the same TDX period tokens as PeriodMappingService.
          period: '1m',
          startTime: '2026-06-25T16:00:00.000Z',
          endTime: '2026-06-26T15:59:59.000Z',
        }),
      );
      expect(mockAxiosGet).not.toHaveBeenCalled();
      expect(result[0]).toEqual({
        timestamp: new Date('2026-06-26T09:31:00+08:00'),
        open: 10.1,
        high: 10.3,
        low: 10.0,
        close: 10.2,
        volume: '1200.125',
        // TDX historical amount is provider-native 万元 → canonical yuan (×10000).
        amount: '123456000',
      });
    });

    it.each<
      [
        string,
        { amount?: string | null; volume?: string },
        { volume?: string | null; amount?: string | null },
      ]
    >([
      [
        'converts 万元 amount to yuan exactly (600519 daily)',
        { amount: '737346.25', volume: '5512752' },
        { amount: '7373462500', volume: '5512752' },
      ],
      [
        'keeps volume as share value',
        { volume: '5512752' },
        { volume: '5512752', amount: '7373462500' },
      ],
      [
        'passes null amount through',
        { amount: null },
        { amount: null, volume: '5512752' },
      ],
    ])('%s', async (_, barOverrides, expectedQuantity) => {
      mockAxiosPost.mockResolvedValueOnce({
        data: {
          ok: true,
          provider: 'tdx',
          data: {
            bars: [
              {
                symbol: '600519.SH',
                period: '1d',
                barTime: '2026-07-31T15:00:00+08:00',
                open: 1350.0,
                high: 1360.0,
                low: 1340.0,
                close: 1350.6,
                volume: '5512752',
                amount: '737346.25',
                provider: 'tdx',
                receivedAt: '2026-07-31T15:00:02+08:00',
                ...barOverrides,
              },
            ],
          },
          meta: null,
          error: null,
        },
      });

      const result = await service.fetchK({
        code: '600519',
        formatCode: '600519.SH',
        period: Period.DAY,
        startDate: new Date('2026-07-31T00:00:00+08:00'),
        endDate: new Date('2026-07-31T23:59:59+08:00'),
      });

      expect(result[0]).toMatchObject({
        volume: expectedQuantity.volume,
        amount: expectedQuantity.amount,
      });
    });

    it.each([
      ['numeric volume', { volume: 1200 }],
      ['signed amount', { amount: '+12345.6' }],
      ['over-scale volume', { volume: '1.000000000' }],
    ])(
      'rejects %s before producing a canonical historical K',
      async (_, invalid) => {
        mockAxiosPost.mockResolvedValueOnce({
          data: {
            ok: true,
            provider: 'tdx',
            data: {
              bars: [
                {
                  symbol: '600519.SH',
                  period: '1m',
                  barTime: '2026-06-26T09:31:00+08:00',
                  open: 10.1,
                  high: 10.3,
                  low: 10,
                  close: 10.2,
                  volume: '1200',
                  amount: '12345.6',
                  provider: 'tdx',
                  receivedAt: '2026-06-26T09:31:02+08:00',
                  ...invalid,
                },
              ],
            },
            meta: null,
            error: null,
          },
        });

        await expect(
          service.fetchK({
            code: '600519',
            formatCode: '600519.SH',
            period: Period.ONE_MIN,
            startDate: new Date('2026-06-26T00:00:00+08:00'),
            endDate: new Date('2026-06-26T23:59:59+08:00'),
          }),
        ).rejects.toMatchObject({ status: HttpStatus.BAD_GATEWAY });
      },
    );

    it('normalizes 60 minute bars to the native TDX 1h token', async () => {
      mockAxiosPost.mockResolvedValueOnce({
        data: {
          ok: true,
          provider: 'tdx',
          data: {
            bars: [
              {
                symbol: '600519.SH',
                period: '1h',
                barTime: '2026-06-26T10:30:00+08:00',
                open: 1199,
                high: 1199,
                low: 1180.42,
                close: 1181.25,
                volume: '2161000',
                amount: '256979.45',
                provider: 'tdx',
                receivedAt: '2026-06-26T10:31:00+08:00',
              },
            ],
          },
          meta: { transport: 'http', asOf: '2026-06-26T10:31:00+08:00' },
          error: null,
        },
      });

      await service.fetchK({
        code: '600519',
        formatCode: '600519.SH',
        period: Period.SIXTY_MIN,
        startDate: new Date('2026-06-26T09:30:00+08:00'),
        endDate: new Date('2026-06-26T15:00:00+08:00'),
      });

      expect(mockAxiosPost).toHaveBeenCalledWith(
        '/v1/bars/query',
        expect.objectContaining({
          period: '1h',
        }),
      );
    });

    it('preserves explicit null TDX volume and amount', async () => {
      mockAxiosPost.mockResolvedValueOnce({
        data: {
          ok: true,
          provider: 'tdx',
          data: {
            bars: [
              {
                symbol: '600519.SH',
                period: '1m',
                barTime: '2026-06-26T09:31:00+08:00',
                open: 10.1,
                high: 10.3,
                low: 10.0,
                close: 10.2,
                volume: null,
                amount: null,
                provider: 'tdx',
                receivedAt: '2026-06-26T09:31:02+08:00',
              },
            ],
          },
          meta: null,
          error: null,
        },
      });

      const rows = await service.fetchK({
        code: '600519',
        formatCode: '600519.SH',
        period: Period.ONE_MIN,
        startDate: new Date('2026-06-26T00:00:00+08:00'),
        endDate: new Date('2026-06-26T23:59:59+08:00'),
      });

      expect(rows[0]).toEqual(
        expect.objectContaining({ volume: null, amount: null }),
      );
    });

    it('fetchK requests and maps structured TDX bar extension fields', async () => {
      mockAxiosPost.mockResolvedValueOnce({
        data: {
          ok: true,
          provider: 'tdx',
          data: {
            bars: [
              {
                symbol: '600519.SH',
                period: '1d',
                barTime: '2026-06-26T00:00:00+08:00',
                open: 1199,
                high: 1199,
                low: 1168.1,
                close: 1168.63,
                volume: '5006647',
                amount: '592201.44',
                forwardFactor: 0.711862,
                volInStock: 182942480,
                unreviewedProviderField: 'not-owned',
                provider: 'tdx',
                receivedAt: '2026-06-26T15:01:00+08:00',
              },
            ],
          },
          meta: { transport: 'http', asOf: '2026-06-26T15:01:00+08:00' },
          error: null,
        },
      });

      const result = await service.fetchK({
        code: '600519',
        formatCode: '600519.SH',
        period: Period.DAY,
        startDate: new Date('2026-06-01T00:00:00+08:00'),
        endDate: new Date('2026-06-26T23:59:59+08:00'),
      });

      expect(mockAxiosPost).toHaveBeenCalledWith(
        '/v1/bars/query',
        expect.objectContaining({
          fields: [
            'Open',
            'High',
            'Low',
            'Close',
            'Volume',
            'Amount',
            'ForwardFactor',
            'VolInStock',
          ],
          dividendType: 'front',
          fillData: false,
        }),
      );
      expect(result[0].extensions).toEqual({
        forwardFactor: 0.711862,
        volInStock: 182942480,
      });
      expect(result[0]).not.toHaveProperty('raw');
      expect(result[0]).not.toHaveProperty('unreviewedProviderField');
    });

    it('throws bad gateway when normalized bars payload is not an array', async () => {
      mockAxiosPost.mockResolvedValueOnce({
        data: {
          ok: true,
          provider: 'tdx',
          data: {
            bars: {},
          },
          meta: { transport: 'http', asOf: '2026-06-26T09:31:02+08:00' },
          error: null,
        },
      });

      await expectBadGatewayWithMessage(
        service.fetchK({
          code: '600519',
          formatCode: '600519.SH',
          period: Period.ONE_MIN,
          startDate: new Date('2026-06-26T00:00:00+08:00'),
          endDate: new Date('2026-06-26T23:59:59+08:00'),
        }),
        'Invalid normalized TDX bars response',
      );
    });
  });
});
