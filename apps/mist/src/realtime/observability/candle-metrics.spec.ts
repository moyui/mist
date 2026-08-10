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
        { source: 'tdx', securityId: 1, reason: 'invalid', total: 2 },
        { source: 'qmt', securityId: 2, reason: 'no_snapshot', total: 1 },
      ],
    }),
  } as unknown as CandleFinalizer;

  const product = {
    runtimeObservation: () => ({
      candle: {
        lateAfterGraceTotal: [{ source: 'tdx', securityId: 1, total: 4 }],
        candidateCapacityExceededTotal: [
          { source: 'qmt', securityId: 2, total: 5 },
        ],
        finalizationHorizonExceededTotal: 6,
        skipTotals: [
          { source: 'tdx', securityId: 1, reason: 'out_of_session', total: 7 },
          {
            source: 'qmt',
            securityId: 2,
            reason: 'duplicate_or_late',
            total: 8,
          },
        ],
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
    const invalidPoint = discardPoints.find(
      (p) => p.attributes.reason === 'invalid',
    );
    expect(invalidPoint?.value).toBe(2);
    expect(invalidPoint?.attributes.source).toBe('tdx');
    expect(invalidPoint?.attributes.securityId).toBe('1');
    const noSnapshotPoint = discardPoints.find(
      (p) => p.attributes.reason === 'no_snapshot',
    );
    expect(noSnapshotPoint?.value).toBe(1);
    expect(noSnapshotPoint?.attributes.source).toBe('qmt');
    expect(noSnapshotPoint?.attributes.securityId).toBe('2');

    // product runtime observation counters (source+securityId labels)
    const latePoints =
      byName('mist_candle_late_after_grace_total')?.dataPoints ?? [];
    expect(latePoints).toHaveLength(1);
    expect(latePoints[0].value).toBe(4);
    expect(latePoints[0].attributes.source).toBe('tdx');
    expect(latePoints[0].attributes.securityId).toBe('1');
    const capacityPoints =
      byName('mist_candle_capacity_exceeded_total')?.dataPoints ?? [];
    expect(capacityPoints).toHaveLength(1);
    expect(capacityPoints[0].value).toBe(5);
    expect(capacityPoints[0].attributes.source).toBe('qmt');
    expect(capacityPoints[0].attributes.securityId).toBe('2');
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

    // skip reasons (zero/absent ones omitted, source+securityId labels)
    const skipPoints = byName('mist_candle_skip_total')?.dataPoints ?? [];
    expect(skipPoints).toHaveLength(2);
    const outOfSession = skipPoints.find(
      (p) => p.attributes.reason === 'out_of_session',
    );
    expect(outOfSession?.value).toBe(7);
    expect(outOfSession?.attributes.source).toBe('tdx');
    expect(outOfSession?.attributes.securityId).toBe('1');
    const duplicateLate = skipPoints.find(
      (p) => p.attributes.reason === 'duplicate_or_late',
    );
    expect(duplicateLate?.value).toBe(8);
    expect(duplicateLate?.attributes.source).toBe('qmt');
    expect(duplicateLate?.attributes.securityId).toBe('2');
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

describe('registerCandleMetrics cardinality guard', () => {
  let freshMetrics: typeof import('@opentelemetry/api').metrics;
  let freshRegister: typeof import('./candle-metrics').registerCandleMetrics;
  let exporter: InMemoryMetricExporter;
  let provider: MeterProvider;

  beforeAll(async () => {
    jest.resetModules();
    freshMetrics = (await import('@opentelemetry/api')).metrics;
    freshRegister = (await import('./candle-metrics')).registerCandleMetrics;
  });

  beforeEach(() => {
    exporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);
    provider = new MeterProvider({
      readers: [new PeriodicExportingMetricReader({ exporter })],
    });
    freshMetrics.disable();
    freshMetrics.setGlobalMeterProvider(provider);
  });

  afterEach(async () => {
    await provider.shutdown();
  });

  it('falls back to source-only labels beyond MAX_SECURITY_LABELS', async () => {
    const manySkips = Array.from({ length: 51 }, (_, i) => ({
      source: 'tdx' as const,
      securityId: i + 1,
      reason: 'out_of_session' as const,
      total: 1,
    }));
    const finalizer = {
      diagnostics: () => ({ sealedTotal: 0, discardTotals: [] }),
    } as unknown as CandleFinalizer;
    const product = {
      runtimeObservation: () => ({
        candle: {
          lateAfterGraceTotal: [],
          candidateCapacityExceededTotal: [],
          finalizationHorizonExceededTotal: 0,
          skipTotals: manySkips,
        },
        queue: { snapshotOverflowTotal: 0, dueAdmissionOverflowTotal: 0 },
        due: { scanFailureTotal: 0, registrationFailureTotal: 0 },
      }),
    } as unknown as RealtimeMarketDataProductService;

    freshRegister(finalizer, product);
    await provider.forceFlush();
    const records = exporter
      .getMetrics()
      .flatMap((rm) => rm.scopeMetrics.flatMap((sm) => sm.metrics));
    const skip = records.find(
      (r) => r.descriptor.name === 'mist_candle_skip_total',
    );
    const points = skip?.dataPoints ?? [];
    expect(points).toHaveLength(1);
    expect(points[0].attributes.source).toBe('tdx');
    expect(points[0].attributes.securityId).toBeUndefined();
    expect(points[0].value).toBe(51);
  });
});
