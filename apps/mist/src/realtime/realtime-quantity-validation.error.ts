import type { RealtimeSource } from './realtime.types';

export type RealtimeQuantityField = 'volume' | 'amount';

export type RealtimeQuantityRejectReason =
  | 'invalid_type'
  | 'invalid_format'
  | 'unexpected_key'
  | 'negative_value'
  | 'unsafe_integer'
  | 'precision_exceeded'
  | 'out_of_range';

/**
 * Provider-boundary quantity rejection with a deliberately low-cardinality
 * classification. The native value and security identity stay out of this
 * error so monitoring cannot accidentally promote them into metric labels.
 */
export class RealtimeQuantityValidationError extends TypeError {
  constructor(
    readonly source: RealtimeSource,
    readonly field: RealtimeQuantityField,
    readonly reason: RealtimeQuantityRejectReason,
    message: string,
  ) {
    super(message);
    this.name = 'RealtimeQuantityValidationError';
  }
}
