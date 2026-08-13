const DECIMAL8_SCALE = 100_000_000n;
const DECIMAL8_MAX_SCALED = 10n ** 36n - 1n;
const EXTERNAL_DECIMAL_PATTERN = /^([0-9]+)(?:\.([0-9]{1,8}))?$/;
const CANONICAL_DECIMAL_PATTERN =
  /^(?:0|[1-9][0-9]{0,27})(?:\.[0-9]{0,7}[1-9])?$/;

export type Decimal8UnitFactor = 100 | 10_000;
export type Decimal8Comparison = -1 | 0 | 1;

/**
 * Normalize one approved external unsigned decimal text value.
 *
 * This is intentionally separate from {@link Decimal8.parseCanonical}:
 * external boundaries may normalize once, while Redis/RPC/domain consumers
 * must reject alternate spellings of an already-canonical value.
 */
export function normalizeExternalDecimalText(value: string): string {
  assertString(value);
  if (value.length > 37) {
    throw new RangeError('decimal text exceeds 37 ASCII characters');
  }

  const match = EXTERNAL_DECIMAL_PATTERN.exec(value);
  if (!match) {
    throw new TypeError('decimal text must be unsigned ASCII fixed-point');
  }

  const [, rawInteger, rawFraction = ''] = match;
  const integer = rawInteger.replace(/^0+(?=\d)/, '');
  if (integer.length > 28) {
    throw new RangeError('decimal text exceeds 28 integer digits');
  }

  const fraction = rawFraction.replace(/0+$/, '');
  return fraction.length > 0 ? `${integer}.${fraction}` : integer;
}

/**
 * Immutable scale-eight decimal used only inside calculation boundaries.
 * JSON/RPC/Redis/MySQL boundaries must call {@link formatCanonical} first.
 */
export class Decimal8 {
  static readonly ZERO = new Decimal8(0n);

  private constructor(private readonly scaledValue: bigint) {}

  static parseCanonical(value: string): Decimal8 {
    assertString(value);
    if (value.length > 37 || !CANONICAL_DECIMAL_PATTERN.test(value)) {
      throw new TypeError('value must be a canonical unsigned Decimal8 string');
    }

    const [integer, fraction = ''] = value.split('.');
    const scaled =
      BigInt(integer) * DECIMAL8_SCALE + BigInt(fraction.padEnd(8, '0') || '0');
    return Decimal8.fromScaled(scaled);
  }

  formatCanonical(): string {
    if (this.scaledValue < 0n) {
      throw new RangeError(
        'negative Decimal8 cannot cross a quantity boundary',
      );
    }

    const integer = this.scaledValue / DECIMAL8_SCALE;
    const fraction = this.scaledValue % DECIMAL8_SCALE;
    if (fraction === 0n) {
      return integer.toString();
    }

    const compactFraction = fraction
      .toString()
      .padStart(8, '0')
      .replace(/0+$/, '');
    return `${integer}.${compactFraction}`;
  }

  compare(other: Decimal8): Decimal8Comparison {
    assertDecimal8(other);
    if (this.scaledValue < other.scaledValue) return -1;
    if (this.scaledValue > other.scaledValue) return 1;
    return 0;
  }

  add(other: Decimal8): Decimal8 {
    assertDecimal8(other);
    return Decimal8.fromScaled(this.scaledValue + other.scaledValue);
  }

  subtract(other: Decimal8): Decimal8 {
    assertDecimal8(other);
    return Decimal8.fromScaled(this.scaledValue - other.scaledValue);
  }

  /**
   * Divide by another Decimal8, rounding half up to scale-eight.
   * Non-negative operands only (Decimal8 is unsigned by design).
   */
  divideRoundHalfUp(other: Decimal8): Decimal8 {
    assertDecimal8(other);
    if (other.scaledValue <= 0n) {
      throw new RangeError('division requires a positive Decimal8 divisor');
    }
    const numerator = this.scaledValue * DECIMAL8_SCALE;
    const denominator = other.scaledValue;
    const rounded = (numerator * 2n + denominator) / (2n * denominator);
    return Decimal8.fromScaled(rounded);
  }

  /** Round to `places` decimal places (0..8), half up. Non-negative only. */
  roundToScale(places: number): Decimal8 {
    if (!Number.isInteger(places) || places < 0 || places > 8) {
      throw new RangeError('places must be an integer in 0..8');
    }
    const factor = 10n ** BigInt(8 - places);
    const half = factor / 2n;
    const rounded = ((this.scaledValue + half) / factor) * factor;
    return Decimal8.fromScaled(rounded);
  }

  scaleByUnit(factor: Decimal8UnitFactor): Decimal8 {
    if (this.scaledValue < 0n) {
      throw new RangeError('unit scaling requires a non-negative Decimal8');
    }

    const multiplier = unitMultiplier(factor);
    return Decimal8.fromScaled(this.scaledValue * multiplier);
  }

  toJSON(): never {
    throw new TypeError(
      'Decimal8 is in-process only; format it as a canonical string before serialization',
    );
  }

  [Symbol.toPrimitive](): never {
    throw new TypeError('Decimal8 does not support implicit numeric coercion');
  }

  private static fromScaled(value: bigint): Decimal8 {
    if (value < -DECIMAL8_MAX_SCALED || value > DECIMAL8_MAX_SCALED) {
      throw new RangeError('Decimal8 result exceeds DECIMAL(36,8) range');
    }
    return new Decimal8(value);
  }
}

function assertString(value: unknown): asserts value is string {
  if (typeof value !== 'string') {
    throw new TypeError('decimal input must be a string');
  }
}

function assertDecimal8(value: unknown): asserts value is Decimal8 {
  if (!(value instanceof Decimal8)) {
    throw new TypeError('operand must be a Decimal8');
  }
}

function unitMultiplier(factor: Decimal8UnitFactor): bigint {
  if (factor === 100) return 100n;
  if (factor === 10_000) return 10_000n;
  throw new RangeError('Decimal8 unit factor must be 100 or 10000');
}
