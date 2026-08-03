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
