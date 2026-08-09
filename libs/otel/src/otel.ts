import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { context, trace } from '@opentelemetry/api';

export interface InitTelemetryOptions {
  serviceName: string;
}

/**
 * pino `mixin` that stamps the active OTel span's trace_id/span_id onto every
 * log record. instrumentation-pino cannot patch pino inside the webpack
 * bundle (RITM only sees modules loaded through the native require, and pino
 * is bundled), so we inject the ids directly from the active span instead.
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

declare global {
  // eslint-disable-next-line no-var
  var __MIST_OTEL_PRELOADED__: NodeSDK | null | undefined;
}

let sdk: NodeSDK | null = null;

/**
 * Initializes the OpenTelemetry SDK. Must be called before NestFactory.create
 * so auto-instrumentations patch modules before Nest core loads them.
 *
 * Community function-style pattern (idempo/SBTM/booking-microservices):
 * - no-op guard: silently skips when OTEL_EXPORTER_OTLP_ENDPOINT is unset
 *   (local dev / CI runs with zero OTel overhead)
 * - serviceName is always a parameter, never hardcoded
 * - endpoint/auth read from OTEL_EXPORTER_OTLP_ENDPOINT /
 *   OTEL_EXPORTER_OTLP_HEADERS environment variables
 *
 * Preload note: the webpack bundle requires http/express/pino before this
 * runs (top-level requires precede bootstrap()), so RITM hooks registered here
 * never fire for those cached modules. In production and the mock env the SDK
 * is therefore initialized by `node -r ./otel-preload.js` instead, which runs
 * before ANY module load; this function then detects the preloaded SDK
 * (globalThis.__MIST_OTEL_PRELOADED__) and becomes a no-op. It remains as a
 * fallback for direct `node dist/...` runs without the preload flag.
 */
export function initTelemetry({ serviceName }: InitTelemetryOptions): void {
  if (sdk) {
    return; // idempotent
  }
  if (globalThis.__MIST_OTEL_PRELOADED__) {
    return; // SDK already initialized via otel-preload.js (preferred path)
  }
  if (!process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
    return; // no-op guard
  }

  sdk = new NodeSDK({
    serviceName,
    traceExporter: new OTLPTraceExporter(),
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter(),
    }),
    instrumentations: [getNodeAutoInstrumentations()],
  });
  sdk.start();

  process.on('SIGTERM', () => {
    void shutdownTelemetry();
  });
  process.on('SIGINT', () => {
    void shutdownTelemetry();
  });
}

export async function shutdownTelemetry(): Promise<void> {
  if (!sdk) {
    return;
  }
  const current = sdk;
  sdk = null;
  await current.shutdown();
}
