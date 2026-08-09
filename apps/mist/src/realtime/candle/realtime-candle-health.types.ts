import type { CandleFinalizerDiagnostics } from './candle-finalizer';
import type {
  RealtimeQuantityField,
  RealtimeQuantityRejectReason,
} from '../realtime-quantity-validation.error';
import type { RealtimeSource } from '../realtime.types';
import type { RealtimeStrategyHandoffObservation } from '../strategy-trigger/realtime-strategy-handoff-observability.service';

export interface RealtimeQuantityRejectionObservation {
  source: RealtimeSource;
  field: RealtimeQuantityField;
  reason: RealtimeQuantityRejectReason;
  total: number;
  lastFailureAtMs: number;
}

export type RealtimeCandleProductMode = 'off' | 'shadow' | 'on';

export type RealtimeCandleDegradedReason =
  | 'redis_unavailable'
  | 'redis_observation_failed'
  | 'redis_aof_disabled'
  | 'redis_aof_error'
  | 'redis_eviction_policy'
  | 'redis_retention'
  | 'due_scan_failed'
  | 'due_registration_failed'
  | 'finalization_failed'
  | 'finalization_horizon_exceeded'
  | 'record_limit_breach'
  | 'queue_overflow'
  | 'recovery_gap'
  | 'quantity_profile_rejected';

export interface RealtimeCandleRuntimeObservation {
  mode: RealtimeCandleProductMode;
  graceMs: number;
  queue: {
    pendingGlobal: number;
    maximumPendingPerSeries: number;
    snapshotOverflowTotal: number;
    snapshotOverflowLastFailureAtMs: number | null;
    dueAdmissionOverflowTotal: number;
    dueAdmissionOverflowLastFailureAtMs: number | null;
  };
  candle: {
    seriesCount: number;
    candidateCount: number;
    invalidCandidateCount: number;
    frozenCandidateCount: number;
    /** Four skip reasons counted by the aggregator (the other two are
     * product-layer counters lateAfterGraceTotal/candidateCapacityExceededTotal). */
    skipTotals?: Partial<
      Record<
        | 'out_of_session'
        | 'no_event_time'
        | 'duplicate_or_late'
        | 'not_aggregation_eligible',
        number
      >
    >;
    sealedTotal: number;
    discardTotals: CandleFinalizerDiagnostics['discardTotals'];
    lateAfterGraceTotal: number;
    candidateCapacityExceededTotal: number;
    finalizationFailureTotal: number;
    finalizationLastFailureAtMs: number | null;
    finalizationHorizonExceededTotal: number;
    finalizationHorizonExceededLastFailureAtMs: number | null;
    recordLimitBreachTotal: number;
    recoveryGapTotal: number;
    recoveryGapLastFailureAtMs: number | null;
    maxSealedRecordBytes: number;
    maxManifestBytes: number;
  };
  due: {
    scanFailureTotal: number;
    scanLastFailureAtMs: number | null;
    registrationFailureTotal: number;
    registrationLastFailureAtMs: number | null;
  };
}

export interface RealtimeCandleHealthObservation
  extends RealtimeCandleRuntimeObservation {
  status: 'disabled' | 'ok' | 'degraded';
  degradedReasons: RealtimeCandleDegradedReason[];
  due: RealtimeCandleRuntimeObservation['due'] & {
    pendingCount: number | null;
    oldestLagMs: number | null;
  };
  redis: {
    available: boolean;
    usedMemoryBytes: number | null;
    aofSizeBytes: number | null;
    aofEnabled: boolean | null;
    aofLastWriteStatus: string | null;
    maxmemoryPolicy: string | null;
    currentDayMarketKeyCount: number | null;
    expiredMarketKeyCount: number | null;
    observationFailureTotal: number;
  };
  quantityProfileRejections: RealtimeQuantityRejectionObservation[];
  strategyHandoff: RealtimeStrategyHandoffObservation;
}
