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
    expect(service.toSourceFormat(Period.SIXTY_MIN, DataSource.TDX)).toBe('1h');
    expect(service.toSourceFormat(Period.DAY, DataSource.TDX)).toBe('1d');
  });

  it('should convert all QMT native K periods independently from TDX and EastMoney', () => {
    expect(service.toSourceFormat(Period.ONE_MIN, DataSource.QMT)).toBe('1m');
    expect(service.toSourceFormat(Period.THREE_MIN, DataSource.QMT)).toBe('3m');
    expect(service.toSourceFormat(Period.FIVE_MIN, DataSource.QMT)).toBe('5m');
    expect(service.toSourceFormat(Period.FIFTEEN_MIN, DataSource.QMT)).toBe(
      '15m',
    );
    expect(service.toSourceFormat(Period.THIRTY_MIN, DataSource.QMT)).toBe(
      '30m',
    );
    expect(service.toSourceFormat(Period.SIXTY_MIN, DataSource.QMT)).toBe('1h');
    expect(service.toSourceFormat(Period.DAY, DataSource.QMT)).toBe('1d');
    expect(service.toSourceFormat(Period.WEEK, DataSource.QMT)).toBe('1w');
    expect(service.toSourceFormat(Period.MONTH, DataSource.QMT)).toBe('1mon');
    expect(service.toSourceFormat(Period.QUARTER, DataSource.QMT)).toBe('1q');
    expect(service.toSourceFormat(Period.HALF_YEAR, DataSource.QMT)).toBe(
      '1hy',
    );
    expect(service.toSourceFormat(Period.YEAR, DataSource.QMT)).toBe('1y');
  });

  it('should map periods to TDX source format', () => {
    expect(service.toSourceFormat(Period.ONE_MIN, DataSource.TDX)).toBe('1m');
    expect(service.toSourceFormat(Period.FIVE_MIN, DataSource.TDX)).toBe('5m');
    expect(service.toSourceFormat(Period.FIFTEEN_MIN, DataSource.TDX)).toBe(
      '15m',
    );
    expect(service.toSourceFormat(Period.THIRTY_MIN, DataSource.TDX)).toBe(
      '30m',
    );
    expect(service.toSourceFormat(Period.SIXTY_MIN, DataSource.TDX)).toBe('1h');
    expect(service.toSourceFormat(Period.DAY, DataSource.TDX)).toBe('1d');
    expect(service.toSourceFormat(Period.WEEK, DataSource.TDX)).toBe('1w');
    expect(service.toSourceFormat(Period.MONTH, DataSource.TDX)).toBe('1mon');
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
    expect(service.isSupported(Period.HALF_YEAR, DataSource.QMT)).toBe(true);
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

  it('maps TDX source period tokens back to the unified Period enum', () => {
    expect(service.fromSourceFormat('1m', DataSource.TDX)).toBe(Period.ONE_MIN);
    expect(service.fromSourceFormat('1h', DataSource.TDX)).toBe(
      Period.SIXTY_MIN,
    );
    expect(service.fromSourceFormat('1d', DataSource.TDX)).toBe(Period.DAY);
    expect(service.fromSourceFormat('1mon', DataSource.TDX)).toBe(Period.MONTH);
    expect(service.fromSourceFormat('1M', DataSource.TDX)).toBe(Period.MONTH);
  });

  it('maps QMT source period aliases back to the unified Period enum', () => {
    expect(service.fromSourceFormat('3min', DataSource.QMT)).toBe(
      Period.THREE_MIN,
    );
    expect(service.fromSourceFormat('1mon', DataSource.QMT)).toBe(Period.MONTH);
    expect(service.fromSourceFormat('halfyear', DataSource.QMT)).toBe(
      Period.HALF_YEAR,
    );
    expect(service.fromSourceFormat('1y', DataSource.QMT)).toBe(Period.YEAR);
  });

  it('throws when a source period token is unsupported', () => {
    expect(() => service.fromSourceFormat('4h', DataSource.TDX)).toThrow(
      'does not support source period 4h',
    );
  });
});
