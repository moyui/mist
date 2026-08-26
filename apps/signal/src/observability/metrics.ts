import { metrics } from '@opentelemetry/api';
import { createIdempotentMetricRegistration } from '@app/observability';
import { HealthStateService } from '../health/health-state.service';

/**
 * Register signal service OTel observable gauges. Idempotent.
 */
export function registerSignalMetrics(health: HealthStateService): void {
  createIdempotentMetricRegistration('signal_metrics', () => {
    const meter = metrics.getMeter('signal', '0.1.0');

    meter
      .createObservableGauge('mist_signal_ready', {
        description:
          'Signal registry ready status (1 for ready, 0 for starting/error)',
      })
      .addCallback((result) => {
        result.observe(health.snapshot().registry.ready ? 1 : 0);
      });

    meter
      .createObservableGauge('mist_signal_definition_count', {
        description:
          'Number of active strategy definitions loaded in signal registry',
      })
      .addCallback((result) => {
        result.observe(health.snapshot().registry.definitionCount);
      });

    meter
      .createObservableGauge('mist_signal_execution_plan_count', {
        description:
          'Number of compiled strategy execution plans in signal registry',
      })
      .addCallback((result) => {
        result.observe(health.snapshot().registry.executionPlanCount);
      });

    meter
      .createObservableGauge('mist_signal_queue_processed_total', {
        description: 'Total jobs processed by signal evaluation queue',
      })
      .addCallback((result) => {
        result.observe(health.snapshot().queue.processedCount);
      });

    meter
      .createObservableGauge('mist_signal_queue_failed_total', {
        description: 'Total jobs failed in signal evaluation queue',
      })
      .addCallback((result) => {
        result.observe(health.snapshot().queue.failedCount);
      });
  });
}
