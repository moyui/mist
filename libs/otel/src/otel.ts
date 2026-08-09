import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';

export interface InitTelemetryOptions {
  serviceName: string;
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
 */
export function initTelemetry({ serviceName }: InitTelemetryOptions): void {
  if (sdk) {
    return; // idempotent
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
