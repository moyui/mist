import { initTelemetry, shutdownTelemetry } from './otel';

describe('initTelemetry', () => {
  it('skips silently when no OTLP endpoint is configured (no-op guard)', () => {
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    expect(() => initTelemetry({ serviceName: 'test' })).not.toThrow();
    expect(() => shutdownTelemetry()).not.toThrow();
  });

  it('initializes when endpoint is configured and is idempotent', () => {
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://localhost:5080';
    expect(() => initTelemetry({ serviceName: 'test' })).not.toThrow();
    // second call must not throw or re-create the SDK
    expect(() => initTelemetry({ serviceName: 'test-again' })).not.toThrow();
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  });
});

import { BasicTracerProvider } from '@opentelemetry/sdk-trace-base';
import { trace } from '@opentelemetry/api';
import { pinoTraceMixin } from './otel';

describe('pinoTraceMixin', () => {
  it('returns {} when no span is active', () => {
    expect(pinoTraceMixin()).toEqual({});
  });

  it('stamps trace_id/span_id of the active span', () => {
    const provider = new BasicTracerProvider();
    trace.setGlobalTracerProvider(provider);
    provider
      .getTracer('pino-mixin-spec')
      .startActiveSpan('mixin-test', (span) => {
        const mixed = pinoTraceMixin();
        expect(mixed.trace_id).toBe(span.spanContext().traceId);
        expect(mixed.span_id).toBe(span.spanContext().spanId);
        span.end();
      });
  });

  it('returns {} for a non-recording span (no global provider)', () => {
    // Reset global provider to noop by setting it to a fresh noop context.
    trace.setGlobalTracerProvider(new BasicTracerProvider());
    // Outside any span there is nothing active -> {}
    expect(pinoTraceMixin()).toEqual({});
  });
});
