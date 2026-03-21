import { PeriodMapping } from './period-mapping.util';
import { KPeriod } from '../enums/k-period.enum';
import { DataSource } from '../enums/data-source.enum';

describe('PeriodMapping', () => {
  describe('toSourceFormat', () => {
    it('should convert 1min to east money format', () => {
      const result = PeriodMapping.toSourceFormat(
        KPeriod.MIN_1,
        DataSource.EAST_MONEY,
      );
      expect(result).toBe('1');
    });

    it('should convert daily to east money format', () => {
      const result = PeriodMapping.toSourceFormat(
        KPeriod.DAILY,
        DataSource.EAST_MONEY,
      );
      expect(result).toBe('daily');
    });

    it('should convert 1min to tdx format', () => {
      const result = PeriodMapping.toSourceFormat(
        KPeriod.MIN_1,
        DataSource.TDX,
      );
      expect(result).toBe('1m');
    });

    it('should throw error for unsupported period', () => {
      expect(() => {
        PeriodMapping.toSourceFormat(KPeriod.MIN_15, DataSource.TDX);
      }).toThrow('Data source tdx does not support period 15min');
    });
  });

  describe('isSupported', () => {
    it('should return true for supported periods', () => {
      expect(
        PeriodMapping.isSupported(KPeriod.DAILY, DataSource.EAST_MONEY),
      ).toBe(true);
      expect(PeriodMapping.isSupported(KPeriod.DAILY, DataSource.TDX)).toBe(
        true,
      );
    });

    it('should return false for unsupported periods', () => {
      expect(PeriodMapping.isSupported(KPeriod.MIN_15, DataSource.TDX)).toBe(
        false,
      );
    });
  });
});
