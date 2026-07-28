export type KDecimal = string;

const K_DECIMAL_PATTERN = /^([+-]?)(\d+)(?:\.(\d+))?$/;
const K_DECIMAL_INTEGER_DIGITS = 28;
const K_DECIMAL_SCALE = 8;

export function normalizeKDecimal(
  value: string | null,
  fieldName: 'volume' | 'amount',
): KDecimal | null {
  if (value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    throw new TypeError(`${fieldName} must be a decimal string or null`);
  }
  const match = K_DECIMAL_PATTERN.exec(value.trim());
  if (!match) {
    throw new TypeError(`${fieldName} must be a finite decimal string or null`);
  }

  const [, sign, rawInteger, rawFraction = ''] = match;
  const integer = rawInteger.replace(/^0+(?=\d)/, '');
  const fraction = rawFraction.replace(/0+$/, '');
  if (integer.replace(/^0+$/, '').length > K_DECIMAL_INTEGER_DIGITS) {
    throw new RangeError(`${fieldName} exceeds 28 integer digits`);
  }
  if (fraction.length > K_DECIMAL_SCALE) {
    throw new RangeError(`${fieldName} exceeds 8 fractional digits`);
  }
  if (/^0+$/.test(integer) && fraction.length === 0) {
    return '0';
  }
  return `${sign === '-' ? '-' : ''}${integer}${fraction ? `.${fraction}` : ''}`;
}

export function kDecimalFromNumber(
  value: number | null | undefined,
  fieldName: 'volume' | 'amount',
): KDecimal | null {
  if (value == null || !Number.isFinite(value)) {
    return null;
  }
  return normalizeKDecimal(String(value), fieldName);
}
