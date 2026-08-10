import { metrics } from '@opentelemetry/api';
import {
  AggregationTemporality,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics';
import type { MetricData } from '@opentelemetry/sdk-metrics';
import { registerBacktestMetrics } from './backtest-metrics';
import type { BacktestHealthStateService } from '../backtest-health-state.service';
import type { BacktestAdmissionService } from '../backtest-admission.service';

// NOTE: cumulative LastValueAggregation re-emits the last observed value when
// a callback observes nothing, so the "no duration before first run" behavior
// can only be verified on a fresh registration (fresh module instance), not by
// mutating the mock between collections.

describe('registerBacktestMetrics', () => {
  let exporter: InMemoryMetricExporter;
  let provider: MeterProvider;
  let healthSnapshot: ReturnType<BacktestHealthStateService['snapshot']>;

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
  } as unknown as BacktestHealthStateService;

  const admission = {
    activeCount: () => 2,
    waitingCount: () => 1,
  } as unknown as BacktestAdmissionService;

  beforeEach(() => {
    healthSnapshot = {
      status: 'ok',
      service: 'backtest',
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
          resultRowCount: 100,
          resultBatchFailureCount: 1,
          lastRunDurationSeconds: 12.5,
          lastResultBatchDurationSeconds: null,
          oldestActiveAgeSeconds: null,
          oldestWaitingAgeSeconds: null,
          lastFailureClass: 'BACKTEST_EXECUTION_TIMEOUT',
        },
      },
    } as unknown as ReturnType<BacktestHealthStateService['snapshot']>;

    exporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);
    provider = new MeterProvider({
      readers: [new PeriodicExportingMetricReader({ exporter })],
    });
    metrics.setGlobalMeterProvider(provider);
  });

  afterEach(async () => {
    await provider.shutdown();
  });

  const metricRecords = (): MetricData[] =>
    exporter
      .getMetrics()
      .flatMap((rm) => rm.scopeMetrics.flatMap((sm) => sm.metrics));

  it('registers gauges and observes counter values from health + admission', async () => {
    registerBacktestMetrics(health, admission);
    await provider.forceFlush();
    const records = metricRecords();
    const byName = (name: string) =>
      records.find((r) => r.descriptor.name === name);

    // readiness + admission
    expect(byName('mist_backtest_ready')?.dataPoints[0].value).toBe(1);
    expect(byName('mist_backtest_active_runs')?.dataPoints[0].value).toBe(2);
    expect(byName('mist_backtest_waiting_runs')?.dataPoints[0].value).toBe(1);
    expect(byName('mist_backtest_capacity_total')?.dataPoints[0].value).toBe(8);

    // command outcomes: 4 fixed points, zero values emitted too
    const commandPoints =
      byName('mist_backtest_command_total')?.dataPoints ?? [];
    expect(commandPoints).toHaveLength(4);
    expect(
      commandPoints.find((p) => p.attributes.outcome === 'accepted')?.value,
    ).toBe(3);
    expect(
      commandPoints.find((p) => p.attributes.outcome === 'queue_full')?.value,
    ).toBe(1);
    expect(
      commandPoints.find((p) => p.attributes.outcome === 'not_ready')?.value,
    ).toBe(0);
    expect(
      commandPoints.find((p) => p.attributes.outcome === 'run_failed')?.value,
    ).toBe(1);

    // run statuses
    const runPoints = byName('mist_backtest_run_total')?.dataPoints ?? [];
    expect(runPoints).toHaveLength(2);
    expect(
      runPoints.find((p) => p.attributes.status === 'completed')?.value,
    ).toBe(5);
    expect(runPoints.find((p) => p.attributes.status === 'failed')?.value).toBe(
      2,
    );

    // last-run duration
    expect(byName('mist_backtest_duration_seconds')?.dataPoints[0].value).toBe(
      12.5,
    );

    // persistence outcomes
    const persistencePoints =
      byName('mist_backtest_persistence_total')?.dataPoints ?? [];
    expect(persistencePoints).toHaveLength(2);
    expect(
      persistencePoints.find((p) => p.attributes.outcome === 'success')?.value,
    ).toBe(4);
    expect(
      persistencePoints.find((p) => p.attributes.outcome === 'failure')?.value,
    ).toBe(1);

    // failure reasons from diagnostics
    const failurePoints =
      byName('mist_backtest_failure_total')?.dataPoints ?? [];
    expect(failurePoints).toHaveLength(1);
    expect(
      failurePoints.find(
        (p) => p.attributes.reason === 'BACKTEST_EXECUTION_TIMEOUT',
      )?.value,
    ).toBe(2);

    // target issues from diagnostics
    const issuePoints =
      byName('mist_backtest_target_issue_total')?.dataPoints ?? [];
    expect(issuePoints).toHaveLength(2);
    expect(
      issuePoints.find((p) => p.attributes.code === 'SECURITY_NOT_FOUND')
        ?.value,
    ).toBe(1);
    expect(
      issuePoints.find((p) => p.attributes.code === 'NO_HISTORICAL_BARS')
        ?.value,
    ).toBe(3);
  });

  it('is idempotent: a second registration does not re-register gauges', async () => {
    // _registered is already true from the earlier test; on this fresh
    // provider a re-registration would produce data, a no-op produces nothing.
    registerBacktestMetrics(health, admission);
    await provider.forceFlush();
    const records = metricRecords();
    expect(
      records.filter((r) => r.descriptor.name === 'mist_backtest_ready'),
    ).toHaveLength(0);
  });
});

