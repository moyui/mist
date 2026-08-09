/**
 * OTel SDK preload — MUST run before any business module loads.
 *
 * Why: the backend ships as a webpack bundle. The bundle's top-level
 * requires (NestFactory -> express -> `require('http')`) execute before
 * `bootstrap()` calls initTelemetry(), so by the time the SDK registers its
 * require-in-the-middle hooks, `http`/`pino`/`express` are already cached in
 * Module._cache and RITM never fires for them — auto-instrumentations silently
 * no-op. Initializing the SDK here (`node -r ./otel-preload.js dist/apps/mist/main.js`)
 * runs it before ANY module (including node builtins) is loaded, so the first
 * `require('http')` from the bundle triggers the hooks and patches succeed.
 *
 * Usage: NODE_OPTIONS="--require /path/to/otel-preload.js" node dist/apps/mist/main.js
 * Endpoint/auth/serviceName come from OTEL_EXPORTER_OTLP_ENDPOINT /
 * OTEL_EXPORTER_OTLP_HEADERS / OTEL_SERVICE_NAME env vars.
 * No-op guard: silently skips when OTEL_EXPORTER_OTLP_ENDPOINT is unset
 * (local dev / CI with zero OTel overhead).
 *
 * Must stay dependency-light CJS: it loads before everything else and is not
 * part of the webpack graph.
 */
'use strict';

if (!process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
  module.exports = null;
  return;
}

const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-http');
const { PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics');

const sdk = new NodeSDK({
  serviceName: process.env.OTEL_SERVICE_NAME ?? 'mist-backend',
  traceExporter: new OTLPTraceExporter(),
  metricReader: new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter(),
  }),
  instrumentations: [getNodeAutoInstrumentations()],
});
sdk.start();
globalThis.__MIST_OTEL_PRELOADED__ = sdk;

function shutdownTelemetry() {
  const current = globalThis.__MIST_OTEL_PRELOADED__;
  if (!current) return;
  globalThis.__MIST_OTEL_PRELOADED__ = null;
  void current.shutdown();
}
process.on('SIGTERM', shutdownTelemetry);
process.on('SIGINT', shutdownTelemetry);

module.exports = sdk;
