import { Decimal8, normalizeExternalDecimalText } from '@app/decimal';
import type { ValueTransformer } from 'typeorm';

/**
 * Keeps TypeORM's fixed-scale DECIMAL text outside canonical domain state.
 */
export const canonicalDecimalTransformer: ValueTransformer = {
  to(value: string | null): string | null {
    if (value === null) return null;
    return Decimal8.parseCanonical(value).formatCanonical();
  },

  from(value: unknown): string | null {
    if (value === null) return null;
    if (typeof value !== 'string') {
      throw new TypeError('MySQL decimal quantity must be returned as text');
    }
    return normalizeExternalDecimalText(value);
  },
};
