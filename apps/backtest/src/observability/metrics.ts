import { metrics } from '@opentelemetry/api';
import { createIdempotentMetricRegistration } from '@app/observability';
import { BacktestAdmissionService } from '../backtest-admission.service';
import { HealthStateService } from '../health/health-state.service';

/**
 * Register existing process-local backtest counters as OTel observable gauges
 * (extract-backtest-runtime 5.2, design §12). Call once after SDK init (official register)
 * with DI-resolved service instances. Idempotent.
 */
export function registerBacktestMetrics(
  health: HealthStateService,
  admission: BacktestAdmissionService,
): void {
  createIdempotentMetricRegistration('backtest_metrics', () => {
    const meter = metrics.getMeter('backtest', '0.1.0');

    meter
      .createObservableGauge('mist_backtest_ready', {
        description: 'Backtest admission window open (1) or closed (0)',
      })
      .addCallback((result) => {
        result.observe(health.snapshot().backtest.ready ? 1 : 0);
      });

    meter
      .createObservableGauge('mist_backtest_active_runs', {
        description: 'Currently executing backtest runs',
      })
      .addCallback((result) => {
        result.observe(admission.activeCount());
      });

    meter
      .createObservableGauge('mist_backtest_waiting_runs', {
        description: 'Backtest runs waiting in the admission queue',
      })
      .addCallback((result) => {
        result.observe(admission.waitingCount());
      });

    meter
      .createObservableGauge('mist_backtest_capacity_total', {
        description: 'Configured backtest queue capacity',
      })
      .addCallback((result) => {
        result.observe(health.snapshot().backtest.queueCapacity);
      });

    meter
      .createObservableGauge('mist_backtest_command_total', {
        description: 'Backtest submit commands by outcome',
      })
      .addCallback((result) => {
        const observations = health.snapshot().backtest.observations;
        result.observe(observations.commandAcceptedCount, {
          outcome: 'accepted',
        });
        result.observe(observations.commandQueueFullCount, {
          outcome: 'queue_full',
        });
        result.observe(observations.commandNotReadyCount, {
          outcome: 'not_ready',
        });
        result.observe(observations.commandRunFailedCount, {
          outcome: 'run_failed',
        });
      });

    meter
      .createObservableGauge('mist_backtest_run_total', {
        description: 'Backtest runs by terminal status',
      })
      .addCallback((result) => {
        const observations = health.snapshot().backtest.observations;
        result.observe(observations.runCompletedCount, { status: 'completed' });
        result.observe(observations.runFailedCount, { status: 'failed' });
      });

    meter
      .createObservableGauge('mist_backtest_duration_seconds', {
        description: 'Last backtest run duration in seconds',
      })
      .addCallback((result) => {
        const seconds =
          health.snapshot().backtest.observations.lastRunDurationSeconds;
        if (seconds !== null) {
          result.observe(seconds);
        }
      });

    meter
      .createObservableGauge('mist_backtest_persistence_total', {
        description: 'Backtest result batches by persistence outcome',
      })
      .addCallback((result) => {
        const observations = health.snapshot().backtest.observations;
        result.observe(observations.resultBatchCount, { outcome: 'success' });
        result.observe(observations.resultBatchFailureCount, {
          outcome: 'failure',
        });
      });

    meter
      .createObservableGauge('mist_backtest_failure_total', {
        description: 'Backtest run failures by reason class',
      })
      .addCallback((result) => {
        for (const [reason, total] of health.diagnostics().failureTotals) {
          if (total > 0) {
            result.observe(total, { reason });
          }
        }
      });

    meter
      .createObservableGauge('mist_backtest_target_issue_total', {
        description: 'Backtest target issues by code',
      })
      .addCallback((result) => {
        for (const [code, total] of health.diagnostics().targetIssueTotals) {
          if (total > 0) {
            result.observe(total, { code });
          }
        }
      });
  });
}
