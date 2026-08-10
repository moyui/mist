import { BasicTracerProvider } from '@opentelemetry/sdk-trace-base';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { context, trace } from '@opentelemetry/api';
import { pinoTraceMixin } from './otel';

// Without an SDK the global context manager is never installed, and
// startActiveSpan's context.with() would not propagate. Install the same
// AsyncLocalStorage manager the SDK uses (NodeSDK/register does this in prod).
beforeAll(() => {
  context.setGlobalContextManager(new AsyncLocalStorageContextManager());
});

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

  it('returns {} for a non-recording span', () => {
    // Global provider without an active span -> nothing recording.
    trace.setGlobalTracerProvider(new BasicTracerProvider());
    expect(pinoTraceMixin()).toEqual({});
  });
});
