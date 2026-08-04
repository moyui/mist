import type { CandleFinalizerDiagnostics } from './candle-finalizer';
import type { RealtimeQuantityRejectionObservation } from '../realtime-market-observability.service';

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
    dueAdmissionOverflowTotal: number;
  };
  candle: {
    seriesCount: number;
    candidateCount: number;
    invalidCandidateCount: number;
    frozenCandidateCount: number;
    sealedTotal: number;
    discardTotals: CandleFinalizerDiagnostics['discardTotals'];
    lateAfterGraceTotal: number;
    candidateCapacityExceededTotal: number;
    finalizationFailureTotal: number;
    finalizationHorizonExceededTotal: number;
    recordLimitBreachTotal: number;
    recoveryGapTotal: number;
    maxSealedRecordBytes: number;
    maxManifestBytes: number;
  };
  due: {
    scanFailureTotal: number;
    registrationFailureTotal: number;
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
}
