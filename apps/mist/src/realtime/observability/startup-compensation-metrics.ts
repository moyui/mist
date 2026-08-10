import { metrics } from '@opentelemetry/api';
import { RealtimeStrategyStartupCompensationService } from '../strategy-trigger/realtime-strategy-startup-compensation.service';

let _registered = false;

/**
 * Export the one-shot startup compensation outcome as an OTel observable
 * gauge (extract-backtest-runtime 5.2, design §12.4). Call once after
 * initTelemetry with the DI-resolved service. Idempotent. The compensation
 * service itself is not modified.
 */
export function registerStartupCompensationMetrics(
  compensation: RealtimeStrategyStartupCompensationService,
): void {
  if (_registered) {
    return;
  }
  const meter = metrics.getMeter('mist-backend', '0.1.0');

  meter
    .createObservableGauge('mist_startup_compensation_total', {
      description:
        'Startup strategy-trigger compensation outcome (one-shot marker)',
    })
    .addCallback((result) => {
      result.observe(1, { outcome: compensation.snapshot().outcome });
    });

  _registered = true;
}
