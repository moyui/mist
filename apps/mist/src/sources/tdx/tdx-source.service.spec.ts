import { Test, TestingModule } from '@nestjs/testing';
import { TdxSource } from './tdx-source.service';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import {
  Period,
  Security,
  DataSource as AppDataSource,
} from '@app/shared-data';
import { PeriodMappingService } from '@app/utils';

describe('TdxSource', () => {
  let service: TdxSource;
  let mockAxiosGet: jest.Mock;
  let mockTypeOrmDataSource: jest.Mocked<DataSource>;

  beforeEach(async () => {
    mockAxiosGet = jest.fn();

    mockTypeOrmDataSource = {
      transaction: jest.fn(),
    } as unknown as jest.Mocked<DataSource>;

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
          provide: PeriodMappingService,
          useValue: {
            toSourceFormat: jest.fn((period: Period, source: AppDataSource) => {
              if (source === AppDataSource.TDX) {
                switch (period) {
                  case Period.ONE_MIN:
                    return '1min';
                  case Period.FIVE_MIN:
                    return '5min';
                  case Period.FIFTEEN_MIN:
                    return '15min';
                  case Period.THIRTY_MIN:
                    return '30min';
                  case Period.SIXTY_MIN:
                    return '60min';
                  case Period.DAY:
                    return 'day';
                  case Period.WEEK:
                    return 'week';
                  case Period.MONTH:
                    return 'month';
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
    };
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
  });
});
