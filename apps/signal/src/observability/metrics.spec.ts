import { metrics } from '@opentelemetry/api';
import {
  AggregationTemporality,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics';
import type { MetricData } from '@opentelemetry/sdk-metrics';
import { resetMetricRegistrationsForTest } from '@app/observability';
import { registerSignalMetrics } from './metrics';
import { HealthStateService } from '../health/health-state.service';

describe('registerSignalMetrics', () => {
  let exporter: InMemoryMetricExporter;
  let provider: MeterProvider;
  let health: HealthStateService;

  beforeEach(() => {
    resetMetricRegistrationsForTest();
    health = new HealthStateService();
    health.recordRegistrySuccess(1, 5, 5, '2026-08-26T03:00:00.000Z');

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

  it('registers gauges and observes values from HealthStateService', async () => {
    registerSignalMetrics(health);
    await provider.forceFlush();
    const records = exporter
      .getMetrics()
      .flatMap((rm) => rm.scopeMetrics.flatMap((sm) => sm.metrics));

    expect(records).toHaveLength(5);

    const ready = metricByName(records, 'mist_signal_ready');
    expect(ready.dataPoints[0].value).toBe(1);

    const defCount = metricByName(records, 'mist_signal_definition_count');
    expect(defCount.dataPoints[0].value).toBe(5);

    const planCount = metricByName(records, 'mist_signal_execution_plan_count');
    expect(planCount.dataPoints[0].value).toBe(5);
  });

  it('is idempotent: duplicate registration does not crash or double-register', async () => {
    registerSignalMetrics(health);
    registerSignalMetrics(health);
    await provider.forceFlush();
    const records = exporter
      .getMetrics()
      .flatMap((rm) => rm.scopeMetrics.flatMap((sm) => sm.metrics));

    const ready = metricByName(records, 'mist_signal_ready');
    expect(ready.dataPoints).toHaveLength(1);
  });
});
