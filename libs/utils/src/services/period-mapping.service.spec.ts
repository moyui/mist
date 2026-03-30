import { Test, TestingModule } from '@nestjs/testing';
import { PeriodMappingService } from './period-mapping.service';
import { Period, DataSource } from '@app/shared-data';

describe('PeriodMappingService', () => {
  let service: PeriodMappingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PeriodMappingService],
    }).compile();

    service = module.get<PeriodMappingService>(PeriodMappingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should convert periods for EAST_MONEY', () => {
    expect(service.toSourceFormat(Period.ONE_MIN, DataSource.EAST_MONEY)).toBe(
      '1',
    );
    expect(service.toSourceFormat(Period.DAY, DataSource.EAST_MONEY)).toBe(
      'daily',
    );
  });

  it('should convert periods for TDX', () => {
    expect(service.toSourceFormat(Period.ONE_MIN, DataSource.TDX)).toBe('1m');
    expect(service.toSourceFormat(Period.DAY, DataSource.TDX)).toBe('1d');
  });

  it('should fallback to EAST_MONEY for MINI_QMT', () => {
    expect(service.toSourceFormat(Period.ONE_MIN, DataSource.MINI_QMT)).toBe(
      '1',
    );
    expect(service.toSourceFormat(Period.DAY, DataSource.MINI_QMT)).toBe(
      'daily',
    );
  });

  it('should throw for unsupported period', () => {
    expect(() =>
      service.toSourceFormat(Period.QUARTER, DataSource.TDX),
    ).toThrow('does not support period');
  });

  it('should check supported periods', () => {
    expect(service.isSupported(Period.ONE_MIN, DataSource.EAST_MONEY)).toBe(
      true,
    );
    expect(service.isSupported(Period.FIFTEEN_MIN, DataSource.TDX)).toBe(true);
    expect(service.isSupported(Period.QUARTER, DataSource.TDX)).toBe(false);
  });
});

describe('PeriodMappingService with unified Period enum', () => {
  let service: PeriodMappingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PeriodMappingService],
    }).compile();

    service = module.get<PeriodMappingService>(PeriodMappingService);
  });

  it('should accept Period.ONE_MIN and return correct format', () => {
    const result = service.toSourceFormat(
      Period.ONE_MIN,
      DataSource.EAST_MONEY,
    );
    expect(result).toBe('1');
  });

  it('should accept Period.DAY and return daily format', () => {
    const result = service.toSourceFormat(Period.DAY, DataSource.EAST_MONEY);
    expect(result).toBe('daily');
  });

  it('should throw error for unsupported period', () => {
    expect(() =>
      service.toSourceFormat(Period.QUARTER, DataSource.TDX),
    ).toThrow();
  });
});
