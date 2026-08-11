require('@opentelemetry/auto-instrumentations-node/register');
const { trace } = require('@opentelemetry/api');
const tracer = trace.getTracer('probe');
tracer.startActiveSpan('probe.verdict', (span) => {
  span.setAttribute('verdict', 'sealed');
  span.setAttribute('source', 'tdx');
  span.setAttribute('bucketStartMs', 123456789);
  span.setStatus({ code: 1 });  // OK
  span.end();
});
setTimeout(() => process.exit(0), 8000);
