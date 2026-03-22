import { Test, TestingModule } from '@nestjs/testing';
import { PeriodMappingService } from './period-mapping.service';
import { KPeriod, DataSource } from '@app/shared-data';

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
    expect(service.toSourceFormat(KPeriod.ONE_MIN, DataSource.EAST_MONEY)).toBe(
      '1',
    );
    expect(service.toSourceFormat(KPeriod.DAILY, DataSource.EAST_MONEY)).toBe(
      'daily',
    );
  });

  it('should convert periods for TDX', () => {
    expect(service.toSourceFormat(KPeriod.ONE_MIN, DataSource.TDX)).toBe('1m');
    expect(service.toSourceFormat(KPeriod.DAILY, DataSource.TDX)).toBe('1d');
  });

  it('should fallback to EAST_MONEY for MINI_QMT', () => {
    expect(service.toSourceFormat(KPeriod.ONE_MIN, DataSource.MINI_QMT)).toBe(
      '1',
    );
    expect(service.toSourceFormat(KPeriod.DAILY, DataSource.MINI_QMT)).toBe(
      'daily',
    );
  });

  it('should throw for unsupported period', () => {
    expect(() =>
      service.toSourceFormat(KPeriod.FIFTEEN_MIN, DataSource.TDX),
    ).toThrow('does not support period');
  });

  it('should check supported periods', () => {
    expect(service.isSupported(KPeriod.ONE_MIN, DataSource.EAST_MONEY)).toBe(
      true,
    );
    expect(service.isSupported(KPeriod.FIFTEEN_MIN, DataSource.TDX)).toBe(
      false,
    );
  });

  it('should get all supported periods', () => {
    const tdxPeriods = service.getSupportedPeriods(DataSource.TDX);
    expect(tdxPeriods).toContain(KPeriod.ONE_MIN);
    expect(tdxPeriods).toContain(KPeriod.DAILY);
    expect(tdxPeriods.length).toBe(3); // ONE_MIN, FIVE_MIN, DAILY
  });
});
