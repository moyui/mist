import {
  AggregationTemporality,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics';
import { metrics } from '@opentelemetry/api';
import type { MetricData } from '@opentelemetry/sdk-metrics';
import { registerSubscriptionLifecycleMetrics } from './subscription-lifecycle-metrics';
import type { RealtimeSubscriptionLifecycleObservationStore } from '../../realtime-subscriptions/realtime-subscription-lifecycle-observation.store';
import type { RealtimeSecurityAllowlistService } from '../realtime-security-allowlist.service';

describe('registerSubscriptionLifecycleMetrics', () => {
  let exporter: InMemoryMetricExporter;
  let provider: MeterProvider;

  const observations = {
    health: jest.fn(() => ({
      mode: 'on',
      sources: [
        {
          source: 'tdx',
          desiredCount: 3,
          activeCount: 2,
          convergedCount: 2,
          deferredRemovalCount: 1,
          lastAttemptAgeSeconds: 5,
          lastSuccessAgeSeconds: 60,
          triggerTotals: [{ trigger: 'scheduled_reconcile', value: 4 }],
          resultTotals: [
            {
              trigger: 'scheduled_reconcile',
              result: 'success',
              reason: null,
              value: 3,
            },
          ],
        },
        {
          source: 'qmt',
          desiredCount: 0,
          activeCount: 0,
          convergedCount: 0,
          deferredRemovalCount: 0,
          lastAttemptAgeSeconds: null,
          lastSuccessAgeSeconds: null,
          triggerTotals: [],
          resultTotals: [],
        },
      ],
    })),
  } as unknown as RealtimeSubscriptionLifecycleObservationStore;

  const allowlist = {
    assignedCountFor: jest.fn((source: string) => (source === 'tdx' ? 3 : 0)),
    list: jest.fn(() => [{ formatCode: '600030.SH', securityId: 7 }]),
  } as unknown as RealtimeSecurityAllowlistService;

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

  it('registers convergence + allowlist gauges with low-cardinality labels', async () => {
    registerSubscriptionLifecycleMetrics(observations, allowlist, () => true);
    await provider.forceFlush();
    const records = metricRecords();
    const byName = (name: string) =>
      records.find((r) => r.descriptor.name === name);

    // per-source count gauges
    const desired = byName('mist_realtime_subscription_desired_count');
    expect(desired?.dataPoints).toHaveLength(2);
    const tdxPoint = desired?.dataPoints.find(
      (p) => p.attributes.source === 'tdx',
    );
    expect(tdxPoint?.value).toBe(3);

    // null ages map to -1 (never attempted)
    const attemptAge = byName(
      'mist_realtime_subscription_last_attempt_age_seconds',
    );
    const qmtAttempt = attemptAge?.dataPoints.find(
      (p) => p.attributes.source === 'qmt',
    );
    expect(qmtAttempt?.value).toBe(-1);

    // bounded-enum label gauges
    const trigger = byName('mist_realtime_subscription_trigger_total');
    const triggerPoint = trigger?.dataPoints.find(
      (p) => p.attributes.trigger === 'scheduled_reconcile',
    );
    expect(triggerPoint?.value).toBe(4);

    const result = byName('mist_realtime_subscription_result_total');
    const resultPoint = result?.dataPoints.find(
      (p) => p.attributes.result === 'success',
    );
    expect(resultPoint?.value).toBe(3);

    // allowlist counts
    const assigned = byName('mist_realtime_allowlist_assigned_total');
    const assignedTdx = assigned?.dataPoints.find(
      (p) => p.attributes.source === 'tdx',
    );
    expect(assignedTdx?.value).toBe(3);
    const effective = byName('mist_realtime_allowlist_effective_total');
    const effectiveTdx = effective?.dataPoints.find(
      (p) => p.attributes.source === 'tdx',
    );
    expect(effectiveTdx?.value).toBe(1);

    // no symbol labels anywhere
    for (const record of records) {
      for (const point of record.dataPoints) {
        expect(point.attributes.symbol).toBeUndefined();
        expect(point.attributes.securityId).toBeUndefined();
      }
    }
  });
});
