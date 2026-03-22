import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DataSourceService } from './data-source.service';
import { DataSource } from '@app/shared-data';

describe('DataSourceService', () => {
  let service: DataSourceService;

  const createService = async (envValue?: string) => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DataSourceService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(() => envValue),
          },
        },
      ],
    }).compile();

    service = module.get<DataSourceService>(DataSourceService);
  };

  describe('with no env var', () => {
    beforeEach(async () => {
      await createService(undefined);
    });

    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should use EAST_MONEY as default when no env var', () => {
      expect(service.getDefault()).toBe(DataSource.EAST_MONEY);
    });

    it('should select enum value directly', () => {
      const result = service.select('ef');
      expect(result).toBe(DataSource.EAST_MONEY);
    });

    it('should select enum key', () => {
      const result = service.select('TDX');
      expect(result).toBe(DataSource.TDX);
    });

    it('should select user-friendly format', () => {
      const result = service.select('east-money');
      expect(result).toBe(DataSource.EAST_MONEY);
    });

    it('should throw on invalid source', () => {
      expect(() => service.select('INVALID')).toThrow('Invalid data source');
    });

    it('should normalize correctly', () => {
      expect(service.normalize('east-money')).toBe('EAST_MONEY');
      expect(service.normalize('EAST_MONEY')).toBe('EAST_MONEY');
      expect(service.normalize('east_money')).toBe('EAST_MONEY');
    });

    it('should validate valid sources', () => {
      expect(service.isValid('ef')).toBe(true);
      expect(service.isValid('EAST_MONEY')).toBe(true);
      expect(service.isValid('east-money')).toBe(true);
      expect(service.isValid('invalid')).toBe(false);
    });
  });

  describe('with env var set to enum value', () => {
    beforeEach(async () => {
      await createService('tdx');
    });

    it('should use env default when valid (enum value)', () => {
      expect(service.getDefault()).toBe(DataSource.TDX);
    });
  });

  describe('with env var set to enum key', () => {
    beforeEach(async () => {
      await createService('TDX');
    });

    it('should use env default when valid (enum key)', () => {
      expect(service.getDefault()).toBe(DataSource.TDX);
    });
  });
});
