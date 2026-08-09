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
