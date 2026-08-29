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
    //  lenient:多零不算脏 (1.200 -> 1.20),按你的规则 toFixed(2)归一即可
    const trimmed = String(value).trim();
    if (trimmed === String(value) && /^-?\d+\.\d+$/.test(trimmed)) {
      const numeric = Number(trimmed);
      if (Number.isFinite(numeric) && numeric >= 0) {
        // 超最大整数先当最大整数处理，clamp后toFixed
        const MAX_NUM = 999999999999999999.99;
        let n = numeric;
        if (n > MAX_NUM) n = MAX_NUM;
        // Also string length overflow check
        if (trimmed.length > 21) {
          // DECIMAL(20,2) max length 21 inc dot
          n = Math.min(n, MAX_NUM);
        }
        const normalized = n.toFixed(2);
        // toFixed不等极少见，已通过clamp处理
        const check = Number(normalized);
        if (Number.isFinite(check)) {
          return check;
        }
      }
    }
    throw new TypeError(
      'MySQL strategy price must be a non-negative DECIMAL(20,2) string',
    );
  }

  const projected = Number(value);
  if (!Number.isFinite(projected)) {
    throw new RangeError('MySQL strategy price is outside finite number range');
  }
  // 超最大整数 clamp
  const MAX_NUM = 999999999999999999.99;
  if (projected > MAX_NUM) {
    return MAX_NUM;
  }
  if (projected.toFixed(2) !== value) {
    // 理论上已在上面处理，极少见；此处按clamp归一
    const clamped = Math.min(projected, MAX_NUM);
    return Number(clamped.toFixed(2));
  }
  return projected;
}
