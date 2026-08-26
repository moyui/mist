import {
  createIdempotentMetricRegistration,
  resetMetricRegistrationsForTest,
  sanitizeLowCardinalityLabel,
  safeMetricNumber,
} from './metric-utils';

describe('metric-utils', () => {
  beforeEach(() => {
    resetMetricRegistrationsForTest();
  });

  describe('createIdempotentMetricRegistration', () => {
    it('executes the registration callback once for a given key', () => {
      const callback = jest.fn();
      const first = createIdempotentMetricRegistration('test_metric', callback);
      const second = createIdempotentMetricRegistration(
        'test_metric',
        callback,
      );

      expect(first).toBe(true);
      expect(second).toBe(false);
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('allows different keys to execute independently', () => {
      const callbackA = jest.fn();
      const callbackB = jest.fn();

      expect(createIdempotentMetricRegistration('metric_a', callbackA)).toBe(
        true,
      );
      expect(createIdempotentMetricRegistration('metric_b', callbackB)).toBe(
        true,
      );
      expect(callbackA).toHaveBeenCalledTimes(1);
      expect(callbackB).toHaveBeenCalledTimes(1);
    });
  });

  describe('sanitizeLowCardinalityLabel', () => {
    it('returns fallback for null, undefined, or empty strings', () => {
      expect(sanitizeLowCardinalityLabel(null)).toBe('unknown');
      expect(sanitizeLowCardinalityLabel(undefined)).toBe('unknown');
      expect(sanitizeLowCardinalityLabel('')).toBe('unknown');
      expect(sanitizeLowCardinalityLabel('   ')).toBe('unknown');
      expect(sanitizeLowCardinalityLabel(null, 'default')).toBe('default');
    });

    it('returns trimmed string for valid labels', () => {
      expect(sanitizeLowCardinalityLabel('tdx')).toBe('tdx');
      expect(sanitizeLowCardinalityLabel('  qmt  ')).toBe('qmt');
    });

    it('returns fallback for excessively long strings exceeding max cardinality length', () => {
      const longString = 'a'.repeat(65);
      expect(sanitizeLowCardinalityLabel(longString)).toBe('unknown');
    });
  });

  describe('safeMetricNumber', () => {
    it('returns the number if finite', () => {
      expect(safeMetricNumber(42)).toBe(42);
      expect(safeMetricNumber(0)).toBe(0);
      expect(safeMetricNumber(-5)).toBe(-5);
      expect(safeMetricNumber(3.14)).toBe(3.14);
    });

    it('returns fallback for null, undefined, NaN, or Infinity', () => {
      expect(safeMetricNumber(null)).toBe(0);
      expect(safeMetricNumber(undefined)).toBe(0);
      expect(safeMetricNumber(NaN)).toBe(0);
      expect(safeMetricNumber(Infinity)).toBe(0);
      expect(safeMetricNumber(null, 10)).toBe(10);
    });
  });
});
