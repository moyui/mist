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
  lastFailureAtMs: number;
}

interface QuantityRejectionEntry {
  total: number;
  lastFailureAtMs: number;
}

/** Process-local low-cardinality observations shared by provider adapters. */
@Injectable()
export class RealtimeMarketObservabilityService {
  private readonly quantityRejections = new Map<
    string,
    QuantityRejectionEntry
  >();

  recordQuantityRejection(
    source: RealtimeSource,
    field: RealtimeQuantityField,
    reason: RealtimeQuantityRejectReason,
    atMs: number,
  ): void {
    const key = `${source}:${field}:${reason}`;
    const entry = this.quantityRejections.get(key);
    this.quantityRejections.set(key, {
      total: (entry?.total ?? 0) + 1,
      lastFailureAtMs: atMs,
    });
  }

  quantityRejectionObservations(): RealtimeQuantityRejectionObservation[] {
    return [...this.quantityRejections.entries()]
      .map(([key, entry]) => {
        const [source, field, reason] = key.split(':') as [
          RealtimeSource,
          RealtimeQuantityField,
          RealtimeQuantityRejectReason,
        ];
        return {
          source,
          field,
          reason,
          total: entry.total,
          lastFailureAtMs: entry.lastFailureAtMs,
        };
      })
      .sort((left, right) =>
        `${left.source}:${left.field}:${left.reason}`.localeCompare(
          `${right.source}:${right.field}:${right.reason}`,
        ),
      );
  }

  /**
   * Bounded cleanup: drop rejection keys whose last failure lies outside the
   * recovery window (they no longer drive the degraded verdict, so retaining
   * them only grows the map without value). Called by the health observer.
   */
  pruneQuantityRejections(nowMs: number, windowMs: number): void {
    for (const [key, entry] of this.quantityRejections) {
      if (nowMs - entry.lastFailureAtMs >= windowMs) {
        this.quantityRejections.delete(key);
      }
    }
  }
}
