import { metrics } from '@opentelemetry/api';
import { CandleFinalizer } from '../candle/candle-finalizer';
import { RealtimeMarketDataProductService } from '../candle/realtime-market-data-product.service';

let _registered = false;

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
      for (const { reason, total } of finalizer.diagnostics().discardTotals) {
        result.observe(total, { reason });
      }
    });

  meter
    .createObservableGauge('mist_candle_late_after_grace_total', {
      description: 'Frames skipped as late after grace',
    })
    .addCallback((result) => {
      result.observe(product.runtimeObservation().candle.lateAfterGraceTotal);
    });

  meter
    .createObservableGauge('mist_candle_capacity_exceeded_total', {
      description: 'Frames skipped for candidate capacity',
    })
    .addCallback((result) => {
      result.observe(
        product.runtimeObservation().candle.candidateCapacityExceededTotal,
      );
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
      if (!skipTotals) {
        return;
      }
      for (const [reason, total] of Object.entries(skipTotals) as [
        keyof typeof skipTotals,
        number,
      ][]) {
        if (total > 0) {
          result.observe(total, { reason });
        }
      }
    });

  _registered = true;
}