describe('registerBacktestMetrics before first run', () => {
  let exporter: InMemoryMetricExporter;
  let provider: MeterProvider;
  let freshMetrics: typeof metrics;
  let freshRegister: typeof registerBacktestMetrics;

  beforeAll(async () => {
    // A fresh module instance (own `_registered` flag) is required because
    // the first describe already registered. Dynamic import() after
    // resetModules is eslint-safe (require() is forbidden); the fresh
    // @opentelemetry/api copy does not see a provider registered through the
    // original import, so the provider must be set through the fresh copy.
    jest.resetModules();
    freshMetrics = (await import('@opentelemetry/api')).metrics;
    freshRegister = (await import('./backtest-metrics'))
      .registerBacktestMetrics;
  });

  beforeEach(() => {
    exporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);
    provider = new MeterProvider({
      readers: [new PeriodicExportingMetricReader({ exporter })],
    });
    // setGlobalMeterProvider refuses a duplicate registration (no
    // allowOverride), and the first describe already registered the shared
    // global — clear it through the fresh copy first.
    freshMetrics.disable();
    freshMetrics.setGlobalMeterProvider(provider);
  });

  afterEach(async () => {
    await provider.shutdown();
  });

  it('emits no duration data point when no run has completed', async () => {
    const health = {
      snapshot: () => ({
        status: 'ok',
        service: 'backtest',
        backtest: {
          ready: true,
          state: 'ready',
          activeCount: 0,
          waitingCount: 0,
          concurrency: 2,
          queueCapacity: 8,
          observations: {
            commandAcceptedCount: 0,
            commandQueueFullCount: 0,
            commandNotReadyCount: 0,
            commandRunFailedCount: 0,
            startupQueueFullCount: 0,
            startupUnavailableCount: 0,
            runCompletedCount: 0,
            runFailedCount: 0,
            resultBatchCount: 0,
            resultRowCount: 0,
            resultBatchFailureCount: 0,
            lastRunDurationSeconds: null,
            lastResultBatchDurationSeconds: null,
            oldestActiveAgeSeconds: null,
            oldestWaitingAgeSeconds: null,
            lastFailureClass: null,
          },
        },
      }),
      diagnostics: () => ({
        failureTotals: new Map<string, number>(),
        targetIssueTotals: new Map<string, number>(),
      }),
    } as unknown as BacktestHealthStateService;
    const admission = {
      activeCount: () => 0,
      waitingCount: () => 0,
    } as unknown as BacktestAdmissionService;

    freshRegister(health, admission);
    await provider.forceFlush();
    const records = exporter
      .getMetrics()
      .flatMap((rm) => rm.scopeMetrics.flatMap((sm) => sm.metrics));
    expect(
      records.find(
        (r) => r.descriptor.name === 'mist_backtest_duration_seconds',
      ),
    ).toBeUndefined();
    // the other gauges still register
    expect(
      records.some((r) => r.descriptor.name === 'mist_backtest_ready'),
    ).toBe(true);
  });
});
