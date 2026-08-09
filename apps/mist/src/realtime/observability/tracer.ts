import { trace, Span } from '@opentelemetry/api';

/** Backend candle pipeline tracer. Each snapshot/finalize gets a root span. */
export const candleTracer = (): ReturnType<typeof trace.getTracer> =>
  trace.getTracer('mist-backend');

/**
 * Runs `fn` inside a root span and ALWAYS ends it afterwards.
 *
 * OTel JS SDK 2.x removed the auto-`span.end()` that startActiveSpan used to
 * do in 1.x — spans created via startActiveSpan never end on their own, so
 * BatchSpanProcessor never exports them. Every candle span must therefore end
 * explicitly; the try/finally here guarantees end() even on early returns
 * (the codebase's candle paths are full of them) and on exceptions. Works for
 * both sync and async `fn` (an async fn returns a Promise, which is awaited
 * by the caller via `await withCandleSpan(...)`).
 */
export const withCandleSpan = <T>(name: string, fn: (span: Span) => T): T =>
  candleTracer().startActiveSpan(name, (span) => {
    try {
      return fn(span);
    } finally {
      span.end();
    }
  });
