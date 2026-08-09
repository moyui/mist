module.exports = function (options, webpack) {
  const unusedMicroserviceTransports = new Set([
    '@grpc/grpc-js',
    '@grpc/proto-loader',
    'amqp-connection-manager',
    'amqplib',
    'kafkajs',
    'mqtt',
    'nats',
  ]);

  return {
    ...options,
    externals: {
      talib: 'commonjs talib',
      // The OTel SDK is initialized by otel-preload.js (node -r) so its hooks
      // run before http/express/pino are loaded. For the bundle's own spans
      // (candleTracer, registerCandleMetrics) to share that SDK's global
      // provider/context, @opentelemetry/api must be the SAME module instance
      // in both worlds — otherwise the bundled copy sees a noop global
      // provider and all app-created spans are silently dropped.
      '@opentelemetry/api': 'commonjs @opentelemetry/api',
    },
    plugins: [
      ...(options.plugins ?? []),
      new webpack.IgnorePlugin({
        checkResource(resource) {
          return unusedMicroserviceTransports.has(resource);
        },
      }),
    ],
  };
};
