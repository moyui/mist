export type StrategyPriceInput = string | number;

const MYSQL_FIXED_SCALE_PRICE = /^(?:0|[1-9][0-9]{0,17})\.[0-9]{2}$/;

/**
 * Project one approved MySQL or Redis price representation into the shared
 * finite-number strategy view. This function does not round or mutate storage.
 */
export function KPriceProjector(value: StrategyPriceInput): number {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) {
      throw new TypeError(
        'strategy price number must be finite and non-negative',
      );
    }
    return value;
  }

  if (!MYSQL_FIXED_SCALE_PRICE.test(value)) {
    throw new TypeError(
      'MySQL strategy price must be a non-negative DECIMAL(20,2) string',
    );
  }

  const projected = Number(value);
  if (!Number.isFinite(projected)) {
    throw new RangeError('MySQL strategy price is outside finite number range');
  }
  if (projected.toFixed(2) !== value) {
    throw new RangeError(
      'MySQL strategy price cannot be projected without changing cent precision',
    );
  }
  return projected;
}
