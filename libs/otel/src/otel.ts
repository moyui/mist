import { context, trace } from '@opentelemetry/api';

/**
 * pino `mixin` that stamps the active OTel span's trace_id/span_id onto every
 * log record. instrumentation-pino cannot patch pino inside the webpack
 * bundle (RITM only sees modules loaded through the native require, and pino
 * is bundled), so we inject the ids directly from the active span instead.
 * The SDK itself is initialized by the official entry
 * `@opentelemetry/auto-instrumentations-node/register` (node -r), which must
 * run before any business module loads (see otel-observability-gaps G0).
 * Returns {} (pino omits it) when no span is active.
 */
export function pinoTraceMixin(): Record<string, string> {
  const span = trace.getSpan(context.active());
  if (!span || !span.isRecording()) {
    return {};
  }
  const { traceId, spanId } = span.spanContext();
  return { trace_id: traceId, span_id: spanId };
}
