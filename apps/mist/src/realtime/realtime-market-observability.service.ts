import { Injectable } from '@nestjs/common';
import type {
  RealtimeQuantityField,
  RealtimeQuantityRejectReason,
} from './realtime-quantity-validation.error';
import type { RealtimeSource } from './realtime.types';

export interface RealtimeQuantityRejectionObservation {
  source: RealtimeSource;
  field: RealtimeQuantityField;
  reason: RealtimeQuantityRejectReason;
  total: number;
}

/** Process-local low-cardinality observations shared by provider adapters. */
@Injectable()
export class RealtimeMarketObservabilityService {
  private readonly quantityRejections = new Map<string, number>();

  recordQuantityRejection(
    source: RealtimeSource,
    field: RealtimeQuantityField,
    reason: RealtimeQuantityRejectReason,
  ): void {
    const key = `${source}:${field}:${reason}`;
    this.quantityRejections.set(
      key,
      (this.quantityRejections.get(key) ?? 0) + 1,
    );
  }

  quantityRejectionObservations(): RealtimeQuantityRejectionObservation[] {
    return [...this.quantityRejections.entries()]
      .map(([key, total]) => {
        const [source, field, reason] = key.split(':') as [
          RealtimeSource,
          RealtimeQuantityField,
          RealtimeQuantityRejectReason,
        ];
        return { source, field, reason, total };
      })
      .sort((left, right) =>
        `${left.source}:${left.field}:${left.reason}`.localeCompare(
          `${right.source}:${right.field}:${right.reason}`,
        ),
      );
  }
}
