import { metrics } from '@opentelemetry/api';
import {
  AggregationTemporality,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics';
import type { MetricData } from '@opentelemetry/sdk-metrics';
import { registerCandleMetrics } from './candle-metrics';
import type { CandleFinalizer } from '../candle/candle-finalizer';
import type { RealtimeMarketDataProductService } from '../candle/realtime-market-data-product.service';

describe('registerCandleMetrics', () => {
  let exporter: InMemoryMetricExporter;
  let provider: MeterProvider;

  const finalizer = {
    diagnostics: () => ({
      sealedTotal: 3,
      discardTotals: [
        { reason: 'invalid', total: 2 },
        { reason: 'no_snapshot', total: 1 },
      ],
    }),
  } as unknown as CandleFinalizer;

  const product = {
    runtimeObservation: () => ({
      candle: {
        lateAfterGraceTotal: 4,
        candidateCapacityExceededTotal: 5,
        finalizationHorizonExceededTotal: 6,
        skipTotals: {
          out_of_session: 7,
          duplicate_or_late: 8,
        },
      },
      queue: {
        snapshotOverflowTotal: 9,
        dueAdmissionOverflowTotal: 10,
      },
      due: {
        scanFailureTotal: 11,
        registrationFailureTotal: 12,
      },
    }),
  } as unknown as RealtimeMarketDataProductService;

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

  it('registers gauges and observes counter values from finalizer + product', async () => {
    registerCandleMetrics(finalizer, product);
    await provider.forceFlush();
    const records = metricRecords();
    const byName = (name: string) =>
      records.find((r) => r.descriptor.name === name);

    // finalizer counters
    const sealed = byName('mist_candle_sealed_total');
    expect(sealed).toBeDefined();
    expect(sealed?.dataPoints).toHaveLength(1);
    expect(sealed?.dataPoints[0].value).toBe(3);

    const discard = byName('mist_candle_discard_total');
    const discardPoints = discard?.dataPoints ?? [];
    expect(discardPoints).toHaveLength(2);
    expect(
      discardPoints.find((p) => p.attributes.reason === 'invalid')?.value,
    ).toBe(2);
    expect(
      discardPoints.find((p) => p.attributes.reason === 'no_snapshot')?.value,
    ).toBe(1);

    // product runtime observation counters
    expect(
      byName('mist_candle_late_after_grace_total')?.dataPoints[0].value,
    ).toBe(4);
    expect(
      byName('mist_candle_capacity_exceeded_total')?.dataPoints[0].value,
    ).toBe(5);
    expect(
      byName('mist_candle_snapshot_overflow_total')?.dataPoints[0].value,
    ).toBe(9);
    expect(
      byName('mist_candle_due_admission_overflow_total')?.dataPoints[0].value,
    ).toBe(10);
    expect(
      byName('mist_candle_due_scan_failure_total')?.dataPoints[0].value,
    ).toBe(11);
    expect(
      byName('mist_candle_due_registration_failure_total')?.dataPoints[0].value,
    ).toBe(12);
    expect(
      byName('mist_candle_finalization_horizon_exceeded_total')?.dataPoints[0]
        .value,
    ).toBe(6);

    // skip reasons (zero/absent ones omitted)
    const skipPoints = byName('mist_candle_skip_total')?.dataPoints ?? [];
    expect(skipPoints).toHaveLength(2);
    expect(
      skipPoints.find((p) => p.attributes.reason === 'out_of_session')?.value,
    ).toBe(7);
    expect(
      skipPoints.find((p) => p.attributes.reason === 'duplicate_or_late')
        ?.value,
    ).toBe(8);
  });

  it('is idempotent: a second registration does not re-register gauges', async () => {
    // _registered is already true from earlier tests; on this fresh provider a
    // re-registration would produce data, a no-op produces nothing.
    registerCandleMetrics(finalizer, product);
    await provider.forceFlush();
    const records = metricRecords();
    expect(
      records.filter((r) => r.descriptor.name === 'mist_candle_sealed_total'),
    ).toHaveLength(0);
  });
});
