import type { ChanK } from '../contracts';
import { ChanInputError } from '../errors';

const DECIMAL_36_8_PATTERN = /^[+-]?(\d{1,28})(?:\.(\d{1,8}))?$/;
const PRICE_FIELDS = ['open', 'high', 'low', 'close'] as const;
const QUANTITY_FIELDS = ['volume', 'amount'] as const;

export function assertChanKSeries(orderedK: readonly ChanK[]): void {
  const ids = new Set<number>();
  let symbol: string | undefined;
  let previousTime: number | undefined;

  orderedK.forEach((k, index) => {
    if (!Number.isSafeInteger(k.id) || k.id <= 0) {
      throw inputError(index, 'id must be a positive safe integer');
    }
    if (ids.has(k.id)) {
      throw inputError(index, `id ${k.id} is duplicated`);
    }
    ids.add(k.id);

    if (typeof k.symbol !== 'string' || k.symbol.length === 0) {
      throw inputError(index, 'symbol must be a non-empty string');
    }
    symbol ??= k.symbol;
    if (k.symbol !== symbol) {
      throw inputError(index, `symbol must equal ${symbol}`);
    }

    if (!(k.time instanceof Date) || !Number.isFinite(k.time.getTime())) {
      throw inputError(index, 'time must be a valid Date');
    }
    const time = k.time.getTime();
    if (previousTime !== undefined && time <= previousTime) {
      throw inputError(index, 'time must be strictly increasing');
    }
    previousTime = time;

    for (const field of PRICE_FIELDS) {
      if (typeof k[field] !== 'number' || !Number.isFinite(k[field])) {
        throw inputError(index, `${field} must be a finite number`);
      }
    }
    if (k.high < k.low) {
      throw inputError(index, 'high must be greater than or equal to low');
    }

    for (const field of QUANTITY_FIELDS) {
      const value = k[field];
      if (value !== null && !isDecimal36Scale8(value)) {
        throw inputError(
          index,
          `${field} must be null or a DECIMAL(36,8) string`,
        );
      }
    }
  });
}

function isDecimal36Scale8(value: unknown): value is string {
  return typeof value === 'string' && DECIMAL_36_8_PATTERN.test(value);
}

function inputError(index: number, reason: string): ChanInputError {
  return new ChanInputError(`Invalid ChanK at index ${index}: ${reason}`);
}
