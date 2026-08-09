import { trace } from '@opentelemetry/api';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { OpenCandleAggregator } from './open-candle-aggregator';

/**
 * OTel span/event tests for the candle pipeline. jest isolates each test file
 * in its own worker, so a per-file TracerProvider is safe.
 */
let exporter: InMemorySpanExporter;

beforeEach(() => {
  exporter = new InMemorySpanExporter();
  const provider = new BasicTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });
  trace.setGlobalTracerProvider(provider);
});

afterEach(() => {
  exporter.reset();
});

function snap(opts: {
  eventTime: string | null;
  last?: number;
  source?: 'tdx' | 'qmt';
}): any {
  const eventTime = opts.eventTime;
  return {
    source: opts.source ?? 'tdx',
    securityId: 1,
    providerSymbol: '600030.SH',
    eventTime,
    capturedAt: eventTime,
    prices: {
      last: opts.last ?? 10,
      open: opts.last ?? 10,
      high: opts.last ?? 10,
      low: opts.last ?? 10,
      lastClose: null,
    },
    cumulativeVolume: '0',
    cumulativeAmount: '0',
    quality: {
      level: 'latest-state',
      eventTimeAvailable: true,
      aggregationEligible: true,
      partialPrices: false,
    },
    native: {},
  };
}

describe('OpenCandleAggregator skip counters', () => {
  it('counts no_event_time and out_of_session skips', () => {
    const aggregator = new OpenCandleAggregator();
    // no_event_time: null eventTime
    aggregator.applySnapshot(snap({ eventTime: null }));
    // out_of_session: 00:00 UTC+8 is outside the A-share session
    aggregator.applySnapshot(snap({ eventTime: '2026-08-09T00:00:00+08:00' }));
    const diag = aggregator.diagnostics();
    expect(diag.skipTotals).toBeDefined();
    expect(diag.skipTotals?.['no_event_time']).toBe(1);
    expect(diag.skipTotals?.['out_of_session']).toBe(1);
  });

  it('does not count reasons tracked by the product layer', () => {
    const aggregator = new OpenCandleAggregator();
    const diag = aggregator.diagnostics();
    expect('late_after_grace' in (diag.skipTotals ?? {})).toBe(false);
    expect('candidate_capacity_exceeded' in (diag.skipTotals ?? {})).toBe(
      false,
    );
  });
});
