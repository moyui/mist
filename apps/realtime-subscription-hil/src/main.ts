import { runRealtimeSubscriptionHilFromEnvironment } from '../../mist/src/realtime/hil/realtime-subscription-hil';
import { initTelemetry } from '../../../libs/otel/src/otel';

initTelemetry({ serviceName: 'realtime-subscription-hil' });

void runRealtimeSubscriptionHilFromEnvironment().catch((error: unknown) => {
  process.stderr.write(
    (error instanceof Error ? error.message : String(error)) + '\n',
  );
  process.exitCode = 1;
});
