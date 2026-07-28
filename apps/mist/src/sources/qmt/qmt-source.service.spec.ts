import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AxiosInstance } from 'axios';
import { DataSource as TypeOrmDataSource } from 'typeorm';
import {
  DataSource,
  K,
  KExtensionQmt,
  Period,
  Security,
} from '@app/shared-data';
import { PeriodMappingService, UtilsService } from '@app/utils';
import { DATASOURCE_HTTP_TIMEOUT_MS } from '../constants';
import { QmtSource } from './qmt-source.service';
import { QmtResponse } from './types';

const createInsertBuilderMock = () => ({
  insert: jest.fn().mockReturnThis(),
  into: jest.fn().mockReturnThis(),
  values: jest.fn().mockReturnThis(),
  orUpdate: jest.fn().mockReturnThis(),
  updateEntity: jest.fn().mockReturnThis(),
  execute: jest.fn().mockResolvedValue(undefined),
});

describe('QmtSource', () => {
  let service: QmtSource;
  let mockAxiosPost: jest.Mock;
  let mockTypeOrmDataSource: jest.Mocked<TypeOrmDataSource>;
  let createAxiosInstance: jest.Mock;

  beforeEach(async () => {
    mockAxiosPost = jest.fn();
    const mockAxiosInstance = {
      post: mockAxiosPost,
    } as unknown as jest.Mocked<AxiosInstance>;
    createAxiosInstance = jest.fn(() => mockAxiosInstance);
    mockTypeOrmDataSource = {
      transaction: jest.fn(),
    } as unknown as jest.Mocked<TypeOrmDataSource>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QmtSource,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'QMT_BASE_URL') return 'http://127.0.0.1:9002';
              return undefined;
            }),
          },
        },
        {
          provide: UtilsService,
          useValue: {
            createAxiosInstance,
          },
        },
        {
          provide: PeriodMappingService,
          useValue: {
            toSourceFormat: jest.fn((period: Period, source: DataSource) => {
              if (source !== DataSource.QMT) return null;
              return {
                [Period.ONE_MIN]: '1m',
                [Period.THREE_MIN]: '3m',
                [Period.FIVE_MIN]: '5m',
                [Period.FIFTEEN_MIN]: '15m',
                [Period.THIRTY_MIN]: '30m',
                [Period.SIXTY_MIN]: '1h',
                [Period.DAY]: '1d',
                [Period.WEEK]: '1w',
                [Period.MONTH]: '1mon',
                [Period.QUARTER]: '1q',
                [Period.HALF_YEAR]: '1hy',
                [Period.YEAR]: '1y',
              }[period];
            }),
            isSupported: jest.fn((period: Period, source: DataSource) => {
              return (
                source === DataSource.QMT &&
                [
                  Period.ONE_MIN,
                  Period.THREE_MIN,
                  Period.FIVE_MIN,
                  Period.FIFTEEN_MIN,
                  Period.THIRTY_MIN,
                  Period.SIXTY_MIN,
                  Period.DAY,
                  Period.WEEK,
                  Period.MONTH,
                  Period.QUARTER,
                  Period.HALF_YEAR,
                  Period.YEAR,
                ].includes(period)
              );
            }),
          },
        },
        {
          provide: TypeOrmDataSource,
          useValue: mockTypeOrmDataSource,
        },
      ],
    }).compile();

    service = module.get<QmtSource>(QmtSource);
  });

  it('uses QMT_BASE_URL with the shared datasource HTTP timeout', () => {
    expect(createAxiosInstance).toHaveBeenCalledWith({
      baseURL: 'http://127.0.0.1:9002',
      timeout: DATASOURCE_HTTP_TIMEOUT_MS,
    });
  });

  it('posts native get_market_data_ex payload and maps columnar minute data', async () => {
    mockAxiosPost.mockResolvedValueOnce({
      data: {
        ok: true,
        provider: 'qmt',
        data: {
          marketData: {
            '600519.SH': {
              open: { '20260703143000': 11.1 },
              high: { '20260703143000': 11.5 },
              low: { '20260703143000': 10.9 },
              close: { '20260703143000': 11.3 },
              volume: { '20260703143000': '1200.12500000' },
              amount: { '20260703143000': '13560.25000000' },
              stime: { '20260703143000': '20260703143000' },
              preClose: { '20260703143000': 10.8 },
              openInterest: { '20260703143000': 22 },
              suspendFlag: { '20260703143000': 0 },
              settelementPrice: { '20260703143000': 11.2 },
            },
          },
        },
        meta: null,
        error: null,
      },
    });

    const rows = await service.fetchK({
      code: '600519',
      formatCode: '600519.SH',
      period: Period.THREE_MIN,
      startDate: new Date('2026-07-03T09:30:00+08:00'),
      endDate: new Date('2026-07-03T15:00:00+08:00'),
    });

    expect(mockAxiosPost).toHaveBeenCalledWith('/v1/bars/query', {
      fields: expect.arrayContaining([
        'open',
        'high',
        'low',
        'close',
        'volume',
        'amount',
        'stime',
        'preClose',
        'openInterest',
        'suspendFlag',
      ]),
      stock_list: ['600519.SH'],
      period: '3m',
      start_time: '20260703093000',
      end_time: '20260703150000',
      count: -1,
      dividend_type: 'front_ratio',
      fill_data: true,
      include_raw: false,
    });
    expect(rows).toEqual([
      {
        timestamp: new Date('2026-07-03T14:30:00+08:00'),
        open: 11.1,
        high: 11.5,
        low: 10.9,
        close: 11.3,
        volume: '1200.125',
        amount: '13560.25',
        period: Period.THREE_MIN,
        extensions: {
          preClose: 10.8,
          openInterest: 22,
          suspendFlag: 0,
          settle: 11.2,
          effectiveDividendType: 'front_ratio',
          nativePeriod: '3m',
        },
      },
    ]);
  });

  it('keeps an otherwise valid QMT row when volume and amount are null', async () => {
    const rowKey = '20260703143000';
    mockAxiosPost.mockResolvedValueOnce({
      data: {
        ok: true,
        provider: 'qmt',
        data: {
          marketData: {
            '600519.SH': {
              open: { [rowKey]: 11.1 },
              high: { [rowKey]: 11.5 },
              low: { [rowKey]: 10.9 },
              close: { [rowKey]: 11.3 },
              volume: { [rowKey]: null },
              amount: { [rowKey]: null },
              stime: { [rowKey]: rowKey },
            },
          },
        },
        meta: null,
        error: null,
      },
    });

    const rows = await service.fetchK({
      code: '600519',
      formatCode: '600519.SH',
      period: Period.ONE_MIN,
      startDate: new Date('2026-07-03T09:30:00+08:00'),
      endDate: new Date('2026-07-03T15:00:00+08:00'),
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(
      expect.objectContaining({ volume: null, amount: null }),
    );
  });

  it('parses QMT epoch-millisecond time when stime is absent', async () => {
    const barTime = new Date('2026-07-03T14:30:00+08:00');
    const rowKey = '20260703143000';
    mockAxiosPost.mockResolvedValueOnce({
      data: {
        ok: true,
        provider: 'qmt',
        data: {
          marketData: {
            '600519.SH': {
              open: { [rowKey]: 11.1 },
              high: { [rowKey]: 11.5 },
              low: { [rowKey]: 10.9 },
              close: { [rowKey]: 11.3 },
              volume: { [rowKey]: '1200' },
              amount: { [rowKey]: '13560' },
              time: { [rowKey]: barTime.getTime() },
            },
          },
        },
        meta: null,
        error: null,
      },
    });

    const rows = await service.fetchK({
      code: '600519',
      formatCode: '600519.SH',
      period: Period.ONE_MIN,
      startDate: new Date('2026-07-03T09:30:00+08:00'),
      endDate: new Date('2026-07-03T15:00:00+08:00'),
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].timestamp).toEqual(barTime);
  });

  it('formats daily and above request dates as yyyymmdd', async () => {
    mockAxiosPost.mockResolvedValueOnce({
      data: {
        ok: true,
        provider: 'qmt',
        data: { marketData: { '600519.SH': {} } },
        meta: null,
        error: null,
      },
    });

    await service.fetchK({
      code: '600519',
      formatCode: '600519.SH',
      period: Period.DAY,
      startDate: new Date('2026-07-01T00:00:00+08:00'),
      endDate: new Date('2026-07-04T00:00:00+08:00'),
    });

    expect(mockAxiosPost).toHaveBeenCalledWith(
      '/v1/bars/query',
      expect.objectContaining({
        period: '1d',
        start_time: '20260701',
        end_time: '20260704',
        dividend_type: 'front_ratio',
      }),
    );
  });

  it('turns datasource failure envelopes into backend HttpException', async () => {
    mockAxiosPost.mockResolvedValueOnce({
      data: {
        ok: false,
        provider: 'qmt',
        data: null,
        meta: null,
        error: {
          code: 'QMT_OWNER_STALE',
          message: 'bridge owner stale',
          retryable: true,
          details: {},
        },
      },
    });

    await expect(
      service.fetchK({
        code: '600519',
        formatCode: '600519.SH',
        period: Period.ONE_MIN,
        startDate: new Date('2026-07-03T09:30:00+08:00'),
        endDate: new Date('2026-07-03T15:00:00+08:00'),
      }),
    ).rejects.toThrow(/QMT_OWNER_STALE: bridge owner stale/);
  });

  it('saves base K rows and structured QMT extensions', async () => {
    const kInsertBuilder = createInsertBuilderMock();
    const extensionInsertBuilder = createInsertBuilderMock();
    const data: QmtResponse[] = [
      {
        timestamp: new Date('2026-07-03T14:30:00+08:00'),
        open: 11.1,
        high: 11.5,
        low: 10.9,
        close: 11.3,
        volume: '1200',
        amount: '13560',
        period: Period.THREE_MIN,
        extensions: {
          preClose: 10.8,
          openInterest: 22,
          suspendFlag: 0,
          settle: 11.2,
          effectiveDividendType: 'front_ratio',
          nativePeriod: '3m',
        },
      },
    ];
    const security = {
      id: 1,
      code: '600519',
      sourceConfigs: [{ source: DataSource.QMT, formatCode: '600519.SH' }],
    } as Security;
    const manager = {
      create: jest.fn((entity, payload) => ({ entity, ...payload })),
      find: jest.fn((entity) => {
        if (entity === K) {
          return Promise.resolve([{ ...data[0], id: 9 }]);
        }
        return Promise.resolve([]);
      }),
      createQueryBuilder: jest
        .fn()
        .mockReturnValueOnce(kInsertBuilder)
        .mockReturnValueOnce(extensionInsertBuilder),
    };
    mockTypeOrmDataSource.transaction.mockImplementation(
      async (callback: any) => callback(manager as any),
    );

    await service.saveK(data, security, Period.THREE_MIN);

    expect(kInsertBuilder.into).toHaveBeenCalledWith(K);
    expect(kInsertBuilder.values).toHaveBeenCalledWith([
      expect.objectContaining({
        securityId: security.id,
        source: DataSource.QMT,
        period: Period.THREE_MIN,
      }),
    ]);
    expect(extensionInsertBuilder.into).toHaveBeenCalledWith(KExtensionQmt);
    expect(extensionInsertBuilder.values).toHaveBeenCalledWith([
      {
        kId: 9,
        preClose: 10.8,
        openInterest: 22,
        suspendFlag: 0,
        settle: 11.2,
        effectiveDividendType: 'front_ratio',
        nativePeriod: '3m',
      },
    ]);
    expect(extensionInsertBuilder.orUpdate).toHaveBeenCalledWith(
      [
        'preClose',
        'suspendFlag',
        'openInterest',
        'settle',
        'effectiveDividendType',
        'nativePeriod',
      ],
      ['k_id'],
    );
  });
});
