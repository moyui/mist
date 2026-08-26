import { metrics } from '@opentelemetry/api';
import {
  AggregationTemporality,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics';
import type { MetricData } from '@opentelemetry/sdk-metrics';
import { resetMetricRegistrationsForTest } from '@app/observability';
import { registerBacktestMetrics } from './metrics';
import type { HealthStateService } from '../health/health-state.service';
import type { BacktestAdmissionService } from '../backtest-admission.service';

describe('registerBacktestMetrics', () => {
  let exporter: InMemoryMetricExporter;
  let provider: MeterProvider;
  let healthSnapshot: ReturnType<HealthStateService['snapshot']>;

  const diagnostics = {
    failureTotals: new Map([['BACKTEST_EXECUTION_TIMEOUT', 2]]),
    targetIssueTotals: new Map([
      ['SECURITY_NOT_FOUND', 1],
      ['NO_HISTORICAL_BARS', 3],
    ]),
  };

  const health = {
    snapshot: () => healthSnapshot,
    diagnostics: () => diagnostics,
  } as unknown as HealthStateService;

  const admission = {
    activeCount: () => 2,
    waitingCount: () => 1,
  } as unknown as BacktestAdmissionService;

  beforeEach(() => {
    resetMetricRegistrationsForTest();
    healthSnapshot = {
      status: 'ok',
      service: 'backtest',
      instance: 'backtest',
      timestamp: new Date().toISOString(),
      backtest: {
        ready: true,
        state: 'ready',
        activeCount: 2,
        waitingCount: 1,
        concurrency: 2,
        queueCapacity: 8,
        observations: {
          commandAcceptedCount: 3,
          commandQueueFullCount: 1,
          commandNotReadyCount: 0,
          commandRunFailedCount: 1,
          startupQueueFullCount: 0,
          startupUnavailableCount: 0,
          runCompletedCount: 5,
          runFailedCount: 2,
          resultBatchCount: 4,
          resultRowCount: 16,
          resultBatchFailureCount: 1,
          lastRunDurationSeconds: 12.5,
          lastResultBatchDurationSeconds: 0.35,
          oldestActiveAgeSeconds: 10,
          oldestWaitingAgeSeconds: 5,
          lastFailureClass: 'BACKTEST_DATABASE_ERROR',
        },
      },
    };
    exporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);
    provider = new MeterProvider({
      readers: [new PeriodicExportingMetricReader({ exporter })],
    });
    metrics.setGlobalMeterProvider(provider);
  });

  afterEach(async () => {
    await provider.shutdown();
    metrics.disable();
  });

  function metricByName(records: MetricData[], name: string): MetricData {
    const match = records.find((r) => r.descriptor.name === name);
    if (!match) {
      throw new Error(`Metric not found: ${name}`);
    }
    return match;
  }

  it('registers gauges and observes counter values from health + admission', async () => {
    registerBacktestMetrics(health, admission);
    await provider.forceFlush();
    const records = exporter
      .getMetrics()
      .flatMap((rm) => rm.scopeMetrics.flatMap((sm) => sm.metrics));

    expect(records).toHaveLength(10);

    const ready = metricByName(records, 'mist_backtest_ready');
    expect(ready.dataPoints[0].value).toBe(1);

    const active = metricByName(records, 'mist_backtest_active_runs');
    expect(active.dataPoints[0].value).toBe(2);

    const waiting = metricByName(records, 'mist_backtest_waiting_runs');
    expect(waiting.dataPoints[0].value).toBe(1);

    const capacity = metricByName(records, 'mist_backtest_capacity_total');
    expect(capacity.dataPoints[0].value).toBe(8);

    const commands = metricByName(records, 'mist_backtest_command_total');
    expect(commands.dataPoints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          value: 3,
          attributes: { outcome: 'accepted' },
        }),
        expect.objectContaining({
          value: 1,
          attributes: { outcome: 'queue_full' },
        }),
        expect.objectContaining({
          value: 0,
          attributes: { outcome: 'not_ready' },
        }),
        expect.objectContaining({
          value: 1,
          attributes: { outcome: 'run_failed' },
        }),
      ]),
    );

    const runs = metricByName(records, 'mist_backtest_run_total');
    expect(runs.dataPoints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          value: 5,
          attributes: { status: 'completed' },
        }),
        expect.objectContaining({
          value: 2,
          attributes: { status: 'failed' },
        }),
      ]),
    );

    const duration = metricByName(records, 'mist_backtest_duration_seconds');
    expect(duration.dataPoints[0].value).toBe(12.5);

    const persistence = metricByName(
      records,
      'mist_backtest_persistence_total',
    );
    expect(persistence.dataPoints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          value: 4,
          attributes: { outcome: 'success' },
        }),
        expect.objectContaining({
          value: 1,
          attributes: { outcome: 'failure' },
        }),
      ]),
    );

    const failures = metricByName(records, 'mist_backtest_failure_total');
    expect(failures.dataPoints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          value: 2,
          attributes: { reason: 'BACKTEST_EXECUTION_TIMEOUT' },
        }),
      ]),
    );
  });

  it('is idempotent: a second registration does not re-register gauges', async () => {
    registerBacktestMetrics(health, admission);
    registerBacktestMetrics(health, admission);
    await provider.forceFlush();
    const records = exporter
      .getMetrics()
      .flatMap((rm) => rm.scopeMetrics.flatMap((sm) => sm.metrics));

    const ready = metricByName(records, 'mist_backtest_ready');
    expect(ready.dataPoints).toHaveLength(1);
  });
});
