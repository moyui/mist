import { metrics } from '@opentelemetry/api';
import {
  AggregationTemporality,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics';
import type { MetricData } from '@opentelemetry/sdk-metrics';
import { registerStartupCompensationMetrics } from './startup-compensation-metrics';
import type { RealtimeStrategyStartupCompensationService } from '../strategy-trigger/realtime-strategy-startup-compensation.service';

describe('registerStartupCompensationMetrics', () => {
  let exporter: InMemoryMetricExporter;
  let provider: MeterProvider;

  const compensation = {
    snapshot: () => ({ outcome: 'completed', submitted: 3 }),
  } as unknown as RealtimeStrategyStartupCompensationService;

  beforeEach(() => {
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

  it('registers the one-shot outcome gauge with the current outcome label', async () => {
    registerStartupCompensationMetrics(compensation);
    await provider.forceFlush();
    const records = metricRecords();
    const gauge = records.find(
      (r) => r.descriptor.name === 'mist_startup_compensation_total',
    );
    expect(gauge).toBeDefined();
    expect(gauge?.dataPoints).toHaveLength(1);
    expect(gauge?.dataPoints[0].value).toBe(1);
    expect(gauge?.dataPoints[0].attributes.outcome).toBe('completed');
  });

  it('is idempotent: a second registration does not re-register gauges', async () => {
    registerStartupCompensationMetrics(compensation);
    await provider.forceFlush();
    const records = metricRecords();
    expect(
      records.filter(
        (r) => r.descriptor.name === 'mist_startup_compensation_total',
      ),
    ).toHaveLength(0);
  });
});
