import { metrics } from '@opentelemetry/api';
import { CandleFinalizer } from '../candle/candle-finalizer';
import { RealtimeMarketDataProductService } from '../candle/realtime-market-data-product.service';

let _registered = false;

/**
 * Cardinality guard for the securityId label on skip/discard-style gauges:
 * beyond this many attributed securities in one collection window the gauge
 * falls back to source-only labels (spec R1 Scenario 3).
 */
const MAX_SECURITY_LABELS = 50;

/**
 * Register existing process-local candle counters as OTel observable gauges
 * (design D3, plan A: read values, zero business-logic changes). Call once
 * after SDK init (official register) with DI-resolved service instances. Idempotent.
 */
export function registerCandleMetrics(
  finalizer: CandleFinalizer,
  product: RealtimeMarketDataProductService,
): void {
  if (_registered) {
    return;
  }
  const meter = metrics.getMeter('mist-backend', '0.1.0');

  meter
    .createObservableGauge('mist_candle_sealed_total', {
      description: 'Sealed realtime candles (process-local)',
    })
    .addCallback((result) => {
      result.observe(finalizer.diagnostics().sealedTotal);
    });

  meter
    .createObservableGauge('mist_candle_discard_total', {
      description: 'Discarded realtime candles by reason',
    })
    .addCallback((result) => {
      for (const {
        source,
        securityId,
        reason,
        total,
      } of finalizer.diagnostics().discardTotals) {
        result.observe(total, {
          source,
          securityId: String(securityId),
          reason,
        });
      }
    });

  meter
    .createObservableGauge('mist_candle_late_after_grace_total', {
      description: 'Frames skipped as late after grace',
    })
    .addCallback((result) => {
      for (const { source, securityId, total } of product.runtimeObservation()
        .candle.lateAfterGraceTotal) {
        result.observe(total, {
          source,
          securityId: String(securityId),
        });
      }
    });

  meter
    .createObservableGauge('mist_candle_capacity_exceeded_total', {
      description: 'Frames skipped for candidate capacity',
    })
    .addCallback((result) => {
      for (const { source, securityId, total } of product.runtimeObservation()
        .candle.candidateCapacityExceededTotal) {
        result.observe(total, {
          source,
          securityId: String(securityId),
        });
      }
    });

  meter
    .createObservableGauge('mist_candle_snapshot_overflow_total', {
      description: 'Queue admissions rejected (snapshot overflow)',
    })
    .addCallback((result) => {
      result.observe(product.runtimeObservation().queue.snapshotOverflowTotal);
    });

  meter
    .createObservableGauge('mist_candle_due_admission_overflow_total', {
      description: 'Due members rejected (admission overflow)',
    })
    .addCallback((result) => {
      result.observe(
        product.runtimeObservation().queue.dueAdmissionOverflowTotal,
      );
    });

  meter
    .createObservableGauge('mist_candle_due_scan_failure_total', {
      description: 'Due scan failures',
    })
    .addCallback((result) => {
      result.observe(product.runtimeObservation().due.scanFailureTotal);
    });

  meter
    .createObservableGauge('mist_candle_due_registration_failure_total', {
      description: 'Due registration failures',
    })
    .addCallback((result) => {
      result.observe(product.runtimeObservation().due.registrationFailureTotal);
    });

  meter
    .createObservableGauge('mist_candle_finalization_horizon_exceeded_total', {
      description: 'Due members released at hard horizon',
    })
    .addCallback((result) => {
      result.observe(
        product.runtimeObservation().candle.finalizationHorizonExceededTotal,
      );
    });

  meter
    .createObservableGauge('mist_candle_skip_total', {
      description: 'Snapshots skipped by reason',
    })
    .addCallback((result) => {
      const skipTotals = product.runtimeObservation().candle.skipTotals;
      if (skipTotals.length === 0) {
        return;
      }
      // Cardinality guard: if the attributed security set exceeds the cap,
      // fall back to source-only labels (spec R1 Scenario 3).
      const securityCount = new Set(skipTotals.map((entry) => entry.securityId))
        .size;
      if (securityCount > MAX_SECURITY_LABELS) {
        const bySourceReason = new Map<string, number>();
        for (const { source, reason, total } of skipTotals) {
          const key = `${source}:${reason}`;
          bySourceReason.set(key, (bySourceReason.get(key) ?? 0) + total);
        }
        for (const [key, total] of bySourceReason) {
          const [source, reason] = key.split(':');
          result.observe(total, { source, reason });
        }
        return;
      }
      for (const { source, securityId, reason, total } of skipTotals) {
        if (total > 0) {
          result.observe(total, {
            source,
            securityId: String(securityId),
            reason,
          });
        }
      }
    });

  _registered = true;
}
