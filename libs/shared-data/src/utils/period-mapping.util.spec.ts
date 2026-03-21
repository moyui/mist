import { PeriodMapping } from './period-mapping.util';
import { BarPeriod } from '../enums/bar-period.enum';
import { DataSource } from '../enums/data-source.enum';

describe('PeriodMapping', () => {
  describe('toSourceFormat', () => {
    it('should convert 1min to east money format', () => {
      const result = PeriodMapping.toSourceFormat(
        BarPeriod.ONE_MIN,
        DataSource.EAST_MONEY,
      );
      expect(result).toBe('1');
    });

    it('should convert daily to east money format', () => {
      const result = PeriodMapping.toSourceFormat(
        BarPeriod.DAILY,
        DataSource.EAST_MONEY,
      );
      expect(result).toBe('daily');
    });

    it('should convert 1min to tdx format', () => {
      const result = PeriodMapping.toSourceFormat(
        BarPeriod.ONE_MIN,
        DataSource.TDX,
      );
      expect(result).toBe('1m');
    });

    it('should throw error for unsupported period', () => {
      expect(() => {
        PeriodMapping.toSourceFormat(BarPeriod.FIFTEEN_MIN, DataSource.TDX);
      }).toThrow('Data source tdx does not support period 15min');
    });
  });

  describe('isSupported', () => {
    it('should return true for supported periods', () => {
      expect(
        PeriodMapping.isSupported(BarPeriod.DAILY, DataSource.EAST_MONEY),
      ).toBe(true);
      expect(PeriodMapping.isSupported(BarPeriod.DAILY, DataSource.TDX)).toBe(
        true,
      );
    });

    it('should return false for unsupported periods', () => {
      expect(
        PeriodMapping.isSupported(BarPeriod.FIFTEEN_MIN, DataSource.TDX),
      ).toBe(false);
    });
  });
});
